// The public files: what wrangler would upload must be exactly what ops/public-files.txt allows.
//
// The Worker's assets directory is the build output, dist/ (wrangler.jsonc). The build checks
// itself against the allow-list (ops/postbuild.mjs); this test asks wrangler (a dry-run deploy
// with debug logging names every path it ignores) and compares what it would upload with the
// list: every listed file, files under _astro/ only where the hashed-name pattern allows them,
// and nothing else. Run it after "npm run build" (npm run check builds first).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { auditBuild, CONFIG_FILES, dist, filesUnder, isPublic, readPublicFiles, root } from "../ops/public-files.mjs";

const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const unix = (p) => p.split(path.sep).join("/").replaceAll("\\", "/");
const list = readPublicFiles();

// What a deploy of `env` would upload: every file in dist/ minus what wrangler says it ignores.
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
  const from = out.match(/Read \d+ files from the assets directory (.+?)\r?$/m);
  assert.ok(from, "wrangler did not say which assets directory it read: has its output changed?");
  assert.equal(path.resolve(from[1].trim()), dist, "wrangler must read the build output, dist/");
  const ignored = new Set();
  for (const line of out.split("\n")) {
    const m = line.match(/Ignoring asset: (.+?)\r?$/);
    if (m) ignored.add(unix(m[1].trim()));
  }
  // _headers is read as configuration: wrangler names it here, so a change in its output shows.
  assert.deepEqual([...ignored].sort(), [...CONFIG_FILES].sort(), "wrangler should ignore only its configuration files");
  return filesUnder(dist).filter((f) => !ignored.has(f));
}

test("there is a build to check (npm run build)", () => {
  assert.ok(existsSync(path.join(dist, "index.html")), "dist/index.html is missing: run npm run build first");
});

for (const env of ["staging", "production"]) {
  test(`${env}: wrangler would upload exactly the allow-listed files`, () => {
    const upload = wouldUpload(env);
    const hashed = upload.filter((f) => !list.files.includes(f));
    assert.deepEqual(upload.filter((f) => list.files.includes(f)), [...list.files].sort(), "every listed file is uploaded");
    for (const f of hashed) assert.ok(list.patterns.some((re) => re.test(f)), `${f} would be uploaded but is not allowed by ops/public-files.txt`);
    for (const ext of ["css", "js", "woff2", "webp", "mp4"]) {
      assert.ok(hashed.some((f) => f.endsWith(`.${ext}`)), `expected hashed .${ext} files under _astro/`);
    }
  });
}

test("the build's own check finds nothing wrong with dist/", () => {
  const { unexpected, missing } = auditBuild();
  assert.deepEqual({ unexpected, missing }, { unexpected: [], missing: [] });
});

// The build fails on a file nobody listed. Proven on a copy-shaped folder of stray files, the
// kind a careless change could put in public/ or a plugin could emit.
test("the build's check rejects files that are not on the list", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pennypaws-dist-"));
  try {
    const stray = ["README.md", ".env", "notes.txt", "_astro/client.js", "_astro/client.OzTcoKK0.js.map",
      "_astro/data.OzTcoKK0.json", "squishy-bop/privacy/draft.html", "_astro/sub/x.OzTcoKK0.js"];
    for (const f of [...list.files, ...CONFIG_FILES, "_astro/client.OzTcoKK0.js", ...stray]) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), "x");
    }
    rmSync(path.join(dir, "app-ads.txt"));
    const { unexpected, missing } = auditBuild(dir);
    assert.deepEqual(unexpected, [...stray].sort());
    assert.deepEqual(missing, ["app-ads.txt"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Each listed file that the build does not make from src/pages is a committed file in public/.
test("every listed file that is not a built page is committed in public/", () => {
  const tracked = new Set(execFileSync("git", ["ls-files", "public"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean));
  for (const f of [...list.files, ...CONFIG_FILES]) {
    if (tracked.has(`public/${f}`)) continue;
    assert.ok(f.endsWith(".html"), `${f} is listed but is neither a page nor a committed file in public/`);
  }
  for (const f of tracked) {
    const rel = f.slice("public/".length);
    assert.ok(CONFIG_FILES.includes(rel) || isPublic(rel, list), `${f} is in public/ but not in ops/public-files.txt`);
  }
});

test("the allow-list holds no file that could not be a public page or asset", () => {
  for (const f of list.files) {
    assert.doesNotMatch(f, /(^|\/)\.|^(ops|tests|docs|node_modules|src|public|dist)\/|\.(md|py|mjs|json|jsonc|toml|yml|yaml|lock|map)$/i, f);
    assert.ok(!f.startsWith("/") && !f.includes(".."), f);
  }
  assert.equal(list.patterns.length, 1, "one pattern, for the hashed build output");
  for (const f of ["_astro/client.OzTcoKK0.js", "_astro/01_listing.P_EhUzSM_1f18Ta.webp", "_astro/play.CswBVPtv.mp4"]) {
    assert.ok(isPublic(f, list), `${f} should be allowed`);
  }
  for (const f of ["client.OzTcoKK0.js", "_astro/client.js", "_astro/client.OzTcoKK0.js.map", "_astro/a.OzTcoKK0.html",
    "_astro/.env", "_astro/x/../../README.OzTcoKK0.js", "_astro/notes.OzTcoKK0.md"]) {
    assert.ok(!isPublic(f, list), `${f} must not be allowed`);
  }
});
