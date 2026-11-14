# Penny Paws Games site

The static site at pennypawsgames.com and the pipeline that releases it. This repository is
**public**: write every file, commit message and pull request as something anyone may read.

The plan this implements is tracker task PAWS-001 (hosting, releases, rollback, monitoring).
Read it before changing hosting, branches or deploys. Operating steps are in
[docs/runbook.md](docs/runbook.md): read it when deploying, rolling back, or when a check is red.

## What is served

The site is plain files at the repository root, served by Cloudflare as a static-assets
Worker with no code in front of them (`wrangler.jsonc`). Nothing is public unless it is in
both places:

- `.assetsignore` lets it through (it denies everything by default), and
- `ops/public-files.txt` lists it.

To add a page or file: add it, add its line to both, and run `npm run check`. A test fails
until the two agree with what wrangler would upload. Pages use paths for their own links
(`/squishy-bop/privacy/`, not the full address) so they work on staging and previews, and
load nothing from another origin: no outside script, style, font, image or frame.
Children open these pages.

GitHub Pages stays switched on as the way back for 14 days after the domain's move to
Cloudflare, and it serves `main` from the root: until it is switched off (docs/runbook.md),
`index.html`, `app-ads.txt`, `CNAME`, `.nojekyll` and `squishy-bop/privacy/` stay where they are.

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

| Command | What it does |
|---|---|
| `npm ci` | install the pinned tools |
| `npm run check` | everything `ci` runs except the browser (`ops/check.mjs` lists the steps) |
| `npm run walk` | the browser walk: every page, phone and desktop, light and dark, with an accessibility scan. `PLAYWRIGHT_CHANNEL=msedge` uses an installed Edge |
| `npm run dev` | the site at http://127.0.0.1:8787, served the way Cloudflare serves it |
| `python ops/health.py <address>` | the health check against any address |

Python 3.11 or later and Node 22 or later. The Python scripts use the standard library only.

## The never-break list

`ops/never-break.toml` lists what must keep answering: `/app-ads.txt` byte for byte (AdMob),
each privacy page with its title, the home page, the security headers, no script from
another origin, and that only the public address may be indexed. `ops/health.py` checks it
against a local copy in `ci`, against staging after each deploy and against the live site
after each release.

Add an entry whenever an address is given to an outside party (a store listing, an ad
network, a printed product). Removing or loosening an entry needs the owner's say-so, in the
pull request.

## Privacy pages

The words of a privacy page change only after an independent privacy review: a second
reviewer who did not write the change checks it against the law, against what it commits the
business to, and against what the game really does. Record the review in the pull request.
`tests/content.test.mjs` pins each privacy page by hash; update the hash in the same pull
request, after the review. Moving or restyling a page without changing its words still
changes the hash: say so in the pull request.

## Looking at a visible change

`ci` proves the pages load, fit the screen and pass the accessibility scan. It cannot judge
whether a page makes sense. For a change a visitor can see (a new page, new layout, new
navigation), have an independent reviewer walk the real pages in a browser at phone and
desktop sizes before marking the pull request ready, and fix what they find. Look at the
screenshots in `test-results/walk/` yourself too.

## Public-repository rules

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
| `index.html`, `404.html`, `app-ads.txt`, `squishy-bop/` | the site |
| `_headers` | response headers for every page (security headers, noindex off the public address) |
| `wrangler.jsonc`, `.assetsignore` | the two Workers (production, staging) and what they serve |
| `ops/` | the health check, the never-break list, the allow-list, the local-server helpers |
| `tests/` | unit tests, configuration rules, the browser walk |
| `.github/workflows/` | `ci`, `preview`, `staging`, `release-pr`, `release-guard`, `release`, `rollback` |
| `docs/runbook.md` | deploy, roll back, a red check, turning deploys on, the domain and the way back |
