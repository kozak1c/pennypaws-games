# Penny Paws Games site

The site at [pennypawsgames.com](https://pennypawsgames.com) for Penny Paws Games: the home page, the games, printables and books, a page for grown-ups, each game's privacy policy and `app-ads.txt`.
Squishy Bop! privacy policy: `public/squishy-bop/privacy/index.html` (linked from the game's Grown-ups > About and the Play listing).
Plush Hour privacy policy: `public/plush-hour/privacy/index.html` (for the Play listing).
Giggle Bomb privacy policy: `public/giggle-bomb/privacy/index.html` (for the Play listing and the game's own link).

The site is an [Astro](https://astro.build) project built into static files (`npm run build` writes `dist/`), served by Cloudflare with no code in front of them. Changes go through pull requests into `staging`, are checked and previewed, and reach the live site only when the owner merges the release pull request into `main`.

- [AGENTS.md](AGENTS.md): how to make a change, what must never break, and the rules for a public repository.
- [docs/runbook.md](docs/runbook.md): deploying, rolling back, and what to do when a check is red.

Changes to a privacy policy need an independent privacy review first (AGENTS.md, "Privacy pages").
