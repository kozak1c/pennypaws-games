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

const clips = import.meta.glob<string>('../assets/games/**/play.mp4', { eager: true, query: '?url', import: 'default' });
const clip = (id: string): string => {
  const hit = clips[`../assets/games/${id}/play.mp4`];
  if (!hit) throw new Error(`Missing clip: src/assets/games/${id}/play.mp4`);
  return hit;
};

/** A game's "See it played" strip: one clip of real play, then captioned screenshots. */
export interface Played {
  clip: string;
  poster: ImageMetadata;
  /** What happens in the clip, for people who cannot see it. */
  label: string;
  caption: string;
  shots: (Pic & { caption: string })[];
}

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
  played: Played;
}

export const bopPlayed: Played = {
  clip: clip('squishy-bop'),
  poster: img('squishy-bop/play-poster.png'),
  label: 'Squishy Bop! being played: a piece is dragged from the tray onto the board, two rows of squishies fill and pop, and a sticker is won',
  caption: squishyBop.shots[0].caption,
  shots: squishyBop.shots.slice(1),
};

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
    played: {
      clip: clip('plush-hour'),
      poster: img('plush-hour/play-poster.png'),
      label: 'Plush Hour being played at the start of the game: thread spools are dragged together to make a button, a yarn basket is tapped for more, and they merge into a yarn ball',
      caption: 'Drag two of a kind together',
      shots: [
        { src: img('plush-hour/shot-room_front.webp'), alt: 'The Storefront, partly restored, with three plush neighbors outside', caption: 'Bring the shop back room by room' },
        { src: img('plush-hour/shot-pick_look.webp'), alt: 'Choosing one of three looks for a yarn basket in the Workshop', caption: 'Choose a look for each piece' },
        { src: img('plush-hour/shot-room_alive.webp'), alt: 'The Tea Room, restored, with plush friends having tea', caption: 'Watch each room fill up' },
        { src: img('plush-hour/shot-chapter.webp'), alt: 'A story card: Chapter 2 complete, The Workshop', caption: 'Follow a story in six chapters' },
      ],
    },
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
    played: {
      clip: clip('giggle-bomb'),
      poster: img('giggle-bomb/play-poster.png'),
      label: 'Giggle Bomb being played: a player pops every bubble without touching the bombs, gets a Perfect, and the next player’s game is picked',
      caption: 'Beat a quick minigame',
      shots: [
        { src: img('giggle-bomb/shot-whack.webp'), alt: 'A minigame: splat the goo monsters as they pop out of their holes', caption: 'Each one takes seconds' },
        { src: img('giggle-bomb/shot-dare.webp'), alt: 'The dare wheel, landed on a silly face dare for everyone but one player', caption: 'Get splatted and spin for a dare' },
        { src: img('giggle-bomb/shot-table.webp'), alt: 'Four players sitting round the table with their plush animals', caption: 'Up to five players on one phone' },
        { src: img('giggle-bomb/shot-win.webp'), alt: 'The winner’s screen: a crown and the words Giggle Champion', caption: 'Play for the crown' },
      ],
    },
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
