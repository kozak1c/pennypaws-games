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
// with the reviewed change. Last changed 2026-11-15 (PAWS-034): a way back to the site above and
// below each policy; the policy words, below, did not change.
const PRIVACY_PAGES = {
  "squishy-bop/privacy/index.html": "844e3f318168843f651caf0f7740fa6e2d890699537883916e1bfd9bef5bc2c5",
  "plush-hour/privacy/index.html": "b7dd9ab6f54a7e8974c71990fa8afe7fe6db443279b6a1bf2309cc768bb62118",
  "giggle-bomb/privacy/index.html": "09632e29e402427839ac37407c7af8a01c7e30e4349769feaf93dcb83c08e3da",
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

// The policy itself: SHA-256 of the page's <main> element, the words a reader agrees to. A change to
// the site links or styling around a policy moves the page pin above but not this one; a change
// to these needs the privacy review of the words themselves.
const POLICY_WORDS = {
  "squishy-bop/privacy/index.html": "c7b46d8579af55b4eef598180bbdcc3202740f39c05cc6e99501901c2b10e5bc",
  "plush-hour/privacy/index.html": "136a6461d1e41c3f76761a0426a5c8ad2d76f92a352c94d651e46209ae1b33f6",
  "giggle-bomb/privacy/index.html": "a936e1ecae8af79c3c0f082ad49cb12dcac70a6bb361baf9b64f27d39f1a580a",
};

for (const [file, pin] of Object.entries(POLICY_WORDS)) {
  test(`the policy words in public/${file} are unchanged since their last review`, () => {
    const main = readFileSync(path.join(root, "public", file), "utf8").match(/<main>[\s\S]*<\/main>/);
    assert.ok(main, `public/${file} has no <main> element`);
    assert.equal(createHash("sha256").update(main[0]).digest("hex"), pin,
      `the words of public/${file} changed. That needs the independent privacy review of the policy itself (AGENTS.md).`);
  });
}

test("every public privacy or policy page is pinned", () => {
  const policyPages = publicFiles.filter((f) => f.endsWith(".html") && /privacy|terms|policy|data-deletion/i.test(f));
  assert.ok(policyPages.length > 0);
  for (const f of policyPages) assert.ok(f in PRIVACY_PAGES, `${f} looks like a policy page: pin it in tests/content.test.mjs`);
  for (const f of Object.keys(PRIVACY_PAGES)) assert.ok(publicFiles.includes(f), `${f} is pinned but not a public file`);
  assert.deepEqual(Object.keys(POLICY_WORDS).sort(), Object.keys(PRIVACY_PAGES).sort(), "every pinned page has its words pinned too");
});
