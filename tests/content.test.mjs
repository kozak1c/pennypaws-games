// Content that must not change by accident.
//
// Privacy pages: each one is pinned by SHA-256. Changing a privacy page fails this test until
// the pin is updated, which is the moment to ask: has the independent privacy review been
// done and recorded in the pull request? (AGENTS.md, "Privacy pages".)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (rel) => createHash("sha256").update(readFileSync(path.join(root, rel))).digest("hex");
const publicFiles = readFileSync(path.join(root, "ops", "public-files.txt"), "utf8")
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

// file -> SHA-256 of its bytes. Update a pin only together with the reviewed change.
const PRIVACY_PAGES = {
  "squishy-bop/privacy/index.html": "b5481fe23b4fda095a80186d0cdc43912cb39b104d786b1578dee83fd4e82dbc",
};

for (const [file, pin] of Object.entries(PRIVACY_PAGES)) {
  test(`privacy page ${file} is unchanged since its last review`, () => {
    assert.equal(sha256(file), pin,
      `${file} changed. Privacy text needs the independent privacy review before it merges (AGENTS.md). ` +
      "When that is done and recorded in the pull request, update the pin in tests/content.test.mjs.");
  });
}

test("every public privacy or policy page is pinned", () => {
  const policyPages = publicFiles.filter((f) => f.endsWith(".html") && /privacy|terms|policy|data-deletion/i.test(f));
  assert.ok(policyPages.length > 0);
  for (const f of policyPages) assert.ok(f in PRIVACY_PAGES, `${f} looks like a policy page: pin it in tests/content.test.mjs`);
  for (const f of Object.keys(PRIVACY_PAGES)) assert.ok(publicFiles.includes(f), `${f} is pinned but not a public file`);
});

// GitHub Pages serves the default branch from the root until the domain moves to Cloudflare.
// Delete this test in the pull request that follows the move (docs/runbook.md).
test("the files GitHub Pages needs are still at the root", () => {
  assert.equal(readFileSync(path.join(root, "CNAME"), "utf8"), "pennypawsgames.com\n");
  assert.equal(readFileSync(path.join(root, ".nojekyll"), "utf8"), "");
  for (const f of ["index.html", "app-ads.txt", "squishy-bop/privacy/index.html"]) {
    assert.ok(readFileSync(path.join(root, f)).length > 0, f);
  }
});
