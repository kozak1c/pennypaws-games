// What the pages lay out: each product's facts joined with the site's own words about it.
//
// FACTS ARE NOT TYPED HERE. Names, prices, store addresses, statuses, page counts, pairings
// and listing pictures come from the feed (src/data/feed.json, read through the content
// collections in src/content.config.ts). A product appears on the site because the feed
// names it, and leaves when the feed drops it.
//
// What is typed here is the site's own: how it words a product on a card, which art it shows,
// and the order of the shelves. Those words may quote a number only if the product's facts
// in the feed hold the same number; the build fails otherwise (checkNumbers below). A game's
// counts are never typed: write {fact_name} and the feed's value is filled in.
import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import covers from './covers.json';
import shelf from './shelf.json';

const art = import.meta.glob<{ default: ImageMetadata }>('../assets/**/*.{webp,png}', { eager: true });
const img = (path: string): ImageMetadata => {
  const hit = art[`../assets/${path}`];
  if (!hit) throw new Error(`Missing image: src/assets/${path}`);
  return hit.default;
};

// Listing pictures from the feed, fetched and hash-checked before the build (ops/feed-images.mjs).
const fetched = import.meta.glob<{ default: ImageMetadata }>('../assets/feed/*.{jpg,jpeg,png,webp}', { eager: true });
const feedImage = (image: { url: string; sha256: string }): ImageMetadata => {
  const ext = image.url.slice(image.url.lastIndexOf('.')).toLowerCase();
  const hit = fetched[`../assets/feed/${image.sha256.slice(0, 16)}${ext}`];
  if (!hit) throw new Error(`Feed picture not fetched: ${image.url} (run node ops/feed-images.mjs)`);
  return hit.default;
};

// The brand's own addresses. `play` stands in for a game's tester link until the feed carries one.
export const stores = {
  etsy: 'https://www.etsy.com/shop/PennyPawsPrintables',
  instagram: 'https://www.instagram.com/pennypaws.games/',
  facebook: 'https://www.facebook.com/pennypawsprintables',
  email: 'quietops89@gmail.com',
  play: 'https://play.google.com/store/apps',
};

export interface Pic {
  src: ImageMetadata;
  alt: string;
}

// ---- helpers shared with games.ts ------------------------------------------------------------

/** Feed text is plain; the site sets apostrophes as the rest of its words do. */
export const smart = (text: string) => text.replace(/(\p{L})'(\p{L})/gu, '$1’$2');
const usd = (amount: string) => `$${amount}`;

const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(strings)
        : typeof value === 'number'
          ? [String(value)]
          : [];
const numbers = (text: string) => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''));

/** Fails the build when the site's words about a product state a number its facts do not hold. */
export function checkNumbers(what: string, words: unknown, facts: unknown) {
  const known = new Set(strings(facts).flatMap(numbers));
  const loose = [...new Set(strings(words).flatMap(numbers))].filter((n) => !known.has(n));
  if (loose.length) {
    throw new Error(
      `${what}: the site's words state ${loose.join(', ')}, which the product's facts in src/data/feed.json do not. ` +
        'Fix the words here, or fix the fact where the product lives.',
    );
  }
}

/** Fills {fact_name} from a game's facts. An unknown name fails the build. */
export function fill<T>(what: string, words: T, facts: Record<string, unknown>): T {
  const one = (text: string) =>
    text.replace(/\{(\w+)\}/g, (_, key: string) => {
      if (!(key in facts)) throw new Error(`${what}: the feed has no fact "${key}"`);
      return String(facts[key]);
    });
  const walk = (value: unknown): unknown =>
    typeof value === 'string'
      ? one(value)
      : Array.isArray(value)
        ? value.map(walk)
        : value && typeof value === 'object' && !('src' in value && 'width' in value)
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
          : value;
  return walk(words) as T;
}

/** The site's own order first, then anything new from the feed. */
function inOrder<T extends { id: string }>(rows: T[], order: string[]): T[] {
  const place = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  return [...rows].sort((a, b) => place(a.id) - place(b.id) || a.id.localeCompare(b.id));
}

// ---- printables --------------------------------------------------------------------------------

export interface Printable {
  id: string;
  name: string;
  line: string;
  hook: string;
  price: string;
  /** This printable's own listing in the Etsy shop. */
  etsy: string;
  cover: Pic;
  facts: string[];
  /** "A look inside": the printable's Etsy listing pictures from the feed, all but its cover. */
  gallery: Pic[];
  seasonal?: boolean;
  book?: string;
  pair?: { blank: Pic; colored: Pic; caption: string };
  made?: { pic: Pic; caption: string };
  inside?: { lead: string; rest: string }[];
  get?: string[];
}

/** The site's words and art for a printable. Everything is optional: a printable with none still gets its page. */
interface PrintableWords {
  name?: string;
  line?: string;
  hook?: string;
  coverAlt?: string;
  facts?: string[];
  seasonal?: boolean;
  pair?: Printable['pair'];
  made?: Printable['made'];
  inside?: Printable['inside'];
  get?: string[];
}

const sheet = (folder: string, n: number, alt: string): Pic => ({
  src: img(`printables/${folder}/page-${n}.webp`),
  alt,
});

/** A coloring page that peeks out of the home page's Printables door (decoration; the printable's own
 *  page shows its listing pictures from the feed). */
export const doorSheet = sheet('squishy-coloring', 8, '');

// Keyed by the product's id in the feed, in shelf order.
const printableWords: Record<string, PrintableWords> = {
  'squishy-coloring': {
    name: 'Squishy coloring pages',
    line: '25 pages in three levels, each with a colored example.',
    hook: 'Glitter dumplings, butter blocks and boba buddies to color, each with a finished example to copy or beat.',
    coverAlt: 'Squishy coloring pages: a colored glitter dumpling beside the page it came from',
    facts: ['25 pages', 'Three levels, ages 4 and up', 'US Letter and A4', 'Instant download'],
    pair: {
      blank: sheet('squishy-coloring', 2, 'The glitter dumpling page, ready to color'),
      colored: sheet('squishy-coloring', 1, 'The same glitter dumpling, colored in'),
      caption: 'The page you print, and the example that comes with it.',
    },
    made: {
      pic: {
        src: img('printables/squishy-coloring/finished.webp'),
        alt: 'Three finished paper squishies, colored, cut out and stuffed',
      },
      caption: 'Three of the pages are paper squishies to cut, stuff and squish.',
    },
    inside: [
      { lead: '7 easy pages', rest: 'big, bold squishies for little hands' },
      { lead: '9 fun scenes', rest: 'a dumpling steamer, a toast slide, a pillow fort, a bubble bath and more' },
      { lead: '6 detailed pages', rest: 'a claw machine, a vending machine and a pile of 42 squishies to find' },
      { lead: '3 paper squishies', rest: 'color, cut, tape, stuff and squish' },
    ],
    get: [
      'All 25 pages as US Letter and A4 PDFs',
      'Every page fully colored, for ideas',
      '25 single PNG pages for tablets',
      'A short printing guide',
    ],
  },
  'paper-squishy': {
    name: 'Paper squishies',
    line: '20 to color, cut, tape, stuff and squish.',
    hook: 'A rainy afternoon sorted: color a squishy, cut it out, tape the edges, stuff it and squeeze.',
    coverAlt: 'Paper squishies: finished paper toys beside the printed pages',
    facts: ['20 designs', 'Color, cut, tape and stuff', 'US Letter and A4', 'Instant download'],
    get: [
      'All 20 paper squishies in full color, ready to cut out',
      'The same 20 to color yourself',
      'Play pages to go with them',
      'US Letter and A4 PDFs',
    ],
  },
  'squishy-bundle': {
    name: 'The squishy bundle',
    line: '50 coloring pages and 20 paper squishies in one download.',
    hook: 'Both squishy coloring sets and every paper squishy in one download, for less than buying them one by one.',
    coverAlt: 'The squishy bundle: 70 pages of coloring and paper crafts',
    facts: ['50 pages to color', '20 paper squishies to make', 'Instant download'],
    get: [
      'Squishy coloring pages: 25 pages',
      'Squishy Christmas coloring pages: 25 pages',
      'Paper squishies: 20 to color, cut, tape, stuff and squish',
      'A fully colored example of every coloring page',
    ],
  },
  'squishy-christmas': {
    name: 'Squishy Christmas coloring pages',
    line: '25 festive pages to print tonight, each with a colored example.',
    hook: 'Squishy friends trim the tree, peek out of stockings, bake cookies and go sledding.',
    coverAlt: 'Squishy Christmas coloring pages: festive squishies around an open coloring page',
    facts: ['25 pages', 'A colored example of each', 'Instant download'],
    get: [
      'All 25 pages as PDFs',
      '25 single PNG pages for tablets',
      'A colored example of every page',
      'A short start-here guide',
    ],
    seasonal: true,
  },
  'north-pole-caper': {
    line: 'A printable mystery the whole family solves. 16 clues, one answer, about an hour.',
    hook: 'Santa’s sleigh is missing and 4,000 elves are suspects. Print the clues, pass them round the table and work out who did it.',
    coverAlt: 'Who Took Santa’s Sleigh? A printable Christmas mystery game',
    facts: ['16 clues', 'One answer', 'About an hour', 'Instant download'],
    get: [
      'A warm-up case: 48 elves and 8 clues, about 10 minutes',
      'The main case: a roster of 4,000 elves and 16 clues in three chapters',
      'Hints and the solution, each in its own PDF',
      'A short case briefing video',
    ],
    seasonal: true,
  },
  'cozy-cats-mosaics': {
    name: 'Cat mystery mosaics',
    line: '30 large print cats to color by number, from a tabby in a teacup to a tuxedo in a bow tie.',
    facts: ['30 pictures', 'Large print', 'Instant download'],
  },
  'cozy-winter-mosaics': {
    name: 'Winter mystery mosaics',
    line: '30 large print winter pictures to color by number, and not one of them is Christmas.',
    facts: ['30 pictures', 'Large print', 'Instant download'],
  },
  'mosaics-bundle': {
    name: 'The mosaics bundle',
    line: 'All three mystery mosaic books, Christmas, Winter and Cats: 90 pictures for less than buying them one by one.',
    facts: ['90 pictures', 'Three books', 'Instant download'],
  },
  'pink-haunted-house': {
    line: 'A printable Halloween mystery the whole family solves. 16 clues, no murder, exactly one answer.',
    facts: ['16 clues', 'One answer', 'Instant download'],
  },
  'cozy-christmas-mosaics': {
    name: 'Christmas mystery mosaics',
    line: '30 large print color-by-number pictures for kids and grandparents.',
    hook: 'Color the squares by number and a cozy Christmas picture appears. The print is large, so kids and grandparents can share a page.',
    coverAlt: 'Cozy Christmas mystery mosaics: a color-by-number page half colored in',
    facts: ['30 pictures', 'Large print', 'Instant download'],
    get: [
      '30 large print pictures in one PDF',
      '5 to 9 colors a page, all found in an ordinary box of colored pencils',
      'A riddle at the top of each page as a hint',
      'The finished pictures at the back, if you want to peek',
    ],
    seasonal: true,
  },
};

type FeedPrintable = CollectionEntry<'printables'>['data'];
type FeedBook = CollectionEntry<'books'>['data'];
type FeedGame = CollectionEntry<'games'>['data'];

const feedPrintables = (await getCollection('printables')).map((entry) => entry.data);
const feedBooks = (await getCollection('books')).map((entry) => entry.data);
export const feedGames = (await getCollection('games')).map((entry) => entry.data);

/** What a printable's listing says about it: the facts the site's words are checked against. */
const said = (p: FeedPrintable) => [p.name, p.title, p.hook, p.description, p.features, p.faq, p.price];
const saidOfBook = (b: FeedBook) => [b.title, b.subtitle, b.pages, b.trim, b.price];

export const printables: Printable[] = inOrder(feedPrintables, Object.keys(printableWords)).map((p) => {
  const words = printableWords[p.id] ?? {};
  const { pair, made, coverAlt, ...text } = words;
  checkNumbers(`Printable "${p.id}"`, [text, pair?.caption, made?.caption], said(p));
  const coverAt = (covers as Record<string, number>)[p.id] ?? 0;
  const picked = p.images[coverAt];
  return {
    id: p.id,
    name: words.name ?? smart(p.name),
    line: words.line ?? smart(p.title),
    hook: words.hook ?? smart(p.hook),
    price: usd(p.price),
    etsy: p.etsy_url,
    cover: { src: feedImage(picked), alt: coverAlt ?? picked.alt },
    facts: words.facts ?? [],
    gallery: p.images.filter((_, i) => i !== coverAt).map((image) => ({ src: feedImage(image), alt: smart(image.alt) })),
    seasonal: words.seasonal,
    book: p.book ?? undefined,
    pair,
    made,
    inside: words.inside,
    get: words.get ?? p.features.map(smart),
  };
});

// ---- books -------------------------------------------------------------------------------------

export interface Book {
  id: string;
  name: string;
  line: string;
  blurb: string;
  price: string;
  cover: Pic;
  amazon: string;
  facts: string[];
  peek: Pic[];
  printable?: string;
  seasonal?: boolean;
}

/** The site's words for a book on the shelf (src/data/shelf.json names the shelf, in order; a book
 *  there without words here shows the feed's subtitle). Its cover is not typed here: it is the
 *  front of the cover uploaded to Amazon, from the feed. */
interface BookWords {
  line?: string;
  blurb?: string;
  facts?: string[];
  peek?: Pic[];
  seasonal?: boolean;
}

const bookWords: Record<string, BookWords> = {
  'squishy-coloring': {
    line: '25 designs, from easy pages for little hands to a big pile of squishies.',
    blurb: 'Glitter dumplings, butter blocks and boba buddies, from easy pages for little hands to a page with 42 squishies to find.',
    facts: ['25 designs', 'Three levels', '8.5 × 11 in pages'],
    peek: [
      sheet('squishy-coloring', 2, 'A glitter dumpling page'),
      sheet('squishy-coloring', 7, 'A claw machine page'),
      sheet('squishy-coloring', 9, 'A big pile of squishies page'),
    ],
  },
  'squishy-christmas': {
    line: 'The paperback, ready to wrap. 25 designs, one per sheet.',
    blurb: 'Squishy friends trim the tree, peek out of stockings, bake cookies and go sledding. One design per sheet, so markers don’t bleed through.',
    facts: ['25 designs', 'One design per sheet', '8.5 × 11 in pages'],
    peek: [
      sheet('squishy-christmas', 4, 'A trim the tree page'),
      sheet('squishy-christmas', 2, 'A stocking surprise page'),
      sheet('squishy-christmas', 3, 'A gingerbread buddy page'),
    ],
    seasonal: true,
  },
  'cozy-christmas-mosaics': {
    line: 'Large print color by number: 30 cozy Christmas pictures, a page at a time.',
    blurb: 'Color the squares by number and a cozy Christmas picture appears, from Santa to a mug of hot cocoa. Big squares and large print, so kids and grandparents can share a page.',
    facts: ['30 pictures', 'Large print', '8.5 × 11 in pages'],
    seasonal: true,
  },
};

/** Books the feed names that are not on the shelf (src/data/shelf.json). */
export const booksOffShelf = feedBooks.filter((b) => !shelf.books.includes(b.id)).map((b) => b.id);
if (booksOffShelf.length) {
  console.warn(`[feed] not on the shelf (src/data/shelf.json): ${booksOffShelf.map((id) => `book ${id}`).join(', ')}`);
}
for (const id of Object.keys(bookWords)) {
  if (!shelf.books.includes(id)) throw new Error(`Book "${id}" has words in catalog.ts but is not in src/data/shelf.json`);
}

export const books: Book[] = inOrder(
  feedBooks.filter((b) => shelf.books.includes(b.id)),
  shelf.books,
).map((b) => {
  const { peek, ...text } = bookWords[b.id] ?? {};
  const pages = feedPrintables.find((p) => p.id === b.printable);
  checkNumbers(`Book "${b.id}"`, text, [saidOfBook(b), pages ? said(pages) : []]);
  const subtitle = b.subtitle ? smart(b.subtitle) : '';
  return {
    id: b.id,
    name: smart(b.title),
    line: text.line ?? subtitle,
    blurb: text.blurb ?? subtitle,
    price: usd(b.price),
    cover: { src: feedImage(b.cover), alt: smart(b.cover.alt) },
    amazon: b.amazon_url,
    facts: text.facts ?? [b.pages ? `${b.pages} pages` : '', b.trim ? `${b.trim.replace(' x ', ' × ')} pages` : ''].filter(Boolean),
    peek: peek ?? [],
    printable: b.printable ?? undefined,
    seasonal: text.seasonal,
  };
});

// ---- Squishy Bop! ------------------------------------------------------------------------------

/** How the site says where a game stands. */
export const statusWords = {
  'coming-soon': 'Coming soon',
  testing: 'In testing on Android',
  live: 'On Google Play',
} as const;

export const feedGame = (id: string): FeedGame => {
  const hit = feedGames.find((g) => g.id === id);
  if (!hit) throw new Error(`The site has a page for the game "${id}", but the feed does not name it`);
  return hit;
};

/** A game's facts as its words may quote them: its counts, its ages and what it charges. */
export const saidOfGame = (g: FeedGame) => [g.facts, g.ages, g.purchases, g.price_usd];

/** A game's ages as the site says them: the feed writes "6+" and the site says it in words. Nothing while undecided. */
export const agesWords = (g: FeedGame): string | undefined => {
  if (!g.ages) return undefined;
  const from = /^(\d+)\+$/.exec(g.ages);
  if (!from) throw new Error(`Game "${g.id}": ages "${g.ages}" in the feed is not written like "6+"`);
  return `Ages ${from[1]} and up`;
};

const shot = (file: string, alt: string, caption: string) => ({
  src: img(`games/squishy-bop/${file}.webp`),
  alt,
  caption,
});

const bop = feedGame('squishy-bop');
const bopWords = {
  pitch: 'Every block is a squishy plush friend, and they can’t wait to pop.',
  promise: 'Free to play. No sign-in. Ads never interrupt a game.',
  shots: [
    shot('01_superpower', 'A rainbow wave clearing the board', 'Fill a row and it pops into a song'),
    shot('03_collection', 'The collection of rare squishies', 'Find all {rare_collection_size} rare squishies'),
    shot('04_adventure', 'An Adventure mode puzzle', 'Solve {adventure_level_count} Adventure puzzles'),
    shot('07_playground', 'The Squishy Playground', 'Or just squeeze them in the Playground'),
    shot('06_scenes', 'Cozy places to play', 'Pick a cozy place to play'),
  ],
  parts: [
    {
      title: 'Fill a row and the squishies pop',
      text: 'Drag pieces onto the board. A full row or column puffs up and pops, one note at a time, into a happy little song.',
    },
    {
      title: 'Give your buddy a superpower',
      text: 'Kitty, Bunny, Froggy, Panda and Uni each have their own. Fill the power ring, tap it, and watch your buddy pounce, hop or send a rainbow wave across the board.',
    },
    {
      title: 'Play together',
      text: 'Take turns on one phone every three pieces. Cozy mode is gentle for little ones, and Classic is a real challenge for grown-ups.',
    },
  ],
  grownUps: [
    {
      term: 'Ads',
      text: 'Never during a game. There’s a short ad break between games now and then, and watching a video for a bonus is always a choice.',
    },
    {
      term: 'Purchases',
      text: 'One optional purchase, the Squishy Pass, removes ad breaks. It’s a single payment, not a subscription, and sits behind a grown-up check.',
    },
    { term: 'Accounts', text: 'None. There’s no sign-in, and progress stays on the device.' },
    { term: 'Reading', text: 'Big words are read aloud, so early readers can play too.' },
    {
      term: 'Joining the test',
      text: 'Squishy Bop! is in testing on Android. The button takes you to Google Play to opt in with your Google account.',
    },
  ],
};
checkNumbers('Game "squishy-bop"', [bopWords.pitch, bopWords.promise, bopWords.parts, bopWords.grownUps], saidOfGame(bop));

export const squishyBop = {
  id: bop.id,
  name: smart(bop.name),
  tagline: smart(bop.tagline),
  status: statusWords[bop.status],
  /** Who it is for: the game's own ages, from the feed. */
  forWhom: agesWords(bop),
  testerUrl: bop.tester_url ?? bop.play_url ?? stores.play,
  icon: { src: img('games/squishy-bop/icon.webp'), alt: '' },
  feature: {
    src: img('games/squishy-bop/feature.webp'),
    alt: 'Squishy Bop! title art with plush block friends',
  },
  ...fill('Game "squishy-bop"', bopWords, bop.facts),
};

export const printable = (id: string) => {
  const hit = printables.find((p) => p.id === id);
  if (!hit) throw new Error(`No printable "${id}"`);
  return hit;
};
export const book = (id: string) => {
  const hit = books.find((b) => b.id === id);
  if (!hit) throw new Error(`No book "${id}"`);
  return hit;
};

export const brand = {
  logo: img('brand/logo-games-wide.webp'),
  mark: img('brand/mark-white.webp'),
  pennyRest: img('brand/penny-rest.png'),
  logoTight: img('brand/logo-games.webp'),
  clay: (shape: string) => img(`brand/clay-${shape}.webp`),
};
