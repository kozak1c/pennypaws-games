# The Penny Paws site: design and build plan

Tracker task PAWS-007 (design and first build), with PAWS-008 (printables catalog) and
PAWS-009 (web games) as the later phases. Written 2026-11-14. Nothing in this plan is built
yet. It is meant to stand alone: a later session should be able to build from it without the
conversation that produced it.

Hosting, branches, releases, rollback and monitoring are already decided and built (PAWS-001,
`AGENTS.md`, `docs/runbook.md`). This plan covers what the site is, how it looks, how it is
organized and what it is built with.

## 1. What the site is for

Penny Paws makes mobile games, print-at-home activities and paperback activity books for
families. pennypawsgames.com is the one place that shows all of it and sends each visitor to
the right store. It sells nothing itself at launch.

| Visitor | Arrives from | Wants | The site gives them |
|---|---|---|---|
| A parent or grandparent | Instagram, Facebook, a search | Something fun for a child of about 5 to 10 | Three clear doors (games, printables, books) with real pictures, one button per product |
| A player or a player's parent | The game's Play listing or a link inside the game | Is this game safe, who made it, help, privacy | A page per game with a plain "for grown-ups" box, help and the privacy policy |
| A shopper who bought a printable | Etsy, a printed PDF | More like it, help printing | The catalog, cross-links to the matching book and game, printing help |
| A store or ad network reviewer | Google Play, AdMob, Meta, Pinterest | A real developer site, policies, `app-ads.txt` | Stable addresses that never move (the never-break list) |
| A tester | A link the owner shared | How to join a test | A join link on the game's page |

Later jobs, planned for but not built at launch: playing a game in the browser, and buying a
printable without leaving for Etsy.

What the site does not do: accounts, comments, a cart, a newsletter form, tracking. Children
open these pages, so no page loads anything from another origin and no page posts data.

## 2. Decisions at a glance

| Question | Decision |
|---|---|
| Framework | Astro 7, static output, no adapter, no UI framework. Section 7 says why. |
| Styling | Plain CSS with design tokens as custom properties. No Tailwind, no component kit. |
| Client JavaScript | Almost none. One small script for press feedback and the screenshot strip, served as a file from our own origin. Every page works with JavaScript off. |
| Content | Typed content collections: games, printables, books, FAQ, legal pages, home shelves. A missing field fails the build. |
| Look | "Clay on the table": the brand kit's pale sky ground, navy text, five clay shapes. Section 3. |
| Colour scheme | Light only at launch. The clay art exists on white and pale sky grounds only. |
| Navigation | Four tabs, each with its own shape: Games, Printables, Books, Grown-ups. A fifth, Play, appears when the first browser game exists. |
| Stores | Google Play for games, Etsy for printables, Amazon for paperbacks. Links only. |
| Order of work | The look is shown and picked before any page is built. The engine swap can run in parallel because it changes nothing a visitor sees. |

## 3. Art direction

### The idea

The logo is a photograph-like render of modelling clay pieces lying on a pale sky table,
lit from the top left. The site is that table. Two materials sit on it, and the material
tells the visitor what a thing does:

- **Clay is for pressing.** Tabs, buttons and the big section shapes are clay. They give
  under a finger the way clay does (a small squash and a tighter shadow) and spring back.
- **Paper is for reading.** Text, product details and policies sit on white paper.

Products are objects on the table, each in its own form, not one repeated card: a game is a
rounded app tile, a printable is a small fan of tilted sheets, a book is a cover with a
spine. The table stays calm so the products, which are loud and saturated, carry the colour.

The one bold thing is the press. Everything else is quiet.

### Shapes are wayfinding

The mark is Penny's paw print: a heart pad and four toes (circle, triangle, square, star).
Each shape belongs to one part of the site and keeps that meaning everywhere: in the tab,
beside the section heading, on the section's buttons and in the page's accent colour.

| Shape | Colour | Section | Why |
|---|---|---|---|
| Square | Sky | Games | The brand kit already sets the Games line in sky |
| Heart | Heart red | Printables | The brand kit already sets the Printables line in heart red |
| Circle | Sun | Books | |
| Star | Grape | Grown-ups (help, about, privacy) | |
| Triangle | Leaf | Play, later | Turned on its side it is a play button. Its tab appears with the first browser game, which completes the paw. |

No shape is used as decoration with no meaning. Loose shapes may sit at the edges of the
home page's top area only, as on the shop banner, and never close enough to the mark to read
as a sixth toe.

### Colour tokens

From the brand kit. The bright colours are for shapes and fills. Text and thin lines use the
"ink" partner, which passes 4.5:1 on both white and pale sky (measured 2026-11-14; the build
re-measures them in a test).

| Token | Hex | Use | Contrast on white / on pale sky |
|---|---|---|---|
| `--table` | `#E1F0FD` | Page ground | |
| `--paper` | `#FFFFFF` | Reading surfaces, the header | |
| `--navy` | `#1E2550` | All body text and headings | 14.6 / 12.6 |
| `--navy-soft` | `#4A5280` | Secondary text | 7.5 / 6.4 |
| `--heart` / `--heart-ink` | `#FF5A5F` / `#B81F33` | Printables | ink 6.4 / 5.5 |
| `--sun` / `--sun-ink` | `#FFC233` / `#8A5A00` | Books | ink 5.9 / 5.1 |
| `--leaf` / `--leaf-ink` | `#2FBF71` / `#177A45` | Play | ink 5.4 / 4.6 |
| `--sky` / `--sky-ink` | `#2E9BFF` / `#0F5FB8` | Games, links | ink 6.3 / 5.4 |
| `--grape` / `--grape-ink` | `#8B5CF6` / `#6336D6` | Grown-ups | ink 6.9 / 6.0 |

Button labels are navy on sun, leaf and sky (9.1, 6.1 and 5.1 to 1) and white on the ink
colours. White text never sits on a bright fill: none of them passes.

Shadows are the logo's shadows: soft, offset down and to the right, tinted navy
(`rgb(30 37 80 / ...)`), never neutral grey. One light direction on every page.

Each game also brings its own theme colours, sampled from its store art (Squishy Bop!: plum
and candy pink). They are used only inside that game's page band and tile.

The old berry accent (`#C2337A`) and cream ground are retired with the old page.

### Type

One family, Nunito, which the brand kit already uses for the line under the name. Self-hosted
as a variable font, Latin subset, one file.

- Body 18 px, line height 1.55, at most 65 characters a line. Many shoppers are
  grandparents; the text is sized for them, and for a phone held at arm's length.
- Headings weight 900 in navy, sentence case, slightly tight. Scale 1.25: 18, 22, 28, 35,
  44, 55, with the top two sizes stepping down on phones.
- A section heading sits beside its clay shape, the shape at cap height.
- No all-caps labels, no small label above a heading, no middle-dot strings, no arrows on
  links. The only capitals are inside the logo artwork.

The look round (phase 0) shows a second version with Baloo 2 for headings, so the choice is
made on real pages.

The name "Penny Paws" is always the clay logo artwork, never set in a font.

### Shape, spacing, motion

- Radii by material, not one radius everywhere: paper 8 px, app tiles a squircle (22% of the
  side), clay fully round.
- An 8 px spacing grid. Content column 1120 px at most; reading column 65 characters.
- Tap targets 48 px or larger.
- **Press:** a clay thing scales to about 96% and its shadow tightens for 120 ms, then
  springs back. This is the only hover or press effect on the site.
- **Arrival:** on the home page only, the five pieces of the paw settle onto the table once,
  in under 700 ms. No scroll-triggered reveals anywhere.
- Page changes use the browser's own cross-document view transition (a CSS rule, no script).
- `prefers-reduced-motion` turns all three off.

### Brand art rules (from the brand kit)

- The clay pieces are never redrawn, traced or cut out by hand. The site receives finished
  files exported by the brand kit's own tools: the wide and stacked logos on white, the mark
  on pale sky, and single loose pieces with their cast shadows.
- Clay art is used at 64 px and larger. Below that (tabs, bullets, the favicon) the flat
  vector shapes from the kit are used, in the same colours.
- The header is a white paper strip, so the approved on-white logo drops in unchanged. The
  home page's top area is pale sky and uses the on-sky mark.

### Wireframes

Home, phone (390 px):

```
+--------------------------------------+
| [paw] Penny Paws GAMES               |  white strip, logo links home
|   ■        ♥         ●        ★      |  four tabs, a flat shape
| Games  Printables  Books  Grown-ups  |  over each label
+--------------------------------------+
|            (pale sky table)          |
|        [ clay paw, pieces settle ]   |
|  Printables and games for families   |
|  who like to play                    |
|                                      |
| +----------------------------------+ |
| | ■ Games                          | |  door 1: real game art
| |   [Squishy Bop! art]             | |
| +----------------------------------+ |
| +----------------------------------+ |
| | ♥ Printables                     | |  door 2: fan of tilted pages
| +----------------------------------+ |
| +----------------------------------+ |
| | ● Books                          | |  door 3: paperback covers
| +----------------------------------+ |
+--------------------------------------+
| In season      (a short shelf)       |
| Games          (app tiles)           |
| Printables     (paper fans)          |
| Books          (covers)              |
| A note for grown-ups  (paper)        |
| footer                               |
+--------------------------------------+
```

Home, desktop (1280 px): the same order. The top area is two columns (paw left, line and the
three doors in a row right); shelves show four to six objects in a row.

Game page, phone:

```
+--------------------------------------+
| header and tabs                      |
+--------------------------------------+
| (band in the game's own colours)     |
|  [feature art]                       |
|  [icon]  Squishy Bop!                |
|  A block puzzle where every block    |
|  is a squishy plush.                 |
|  [ Get it on Google Play ]           |  or "Join the test" / "Coming soon"
+--------------------------------------+
| [phone][phone][phone] ->             |  screenshots, swipe, snap
| What you do   (three short parts)    |
| +----------------------------------+ |
| | ★ For grown-ups                  | |  ages, ads, purchases, offline,
| |                                  | |  data, privacy policy, help
| +----------------------------------+ |
| ♥ More squishy fun  (printables,     |
|   books from the same world)         |
+--------------------------------------+
```

## 4. Site map and addresses

```
/                               home
/games/                         all games
/<game>/                        one page per game, e.g. /squishy-bop/
/<game>/privacy/                that game's privacy policy (existing addresses stay exact)
/printables/                    the catalog, by collection
/printables/<collection>/       e.g. /printables/coloring/
/printables/<product>/          one page per printable
/books/                         all paperbacks
/books/<book>/                  one page per book
/grown-ups/                     who we are, our promises, links to help and policies
/grown-ups/help/                questions and answers, printing help, contact
/grown-ups/privacy/             this site's privacy note and a list of every policy
/play/                          later: browser games (links to play.pennypawsgames.com)
/app-ads.txt  /robots.txt  /sitemap-index.xml  /404
```

Rules:

- Games live at the root (`/squishy-bop/`) because their privacy addresses already do and are
  given to Google Play. A build test keeps a list of reserved names (`games`, `printables`,
  `books`, `grown-ups`, `play`, `go`, `_astro`) and fails if a game's id collides.
- Every address ends in a slash. Internal links are paths, never full addresses, so they
  work on staging and previews.
- Every address in `ops/never-break.toml` keeps answering exactly as today, including the
  home page's title, "Penny Paws Games".
- Any address handed to an outside party (a store listing, an ad network, a printed page)
  gets a never-break entry in the same pull request.

### Navigation

- The header is the logo (home) and four tabs, each a flat shape over a short label. All
  four fit on a 360 px phone without a menu button. The current section's tab is pressed in.
- Every product is at most two taps from the home page.
- A product page has exactly one primary button. Its label names where it goes and what
  happens: "Get it on Google Play", "Buy on Etsy", "Buy the paperback on Amazon". Buttons
  that leave the site say so in the label; nothing opens in a new tab by surprise.
- A "more from this world" row links a game to its printables and books and back (the
  squishy coloring pages, the squishy paperback and Squishy Bop! share one cast).
- The footer repeats the four sections and adds the shop links, social accounts, contact
  address, and the trademark lines the stores require.

## 5. Pages

**Home.** Job: route every visitor in one tap. Top area as drawn above. Then an "In season"
shelf (a short hand-picked list in `src/content/home.yaml`; Christmas items first when it
launches), one shelf per section, and "A note for grown-ups": who makes this (a small family
studio), what the site promises (no accounts, no ads, no tracking on this site), and how to
reach a person.

**Games index.** App tiles with name, one line and a status chip in words ("Out now", "In
testing", "Coming soon").

**Game page.** As drawn above. Everything that differs between games is a typed field, so
the "for grown-ups" box is complete and consistent on every game: ages, whether it shows ads
and what kind, whether it has purchases, whether it works offline, what data it collects in
one sentence, the privacy policy, the support address. The primary button follows the game's
status: live shows the official Google Play badge; testing shows "Join the test" (a link
out); coming soon shows no button and says so plainly.

**Printables.** The catalog grouped by collection (coloring, color by number, mystery games,
paper crafts, bundles), each product a fan of tilted sheets, all the same sheet shape. A
product page shows the gallery, what is inside (pages, paper sizes, what you need), "instant
download, print at home as often as you like", the price from the last export, and "Buy on
Etsy". Which products appear is a per-product flag in the export, so the owner's content
choices are data, not code.

**Books.** Covers with a spine and a soft shadow. A book page shows the cover, a few inside
spreads, who it is for, and "Buy the paperback on Amazon". Where the same pages exist as a
printable it adds "Want it today? Print it at home" with the Etsy link.

**Grown-ups.** A plain, warm page: about, the promises above, links to help and every
policy. **Help** is questions and answers in `<details>` groups (printing, downloads, games,
refunds go to the store that sold it) and the contact address. **Privacy** states what this
site itself collects (nothing a script or cookie sets; the host keeps ordinary request
logs) and lists every product policy.

**404.** A lost clay shape, one sentence and the four doors.

Copy follows the house rules: plain sentences a person would say out loud, sentence case, a
real hook per product written for its audience, at most one stylized line per page. The
brand line is "Printables and games for families who like to play".

## 6. Content model

`src/content.config.ts` defines these collections with Zod schemas. Markdown bodies hold the
longer text; everything a page lays out is a field.

| Collection | Source | Key fields |
|---|---|---|
| `games` | one Markdown file per game | `id`, `name`, `tagline`, `status` (`coming-soon`, `testing`, `live`), `play_url`, `tester_url`, `demo_url`, `icon`, `feature_art`, `screenshots[]` (with alt text), `theme` (two colours), `ages`, `ads`, `purchases`, `offline`, `data_summary`, `privacy` (a `legal` id), `worlds[]`, `released` |
| `printables` | one JSON file written by the printables export (phase 3); a few hand-written entries before that | `id`, `title`, `hook`, `collection`, `price`, `currency`, `etsy_url`, `direct_url`, `images[]` (address, SHA-256, width, height, alt), `pages`, `paper_sizes[]`, `worlds[]`, `show_on_site`, `schema_version` |
| `books` | one Markdown file per book | `id`, `title`, `subtitle`, `cover`, `spreads[]`, `amazon_url`, `asin`, `pages`, `trim`, `audience`, `printable` (a `printables` id), `worlds[]` |
| `faq` | Markdown files | `question`, `group`, `order` |
| `legal` | Markdown files | `path` (the exact public address), `title` (the exact `<title>`), `product`, `effective` |
| `home` | `src/content/home.yaml` | `in_season[]`, `featured_printables[]`, `featured_books[]` |

Rules the schemas enforce: a `live` game must have `play_url`; a `testing` game must have
`tester_url`; every image has alt text; every outbound address is `https` and on an allowed
host (Google Play, Etsy, Amazon, the brand's own social accounts, later the shop and play
addresses); `worlds` values come from one list.

## 7. Framework and architecture

### Why Astro

The site is content pages with typed data and almost no behaviour, served as plain files
with no code in front of them (so it keeps serving when the account's Workers spending limit
stops Workers that run code). That is what Astro's static output produces.

| Need | How Astro meets it |
|---|---|
| Static files only | `output: 'static'` is the default; no adapter is installed |
| Typed content, a missing field fails the build | Content collections with Zod schemas |
| Fast pages on phones from 1 to 2 MB listing images | Built-in image pipeline: AVIF and WebP at several widths, width and height set, lazy by default |
| No script by default | Astro ships no JavaScript unless a page asks for it |
| Shared header, tabs, product objects | `.astro` components with scoped CSS |
| Room for interactive pieces later | A single island can be added to one page without changing the rest |

Considered and set aside: hand-written HTML (fine for three pages, not for a catalog and
repeated product layouts), Eleventy (close, but weaker typing and no built-in image
pipeline), Next.js or SvelteKit (application frameworks; they bring a runtime and a
server-shaped deploy this site does not need), a hosted builder such as Shopify's theme or
Squarespace (no control over scripts on pages children open, and it would split the brand
across hosts).

Versions checked on 2026-11-14: `astro` 7.4.12 (needs Node 22.23.4 or later), `sharp`
0.35.5, `@astrojs/sitemap` 3.7.5, `@astrojs/check` 0.9.12. Pin exact versions; Dependabot
already groups weekly updates into staging.

Astro 7 points to respect (from its upgrade guide): the compiler rejects unclosed tags and no
longer repairs invalid nesting; whitespace between inline elements follows JSX rules, so a
needed space is written as `{" "}`; Markdown is rendered by the built-in processor, and no
remark or rehype plugins are used here.

### Layout of the repository after the engine swap

```
astro.config.mjs
src/
  content.config.ts
  content/            games/ books/ faq/ legal/ printables/ home.yaml
  assets/             brand/ games/<id>/ books/<id>/ fonts/
  styles/             tokens.css  base.css
  components/         SiteHeader  SiteTabs  SiteFooter  Shape  ClayButton  StoreButton
                      GameTile  PaperFan  BookCover  Shelf  ScreenshotStrip
                      GrownUpsBox  WorldRow  Picture
  layouts/            Base.astro  Product.astro  Legal.astro
  pages/              index.astro  404.astro  games/index.astro
                      [game]/index.astro  [game]/privacy.astro
                      printables/...  books/...  grown-ups/...
  scripts/            press.ts
public/               app-ads.txt  _headers  robots.txt  favicon.svg  icons/
ops/  tests/  docs/  .github/workflows/     (as today)
```

### Settings that matter

- `site: 'https://pennypawsgames.com'`, `trailingSlash: 'always'`, `build.format:
  'directory'`.
- `wrangler.jsonc`: `assets.directory` moves from `.` to `./dist`. `_headers` and
  `app-ads.txt` move to `public/` so the build copies them unchanged.
- **Content security policy.** The response header stays the single policy and gets
  stricter: `style-src 'self'` (drop `'unsafe-inline'`), everything else as today. To make
  that possible: `build.inlineStylesheets: 'never'`, `vite.build.assetsInlineLimit: 0`, no
  `style` attributes, no `is:inline` scripts, no `<ClientRouter />`. Astro inlines small
  processed scripts by default, so a test reads every built page and fails on any inline
  script (JSON-LD data blocks excepted), inline `<style>` or `style` attribute. If a version
  of Astro still inlines the script despite the settings, load it as a file from `public/`
  instead; do not loosen the header.
- **Images.** Local art lives in `src/assets` and goes through `astro:assets`. Catalog
  images (phase 3) are fetched at build time from the address in the export, checked against
  the export's SHA-256, optimized, and served from our own origin, so `img-src 'self'` holds.
  The build cache is kept between CI runs.
- **Fonts.** One variable WOFF2 in `src/assets/fonts`, declared with `@font-face`,
  `font-display: swap`, preloaded on every page.
- **No analytics script.** Outbound store links carry a plain source tag (for example
  `utm_source=pennypawsgames`) so each store's own statistics can show visits from the site.
  Check what each store reports before relying on it.

### Search and sharing

`@astrojs/sitemap`; `robots.txt`; a canonical address on every page; one Open Graph image
per page, built ahead of time from the page's own art on the pale sky ground; JSON-LD for
the organization, each game (`MobileApplication`), each printable (`Product` with its offer
at the store) and each book (`Book`). Staging and previews stay noindex through the existing
header rule.

### Stores and their marks

- Google Play: the official badge artwork, unaltered, self-hosted, with the clear space and
  the trademark line Google's badge guidelines require.
- Etsy and Amazon: plain clay buttons with text labels. No store logos until their brand
  rules have been read and followed.
- Read each store's current brand guidelines during the build and record the links in the
  pull request.

## 8. Room for the later features

**Play in the browser (PAWS-009).** A game's `demo_url` field is empty today. When one is
set, the game page gains a leaf triangle button, "Play in your browser", and the Play tab
appears in the header; both are derived from content, so no layout change is needed. The
button is a link to `play.pennypawsgames.com`, a separate origin, not an embedded frame:
game files are tens of megabytes and deserve their own full-screen page, and the separate
origin keeps the site's policy at `frame-src 'none'`.

**Buying on the site.** A printable's `direct_url` field is empty today. When the owner turns
direct sales on, a product with that field shows "Buy here" as the primary button and "Buy
on Etsy" as the second. Checkout, payment and file delivery stay on a hosted shop page, so
the site still runs no code, takes no payment details and keeps its policy. Before turning
it on, settle: which shop hosts the checkout, its address under the brand's domain, who
collects sales tax and VAT on direct digital sales (a marketplace does this for its sellers;
a direct seller may have to), and the refund and delivery wording. Each of these is the
owner's decision.

**The full catalog (PAWS-008).** Until the export exists, the home page's printables shelf
uses a few hand-written entries with their own images. The export replaces them with one
schema-versioned JSON file delivered as a pull request into staging.

**More product lines.** A new line is a new shape colour only if the paw has one left; five
sections is the limit of this navigation. Past that, lines nest inside a section.

## 9. Children, privacy and safety

- No page loads anything from another origin: no script, style, font, image, frame or
  embedded video. Videos are self-hosted files with a poster, muted, never autoplaying with
  sound.
- No forms. Joining a test, buying and contacting all leave the site by a labelled link.
- No cookies or storage set by the site.
- Buying links are worded for grown-ups and say where they go.
- Privacy policy words change only after the independent review described in `AGENTS.md`.

## 10. Quality bar and checks

Kept from today and adapted to a build folder: `npm run check`, the browser walk at phone
and desktop sizes with the accessibility scan, the health check with the never-break list
after every deploy, the rule that nothing unintended is uploaded.

| Check | Change |
|---|---|
| Public files | `ops/public-files.txt` becomes the list of expected pages and fixed files; `tests/assets.test.mjs` compares it with the build output and allows hashed files under `/_astro/` by pattern |
| Privacy pages | The hash pin moves from the built page to the policy's source text, plus a test that the built page contains those words in order. The first pull request shows the words are unchanged from today's page. Say so in that pull request, because the pin is moving. |
| Policy | New test: no inline script, style element or style attribute in any built page |
| Types | `astro check` runs in `ci` |
| Links | Every internal link resolves in the build; outbound store links are checked by a script run before a release, not in `ci` (stores block robots) |
| Colour | The ink colours are re-measured against white and pale sky; a failure stops the build |
| Budgets, phone, first load | HTML and CSS under 40 KB, script under 5 KB, font under 60 KB, the largest picture above the fold under 120 KB, the whole first screen under 400 KB |
| Walk | Light only; add the new pages; keep the 404 for a missing page |
| Alignment | Before a look or a page is shown to the owner: measure shared left edges, card tops, baselines and overflow at 360, 390, 768 and 1280 px with a Playwright script, fix, re-measure |
| Independent walk | For every visible change, a reviewer who did not build it walks the real pages at phone and desktop sizes; every finding is fixed and re-walked |

Accessibility floor: WCAG 2.2 AA; visible keyboard focus on every clay control; headings in
order; alt text required by the schema; the screenshot strip is a scrollable region with a
label, usable by keyboard; nothing depends on colour or shape alone (tabs always have words).

## 11. Phases

Each phase is one or more pull requests into `staging`; the owner releases to production.

### Phase 0: the look round (no merge)

Show the look before building pages. Build static mock-ups by hand with the real logo files,
the real font, real product art and real copy; a stand-in font or grey box reads as the
product and gets judged as one.

- Screens: home at phone and desktop width, one game page, one printable page, the books
  shelf.
- Two versions of the home page: A with Nunito throughout, B with Baloo 2 headings.
- Run the alignment measurements, then publish the screens on a private page the owner can
  open on a phone.
- Record the pick and every note in a "Look decisions" section added to this file. From then
  on the approved mock-up is a contract: keep a checklist of every element in it and tick
  each off in the build.

Done when: the owner has picked a look and section 3 is updated to match.

### Phase 1: the engine swap, look unchanged

Can run alongside phase 0. Move today's pages onto Astro with no visible change.

- Add Astro, `astro.config.mjs`, `src/`, `public/`; port the home page, the 404 and the
  Squishy Bop! privacy policy; move `app-ads.txt` and `_headers`.
- Point `wrangler.jsonc` at `./dist`; update `npm run dev`, `check`, `walk`, the workflows
  (`npm run build` before every check and deploy) and `docs/runbook.md` (the rebuild drill).
- Port the checks in section 10 that do not depend on the new look.

Verify: `npm ci && npm run build && npm run check && npm run walk`; `python ops/health.py`
against the local server, the preview and staging; `app-ads.txt` byte for byte; both page
titles unchanged; the policy's words unchanged.

Done when: staging and then production serve the Astro build and the health check is green.

### Phase 2: the brand shell and launch pages

- Tokens, base styles, the font, the favicon, the header with tabs, the footer.
- Components: shapes, clay buttons with the press, shelves, app tile, paper fan, book cover,
  the grown-ups box, the store buttons.
- Pages: home, games index, the Squishy Bop! page, grown-ups, help, privacy, the 404. The
  printables shelf from a few hand-written entries; the books shelf with covers linking to
  Amazon.
- Open Graph images, sitemap, JSON-LD, the tightened policy header.
- New never-break entries for the game page and the grown-ups pages.

Verify: the full check and walk; the alignment measurements; the independent walk; the
mock-up checklist fully ticked; the budgets in section 10.

Done when: the designed site is live through a release the owner merged, every never-break
address answers, and the independent walk has no open finding.

### Phase 3: the catalog and book pages (PAWS-008)

- The printables export and its schema; build-time image fetch with hash checks; collection
  and product pages; book pages; "more from this world" rows.
- The shop's privacy and data-deletion pages move here (after the privacy review), the old
  site's addresses become redirects, and each new address joins the never-break list.

### Phase 4: buying on the site (later, on the owner's go)

Section 8. A content change plus one button variant, after the owner's decisions.

### Phase 5: play in the browser (PAWS-009, later)

Section 8. The site's part is the `demo_url` field, the button and the Play tab; hosting the
games is PAWS-009.

## 12. Calls for the owner

Each has a recommendation; the look round is the natural moment to settle them.

1. **Light only at launch.** Recommended. A night version needs the logo rendered on a dark
   ground first.
2. **Heading typeface.** Decided in the look round between Nunito and Baloo 2.
3. **Which printables appear.** Recommended: the kid and family lines; anything else stays
   in the Etsy shop and is reached through "See the whole shop on Etsy".
4. **Which games get a page at launch.** Recommended: only games the owner has cleared to be
   named in public.
5. **Amazon links.** Recommended: plain links. An affiliate tag would need a disclosure on
   every page that uses one.
6. **Contact address.** Keep the current address at launch; an address on the brand's own
   domain is a later, separate job.

## 13. Risks

- **The clay art does not shrink or recolour freely.** Mitigated by the size rule and the
  flat vector shapes; any new ground or piece comes from the brand kit's tools, not from
  this repository.
- **Loud product art on a calm table can look mismatched.** The look round exists to test
  exactly this with real art before anything is built.
- **Catalog builds depend on the media host being up.** A failed fetch fails the build and
  nothing is released; the live site is unaffected, and rollback needs no build.
- **Stale prices.** The site shows the price from the last export; the export runs whenever
  a listing changes.
- **Astro moves fast.** Versions are pinned and updated weekly through the normal path; the
  inline-script test catches a change in bundling behaviour before it reaches staging.
