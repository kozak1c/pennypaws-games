// The built pages keep to the security header in public/_headers, which the site sends with
// every page: "script-src 'self'" (no inline script of any kind) and every other directive
// limited to the site's own origin. Children open these pages; a request to another origin is
// a request to a third party. Run after "npm run build" (npm run check builds first).
//
//   * no page has an inline script: no <script> without src (JSON-LD data blocks excepted),
//     no on...= event handler attribute, no javascript: address
//   * no page, and no stylesheet, loads a script, style, font, image, media file or frame from
//     another origin; what it loads from its own origin exists in the build
//
// Outbound links (<a href> to a store or a social site) are fine: the visitor chooses to go.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { addressOf, dist, filesUnder, publicPages } from "../ops/public-files.mjs";

const SITE = "https://pennypawsgames.com";
const pages = publicPages();
const stylesheets = filesUnder(dist).filter((f) => f.endsWith(".css"));

const decode = (s) => s.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");

// Every start tag of a page: { tag, attrs: Map(name -> value), body } (body for script/style).
export function tags(html) {
  const out = [];
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  const re = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m;
  while ((m = re.exec(clean))) {
    const tag = m[1].toLowerCase();
    const attrs = new Map();
    for (const a of m[2].matchAll(/([^\s=/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      attrs.set(a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? ""));
    }
    let body = "";
    if (tag === "script" || tag === "style") {
      const end = clean.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
      body = clean.slice(re.lastIndex, end < 0 ? undefined : end);
      if (end >= 0) re.lastIndex = end;
    }
    out.push({ tag, attrs, body });
  }
  return out;
}

const LOADING_RELS = new Set(["stylesheet", "icon", "apple-touch-icon", "manifest", "preload", "modulepreload", "prefetch", "preconnect", "dns-prefetch"]);
const SRC_TAGS = new Set(["script", "img", "iframe", "frame", "embed", "audio", "video", "source", "track", "input"]);

// (what, address) for everything a page makes the browser load by itself.
export function resources(html) {
  const out = [];
  for (const { tag, attrs, body } of tags(html)) {
    const add = (what, url) => { if (url && url.trim()) out.push([what, url.trim()]); };
    if (SRC_TAGS.has(tag)) add(`<${tag} src>`, attrs.get("src"));
    for (const part of (attrs.get("srcset") ?? "").split(",")) add(`<${tag} srcset>`, part.trim().split(/\s+/)[0]);
    if (tag === "video") add("<video poster>", attrs.get("poster"));
    if (tag === "object") add("<object data>", attrs.get("data"));
    if (tag === "link" && (attrs.get("rel") ?? "").toLowerCase().split(/\s+/).some((r) => LOADING_RELS.has(r))) {
      add(`<link rel=${attrs.get("rel")}>`, attrs.get("href"));
    }
    if (tag === "astro-island") {
      for (const a of ["component-url", "renderer-url", "before-hydration-url"]) add(`<astro-island ${a}>`, attrs.get(a));
    }
    if (tag === "meta" && (attrs.get("http-equiv") ?? "").toLowerCase() === "refresh") {
      add("<meta refresh>", (attrs.get("content") ?? "").replace(/^[^;]*;\s*url\s*=\s*/i, ""));
    }
    if (tag === "style") for (const u of cssUrls(body)) add("<style> url", u);
    if (attrs.has("style")) for (const u of cssUrls(attrs.get("style"))) add("style attribute url", u);
  }
  return out;
}

export function cssUrls(css) {
  const urls = [];
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) urls.push(m[1] ?? m[2] ?? m[3]);
  for (const m of css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) urls.push(m[1] ?? m[2]);
  return urls;
}

// null when the address is on the site's own origin (or an image data: address), else why not.
function outside(what, raw, base) {
  if (/^data:/i.test(raw)) return /<img|<source|<video poster|url/.test(what) ? null : `${what} ${raw.slice(0, 40)}: a data: address here is blocked by the policy`;
  const u = new URL(raw, base);
  return u.origin === SITE ? null : `${what} loads ${raw} from another origin`;
}

function ownFile(raw, base) {
  const u = new URL(raw, base);
  const p = decodeURIComponent(u.pathname).replace(/^\//, "");
  return path.join(dist, p.endsWith("/") || p === "" ? `${p}index.html` : p);
}

test("there are built pages to check (npm run build)", () => {
  assert.ok(pages.length > 10);
  for (const f of pages) assert.ok(existsSync(path.join(dist, f)), `dist/${f} is missing: run npm run build first`);
  assert.ok(stylesheets.length > 0);
});

for (const file of pages) {
  test(`${file}: no inline script`, () => {
    const html = readFileSync(path.join(dist, file), "utf8");
    const problems = [];
    for (const { tag, attrs, body } of tags(html)) {
      if (tag === "script" && !attrs.has("src") && (attrs.get("type") ?? "").toLowerCase() !== "application/ld+json") {
        problems.push(`inline <script>${body.slice(0, 60)}...`);
      }
      for (const [name, value] of attrs) {
        if (/^on[a-z]+$/.test(name)) problems.push(`<${tag} ${name}=...> is an inline event handler`);
        if (/^\s*javascript:/i.test(value)) problems.push(`<${tag} ${name}="${value.slice(0, 40)}"> is a javascript: address`);
      }
    }
    assert.deepEqual(problems, [], "_headers allows scripts only from files on the site (script-src 'self'); ops/postbuild.mjs moves Astro's inline scripts into files");
  });

  test(`${file}: loads nothing from another origin`, () => {
    const html = readFileSync(path.join(dist, file), "utf8");
    const base = SITE + addressOf(file);
    const problems = [];
    for (const [what, raw] of resources(html)) {
      const why = outside(what, raw, base);
      if (why) problems.push(why);
      else if (!/^data:/i.test(raw) && !existsSync(ownFile(raw, base))) problems.push(`${what} ${raw} is not in the build`);
    }
    assert.deepEqual(problems, []);
  });
}

for (const file of stylesheets) {
  test(`${file}: loads nothing from another origin`, () => {
    const base = `${SITE}/${file}`;
    const problems = [];
    for (const raw of cssUrls(readFileSync(path.join(dist, file), "utf8"))) {
      const why = outside("url", raw, base);
      if (why) problems.push(why);
      else if (!/^data:/i.test(raw) && !raw.startsWith("#") && !existsSync(ownFile(raw, base))) problems.push(`url ${raw} is not in the build`);
    }
    assert.deepEqual(problems, []);
  });
}

// The checks above, proven on small samples, so a broken parser cannot pass the real pages.
test("the inline-script and other-origin checks catch what they should", () => {
  const sample = `<!doctype html><html><head><link rel="stylesheet" href="https://cdn.example.com/a.css">
    <link rel="canonical" href="https://pennypawsgames.com/"><script type="application/ld+json">{"a":1}</script>
    <style>@font-face{src:url(https://fonts.example.com/f.woff2)}</style></head><body>
    <img src="/_astro/a.webp" srcset="https://img.example.com/b.webp 2x" alt=""><video poster="//cdn.example.com/p.jpg"></video>
    <iframe src="https://www.example.com/embed"></iframe><astro-island component-url="https://cdn.example.com/c.js"></astro-island>
    <a href="https://www.etsy.com/shop/x">Etsy</a><div style="background:url('https://t.example.com/p.gif')"></div></body></html>`;
  const base = `${SITE}/`;
  const bad = resources(sample).map(([w, r]) => outside(w, r, base)).filter(Boolean);
  assert.equal(bad.length, 7, bad.join("\n"));
  assert.ok(resources(sample).every(([, r]) => !r.includes("etsy.com") && !r.includes("canonical")), "outbound links and canonical are not loads");
  const scripts = tags(`<script>alert(1)</script><script type="application/ld+json">{}</script><script src="/a.js"></script>`)
    .filter((t) => t.tag === "script" && !t.attrs.has("src") && t.attrs.get("type") !== "application/ld+json");
  assert.equal(scripts.length, 1);
});
