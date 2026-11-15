// Everything the pages lay out. Typed here for the look build; the launch build moves these
// into content collections with the same field names (docs/site-plan.md, section 6).
import type { ImageMetadata } from 'astro';

const art = import.meta.glob<{ default: ImageMetadata }>('../assets/**/*.{webp,png}', { eager: true });
const img = (path: string): ImageMetadata => {
  const hit = art[`../assets/${path}`];
  if (!hit) throw new Error(`Missing image: src/assets/${path}`);
  return hit.default;
};

export const stores = {
  etsy: 'https://www.etsy.com/shop/PennyPawsPrintables',
  instagram: 'https://www.instagram.com/pennypaws.games/',
  facebook: 'https://www.facebook.com/pennypawsprintables',
  email: 'quietops89@gmail.com',
};

export interface Pic {
  src: ImageMetadata;
  alt: string;
}

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
  sheets: Pic[];
  seasonal?: boolean;
  book?: string;
  pair?: { blank: Pic; colored: Pic; caption: string };
  made?: { pic: Pic; caption: string };
  inside?: { lead: string; rest: string }[];
  get?: string[];
}

const sheet = (folder: string, n: number, alt: string): Pic => ({
  src: img(`printables/${folder}/page-${n}.webp`),
  alt,
});

export const printables: Printable[] = [
  {
    id: 'squishy-coloring-pages',
    etsy: 'https://www.etsy.com/listing/4604268235',
    name: 'Squishy coloring pages',
    line: '25 pages in three levels, each with a colored example.',
    hook: 'Glitter dumplings, butter blocks and boba buddies to color, each with a finished example to copy or beat.',
    price: '$3.99',
    cover: {
      src: img('printables/squishy-coloring/02_listing.webp'),
      alt: 'Squishy coloring pages: a colored glitter dumpling beside the page it came from',
    },
    facts: ['25 pages', 'Three levels, ages 4 and up', 'US Letter and A4', 'Instant download'],
    sheets: [
      sheet('squishy-coloring', 3, 'Easy: a butter block'),
      sheet('squishy-coloring', 4, 'Easy: a boba buddy'),
      sheet('squishy-coloring', 8, 'Fun scene: a bubble bath, colored in'),
      sheet('squishy-coloring', 5, 'A paw squishy, colored in'),
      sheet('squishy-coloring', 7, 'Detailed: a claw machine'),
      sheet('squishy-coloring', 9, 'Detailed: a big pile of squishies'),
      sheet('squishy-coloring', 6, 'Easy: a jelly cube'),
    ],
    book: 'squishy-coloring-book',
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
  {
    id: 'paper-squishies',
    etsy: 'https://www.etsy.com/listing/4610782218',
    name: 'Paper squishies',
    line: '20 to color, cut, tape, stuff and squish.',
    hook: 'A rainy afternoon sorted: color a squishy, cut it out, tape the edges, stuff it and squeeze.',
    price: '$4.99',
    cover: {
      src: img('printables/paper-squishy/01_listing.webp'),
      alt: 'Paper squishies: finished paper toys beside the printed pages',
    },
    facts: ['20 designs', 'Color, cut, tape and stuff', 'US Letter and A4', 'Instant download'],
    get: [
      'All 20 paper squishies in full color, ready to cut out',
      'The same 20 to color yourself',
      'Play pages to go with them',
      'US Letter and A4 PDFs',
    ],
    sheets: [
      sheet('paper-squishy', 1, 'A paper squishy page, front and back'),
      sheet('paper-squishy', 2, 'A second paper squishy page'),
      sheet('paper-squishy', 3, 'A third paper squishy page'),
    ],
  },
  {
    id: 'squishy-bundle',
    etsy: 'https://www.etsy.com/listing/4611447262',
    name: 'The squishy bundle',
    line: '50 coloring pages and 20 paper squishies in one download.',
    hook: 'Both squishy coloring sets and every paper squishy in one download, for less than buying them one by one.',
    price: '$9.99',
    cover: {
      src: img('printables/squishy-bundle/01_listing.webp'),
      alt: 'The squishy bundle: 70 pages of coloring and paper crafts',
    },
    facts: ['50 pages to color', '20 paper squishies to make', 'Instant download'],
    get: [
      'Squishy coloring pages: 25 pages',
      'Squishy Christmas coloring pages: 25 pages',
      'Paper squishies: 20 to color, cut, tape, stuff and squish',
      'A fully colored example of every coloring page',
    ],
    sheets: [],
  },
  {
    id: 'squishy-christmas-coloring-pages',
    etsy: 'https://www.etsy.com/listing/4610853433',
    name: 'Squishy Christmas coloring pages',
    line: '25 festive pages to print tonight, each with a colored example.',
    hook: 'Squishy friends trim the tree, peek out of stockings, bake cookies and go sledding.',
    price: '$3.99',
    cover: {
      src: img('printables/squishy-christmas/01_listing.webp'),
      alt: 'Squishy Christmas coloring pages: festive squishies around an open coloring page',
    },
    facts: ['25 pages', 'A colored example of each', 'Instant download'],
    get: [
      'All 25 pages as PDFs',
      '25 single PNG pages for tablets',
      'A colored example of every page',
      'A short start-here guide',
    ],
    sheets: [
      sheet('squishy-christmas', 4, 'Squishies trimming the tree'),
      sheet('squishy-christmas', 2, 'A stocking surprise'),
      sheet('squishy-christmas', 3, 'A gingerbread buddy'),
      sheet('squishy-christmas', 1, 'A Christmas squishy, colored in'),
    ],
    seasonal: true,
    book: 'squishy-christmas-coloring-book',
  },
  {
    id: 'who-took-santas-sleigh',
    etsy: 'https://www.etsy.com/listing/4586959797',
    name: 'Who Took Santa’s Sleigh?',
    line: 'A printable mystery the whole family solves. 16 clues, one answer, about an hour.',
    hook: 'Santa’s sleigh is missing and 4,000 elves are suspects. Print the clues, pass them round the table and work out who did it.',
    price: '$5.99',
    cover: {
      src: img('printables/north-pole-caper/01_listing.webp'),
      alt: 'Who Took Santa’s Sleigh? A printable Christmas mystery game',
    },
    facts: ['16 clues', 'One answer', 'About an hour', 'Instant download'],
    get: [
      'A warm-up case: 48 elves and 8 clues, about 10 minutes',
      'The main case: a roster of 4,000 elves and 16 clues in three chapters',
      'Hints and the solution, each in its own PDF',
      'A short case briefing video',
    ],
    sheets: [],
    seasonal: true,
  },
  {
    id: 'christmas-mystery-mosaics',
    etsy: 'https://www.etsy.com/listing/4606027106',
    name: 'Christmas mystery mosaics',
    line: '30 large print color-by-number pictures for kids and grandparents.',
    hook: 'Color the squares by number and a cozy Christmas picture appears. The print is large, so kids and grandparents can share a page.',
    price: '$4.99',
    cover: {
      src: img('printables/cozy-christmas-mosaics/01_cover_listing.webp'),
      alt: 'Cozy Christmas mystery mosaics: a color-by-number page half colored in',
    },
    facts: ['30 pictures', 'Large print', 'Instant download'],
    get: [
      '30 large print pictures in one PDF',
      '5 to 9 colors a page, all found in an ordinary box of colored pencils',
      'A riddle at the top of each page as a hint',
      'The finished pictures at the back, if you want to peek',
    ],
    sheets: [],
    seasonal: true,
  },
];

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
  printable: string;
  seasonal?: boolean;
}

export const books: Book[] = [
  {
    id: 'squishy-coloring-book',
    name: 'Squishy Coloring Book',
    line: '25 designs, from easy pages for little hands to a big pile of squishies.',
    blurb: 'Glitter dumplings, butter blocks and boba buddies, from easy pages for little hands to a page with 42 squishies to find.',
    price: '$9.99',
    cover: { src: img('books/squishy-coloring.webp'), alt: 'Squishy Coloring Book, paperback cover' },
    amazon: 'https://www.amazon.com/dp/B0HPY48PV8',
    facts: ['25 designs', 'Three levels', '8.5 × 11 in pages'],
    peek: [
      sheet('squishy-coloring', 2, 'A glitter dumpling page'),
      sheet('squishy-coloring', 7, 'A claw machine page'),
      sheet('squishy-coloring', 9, 'A big pile of squishies page'),
    ],
    printable: 'squishy-coloring-pages',
  },
  {
    id: 'squishy-christmas-coloring-book',
    name: 'Squishy Christmas Coloring Book',
    line: 'The paperback, ready to wrap. 25 designs, one per sheet.',
    blurb: 'Squishy friends trim the tree, peek out of stockings, bake cookies and go sledding. One design per sheet, so markers don’t bleed through.',
    price: '$9.99',
    cover: { src: img('books/squishy-christmas.webp'), alt: 'Squishy Christmas Coloring Book, paperback cover' },
    amazon: 'https://www.amazon.com/dp/B0HR29ZBCB',
    facts: ['25 designs', 'One design per sheet', '8.5 × 11 in pages'],
    peek: [
      sheet('squishy-christmas', 4, 'A trim the tree page'),
      sheet('squishy-christmas', 2, 'A stocking surprise page'),
      sheet('squishy-christmas', 3, 'A gingerbread buddy page'),
    ],
    printable: 'squishy-christmas-coloring-pages',
    seasonal: true,
  },
];

const shot = (file: string, alt: string, caption: string) => ({
  src: img(`games/squishy-bop/${file}.webp`),
  alt,
  caption,
});

export const squishyBop = {
  id: 'squishy-bop',
  name: 'Squishy Bop!',
  tagline: 'A block puzzle where every block is a plush friend that pops into a song.',
  pitch: 'Every block is a squishy plush friend, and they can’t wait to pop.',
  status: 'In testing on Android',
  promise: 'Free to play. No sign-in. Ads never interrupt a game.',
  // Stand-in until the owner supplies the public opt-in address.
  testerUrl: 'https://play.google.com/store/apps',
  icon: { src: img('games/squishy-bop/icon.webp'), alt: '' },
  feature: {
    src: img('games/squishy-bop/feature.webp'),
    alt: 'Squishy Bop! title art with plush block friends',
  },
  shots: [
    shot('01_superpower', 'A rainbow wave clearing the board', 'Fill a row and it pops into a song'),
    shot('03_collection', 'The collection of rare squishies', 'Find all 60 rare squishies'),
    shot('04_adventure', 'An Adventure mode puzzle', 'Solve 48 Adventure puzzles'),
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
