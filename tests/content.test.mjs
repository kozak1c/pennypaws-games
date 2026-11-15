// Content that must not change by accident.
//
// Privacy pages: each one is pinned by SHA-256. The source is the file in public/, which the
// build copies into dist/ unchanged. Changing a privacy page fails this test until the pin is
// updated, which is the moment to ask: has the independent privacy review been done and
// recorded in the pull request? (AGENTS.md, "Privacy pages".) The built copy must be the same
// bytes, so nothing in the build can alter a policy on its way to the site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dist, readPublicFiles, root } from "../ops/public-files.mjs";

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const publicFiles = readPublicFiles().files;

// page (its path inside public/ and dist/) -> SHA-256 of its bytes. Update a pin only together
// with the reviewed change. The pins are the same as when the pages sat at the repository root.
const PRIVACY_PAGES = {
  "squishy-bop/privacy/index.html": "b5481fe23b4fda095a80186d0cdc43912cb39b104d786b1578dee83fd4e82dbc",
  "plush-hour/privacy/index.html": "afa4d0e34f1a49a8028d1e64b3542084857208a0abdfe9e4b04176c8159c23d3",
  "giggle-bomb/privacy/index.html": "222bc44229f04e604b8570241a2e47e9eebeb984e867ef428d37def6296ac73b",
};

for (const [file, pin] of Object.entries(PRIVACY_PAGES)) {
  test(`privacy page public/${file} is unchanged since its last review`, () => {
    assert.equal(sha256(path.join(root, "public", file)), pin,
      `public/${file} changed. Privacy text needs the independent privacy review before it merges (AGENTS.md). ` +
      "When that is done and recorded in the pull request, update the pin in tests/content.test.mjs.");
  });

  test(`privacy page dist/${file} is the same bytes as its source`, () => {
    assert.equal(sha256(path.join(dist, file)), pin, `the build changed ${file} on its way to dist/ (run npm run build first)`);
  });
}

test("every public privacy or policy page is pinned", () => {
  const policyPages = publicFiles.filter((f) => f.endsWith(".html") && /privacy|terms|policy|data-deletion/i.test(f));
  assert.ok(policyPages.length > 0);
  for (const f of policyPages) assert.ok(f in PRIVACY_PAGES, `${f} looks like a policy page: pin it in tests/content.test.mjs`);
  for (const f of Object.keys(PRIVACY_PAGES)) assert.ok(publicFiles.includes(f), `${f} is pinned but not a public file`);
});
