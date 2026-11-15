# Penny Paws Games site

## What this repo is

The static site at pennypawsgames.com and the pipeline that releases it. This repository is
**public**: write every file, commit message and pull request as something anyone may read.

The plan this implements is tracker task PAWS-001 (hosting, releases, rollback, monitoring).
Read it before changing hosting, branches or deploys. Operating steps are in
[docs/runbook.md](docs/runbook.md): read it when deploying, rolling back, or when a check is red.

### What is served

The site is an Astro project (`astro.config.mjs`, `src/`, `public/`) built into `dist/` by
`npm run build`. Cloudflare serves `dist/` as a static-assets Worker with no code in front of
it (`wrangler.jsonc`). `dist/` is never committed; every check and every deploy builds it
fresh from the commit it runs on.

`npm run build` is `astro build` (which first fetches the feed's product pictures; see "Product
facts come from the feed") plus the post-build step `ops/postbuild-cli.mjs` (the work is in
`ops/postbuild.mjs`), which:

- moves every inline script into a hashed file under `dist/_astro/`, because `_headers` sends
  `script-src 'self'` and Astro writes its island bootstrap inline. Never loosen the header
  (no hashes, nonces or `'unsafe-inline'`) to get a script through; and
- fails the build unless `dist/` holds exactly what `ops/public-files.txt` allows: the listed
  pages and fixed files, plus hashed files under `_astro/` that its pattern allows. So nothing
  becomes public by accident, and a deploy cannot upload a file nobody listed.

To add a page or file: add it (a page in `src/pages/`, a fixed file in `public/`), add its
line to `ops/public-files.txt`, and run `npm run check`. Pages use paths for their own links
(`/squishy-bop/privacy/`, not the full address) so they work on staging and previews, and
load nothing from another origin: no outside script, style, font, image, clip or frame
(`tests/policy.test.mjs`). Children open these pages.

## How a change goes live

1. Branch from `staging` and open a pull request **into `staging`**, as a draft while you
   work. Marking it ready starts the `ci` check and gives it a preview address.
2. Run `npm run check` and `npm run walk` before the first push, so `ci` runs once.
3. When `ci` is green, merge it into `staging` (Corey's agents: `/ship pennypaws-games <PR>`).
   Staging deploys itself and posts the commit status `staging/smoke`. A red staging is your
   next job, before anything else merges.
4. A draft pull request "Release YYYY-MM-DD" from `staging` into `main` collects what is
   waiting. **Only the owner merges it.** That merge deploys production, checks the live
   site and rolls itself back if the check fails.

Batch small changes into one pull request. Only the workflows deploy; they always pass
`--env`. `main` and production are the owner's: your work ends at `staging`.

Rolling production back to the last good version is allowed without asking (the `rollback`
workflow); report it. Going forward again is the owner's call.

## Commands

`paws.toml` names this repo's four standard commands for the shared Penny Paws tools (`check` is
`npm run check`, `gate` is `npm run check:all`, `release` lists the open release pull request, `status`
runs the health check against the live site).

| Command | What it does |
|---|---|
| `npm ci` | install the pinned tools |
| `npm run build` | build the site into `dist/` (Astro, then `ops/postbuild.mjs`) |
| `npm run check` | build, then everything `ci` runs except the browser (`ops/check.mjs` lists the steps) |
| `npm run walk` | build, then the browser walk: every page, phone and desktop, with an accessibility scan, and a dark pass for the pages that have a dark style. `PLAYWRIGHT_CHANNEL=msedge` uses an installed Edge |
| `npm run dev` | build, then the site at http://127.0.0.1:8787, served the way Cloudflare serves it |
| `npm run site:dev` | Astro's own development server at http://127.0.0.1:4391, which reloads as you edit (not how Cloudflare serves it: no `_headers`) |
| `npm run site:preview` | Astro's preview of the last build in `dist/`, at http://127.0.0.1:4392 |
| `python ops/health.py <address>` | the health check against any address |

Python 3.11 or later and Node 22.23.4 or later (Astro's minimum). The Python scripts use the
standard library only. Build from the repository's real path, not through a directory
junction: through a junction the build finishes but leaves the stylesheet link out of every
page.

A worktree inside this checkout (such as `.local/wt-<name>`) also needs `npm ci` in the
checkout that holds it: Vite finds the outer checkout's `tsconfig.json` too, and without that
checkout's `node_modules` the build stops at "Tsconfig not found astro/tsconfigs/strict".

## Rules

### The never-break list

`ops/never-break.toml` lists what must keep answering: `/app-ads.txt` byte for byte (AdMob),
each privacy page with its title, the home page, the section and game pages, the security headers, no script from
another origin, that only the public address may be indexed, and that `www` redirects to it. `ops/health.py` checks it
against a local copy in `ci`, against staging after each deploy and against the live site
after each release.

Add an entry whenever an address is given to an outside party (a store listing, an ad
network, a printed product). Removing or loosening an entry needs the owner's say-so, in the
pull request.

### Product facts come from the feed

No product fact is typed in this repository. `src/data/feed.json` is the public feed: every game,
printable and book the site may name, with its name, price, store address, status, counts and
listing pictures. It is generated from each product's own source and arrives as a pull request
titled "Feed: ...". Do not edit it by hand: a fact that is wrong is fixed where the product
lives, and the next feed carries it.

- `src/content.config.ts` reads the feed into the `games`, `printables` and `books` collections
  and refuses a feed of another schema version or with an address off the known stores.
- `src/data/catalog.ts` and `src/data/games.ts` join those facts with the site's own words and
  art. The words may quote a number only if the product's facts hold the same number, and a
  game's counts are written as `{fact_name}`; the build fails otherwise.
- A product is on the site because the feed names it. A printable needs nothing else; a book also
  needs its words in `bookWords` (which also sets the shelf's order), a game its art here, and the
  build says which ones are waiting.
- A page shows a listing picture at most 1024 px wide, so every `<Image>` that sets `widths` also
  sets `width` (the largest of them); without it Astro builds the 3000 px original as the
  fallback. `tests/images.test.mjs` fails on a missing `width` or a built picture over 1440 px.
- Listing pictures are fetched from `media.pennypawsgames.com` before the build, checked against
  the SHA-256 in the feed, and served from our own origin (`ops/feed-images.mjs`). So a build
  needs the network the first time: it downloads every printable's listing pictures (the cover and
  the "A look inside" gallery) and the cover of each book on the shelf (91 today, about 80 MB) into
  `src/assets/feed/` (not tracked) and reuses them afterwards. A picture that cannot be
  fetched, or does not match its hash, fails the build; nothing is published without it. The
  workflows keep the folder in the Actions cache (`.github/actions/setup`), keyed on the feed;
  a restored file is checked against its hash like any other.
- A book's cover comes from the feed and nowhere else: it is the front panel of the cover file
  uploaded to Amazon, cut at the trim (bleed and spine removed) where the book is published, and
  fetched and hash-checked like a listing picture. There is no folder of book art here and
  `bookWords` in `src/data/catalog.ts` types no cover; `tests/feed.test.mjs` fails otherwise. A
  wrong cover is fixed where the book lives, and the next feed carries it.
- A printable's "A look inside" gallery is its Etsy listing pictures from the feed, all but the
  cover: approved pictures that are live in the store. No sample page is copied into this repository
  for it.
- Each printable the feed names gets a page, `printables/<id>/`, and `ops/public-files.txt`
  allows exactly those through its `feed:printables` line.
  `src/data/covers.json` picks which listing picture is a printable's cover when it is not the first.
- `tests/feed.test.mjs` fails if a page or data file types a price, a game's ages or a product's store address.

### Privacy pages

The words of a privacy page change only after an independent privacy review: a second
reviewer who did not write the change checks it against the law, against what it commits the
business to, and against what the game really does. Record the review in the pull request.
The pages are hand-written HTML in `public/<game>/privacy/index.html`, which the build copies
into `dist/` unchanged. `tests/content.test.mjs` pins each one by hash, and checks that the
built copy is the same bytes; update the hash in the same pull request, after the review.
Moving or restyling a page without changing its words still changes the hash: say so in the
pull request.

### Looking at a visible change

`ci` proves the pages load, fit the screen and pass the accessibility scan. It cannot judge
whether a page makes sense. For a change a visitor can see (a new page, new layout, new
navigation), have an independent reviewer walk the real pages in a browser at phone and
desktop sizes before marking the pull request ready, and fix what they find. Look at the
screenshots in `test-results/walk/` yourself too.

### Public-repository rules

- Secrets live only in GitHub environment secrets. The repository holds none, and no
  workflow prints one. `.env` files stay out of git.
- Write nothing private: no internal host names or addresses, no notes from private
  systems, no personal details beyond what the live site already shows.
- Workflows run on GitHub's own runners (`ubuntu-24.04`), pin every action to a commit,
  start from a read-only token and give Cloudflare secrets only to the steps that call
  wrangler. `tests/config.test.mjs` enforces this; extend it when you add a rule.
- Pull requests from forks get the `ci` check and nothing else: no secrets, no preview.

## Layout

| Path | What |
|---|---|
| `src/pages/` | the pages (`index.astro`, `404.astro`, `games/`, `squishy-bop/`, `[game]/` for the games not out yet, `printables/`, `books/`, `grown-ups/`) |
| `src/components/`, `src/layouts/`, `src/styles/`, `src/data/`, `src/assets/` | the shared pieces, the styles, the product data (`src/data/catalog.ts`) and the art |
| `public/` | copied into the build unchanged: `app-ads.txt`, `favicon.svg`, the three privacy policies, `_headers` |
| `public/_headers` | response headers for every page (security headers, noindex off the public address); wrangler reads it from `dist/` as configuration |
| `astro.config.mjs`, `tsconfig.json` | the Astro build (static output, React islands, Tailwind) |
| `dist/` | the build, never committed; what the Worker serves |
| `wrangler.jsonc` | the two Workers (production, staging), serving `dist/` |
| `ops/` | the post-build step, the allow-list, the health check, the never-break list, the local-server helpers |
| `paws.toml` | this repo's four standard commands for the shared Penny Paws tools |
| `tests/` | unit tests, configuration rules, the security policy of the built pages, the browser walk |
| `.github/workflows/` | `ci`, `preview`, `staging`, `release-pr`, `release-guard`, `release`, `rollback`, `watchdog` (the live check from GitHub, twice an hour) |
| `docs/runbook.md` | deploy, roll back, a red check, turning deploys on, the domain |
