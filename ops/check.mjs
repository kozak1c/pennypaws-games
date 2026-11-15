// Every check that needs no browser, in one command. CI runs exactly this.
//
//   npm run check            (node ops/check.mjs)
//   node ops/check.mjs --only health
//
// Steps, in order. The build comes first, so nothing is ever checked against a stale dist/;
// if it fails, nothing after it runs. After the build, a failing step does not stop the later
// ones, so one run shows everything that is wrong; the exit code is 1 if any step failed.
//
//   build      npm run build: the site into dist/ (astro build, then ops/postbuild-cli.mjs, which
//              moves inline scripts into files and fails on any file not in
//              ops/public-files.txt). "--only" with another step skips it and checks the
//              dist/ that is there.
//   unit       the Python tests for ops/health.py, ops/check_site.py and ops/site_url.py
//   config     tests/*.test.mjs: wrangler.jsonc, public/_headers, the workflows, the privacy
//              pins, no inline script and nothing from another origin in the built pages, and
//              that wrangler would upload exactly what ops/public-files.txt allows
//   html       html-validate on every built page
//   links      ops/check_site.py on dist/: structure, links, nothing loaded from another
//              origin, size budgets
//   dry-run    wrangler deploy --dry-run for staging and for production
//   health     ops/health.py against a local wrangler dev, twice: as an address that must be
//              noindex, and as the public address (which must be indexable)
import { spawnSync } from "node:child_process";
import { appendFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { publicPages } from "./public-files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const bin = (pkg, file) => path.join(root, "node_modules", pkg, file);
const inCI = process.env.GITHUB_ACTIONS === "true";

function findPython() {
  for (const name of ["python3", "python"]) {
    const r = spawnSync(name, ["-c", "import sys, tomllib; print(sys.version_info >= (3, 11))"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim() === "True") return name;
  }
  throw new Error("Python 3.11 or later is needed (python3 or python on PATH)");
}

const python = findPython();
const builtPages = publicPages().map((f) => path.join("dist", f));
const nodeTests = readdirSync(path.join(root, "tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => path.join("tests", f));

// [name, ...commands]: a step passes when each of its commands exits 0, run one after another.
const steps = [
  ["build", [node, bin("astro", "bin/astro.mjs"), "build"], [node, "ops/postbuild-cli.mjs"]],
  ["unit", [python, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"]],
  ["config", [node, "--test", ...nodeTests]],
  ["html", [node, bin("html-validate", "bin/html-validate.mjs"), ...builtPages]],
  ["links", [python, "ops/check_site.py"]],
  ["dry-run staging", [node, bin("wrangler", "bin/wrangler.js"), "deploy", "--dry-run", "--env", "staging"]],
  ["dry-run production", [node, bin("wrangler", "bin/wrangler.js"), "deploy", "--dry-run", "--env", "production"]],
  ["health (noindex address)", [node, "ops/with-site.mjs", "--", python, "ops/health.py", "{site}", "--expect", "staging"]],
  ["health (public address)", [node, "ops/with-site.mjs", "--as-production", "--", python, "ops/health.py", "{site}", "--expect", "production"]],
];

const onlyAt = process.argv.indexOf("--only");
const only = onlyAt > 0 ? process.argv[onlyAt + 1] : null;
const selected = steps.filter(([name]) => !only || name.startsWith(only));
if (selected.length === 0) {
  console.error(`no step starts with "${only}". Steps: ${steps.map(([n]) => n).join(", ")}`);
  process.exit(2);
}

const results = [];
for (const [name, ...commands] of selected) {
  console.log(inCI ? `::group::${name}` : `\n== ${name}`);
  const started = Date.now();
  let ok = true;
  for (const cmd of commands) {
    const r = spawnSync(cmd[0], cmd.slice(1), {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", ASTRO_TELEMETRY_DISABLED: "1", CI: process.env.CI ?? "true" },
    });
    if (r.status !== 0) { ok = false; break; }
  }
  if (inCI) console.log("::endgroup::");
  if (!ok) console.log(inCI ? `::error::check "${name}" failed` : `FAILED: ${name}`);
  results.push({ name, ok, seconds: ((Date.now() - started) / 1000).toFixed(1) });
  if (!ok && name === "build") {
    console.log("The build failed, so nothing else was checked.");
    break;
  }
}

console.log("");
for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name} (${r.seconds} s)`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results.map((r) => `| ${r.name} | ${r.ok ? "pass" : "**FAIL**"} | ${r.seconds} s |`).join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Checks\n\n| Step | Result | Time |\n|---|---|---|\n${rows}\n\n`);
}
process.exit(results.length === selected.length && results.every((r) => r.ok) ? 0 : 1);
