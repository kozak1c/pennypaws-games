// Walk every public page in a real browser, at each size and colour scheme in
// playwright.config.mjs. For each page:
//   * it answers 200 and has a title and one <h1>
//   * the browser reports no console error, no failed request and no request to another origin
//   * nothing is wider than the screen (no sideways scrolling on a phone)
//   * the accessibility scan (axe, WCAG 2.1 A and AA plus best practices) finds nothing
//   * screenshots are saved to test-results/walk/ (whole page) and test-results/walk/fold/
//     (the top of the page; the release pull request shows those)
// Then it follows the links a visitor would: home to each page it links, and a missing
// address to the 404 page and back home.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ops/public-files.txt -> the addresses of the HTML pages (a/index.html is /a/, 404.html is /404).
const pages = readFileSync(path.join(root, "ops", "public-files.txt"), "utf8")
  .split("\n").map((l) => l.trim()).filter((l) => l.endsWith(".html") && !l.startsWith("#"))
  .map((file) => {
    if (file === "index.html") return "/";
    if (file.endsWith("/index.html")) return `/${file.slice(0, -"index.html".length)}`;
    return `/${file.slice(0, -".html".length)}`;
  });

const slug = (p) => (p === "/" ? "home" : p.replace(/^\/|\/$/g, "").replaceAll("/", "-"));

// Everything the browser complains about while a page is open.
function watch(page, baseURL) {
  const problems = [];
  const origin = new URL(baseURL).origin;
  // The site has no favicon yet, and browsers ask for one on their own. That 404 is the one
  // complaint let through, here and in the response check below.
  const favicon = (url) => { try { return new URL(url).pathname === "/favicon.ico"; } catch { return false; } };
  page.on("console", (m) => {
    if (m.type() === "error" && !favicon(m.location().url)) problems.push(`console error: ${m.text()} (${m.location().url})`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
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
    const problems = watch(page, baseURL);
    const response = await page.goto(address, { waitUntil: "load" });
    // The 404 page is also a file of its own, at /404, where it answers 200.
    expect(response.status(), `${address} status`).toBe(200);
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "the page is wider than the screen").toBeLessThanOrEqual(0);

    // The whole page, and the top of it as a visitor first sees it (the release pull request shows that one).
    const shot = `${testInfo.project.name}-${slug(address)}.png`;
    await page.screenshot({ path: path.join(root, "test-results", "walk", shot), fullPage: true });
    await page.screenshot({ path: path.join(root, "test-results", "walk", "fold", shot) });

    expect(await scan(page), "accessibility").toEqual([]);
    expect(problems, "browser problems").toEqual([]);
  });
}

test("home links lead to pages that answer", async ({ page, baseURL }) => {
  const problems = watch(page, baseURL);
  await page.goto("/");
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const inside = hrefs.filter((h) => !/^(https?:|mailto:|tel:|#)/.test(h));
  expect(inside.length, "the home page links to at least one page of the site").toBeGreaterThan(0);
  for (const href of inside) {
    await page.goto("/");
    await page.locator(`a[href="${href}"]`).first().click();
    await page.waitForLoadState("load");
    await expect(page.locator("h1")).toBeVisible();
    expect(new URL(page.url()).origin).toBe(new URL(baseURL).origin);
  }
  expect(problems, "browser problems").toEqual([]);
});

test("a missing address shows the 404 page, which leads home", async ({ page }) => {
  const response = await page.goto("/no-such-page/deeper/");
  expect(response.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("Page not found");
  await page.getByRole("link", { name: /home/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("h1")).toHaveText("Penny Paws Games");
});
