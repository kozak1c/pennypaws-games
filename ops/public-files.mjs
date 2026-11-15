// The public files: ops/public-files.txt, read once for every tool that needs it (the build's
// own check in ops/postbuild.mjs, tests/*.test.mjs, ops/check.mjs and the browser walk).
// ops/check_site.py reads the same file the same way.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dist = path.join(root, "dist");

// Files the build writes into dist/ that wrangler reads as configuration and never serves.
export const CONFIG_FILES = ["_headers"];

const unix = (p) => p.split(path.sep).join("/").replaceAll("\\", "/");

const FEED_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/; // the feed's own id rule (src/content.config.ts)

// "feed:<collection> <path with {id}>" -> one path per product of that collection in the feed.
export function feedPaths(line, feedFile = path.join(root, "src", "data", "feed.json")) {
  const m = line.match(/^feed:(\w+)\s+(\S*\{id\}\S*)$/);
  if (!m) throw new Error(`ops/public-files.txt: cannot read "${line}" (want feed:<collection> <path with {id}>)`);
  const rows = JSON.parse(readFileSync(feedFile, "utf8"))[m[1]];
  if (!Array.isArray(rows)) throw new Error(`ops/public-files.txt: the feed has no collection "${m[1]}"`);
  return rows.map((row) => {
    if (!FEED_ID.test(String(row.id))) throw new Error(`ops/public-files.txt: feed ${m[1]} id ${JSON.stringify(row.id)} is not a plain id`);
    return m[2].replaceAll("{id}", row.id);
  });
}

// { files: exact paths inside dist/ (feed: lines expanded), patterns: RegExps for families of
// hashed files }
export function readPublicFiles(file = path.join(root, "ops", "public-files.txt"), feedFile = undefined) {
  const files = [];
  const patterns = [];
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("re:")) patterns.push(new RegExp(line.slice(3).trim()));
    else if (line.startsWith("feed:")) files.push(...feedPaths(line, feedFile));
    else files.push(line);
  }
  return { files, patterns };
}

// The HTML pages of the allow-list, as paths inside dist/.
export function publicPages(list = readPublicFiles()) {
  return list.files.filter((f) => f.endsWith(".html"));
}

// The address a page is served at: index.html is /, a/index.html is /a/, 404.html is /404.
export function addressOf(file) {
  if (file === "index.html") return "/";
  if (file.endsWith("/index.html")) return `/${file.slice(0, -"index.html".length)}`;
  return `/${file.replace(/\.html$/, "")}`;
}

// Every file under a folder, as paths relative to it with forward slashes.
export function filesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .filter((rel) => statSync(path.join(dir, rel), { throwIfNoEntry: false })?.isFile())
    .map(unix)
    .sort();
}

// Whether one path inside dist/ may be served.
export function isPublic(rel, list = readPublicFiles()) {
  return list.files.includes(rel) || list.patterns.some((re) => re.test(rel));
}

// What is wrong with a build folder: files that would be served but are not allowed, and
// listed files that are missing.
export function auditBuild(dir = dist, list = readPublicFiles()) {
  const present = filesUnder(dir);
  const unexpected = present.filter((f) => !CONFIG_FILES.includes(f) && !isPublic(f, list));
  const missing = [...list.files, ...CONFIG_FILES].filter((f) => !present.includes(f));
  return { present, unexpected, missing };
}
