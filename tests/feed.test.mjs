// Product facts come from the feed and from nowhere else.
//
// src/data/feed.json is generated from each product's own source and arrives by pull request.
// These tests keep three promises: the copy here is a feed this build understands and holds
// only what a public feed may hold; no page or data file types a price or a product's store
// address beside it; and a picture that does not match the feed's SHA-256 is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { feedImageName, fetchFeedImages, wanted } from "../ops/feed-images.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const feed = JSON.parse(readFileSync(path.join(root, "src/data/feed.json"), "utf8"));

// The whole shape of a public feed. A key that is not here does not belong in a public file.
const allowed = {
  games: ["id", "name", "tagline", "status", "page", "privacy", "ages", "rating", "child_directed", "price",
    "price_usd", "ads", "ads_personalized", "purchases", "play_url", "tester_url", "facts"],
  printables: ["id", "name", "title", "hook", "description", "collection", "price", "currency", "etsy_url",
    "images", "features", "formats", "faq", "related", "book"],
  books: ["id", "title", "subtitle", "asin", "isbn", "price", "currency", "amazon_url", "pages", "trim",
    "live_date", "printable", "cover"],
};

test("the feed is a version this build reads, with the three collections", () => {
  assert.equal(feed.schema_version, 2);
  assert.deepEqual(Object.keys(feed).sort(), ["books", "games", "printables", "schema_version"]);
});

test("every product in the feed carries only the public fields", () => {
  for (const [collection, keys] of Object.entries(allowed)) {
    for (const row of feed[collection]) {
      const extra = Object.keys(row).filter((key) => !keys.includes(key));
      assert.deepEqual(extra, [], `${collection}/${row.id} has fields a public feed does not carry`);
    }
  }
});

test("the feed names no package id, tester link or address off the stores and the media bucket", () => {
  const text = JSON.stringify(feed);
  assert.doesNotMatch(text, /\bcom\.[a-z]+\.[a-z]+/, "a package id");
  assert.doesNotMatch(text, /apps\/testing/, "a closed-test link");
  for (const game of feed.games) {
    if (game.status !== "live") assert.equal(game.tester_url, null, `${game.id} is not live but carries a tester link`);
  }
  const hosts = new Set((text.match(/https?:\/\/[^"\\\s)]+/g) ?? []).map((url) => new URL(url).host));
  const known = ["media.pennypawsgames.com", "www.amazon.com", "play.google.com"];
  for (const host of hosts) assert.ok(known.includes(host) || host.endsWith(".etsy.com"), `unexpected host ${host}`);
});

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return name === "assets" ? [] : sources(file);
    return /\.(astro|ts|tsx|mjs|json|yaml|md)$/.test(name) && name !== "feed.json" ? [file] : [];
  });
}

test("no page or data file types a price, a game's ages or a product's store address", () => {
  const typed = [
    [/\$\s?\d+\.\d\d\b/, "a price"],
    [/etsy\.com\/listing\//, "an Etsy listing address"],
    [/amazon\.com\/dp\//, "an Amazon product address"],
    [/play\.google\.com\/(store\/apps\/details|apps\/testing)/, "a Google Play product address"],
    [/Ages \d+ and up/, "a game's ages"],
  ];
  for (const file of sources(path.join(root, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const [pattern, what] of typed) {
      // assert.ok keeps a failure to one line; doesNotMatch would print the whole file.
      assert.ok(!pattern.test(text), `${path.relative(root, file)} types ${what}; it belongs in the feed`);
    }
  }
});

test("each printable's cover and each book's cover is a picture the feed names", async () => {
  const pictures = (await wanted()).map((p) => p.sha256);
  const shelf = JSON.parse(readFileSync(path.join(root, "src/data/shelf.json"), "utf8")).books;
  const onShelf = feed.books.filter((b) => shelf.includes(b.id));
  assert.equal(pictures.length, feed.printables.length + onShelf.length, "a cover only for each printable and each book on the shelf");
  for (const book of onShelf) assert.ok(pictures.includes(book.cover.sha256), `book ${book.id} has no cover fetched`);
});

// A book's cover is the front of the cover file uploaded to Amazon, which the feed carries with
// its SHA-256. Hand-copied art went wrong once (a draft poster and a background painting were
// shown as covers), so no other source is allowed: no folder of book art, no cover typed in the
// site's words, and the shelf takes each cover from the feed's picture.
test("a book's cover comes from the feed and from nowhere else", () => {
  assert.ok(!existsSync(path.join(root, "src/assets/books")), "src/assets/books/ is back; book covers come from the feed");
  const catalog = readFileSync(path.join(root, "src/data/catalog.ts"), "utf8");
  const words = catalog.slice(catalog.indexOf("const bookWords"), catalog.indexOf("export const booksOffShelf"));
  assert.ok(words.length > 0, "src/data/catalog.ts no longer has bookWords where this test looks");
  assert.doesNotMatch(words, /\bcover\s*:/, "bookWords types a cover; book covers come from the feed");
  assert.doesNotMatch(words, /\.(webp|png|jpe?g|avif)\b/, "bookWords names an image file");
  const shelf = catalog.slice(catalog.indexOf("export const books: Book[]"));
  assert.match(shelf, /cover:\s*\{\s*src:\s*feedImage\(b\.cover\)/, "a book's cover is not the feed's picture");
  for (const file of sources(path.join(root, "src"))) {
    const text = readFileSync(file, "utf8");
    assert.ok(!/assets\/books\//.test(text) && !/['"`]books\/[^'"`]*\.(webp|png|jpe?g)/.test(text),
      `${path.relative(root, file)} points at book art outside the feed`);
  }
  for (const book of feed.books) {
    assert.match(book.cover.url, /^https:\/\/media\.pennypawsgames\.com\//, `book ${book.id}'s cover is not on the media bucket`);
    assert.match(book.cover.sha256, /^[0-9a-f]{64}$/, `book ${book.id}'s cover has no SHA-256`);
  }
});

test("a picture that does not match the feed's SHA-256 is refused, and a matching one is kept", async () => {
  const base = mkdtempSync(path.join(tmpdir(), "feed-images-"));
  mkdirSync(path.join(base, "src/data"), { recursive: true });
  const good = Buffer.from("the real picture");
  const image = {
    url: "https://media.pennypawsgames.com/p/toy/abc-01_listing.jpg",
    sha256: createHash("sha256").update(good).digest("hex"),
  };
  writeFileSync(path.join(base, "src/data/feed.json"), JSON.stringify({ printables: [{ id: "toy", images: [image] }] }));
  writeFileSync(path.join(base, "src/data/covers.json"), "{}");
  writeFileSync(path.join(base, "src/data/shelf.json"), JSON.stringify({ books: [] }));
  const answer = (bytes) => async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes });
  const quiet = { base, log: () => {} };

  await assert.rejects(fetchFeedImages({ ...quiet, get: answer(Buffer.from("something else")) }), /does not match the SHA-256/);
  assert.deepEqual(readdirSync(path.join(base, "src/assets/feed")), []);

  await fetchFeedImages({ ...quiet, get: answer(good) });
  assert.deepEqual(readdirSync(path.join(base, "src/assets/feed")), [feedImageName(image)]);

  // Kept files are reused: a second run asks the network for nothing.
  await fetchFeedImages({ ...quiet, get: async () => assert.fail("fetched again") });
});

test("a picture address off the media bucket is refused", async () => {
  const base = mkdtempSync(path.join(tmpdir(), "feed-images-"));
  mkdirSync(path.join(base, "src/data"), { recursive: true });
  const image = { url: "https://example.org/p/toy/abc-01_listing.jpg", sha256: "0".repeat(64) };
  writeFileSync(path.join(base, "src/data/feed.json"), JSON.stringify({ printables: [{ id: "toy", images: [image] }] }));
  writeFileSync(path.join(base, "src/data/covers.json"), "{}");
  writeFileSync(path.join(base, "src/data/shelf.json"), JSON.stringify({ books: [] }));
  await assert.rejects(fetchFeedImages({ base, log: () => {}, get: async () => assert.fail("fetched") }), /Not a media bucket address/);
});

// "node ops/feed-images.mjs" must really fetch when run by hand, also through a directory link:
// a plain "am I the main module" comparison is false through a junction and the script would
// exit 0 having done nothing. Needs the pictures in place (npm run check builds first), so it
// asks the network for nothing.
test("node ops/feed-images.mjs really runs, also through a directory link", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const link = path.join(mkdtempSync(path.join(tmpdir(), "pennypaws-link-")), "checkout");
  symlinkSync(root, link, "junction");
  try {
    for (const cwd of [root, link]) {
      const r = spawnSync(process.execPath, ["ops/feed-images.mjs"], { cwd, encoding: "utf8" });
      assert.equal(r.status, 0, `node ops/feed-images.mjs in ${cwd} failed:\n${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /feed pictures: \d+ in use, 0 fetched/, `nothing ran in ${cwd}:\n${r.stdout}`);
    }
  } finally {
    unlinkSync(link);
    rmdirSync(path.dirname(link));
  }
});
