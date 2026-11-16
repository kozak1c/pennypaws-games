// Product facts. Every game, printable and book the site names comes from src/data/feed.json,
// the public feed. That file is generated from each product's own source and arrives by pull
// request; nobody edits it here. A fact that is wrong is fixed where the product lives, and
// the next feed carries it. The site's own words and art choices live in src/data/catalog.ts
// and src/data/games.ts.
import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

/** The feed shape this build understands. A feed with another version fails the build.
 * 2: each book carries its cover (the front of the cover uploaded to Amazon, on the media bucket).
 * 3: printables and books carry site_pages: named single pages rendered from files released to
 *    buyers (digital_store `factory media pages`), the site's only decoration taken from a product. */
export const FEED_SCHEMA = 3;

const feed = (collection: 'games' | 'printables' | 'books') =>
  file('src/data/feed.json', {
    parser: (text) => {
      const data = JSON.parse(text);
      if (data.schema_version !== FEED_SCHEMA) {
        throw new Error(`src/data/feed.json is schema ${data.schema_version}; this build reads schema ${FEED_SCHEMA}`);
      }
      return data[collection];
    },
  });

// Every outbound address is https and on a host the site already sends people to.
const on = (...hosts: string[]) =>
  z.string().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
    } catch {
      return false;
    }
  }, `must be an https address on ${hosts.join(' or ')}`);

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
/** A picture on the media bucket: fetched before the build and checked against its SHA-256. */
const picture = z.strictObject({
  url: on('media.pennypawsgames.com'),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive(),
  alt: z.string().min(1),
});
/** A named page rendered from a file released to buyers, on the media bucket (PAWS-036). */
const sitePage = picture.extend({ name: id });
const sitePath = z.string().regex(/^\/[a-z0-9/-]*\/$/);
const money = z.string().regex(/^\d+\.\d{2}$/);
const fact = z.union([z.number(), z.string(), z.array(z.string())]);

const games = defineCollection({
  loader: feed('games'),
  schema: z
    .strictObject({
      id,
      name: z.string().min(1),
      tagline: z.string().min(1),
      status: z.enum(['coming-soon', 'testing', 'live']),
      page: sitePath,
      privacy: sitePath.nullable(),
      ages: z.string().nullable(),
      rating: z.string().nullable(),
      child_directed: z.boolean(),
      price: z.enum(['free', 'paid']),
      price_usd: money.nullable(),
      ads: z.array(z.enum(['rewarded', 'interstitial', 'banner'])),
      ads_personalized: z.boolean(),
      purchases: z.array(z.strictObject({ kind: z.string(), price_usd: money.optional() })),
      play_url: on('play.google.com').nullable(),
      tester_url: on('play.google.com').nullable(),
      facts: z.record(z.string(), fact),
    })
    .refine((game) => game.status !== 'live' || game.play_url, 'a live game needs its store address')
    .refine((game) => game.status === 'live' || !game.tester_url, 'only a live game may carry a tester link'),
});

const printables = defineCollection({
  loader: feed('printables'),
  schema: z.strictObject({
    id,
    name: z.string().min(1),
    title: z.string().min(1),
    hook: z.string().min(1),
    description: z.string(),
    collection: z.string(),
    price: money,
    currency: z.literal('USD'),
    etsy_url: on('etsy.com'),
    images: z.array(picture).min(1),
    features: z.array(z.string()),
    formats: z.array(z.string()),
    faq: z.array(z.strictObject({ q: z.string(), a: z.string() })),
    related: z.array(id),
    book: id.nullable(),
    site_pages: z.array(sitePage),
  }),
});

const books = defineCollection({
  loader: feed('books'),
  schema: z.strictObject({
    id,
    title: z.string().min(1),
    subtitle: z.string().nullable(),
    asin: z.string().regex(/^[A-Z0-9]{10}$/),
    isbn: z.string().nullable(),
    price: money,
    currency: z.literal('USD'),
    amazon_url: on('amazon.com'),
    pages: z.number().int().positive().nullable(),
    trim: z.string().nullable(),
    live_date: z.string().nullable(),
    printable: id.nullable(),
    cover: picture,
    site_pages: z.array(sitePage),
  }),
});

export const collections = { games, printables, books };
