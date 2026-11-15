// ops/postbuild.mjs: inline scripts become files in the same place and order, data blocks and
// pages without inline scripts are left alone, and a <style> in <body> moves to <head>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DONE_LINE, externalizeScripts, moveBodyStyles, postbuild } from "../ops/postbuild.mjs";

const name = (text) => `inline.${createHash("sha256").update(text).digest("hex").slice(0, 12)}.js`;

test("inline scripts become hashed files, in the same place and order, with their attributes", () => {
  const a = "(function(){window.a=1})();";
  const b = "customElements.define('x-y',class extends HTMLElement{})";
  const html = `<body><p>1</p><script>${a}</script><script data-x="1">${b}</script><x-y></x-y>` +
    `<script type="module">import "/m.js"</script><script src="/_astro/keep.ABCDEFGH.js"></script>` +
    `<script type="application/ld+json">{"@type":"Organization"}</script></body>`;
  const { html: out, files } = externalizeScripts(html);
  assert.equal(out, `<body><p>1</p><script src="/_astro/${name(a)}"></script><script data-x="1" src="/_astro/${name(b)}"></script><x-y></x-y>` +
    `<script type="module" src="/_astro/${name('import "/m.js"')}"></script><script src="/_astro/keep.ABCDEFGH.js"></script>` +
    `<script type="application/ld+json">{"@type":"Organization"}</script></body>`);
  assert.deepEqual([...files.keys()], [name(a), name(b), name('import "/m.js"')]);
  assert.equal(files.get(name(a)), a, "the file holds exactly the script's text");
  assert.doesNotMatch(out, /\b(async|defer)\b/, "a classic script stays blocking, so the order of execution is unchanged");
});

test("the same script on two pages is one file", () => {
  const one = externalizeScripts("<script>x()</script>").files;
  const two = externalizeScripts("<p></p><script>x()</script>").files;
  assert.deepEqual([...one.keys()], [...two.keys()]);
});

test("a <style> in <body> moves to the end of <head>; one inside an SVG stays", () => {
  const html = `<html><head><link rel="stylesheet" href="/a.css"></head><body><div><style>a{b:c}</style><svg><style>.s{fill:red}</style></svg></div></body></html>`;
  assert.equal(moveBodyStyles(html),
    `<html><head><link rel="stylesheet" href="/a.css"><style>a{b:c}</style></head><body><div><svg><style>.s{fill:red}</style></svg></div></body></html>`);
  const plain = "<html><head><style>a{}</style></head><body></body></html>";
  assert.equal(moveBodyStyles(plain), plain);
});

// The step must really run when npm run build calls it. A guard that decides whether the file
// is the main module can come out false through a directory junction, and the build would then
// skip the step and still exit 0. So: run the command exactly as package.json writes it, from
// the real path and through a link to the checkout, and require the line it prints at the end.
// Needs a build in dist/ (npm run check builds first); running the step again changes nothing.
test("npm run build's post-build command really runs, also through a directory link", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const build = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts.build;
  const parts = build.split("&&").map((s) => s.trim());
  assert.equal(parts[0], "astro build");
  const command = parts.at(-1);
  assert.match(command, /^node ops\/postbuild-cli\.mjs$/);
  const link = path.join(mkdtempSync(path.join(tmpdir(), "pennypaws-link-")), "checkout");
  symlinkSync(root, link, "junction");
  try {
    for (const cwd of [root, link]) {
      const r = spawnSync(command, { cwd, shell: true, encoding: "utf8" });
      assert.equal(r.status, 0, `${command} in ${cwd} failed:\n${r.stdout}\n${r.stderr}`);
      assert.ok(r.stdout.includes(DONE_LINE), `${command} in ${cwd} did not print "${DONE_LINE}": the step did not run\n${r.stdout}`);
      assert.match(r.stdout, /inline script\(s\) moved to files/);
    }
  } finally {
    // Remove the link itself, never what it points at, then the empty folder that held it.
    unlinkSync(link);
    rmdirSync(path.dirname(link));
  }
});

test("postbuild rewrites only pages with inline scripts and writes the scripts under _astro/", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pennypaws-postbuild-"));
  try {
    mkdirSync(path.join(dir, "_astro"));
    mkdirSync(path.join(dir, "policy"));
    const policy = "<!doctype html>\r\n<html><head><title>P</title><style>p{}</style></head><body><p>words</p></body></html>\r\n";
    writeFileSync(path.join(dir, "policy", "index.html"), policy);
    writeFileSync(path.join(dir, "index.html"), "<html><head></head><body><script>go()</script></body></html>");
    const { pages, scripts } = postbuild(dir);
    assert.equal(pages, 1);
    assert.deepEqual(scripts, [name("go()")]);
    assert.equal(readFileSync(path.join(dir, "policy", "index.html"), "utf8"), policy, "a page without inline scripts keeps its bytes");
    assert.equal(readFileSync(path.join(dir, "_astro", name("go()")), "utf8"), "go()");
    assert.equal(readFileSync(path.join(dir, "index.html"), "utf8"), `<html><head></head><body><script src="/_astro/${name("go()")}"></script></body></html>`);
    // Running it again changes nothing.
    assert.equal(postbuild(dir).pages, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
