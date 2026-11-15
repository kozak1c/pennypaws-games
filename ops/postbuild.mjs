// The step after "astro build" (npm run build runs both, through ops/postbuild-cli.mjs). It makes dist/ fit the site's
// security header and the allow-list, and fails the build when it cannot.
//
//   1. Inline scripts become files. _headers sends "script-src 'self'", which forbids inline
//      scripts, and Astro writes its island bootstrap inline. Every <script> without a src
//      (JSON-LD data blocks excepted) is written to dist/_astro/inline.<hash>.js, named by a
//      hash of its content, and replaced in the same place by <script src="..."> with the
//      same attributes. A classic script stays a classic, blocking script and a module stays
//      a module, so everything runs in the same order as before. The header is not loosened:
//      no hashes, no nonces, no 'unsafe-inline'.
//   2. A <style> element Astro writes into <body> (the one rule that keeps island wrappers out
//      of the layout) moves to the end of <head>. It is the same rule in the same cascade
//      order; a <style> in <body> is not valid HTML.
//   3. dist/ must hold exactly what ops/public-files.txt allows (ops/public-files.mjs). A file
//      that is not allowed, or a listed file that is missing, fails the build, so it can never
//      be deployed: the workflows build right before they deploy.
//
// Pages without inline scripts are not rewritten at all, so files copied from public/ (the
// privacy policies) keep their exact bytes.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { auditBuild, dist, filesUnder } from "./public-files.mjs";

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const JS_TYPES = new Set(["", "module", "text/javascript", "application/javascript"]);

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?(?=\\s|$)`, "i"));
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? "";
}

// html -> { html, files: Map(file name inside _astro/ -> script text) }
export function externalizeScripts(html) {
  const files = new Map();
  const out = html.replace(SCRIPT, (whole, attrs, body) => {
    if (attr(attrs, "src") !== null) return whole;
    const type = (attr(attrs, "type") ?? "").trim().toLowerCase();
    if (!JS_TYPES.has(type)) return whole; // a data block such as application/ld+json
    const name = `inline.${createHash("sha256").update(body).digest("hex").slice(0, 12)}.js`;
    files.set(name, body);
    const kept = attrs.trim() ? ` ${attrs.trim()}` : "";
    return `<script${kept} src="/_astro/${name}"></script>`;
  });
  return { html: out, files };
}

// Moves <style> elements found in <body> (outside inline SVG) to the end of <head>.
export function moveBodyStyles(html) {
  const bodyAt = html.search(/<body[\s>]/i);
  const headEnd = html.search(/<\/head>/i);
  if (bodyAt < 0 || headEnd < 0 || headEnd > bodyAt) return html;
  const body = html.slice(bodyAt);
  const svgs = [...body.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].map((m) => [m.index, m.index + m[0].length]);
  const inSvg = (i) => svgs.some(([a, b]) => i >= a && i < b);
  const moved = [];
  const rest = body.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (whole, offset) => {
    if (inSvg(offset)) return whole;
    moved.push(whole);
    return "";
  });
  if (moved.length === 0) return html;
  if (/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(rest)) {
    throw new Error("a page has both a <style> and a stylesheet link in <body>; moving the style would change the cascade order");
  }
  return html.slice(0, headEnd) + moved.join("") + html.slice(headEnd, bodyAt) + rest;
}

export function rewritePage(html) {
  const { html: noInline, files } = externalizeScripts(html);
  return { html: moveBodyStyles(noInline), files };
}

export function postbuild(dir = dist) {
  if (!existsSync(path.join(dir, "index.html"))) {
    throw new Error(`${dir} holds no index.html: run "astro build" first (npm run build does both)`);
  }
  const written = new Map();
  let pages = 0;
  for (const rel of filesUnder(dir).filter((f) => f.endsWith(".html"))) {
    const file = path.join(dir, rel);
    const before = readFileSync(file, "utf8");
    const { html, files } = rewritePage(before);
    for (const [name, text] of files) written.set(name, text);
    if (html !== before) {
      writeFileSync(file, html);
      pages++;
    }
  }
  for (const [name, text] of written) writeFileSync(path.join(dir, "_astro", name), text);
  return { pages, scripts: [...written.keys()] };
}

// The whole step as the build runs it: rewrite, then audit. Returns the exit code. The command
// line entry is ops/postbuild-cli.mjs, which calls this unconditionally: an "is this file the
// main module" guard here would compare a junction path with the real path on some machines,
// come out false, and let the build skip this step and still succeed.
export const DONE_LINE = "postbuild: dist/ holds exactly the allow-listed files";

export function run(dir = dist, { log = console.log, error = console.error } = {}) {
  try {
    const { pages, scripts } = postbuild(dir);
    log(`postbuild: ${pages} page(s) rewritten, ${scripts.length} inline script(s) moved to files${scripts.length ? ` (${scripts.join(", ")})` : ""}`);
    const { unexpected, missing } = auditBuild(dir);
    for (const f of unexpected) error(`postbuild: dist/${f} is not allowed by ops/public-files.txt`);
    for (const f of missing) error(`postbuild: dist/${f} is listed in ops/public-files.txt but the build did not write it`);
    if (unexpected.length || missing.length) {
      error("postbuild: the build does not match the allow-list. Add a new public file to ops/public-files.txt, or remove what should not be public.");
      return 1;
    }
    log(DONE_LINE);
    return 0;
  } catch (err) {
    error(`postbuild: ${err.message}`);
    return 1;
  }
}
