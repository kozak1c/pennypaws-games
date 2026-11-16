// Brings the product pictures the pages use (printable and book covers) from the media bucket
// into src/assets/feed/, so they go through the same image pipeline as local art and are served
// from our own origin.
//
// Each picture's address and SHA-256 come from the feed (src/data/feed.json). A file that
// does not match its hash is refused. Files already fetched are reused, so a build with a
// warm folder needs no network. src/assets/feed/ is not tracked.
//
//   node ops/feed-images.mjs        fetch what is missing
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA_HOST = 'media.pennypawsgames.com';

/** The file name a feed picture is kept under: its hash, so a changed picture is a new file. */
export const feedImageName = (image) => `${image.sha256.slice(0, 16)}${extname(new URL(image.url).pathname).toLowerCase()}`;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Which pictures the pages use: every listing picture of each printable (its cover, which
 *  src/data/covers.json picks, and the rest for its "A look inside" gallery) and the cover of each
 *  book on the shelf (src/data/shelf.json; the front of the cover uploaded to Amazon), and the named
 *  site pages of those printables and books (decoration rendered from released files; every listed
 *  page is used). A picture no page uses is not fetched, or the build would ship it. */
export async function wanted(base = root) {
  const feed = JSON.parse(await readFile(join(base, 'src/data/feed.json'), 'utf8'));
  const covers = JSON.parse(await readFile(join(base, 'src/data/covers.json'), 'utf8'));
  const printables = (feed.printables ?? []).flatMap((p) => {
    if (!p.images[covers[p.id] ?? 0]) throw new Error(`src/data/covers.json picks picture ${covers[p.id]} of ${p.id}, which has ${p.images.length}`);
    return p.images;
  });
  const shelf = JSON.parse(await readFile(join(base, 'src/data/shelf.json'), 'utf8')).books;
  const books = (feed.books ?? []).filter((b) => shelf.includes(b.id)).map((b) => {
    if (!b.cover) throw new Error(`The feed gives book ${b.id} no cover`);
    return b.cover;
  });
  const pages = [...(feed.printables ?? []), ...(feed.books ?? []).filter((b) => shelf.includes(b.id))]
    .flatMap((row) => row.site_pages ?? []);
  const seen = new Set();
  return [...printables, ...books, ...pages].filter((p) => !seen.has(p.sha256) && seen.add(p.sha256));
}

/** One picture's bytes, retried with a pause when the connection drops or the bucket answers 5xx or
 *  429 (a workflow fetching about ninety pictures meets the odd dropped connection). A 4xx other
 *  than 429 is not retried: the picture is not there. The error names the address and the cause. */
export async function download(url, get = fetch, { tries = 4, pause = (n) => new Promise((r) => setTimeout(r, 1000 * 3 ** n)) } = {}) {
  let last;
  for (let n = 0; n < tries; n += 1) {
    if (n > 0) await pause(n - 1);
    try {
      const response = await get(url);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = new Error(`${url} answered ${response.status}`);
      if (response.status < 500 && response.status !== 429) throw last;
    } catch (error) {
      if (error === last) throw error;
      const cause = error?.cause?.code || error?.cause?.message || error?.message || String(error);
      last = new Error(`${url} could not be fetched (${cause})`);
    }
  }
  throw last;
}

export async function fetchFeedImages({ base = root, log = console.log, get = fetch } = {}) {
  const folder = join(base, 'src/assets/feed');
  await mkdir(folder, { recursive: true });
  const images = await wanted(base);
  const keep = new Set(images.map(feedImageName));
  let fetched = 0;
  for (const image of images) {
    const url = new URL(image.url);
    if (url.protocol !== 'https:' || url.hostname !== MEDIA_HOST) throw new Error(`Not a media bucket address: ${image.url}`);
    const file = join(folder, feedImageName(image));
    const have = await readFile(file).catch(() => null);
    if (have && sha256(have) === image.sha256) continue;
    const bytes = await download(image.url, get);
    if (sha256(bytes) !== image.sha256) throw new Error(`${image.url} does not match the SHA-256 in the feed; refusing it`);
    await writeFile(file, bytes);
    fetched += 1;
  }
  // A picture the feed no longer names is not built into the site.
  for (const name of await readdir(folder)) if (!keep.has(name)) await rm(join(folder, name));
  log(`feed pictures: ${images.length} in use, ${fetched} fetched`);
}

/** Astro integration: the pictures are in place before any page is built or served. */
export default function feedImages() {
  return {
    name: 'feed-images',
    hooks: {
      'astro:config:setup': async ({ logger }) => {
        await fetchFeedImages({ log: (line) => logger.info(line) });
      },
    },
  };
}

// Run from the command line. Both paths are resolved first: through a directory junction one
// side is the junction and the other the real path, and a plain comparison is silently false.
const real = (p) => { try { return realpathSync(p); } catch { return p; } };
if (process.argv[1] && real(fileURLToPath(import.meta.url)) === real(process.argv[1])) await fetchFeedImages();
