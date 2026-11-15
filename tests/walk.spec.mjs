// Walk every public page of the build in a real browser, at each size in playwright.config.mjs.
// The site is light only, so the dark pass walks only the pages that have a dark style of their
// own (today the three privacy policies); for every other page it would repeat the light pass.
// For each page:
//   * it answers 200 and has a title and one <h1>
//   * the browser reports no console error, no failed request and no request to another origin
//     (a page that broke the security header, say with an inline script, shows up here)
//   * nothing is wider than the screen (no sideways scrolling on a phone), and nothing inside the
//     page scrolls sideways either, except a gallery stage, which must have its row of small
//     pictures showing (one per picture) so a visitor sees there is more and can pick it
//   * the accessibility scan (axe, WCAG 2.1 A and AA plus best practices) finds nothing
//   * screenshots are saved to test-results/walk/ (whole page) and test-results/walk/fold/
//     (the top of the page; the release pull request shows those)
// Then it follows the links a visitor would: home to each page it links, and a missing
// address to the 404 page and back home.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { addressOf, dist, publicPages, root } from "../ops/public-files.mjs";

// ops/public-files.txt -> the addresses of the HTML pages (a/index.html is /a/, 404.html is /404).
const files = publicPages();
const pages = files.map(addressOf);

// Pages with a dark style of their own: the page, or a stylesheet it links, asks for
// prefers-color-scheme. Read from the build in dist/.
const darkPages = new Set(files.filter((file) => {
  const html = readFileSync(path.join(dist, file), "utf8");
  const sheets = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="\/([^"]+)"/g)].map((m) => path.join(dist, m[1]));
  return [html, ...sheets.filter((f) => existsSync(f)).map((f) => readFileSync(f, "utf8"))].some((t) => t.includes("prefers-color-scheme"));
}).map(addressOf));

const isDark = (testInfo) => testInfo.project.metadata.scheme === "dark";
const lightOnly = (testInfo) => test.skip(isDark(testInfo), "the site is light only; the dark pass walks only pages with a dark style");

const slug = (p) => (p === "/" ? "home" : p.replace(/^\/|\/$/g, "").replaceAll("/", "-"));

// Everything the browser complains about while a page is open. `leaving()` says the test is
// navigating away on purpose: requests the browser cancels for that (ERR_ABORTED) are expected.
function watch(page, baseURL, leaving = () => false) {
  const problems = [];
  const origin = new URL(baseURL).origin;
  // The privacy pages declare no icon, so browsers ask for /favicon.ico on their own (the
  // site's icon is /favicon.svg). That 404 is the one complaint let through, here and below.
  const favicon = (url) => { try { return new URL(url).pathname === "/favicon.ico"; } catch { return false; } };
  page.on("console", (m) => {
    if (m.type() === "error" && !favicon(m.location().url)) problems.push(`console error: ${m.text()} (${m.location().url})`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) => {
    // A video element cancels its own first request for a clip and asks again for byte ranges;
    // the browser reports the cancelled one as ERR_ABORTED. A clip that is really missing still
    // shows as an HTTP error in the response check below, and any other failure is reported.
    const aborted = r.failure()?.errorText === "net::ERR_ABORTED";
    if (aborted && (r.resourceType() === "media" || leaving())) return;
    problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`);
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.origin !== origin) problems.push(`request to another origin: ${r.url()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !favicon(r.url())) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problems;
}

async function scan(page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join("; ")}]`);
}

for (const address of pages) {
  test(`page ${address}`, async ({ page, baseURL }, testInfo) => {
    test.skip(isDark(testInfo) && !darkPages.has(address), "light only: this page has no dark style");
    const problems = watch(page, baseURL);
    const response = await page.goto(address, { waitUntil: "load" });
    // The 404 page is also a file of its own, at /404, where it answers 200.
    expect(response.status(), `${address} status`).toBe(200);
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the page is wider than the screen").toBeLessThanOrEqual(0);

    // A strip that hides cards past the edge is not allowed: content is a grid, or a gallery with
    // its row of small pictures.
    const sideways = await page.evaluate(() => [...document.querySelectorAll("body *")]
      .filter((e) => { const s = getComputedStyle(e); return /auto|scroll/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1; })
      .map((e) => {
        const gallery = e.closest("[data-gallery]");
        const bar = gallery?.querySelector("[data-gallery-thumbs]");
        const ok = e.hasAttribute("data-gallery-stage") && bar && !bar.hidden && getComputedStyle(bar).display !== "none"
          && bar.querySelectorAll("button").length === e.children.length;
        return ok ? null : `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`;
      })
      .filter(Boolean));
    expect(sideways, "something scrolls sideways without a gallery's row of small pictures").toEqual([]);

    // The whole page, and the top of it as a visitor first sees it (the release pull request shows that one).
    const shot = `${testInfo.project.name}-${slug(address)}.png`;
    await page.screenshot({ path: path.join(root, "test-results", "walk", shot), fullPage: true });
    await page.screenshot({ path: path.join(root, "test-results", "walk", "fold", shot) });

    expect(await scan(page), "accessibility").toEqual([]);
    expect(problems, "browser problems").toEqual([]);
  });
}

test("a gallery's small pictures bring their picture into view", async ({ page }, testInfo) => {
  lightOnly(testInfo);
  await page.goto("/squishy-bop/");
  const stage = page.locator("[data-gallery-stage]").first();
  const thumbs = page.locator("[data-gallery-thumbs]").first().locator("button");
  test.skip(!(await thumbs.first().isVisible()), "every picture is in view at this size; the row is hidden");
  const count = await thumbs.count();
  expect(count).toBeGreaterThan(1);
  await expect(thumbs.first()).toHaveAttribute("aria-current", "true");
  // While the stage glides to the tapped picture, no other small picture is marked on the way: the
  // ring goes straight to the one tapped and stays there.
  await page.evaluate(() => {
    const bar = document.querySelector("[data-gallery-thumbs]");
    const buttons = [...bar.querySelectorAll("button")];
    window.__marked = [];
    new MutationObserver(() => {
      const i = buttons.findIndex((b) => b.getAttribute("aria-current") === "true");
      if (window.__marked.at(-1) !== i) window.__marked.push(i);
    }).observe(bar, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
  });
  await thumbs.nth(count - 1).click();
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__marked), "the ring hopped along the row").toEqual([count - 1]);
  await expect(thumbs.nth(count - 1)).toHaveAttribute("aria-current", "true");
  await expect(thumbs.first()).toHaveAttribute("aria-current", "false");
  // Once the smooth scroll settles, the last picture is the one in the middle of the stage.
  await expect.poll(() => stage.evaluate((el) => {
    const last = el.children[el.children.length - 1].getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return Math.abs(last.left + last.width / 2 - (box.left + box.width / 2));
  }), { message: "the picture is centred in the stage" }).toBeLessThan(4);
  // Swiping back to the start moves the ring with the stage.
  await stage.evaluate((el) => el.scrollTo({ left: 0 }));
  await expect(thumbs.first()).toHaveAttribute("aria-current", "true");
});

test("the dark pass still covers the pages that have a dark style", async () => {
  for (const p of ["/squishy-bop/privacy/", "/plush-hour/privacy/", "/giggle-bomb/privacy/"]) {
    expect(darkPages.has(p), p).toBe(true);
  }
});

test("home links lead to pages that answer", async ({ page, baseURL }, testInfo) => {
  lightOnly(testInfo);
  let leaving = false;
  const problems = watch(page, baseURL, () => leaving);
  await page.goto("/");
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const inside = [...new Set(hrefs.filter((h) => !/^(https?:|mailto:|tel:|#)/.test(h)))];
  expect(inside.length, "the home page links to at least one page of the site").toBeGreaterThan(0);
  // Every link is a round trip (home, then the page, each until its network is quiet), so the
  // time this test may take grows with the number of links instead of being one fixed limit.
  test.setTimeout(30_000 + inside.length * 5_000);
  // Each page is left once its network is quiet. Clicking scrolls the link into view, which can
  // start lazy pictures that the navigation then cancels: those cancellations are not failures.
  for (const href of inside) {
    leaving = true;
    await page.goto("/", { waitUntil: "networkidle" });
    leaving = false;
    const link = page.locator(`a[href="${href}"]:visible`).first();
    await link.scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    leaving = true;
    await link.click();
    await page.waitForLoadState("networkidle");
    leaving = false;
    await expect(page.locator("h1")).toBeVisible();
    expect(new URL(page.url()).origin).toBe(new URL(baseURL).origin);
  }
  expect(problems, "browser problems").toEqual([]);
});

test("a missing address shows the 404 page, which leads home", async ({ page }, testInfo) => {
  lightOnly(testInfo);
  const response = await page.goto("/no-such-page/deeper/");
  expect(response.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("Page not found");
  await page.getByRole("link", { name: "Go to the home page" }).click();
  await expect(page).toHaveURL(/\/$/);
  // The home page's title is on the never-break list; its heading is a sentence that may change.
  await expect(page).toHaveTitle("Penny Paws Games");
  await expect(page.locator("h1")).toBeVisible();
});
