// Every game the site names, in the order it lists them. Squishy Bop! has its own fuller page; the games
// that are not out yet share one page layout and say "Coming soon" in place of a store button.
// The words for Plush Hour and Giggle Bomb come from each game's own store listing.
import type { ImageMetadata } from 'astro';
import { squishyBop, type Pic } from './catalog';

const art = import.meta.glob<{ default: ImageMetadata }>('../assets/games/**/*.{webp,png}', { eager: true });
const img = (path: string): ImageMetadata => {
  const hit = art[`../assets/games/${path}`];
  if (!hit) throw new Error(`Missing image: src/assets/games/${path}`);
  return hit.default;
};

export interface GameCard {
  id: string;
  name: string;
  tagline: string;
  status: string;
  icon: Pic;
  feature: Pic;
}

export interface SoonGame extends GameCard {
  /** The tray colour for this game's own page: its art's colours, used nowhere else. */
  tone: 'rose' | 'sunset';
  pitch: string;
  /** Who it is for, where the game's listing says so. */
  audience?: string;
  parts: { title: string; text: string }[];
  grownUps: { term: string; text: string }[];
}

export const soonGames: SoonGame[] = [
  {
    id: 'plush-hour',
    name: 'Plush Hour',
    tagline: 'Merge cozy plush toys, reopen Grandma’s shop and find the memories she lost.',
    status: 'Coming soon',
    tone: 'rose',
    icon: { src: img('plush-hour/icon.png'), alt: '' },
    feature: {
      src: img('plush-hour/feature.png'),
      alt: 'Plush Hour title art: three plush shopkeepers, a sheep in glasses between two friends, in a pink toy shop',
    },
    pitch:
      'Grandma Pom ran the plush shop on Buttonwood Lane for forty years. Then her stuffing wore out, she had it replaced, and every memory she had went with it. The shop is dusty, the bell only goes thunk, and it is yours to reopen.',
    audience: 'Written for teens and adults who like a slow, kind game with a real story in it.',
    parts: [
      {
        title: 'Merge cozy things',
        text: 'Tap a yarn basket, a cookie jar or a tea kettle and see what comes out. Drag two of a kind together and they become something better.',
      },
      {
        title: 'Serve the neighbors',
        text: 'Everyone on the lane wants something. Fill their orders, and once a day ring the bell for Plush Hour: five minutes of customers at the door.',
      },
      {
        title: 'Bring the shop back',
        text: 'Six rooms wait under the dust, from the Storefront up to the Music Loft. Restore them piece by piece and choose a look for each piece.',
      },
      {
        title: 'Find what Pom left behind',
        text: 'The Bell Remembers is a story in six chapters about a grandmother, the daughter who stayed away, and why Pom hums whenever the bell rings.',
      },
    ],
    grownUps: [
      { term: 'Ads', text: 'No ad ever interrupts you. Videos are always your choice, and each one gives you something back.' },
      { term: 'Purchases', text: 'Gem packs are there if you want them, never in the way if you do not.' },
      { term: 'Offline', text: 'The game plays without a connection.' },
    ],
  },
  {
    id: 'giggle-bomb',
    name: 'Giggle Bomb',
    tagline: 'Pass the phone, beat a tiny game, and do not get caught holding the bomb!',
    status: 'Coming soon',
    tone: 'sunset',
    icon: { src: img('giggle-bomb/icon.png'), alt: '' },
    feature: {
      src: img('giggle-bomb/feature.png'),
      alt: 'Giggle Bomb title art: Sparky, a fuzzy round bomb with a smiling face, on pink clouds under a rainbow',
    },
    pitch:
      'A party game for 2 to 5 players on one phone. Sparky the bomb has a hidden fuse, and nobody knows how long it is. Beat a quick minigame, pass Sparky on, and whoever is holding him when he blows spins the dare wheel.',
    parts: [
      {
        title: 'Quick minigames',
        text: 'Pop the bubbles, run the maze, copy Simon, cut the right wire. Each one takes seconds. Brain games come in a kid version and a grown-up version, so a six-year-old and a grandpa can play the same round.',
      },
      {
        title: 'Dares the whole couch laughs at',
        text: 'Get splatted and the wheel picks your dare: silly acts, charades, draw it on the phone, hum that tune.',
      },
      {
        title: 'Showdowns',
        text: 'Every few turns two players go head to head: Tap War, Quick Draw, Thumb War, Staring Contest, Rock Paper Scissors. The loser takes the bomb.',
      },
    ],
    grownUps: [],
  },
];

export const allGames: GameCard[] = [
  {
    id: squishyBop.id,
    name: squishyBop.name,
    tagline: squishyBop.tagline,
    status: squishyBop.status,
    icon: squishyBop.icon,
    feature: squishyBop.feature,
  },
  ...soonGames,
];

// Site sections live beside the games at the root, so a game can never take one of these names.
const reserved = ['games', 'printables', 'books', 'grown-ups', 'play', 'go', '_astro'];
for (const game of allGames) {
  if (reserved.includes(game.id)) throw new Error(`Game id "${game.id}" is a reserved address`);
}
