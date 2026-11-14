// The rules this repository's configuration must keep, checked on every pull request.
//
//   wrangler.jsonc   the site Worker is static files only; staging and production are what
//                    docs/runbook.md says they are
//   _headers         within Cloudflare's limits; the indexing rule is in the right order
//   .github/         workflows run only on GitHub's own runners, pin every action to a commit,
//                    default to a read-only token, and never deploy without naming an environment
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { unstable_readConfig } from "wrangler";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const config = (env) => unstable_readConfig({ config: path.join(root, "wrangler.jsonc"), env });

// ---------------------------------------------------------------- wrangler.jsonc

for (const env of [undefined, "production", "staging"]) {
  test(`wrangler ${env ?? "top level"}: static files only, no code in front of them`, () => {
    const c = config(env);
    assert.equal(c.main, undefined, "the site Worker has no script");
    assert.equal(c.assets.directory, ".");
    assert.equal(c.assets.binding, undefined, "no assets binding: nothing reads assets from code");
    assert.equal(c.assets.run_worker_first, undefined, "run_worker_first would put code in front of every page");
    assert.equal(c.assets.not_found_handling, "404-page");
    assert.equal(c.assets.html_handling, "auto-trailing-slash");
    assert.equal(c.observability.enabled, true);
    assert.deepEqual(c.vars, {});
    for (const key of ["kv_namespaces", "d1_databases", "r2_buckets", "services", "queues"]) {
      const v = c[key];
      assert.ok(v === undefined || (Array.isArray(v) ? v.length === 0 : Object.values(v).every((x) => !x || x.length === 0)),
        `${key} must stay empty: the site has no bindings`);
    }
    assert.deepEqual(c.triggers?.crons ?? [], []);
  });
}

test("wrangler production: the Worker pennypaws-site, the same from the top level and --env production", () => {
  const top = config(undefined);
  const prod = config("production");
  assert.equal(prod.name, "pennypaws-site");
  assert.equal(top.name, "pennypaws-site");
  for (const key of ["workers_dev", "preview_urls", "routes", "route", "assets", "observability", "compatibility_date"]) {
    assert.deepEqual(prod[key], top[key], `${key} differs between the top level and env.production`);
  }
  assert.equal(prod.previews, undefined, "pull request previews belong to staging, not production");
  assert.equal(prod.preview_urls, false);
});

// The domain moved from GitHub Pages with the release that added this route (PAWS-005).
test("wrangler production: on pennypawsgames.com as a custom domain, and nowhere else", () => {
  const prod = config("production");
  assert.deepEqual(prod.routes, [{ pattern: "pennypawsgames.com", custom_domain: true }],
    "the one public address; www is a redirect rule on the zone, not a second custom domain");
  assert.equal(prod.route, undefined);
  assert.equal(prod.workers_dev, false, "the public site has one address: no workers.dev copy");
});

test("wrangler staging: its own Worker on staging.pennypawsgames.com, with pull request previews", () => {
  const s = config("staging");
  assert.equal(s.name, "pennypaws-site-staging");
  assert.deepEqual(s.routes, [{ pattern: "staging.pennypawsgames.com", custom_domain: true }]);
  assert.equal(s.workers_dev, false);
  assert.equal(s.preview_urls, true);
  assert.deepEqual(s.previews, {});
});

// ---------------------------------------------------------------- _headers

function headerBlocks() {
  const blocks = [];
  for (const raw of read("_headers").split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) blocks.at(-1).lines.push(line.trim());
    else blocks.push({ pattern: line.trim(), lines: [] });
  }
  return blocks;
}

test("_headers: within Cloudflare's limits (100 rules, 2,000 characters a line)", () => {
  assert.ok(headerBlocks().length <= 100);
  for (const line of read("_headers").split("\n")) assert.ok(line.length <= 2000, line.slice(0, 60));
});

test("_headers: every address gets the security headers and noindex; only the public address drops noindex", () => {
  const blocks = headerBlocks();
  assert.deepEqual(blocks.map((b) => b.pattern), ["/*", "https://pennypawsgames.com/*"]);
  const all = Object.fromEntries(blocks[0].lines.map((l) => [l.slice(0, l.indexOf(":")).toLowerCase(), l.slice(l.indexOf(":") + 1).trim()]));
  assert.equal(all["x-robots-tag"], "noindex");
  assert.equal(all["x-content-type-options"], "nosniff");
  assert.match(all["strict-transport-security"], /^max-age=\d{8,}/);
  assert.ok(all["referrer-policy"]);
  const csp = all["content-security-policy"];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/, "scripts only from the site itself");
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /https?:|\*|'unsafe-eval'/, "no outside origin in the policy");
  assert.doesNotMatch(csp.match(/script-src[^;]*/)[0], /unsafe-inline/);
  // A removal only undoes what an earlier rule added, so the public block must come second.
  assert.deepEqual(blocks[1].lines, ["! X-Robots-Tag"]);
});

// ---------------------------------------------------------------- workflows

const workflowDir = path.join(root, ".github", "workflows");
const workflows = readdirSync(workflowDir).filter((f) => f.endsWith(".yml")).sort();
const actionFiles = [
  ...workflows.map((f) => `.github/workflows/${f}`),
  ...readdirSync(path.join(root, ".github", "actions"), { recursive: true })
    .map((f) => f.split(path.sep).join("/")).filter((f) => f.endsWith("action.yml")).map((f) => `.github/actions/${f}`),
];

test("workflows: the set the release flow needs is all there", () => {
  assert.deepEqual(workflows, ["ci.yml", "preview.yml", "release-guard.yml", "release-pr.yml", "release.yml", "rollback.yml", "staging.yml"]);
});

for (const file of actionFiles) {
  const text = read(file);
  const code = text.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

  test(`${file}: every action is pinned to a commit`, () => {
    const uses = [...code.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((m) => m[1]);
    for (const u of uses) {
      if (u.startsWith("./")) continue; // an action in this repository
      assert.match(u, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `${u} is not pinned to a full commit SHA`);
    }
  });

  test(`${file}: GitHub's own runners only`, () => {
    assert.doesNotMatch(code, /self-hosted/i, "this repository is public: never a self-hosted runner");
    for (const m of code.matchAll(/^\s*runs-on:\s*(.+)$/gm)) {
      assert.match(m[1].trim(), /^ubuntu-\d\d\.\d\d$/, `runs-on ${m[1]} must be a pinned ubuntu image`);
    }
  });

  if (file.includes("/workflows/")) {
    test(`${file}: read-only token by default, a timeout on every job, superseded runs handled`, () => {
      assert.match(code, /^permissions:\n  contents: read\n(?! )/m, "top-level permissions must be exactly contents: read");
      assert.match(code, /^concurrency:/m, "needs a concurrency group");
      const jobs = code.slice(code.search(/^jobs:/m));
      const jobCount = [...jobs.matchAll(/^  [\w-]+:\s*$/gm)].length;
      const timeouts = [...jobs.matchAll(/^    timeout-minutes:\s*\d+/gm)].length;
      assert.equal(timeouts, jobCount, "every job needs timeout-minutes");
      assert.doesNotMatch(code, /pull_request_target/, "pull_request_target runs with secrets on outside code");
      assert.doesNotMatch(code, /permissions:\s*write-all/);
    });

    test(`${file}: no pull request text is pasted into a shell`, () => {
      // Titles, bodies and branch names are attacker-controlled on a public repository.
      // They may only reach a script through env:, never through ${{ }} inside run:.
      const runs = [...code.matchAll(/^(\s*)run:\s*\|?\n((?:\1\s+.*\n?|\s*\n)+)/gm)].map((m) => m[2]);
      for (const body of runs) {
        assert.doesNotMatch(body, /\$\{\{\s*github\.(event\.pull_request\.(title|body|head\.ref|head\.label)|head_ref|event\.(comment|issue|review)\.)/);
      }
    });
  }

  test(`${file}: Cloudflare secrets go only to the steps that call wrangler`, () => {
    // Never at workflow or job level, where npm ci and the health check would see them too.
    for (const m of code.matchAll(/^(\s*)\w+:\s*\$\{\{\s*secrets\.(\w+)\s*\}\}/gm)) {
      assert.match(m[2], /^CLOUDFLARE_(API_TOKEN|ACCOUNT_ID)$/, `unexpected secret ${m[2]}`);
      assert.equal(m[1].length, 10, `secrets.${m[2]} must be in a step's env, not the job's`);
    }
    assert.equal([...code.matchAll(/secrets\./g)].length, [...code.matchAll(/^\s*\w+:\s*\$\{\{\s*secrets\.\w+\s*\}\}/gm)].length,
      "a secret is used somewhere other than a plain env entry");
  });

  test(`${file}: wrangler never deploys, previews or rolls back without --env`, () => {
    for (const m of code.matchAll(/wrangler\s+(deploy|rollback|preview|deployments|versions)\b[^\n]*/g)) {
      assert.match(m[0], /--env[ =](staging|production)\b|--env "\$/, `"${m[0].trim()}" must name its environment`);
    }
  });
}

test("ci.yml: the check is named ci, skips drafts, and runs on pull requests into staging", () => {
  const text = read(".github/workflows/ci.yml");
  assert.match(text, /^name: ci$/m);
  assert.match(text, /^  ci:$/m);
  assert.match(text, /pull_request\.draft == false/);
  assert.match(text, /ready_for_review/);
});

test("release-guard.yml: a job named source-is-staging on pull requests into main", () => {
  const text = read(".github/workflows/release-guard.yml");
  assert.match(text, /^  source-is-staging:$/m);
  assert.match(text, /branches: \[main\]/);
});

test("staging.yml posts the commit status staging/smoke", () => {
  assert.match(read(".github/workflows/staging.yml"), /staging\/smoke/);
});

test("dependabot: weekly, grouped, npm and actions, into staging", () => {
  const text = read(".github/dependabot.yml");
  for (const eco of ["npm", "github-actions"]) assert.match(text, new RegExp(`package-ecosystem: ${eco}`));
  assert.equal([...text.matchAll(/target-branch: staging/g)].length, 2);
  assert.equal([...text.matchAll(/interval: weekly/g)].length, 2);
  assert.equal([...text.matchAll(/^    groups:/gm)].length, 2);
});

test("package.json: wrangler is pinned to a version with Worker Previews (4.135.0 or later)", () => {
  const pkg = JSON.parse(read("package.json"));
  const v = pkg.devDependencies.wrangler;
  assert.match(v, /^\d+\.\d+\.\d+$/, "pin wrangler exactly; Dependabot moves it");
  const [major, minor] = v.split(".").map(Number);
  assert.ok(major > 4 || (major === 4 && minor >= 135), `wrangler ${v} is older than 4.135.0`);
  for (const [name, ver] of Object.entries(pkg.devDependencies)) assert.match(ver, /^\d+\.\d+\.\d+$/, `${name} is not pinned exactly`);
});

test("CLAUDE.md points at AGENTS.md", () => {
  assert.equal(read("CLAUDE.md").trim(), "@AGENTS.md");
});
