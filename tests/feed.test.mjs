// Product facts come from the feed and from nowhere else.
//
// src/data/feed.json is generated from each product's own source and arrives by pull request.
// These tests keep three promises: the copy here is a feed this build understands and holds
// only what a public feed may hold; no page or data file types a price or a product's store
// address beside it; and a picture that does not match the feed's SHA-256 is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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
    "live_date", "printable"],
};

test("the feed is a version this build reads, with the three collections", () => {
  assert.equal(feed.schema_version, 1);
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

test("each printable's cover is a picture the feed names", async () => {
  assert.equal((await wanted()).length, feed.printables.length);
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
  await assert.rejects(fetchFeedImages({ base, log: () => {}, get: async () => assert.fail("fetched") }), /Not a media bucket address/);
});
