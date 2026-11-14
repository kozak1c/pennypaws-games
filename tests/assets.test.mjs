// The public files: what wrangler would upload must equal ops/public-files.txt, exactly.
//
// The Worker's assets directory is the repo root, so .assetsignore is the only thing between
// a doc, a config file or node_modules and the public site. This test asks wrangler itself
// (a dry-run deploy with debug logging names every path it ignores) and compares what is
// left with the allow-list. It runs in a tree that holds node_modules, .git, tests and docs,
// so the ignore rules are proven against real clutter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

const unix = (p) => p.split(path.sep).join("/").replaceAll("\\", "/");

function allowList() {
  return readFileSync(path.join(root, "ops", "public-files.txt"), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).sort();
}

// Every file under the root, as wrangler lists them (recursive readdir, directories dropped).
function allFiles() {
  return readdirSync(root, { recursive: true })
    .filter((rel) => statSync(path.join(root, rel), { throwIfNoEntry: false })?.isFile())
    .map(unix);
}

// What a deploy of `env` would upload: every file minus what wrangler says it ignores.
function wouldUpload(env) {
  const run = spawnSync(process.execPath, [wrangler, "deploy", "--dry-run", "--env", env], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, WRANGLER_LOG: "debug", WRANGLER_SEND_METRICS: "false", CI: "true", NO_COLOR: "1" },
  });
  const out = `${run.stdout}\n${run.stderr}`;
  assert.equal(run.status, 0, `wrangler deploy --dry-run --env ${env} failed:\n${out.slice(-2000)}`);
  assert.match(out, /--dry-run: exiting now/, "the dry run did not finish");
  const ignored = new Set();
  for (const line of out.split("\n")) {
    const m = line.match(/Ignoring asset: (.+?)\r?$/);
    if (m) ignored.add(unix(m[1].trim()));
  }
  assert.ok(ignored.size > 0, "wrangler logged no ignored paths: has its debug output changed?");
  // _headers and .assetsignore are in the ignored set (wrangler reads them as configuration).
  return allFiles().filter((f) => !ignored.has(f)).sort();
}

for (const env of ["staging", "production"]) {
  test(`${env}: wrangler would upload exactly the allow-listed files`, () => {
    assert.deepEqual(wouldUpload(env), allowList());
  });
}

test("the tree this ran in holds the clutter the ignore list must keep out", () => {
  const files = new Set(allFiles());
  for (const f of ["README.md", "wrangler.jsonc", "package.json", "_headers", ".assetsignore", "CNAME",
    "ops/health.py", "node_modules/wrangler/package.json"]) {
    assert.ok(files.has(f), `${f} should exist in the tree under test`);
  }
  // A page-shaped file somewhere it must not be served from: the rules are anchored to the root.
  assert.ok([...files].some((f) => f.startsWith("node_modules/") && f.endsWith("/index.html")),
    "expected an index.html somewhere under node_modules");
});

test("every allow-listed file is tracked by git, and unchanged files GitHub Pages serves stay put", () => {
  const tracked = new Set(execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean));
  for (const f of allowList()) assert.ok(tracked.has(f), `${f} is allow-listed but not committed`);
  // Until the domain moves to Cloudflare, GitHub Pages serves the default branch from the root.
  for (const f of ["index.html", "app-ads.txt", "CNAME", ".nojekyll", "squishy-bop/privacy/index.html"]) {
    assert.ok(tracked.has(f), `${f} must stay at the repo root for GitHub Pages`);
  }
});

test("the allow-list holds no file that could not be a public page or asset", () => {
  for (const f of allowList()) {
    assert.doesNotMatch(f, /(^|\/)\.|^(ops|tests|docs|node_modules)\/|\.(md|py|mjs|json|jsonc|toml|yml|yaml|lock)$/i, f);
    assert.ok(!f.startsWith("/") && !f.includes(".."), f);
  }
});
