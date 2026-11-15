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
  "squishy-bop/privacy/index.html": "3eac73c802fa0db16bc371c6e9563f9563b7300679eef3c9a0dab28c9ee9c200",
  "plush-hour/privacy/index.html": "e19cabb547d40d34900f279531979db1a16fd2dd751132386b94a0ed5d35f404",
  "giggle-bomb/privacy/index.html": "e28e825591161f7e8106ab23cdcb54ba3277e525728610d7d5d8482187597a79",
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
  "squishy-bop/privacy/index.html": "b1a655175355329e2ae15cfbbf1ba6d0b943509d9d5abd308cd777bb3c25c82e",
  "plush-hour/privacy/index.html": "15f3d37b90171025e1050105a9c32828b09785d0e9a821e1145c8909ab3dba9f",
  "giggle-bomb/privacy/index.html": "e2ccd952578780e7ac69a8f86c21052d474731d5c7f60c2cf0a42eb38bd2ecc4",
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
