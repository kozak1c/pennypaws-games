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
// with the reviewed change. Last changed 2026-11-20 (SQUISH-068): the Squishy Bop policy describes
// the game's new Rate and Share buttons (Share behind the grown-up check), after the independent review. Before that, 2026-11-18
// (PAWS-045): the website's own privacy policy and terms of use added; every policy page also
// declares the site icon (outside <main>, so the game policy words did not change).
const PRIVACY_PAGES = {
  "squishy-bop/privacy/index.html": "880fa2f384833b58b8dd3134f7383f0084439d0fcc73b4cb8fc6ba8679d91817",
  "plush-hour/privacy/index.html": "c561fd9c34278b89db339b4a646bf0e1300ef168f107b67d43115c3c67d09118",
  "giggle-bomb/privacy/index.html": "d34d064c7d364fcb994f4d535582077f7f0995382a2a886e69cd78e9f56a7f85",
  "privacy/index.html": "d29cd709c95137e14135a592e641cb527c9540c94505e7f09e89a7ca3bc09536",
  "terms/index.html": "f59f115c2c288f88c8de0f2fbac47de21a063f259394e8c2d1f043625a3e53f4",
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
  "squishy-bop/privacy/index.html": "e124b17b11979d45a80c9e5c9b8d809de92c3212c73c866d3675d088a27643e2",
  "plush-hour/privacy/index.html": "15f3d37b90171025e1050105a9c32828b09785d0e9a821e1145c8909ab3dba9f",
  "giggle-bomb/privacy/index.html": "e2ccd952578780e7ac69a8f86c21052d474731d5c7f60c2cf0a42eb38bd2ecc4",
  "privacy/index.html": "a62f427fd71f1a8df6fca1d389cf04a6a0c328b71b32fb4f1165def101763ea9",
  "terms/index.html": "abb9eee06e8d4c7083d5386f9ca438d8d049d08c99bf23ae084b3c691fc4b69c",
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
