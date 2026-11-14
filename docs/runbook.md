# Runbook: pennypawsgames.com

Written to be used from a phone. Each section starts with what to tap.

| | |
|---|---|
| Live site | https://pennypawsgames.com |
| Staging | https://staging.pennypawsgames.com (noindex) |
| Release pull request | [open pull requests into main](https://github.com/kozak1c/pennypaws-games/pulls?q=is%3Apr+is%3Aopen+base%3Amain) |
| Runs | [Actions](https://github.com/kozak1c/pennypaws-games/actions) |
| Roll back | [rollback workflow](https://github.com/kozak1c/pennypaws-games/actions/workflows/rollback.yml) |
| Cloudflare | [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages), Workers `pennypaws-site` (production) and `pennypaws-site-staging` |

**Where things stand (2026-11-14).** Deploys are on. pennypawsgames.com is served by the
production Worker on Cloudflare, and `www` is a redirect rule on the zone. GitHub Pages is
still switched on as the way back until 2026-11-28 ("The domain is on Cloudflare").
Update this paragraph when that changes.

## Deploy

**To staging:** merge a pull request into `staging`. Nothing else to do. The `staging`
workflow checks the merged tree, deploys it and posts the `staging/smoke` status on the
commit, with a comment on the pull request. About 5 minutes.

**To production:** the owner merges the release pull request.

1. Open the [release pull request](https://github.com/kozak1c/pennypaws-games/pulls?q=is%3Apr+is%3Aopen+base%3Amain) ("Release YYYY-MM-DD"). It lists what is waiting and shows screenshots.
2. Open staging and look. Check `staging/smoke` and `ci` are green at the bottom of the pull request.
3. Tap **Ready for review**. `source-is-staging` turns green within a few seconds.
4. Tap **Merge pull request** (a merge commit, not squash).
5. The `release` workflow deploys, waits 20 seconds, runs the health check on the live
   address, and rolls back by itself if the check fails. About 2 minutes. Green means live.

A release never needs a terminal. If the `release` run is red, go to "A check is red".

## Roll back

Agents may roll production back to the last good version without asking, and must report it.
Going forward again is the owner's call.

**From a phone:** GitHub app > `pennypaws-games` > Actions > **rollback** > **Run workflow**
> branch `main` > type a reason > Run. About a minute. It ends with the health check.

**From a terminal:**

    gh workflow run rollback.yml --repo kozak1c/pennypaws-games --ref main -f reason="why"

**From Cloudflare, if GitHub is down:** [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
> `pennypaws-site` > Deployments > the three dots on the version you want > **Rollback**.

What to know:

- With no version id, it goes back one step: to the version that was live before the
  current one. Run it twice and you are forward again, because a rollback is itself the
  newest deployment. To go further back, paste a version id from the Deployments list.
- Cloudflare keeps the last 100 versions.
- A rollback changes what is served, not the repository. `main` still holds the bad change
  and the next release would ship it again. Fix or revert it on `staging` before releasing.
- Staging has no rollback workflow. Fix forward: a red staging blocks nothing live.

## A check is red

**`ci` on a pull request.** Open the run; the summary table names the failing step. Run
the same thing locally with `npm run check` (or `node ops/check.mjs --only <step>`) and
`npm run walk`, fix it on the branch, push once.

| Step | It means |
|---|---|
| Lint the workflows | a workflow file has a mistake; the message names the line |
| unit | a test of the ops scripts failed |
| config | `wrangler.jsonc`, `_headers` or a workflow broke a rule, **or** a file would be published that is not in `ops/public-files.txt` (or the reverse), **or** a privacy page changed (see AGENTS.md, "Privacy pages") |
| html, links | a page has broken markup, a dead link, or loads something from another origin |
| dry-run | wrangler rejects the configuration |
| health | the local copy of the site fails the never-break list |
| Browser walk | a page does not load cleanly, is wider than the screen, or fails the accessibility scan; screenshots are in the run's `walk-screenshots` file |

**`staging/smoke` is red** (or the `staging` run failed). Production is untouched. Open the
run from the status; the health table says which check failed. Fix it with a new pull
request into `staging`: that is the next job, before anything else merges. If the first
deploy of a new address fails only on "reachable", its certificate was still being issued:
rerun the failed job.

**The `release` run is red.** Read its summary. It says one of:

- *Rolled back, production is healthy on the previous version.* Nothing is down. The change
  did not go out. Fix it on `staging` and release again.
- *Production is still failing after the rollback*, or *the rollback failed*. Open the live
  site. If it is broken, run the rollback workflow with an older version id, or use the
  Cloudflare dashboard. If the health check itself is wrong (the site is fine), fix the
  check on `staging`.
- *Nothing to roll back to.* Only possible on the very first production deploy.
- The run failed before deploying (for example a missing secret). Nothing changed.

**The live site is down and nothing was released.** Check
[Cloudflare's status page](https://www.cloudflarestatus.com/). Then run
`python ops/health.py https://pennypawsgames.com` from any computer to see what fails.
The files are static and served without code, so an account spending limit does not stop them.

**What the health check checks** is `ops/never-break.toml`; `ops/health.py --help` explains
each line it prints.

## Turning deploys on

One sitting, owner only. Until it is done, every deploy job is skipped with a notice and
pull requests still merge into staging on `ci` alone.

1. **Cloudflare API token** for deploys: Account > Workers Scripts > Edit, and Zone >
   Workers Routes > Edit on the zone `pennypawsgames.com` only. Nothing else: no DNS, no
   billing. (The token can deploy any Worker in the account; Cloudflare's per-Worker roles
   cannot yet cover creating Workers or custom domains.)
2. **GitHub environments** `staging` and `production`, each with the secrets
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. `production` is limited to the `main`
   branch. `staging` has no branch limit, because pull request previews use it.
3. **Repository variable** `CLOUDFLARE_DEPLOY` = `true`. This is the switch. With it on, a
   missing secret fails a deploy instead of skipping it.
4. **Repository settings:** Actions may create pull requests (for the release pull
   request); workflows from outside contributors need approval; secret scanning and push
   protection on.
5. **Branch rules:** `main` takes only pull requests, needs `ci` and `source-is-staging`,
   merge commits only, no force-push or delete. `staging` takes only pull requests and
   needs `ci`.
6. **First staging deploy:** Actions > staging > Run workflow on `staging`. It creates the
   Worker `pennypaws-site-staging`, the address `staging.pennypawsgames.com` (Cloudflare
   adds the DNS record and certificate) and turns on preview addresses. Do this before
   expecting a preview on a pull request.

## The domain is on Cloudflare

`pennypawsgames.com` is a custom domain of the production Worker (`routes` in
`wrangler.jsonc`). It moved from GitHub Pages on 2026-11-14.

How the move went, for the next hostname: the release that added the route could not attach
the domain. Cloudflare refused it because the apex still had its GitHub Pages records
("already has externally managed DNS records ... Delete them first", code 100117), and the
deploy token has no DNS rights, so wrangler could not replace them. The workflow rolled the
Worker back and the live site never changed. The four `A` records were then deleted in the
dashboard and the custom domain added there a few seconds later (the dashboard offers no
override either), and the release was re-run. So: a hostname that already has DNS records
needs them removed by hand before a custom domain can take it; a new hostname (as
`staging` was) needs nothing.

**The way back to GitHub Pages** (kept for 14 days after the move): in the Cloudflare
dashboard remove the custom domain from the Worker (Workers & Pages > `pennypaws-site` >
Settings > Domains & Routes), then put these records back, DNS only:

| Name | Type | Value |
|---|---|---|
| `pennypawsgames.com` | A | `185.199.108.153` |
| `pennypawsgames.com` | A | `185.199.109.153` |
| `pennypawsgames.com` | A | `185.199.110.153` |
| `pennypawsgames.com` | A | `185.199.111.153` |
| `www` | CNAME | `kozak1c.github.io` |

(`www` replaces the proxied `A` record it has now.) Then revert the route in `wrangler.jsonc` through a pull request, or the next release moves
the domain again. Rolling the Worker back (`rollback` workflow) does not move the domain:
it only changes which version the domain serves.

**`www`.** A custom domain only answers its exact host name, so `www` is a redirect on the
zone, not a second custom domain: a proxied `A` record for `www` to `192.0.2.0` and a
redirect rule ("www to apex") that sends `www.pennypawsgames.com/<path>` to
`https://pennypawsgames.com/<path>` with a 301, query string kept. It is in
`ops/never-break.toml` and checked after every release.

**Rollback drill, 2026-11-14.** A release added a marker to the not-found page; the
`rollback` workflow was started from the command line with nothing else prepared. The marker
was gone from the live site 25 seconds after the workflow was started, and the whole run,
including its own health check, took 53 seconds. All checks passed on the rolled-back
version. From the GitHub phone app allow a little longer for finding the button.

**Still to do:** keep GitHub Pages switched on until 2026-11-28 as the way back. Pages cannot
renew its certificate while the domain points elsewhere, so check the certificate is still
valid before relying on it. Then switch Pages off, and in a follow-up pull request remove
`CNAME`, `.nojekyll` and the test "the files GitHub Pages needs are still at the root".

`/404.html` and `_headers` at the root are Cloudflare's alone.

## Facts this page relies on

Checked against Cloudflare's documentation on 2026-11-14 (developers.cloudflare.com/workers):

- A Worker with `assets` and no `main` serves static files without running code.
- `_headers`: up to 100 rules, 2,000 characters a line; a rule may name a full
  `https://host/*` address; `! Header-Name` removes a header an earlier rule added.
- Worker Previews (`wrangler preview`, open beta) need wrangler 4.135.0 or later and a
  `previews` block; preview addresses on workers.dev are sent with `X-Robots-Tag: noindex`.
- `wrangler rollback` creates a new deployment that sends all traffic to an earlier version,
  on the Worker's same routes and domains; the last 100 versions are kept.
- Changing routes or custom domains needs Workers Routes Edit on the zone as well as edit
  rights on the Worker. Creating a Worker needs account-wide rights.
- A custom domain creates its own DNS record and certificate, and cannot be created over an
  existing CNAME.

Not yet proven on a real deploy (no token existed when this was written): the deploy,
preview and rollback steps themselves. `wrangler deploy --dry-run` passes for both
environments, and the health check, the indexing rules and the public-file list are proven
against a local `wrangler dev`.
