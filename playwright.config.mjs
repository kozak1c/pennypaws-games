// The browser walk: every public page at a phone size and a desktop size, in light; the dark
// projects walk only the pages that have a dark style (tests/walk.spec.mjs).
//
//   npm run walk                     (npm run build, then npx playwright test)
//   PLAYWRIGHT_CHANNEL=msedge npm run walk     use an installed Edge instead of a downloaded Chromium
//   WALK_BASE_URL=https://staging.pennypawsgames.com npm run walk     walk a deployed copy
//
// Without WALK_BASE_URL it starts the local copy of the site itself (ops/dev-server.mjs, which
// serves the build in dist/), on a free port chosen once per run, so it never walks some other
// program's pages. The worker processes load this file again and must get the same ports: they
// inherit them from the environment. The page list and the dark-style test read dist/ too, so
// build first either way.
import { defineConfig } from "@playwright/test";
import { devArgs, freePorts, requireBuild } from "./ops/dev-server.mjs";

requireBuild();
if (!process.env.WALK_BASE_URL && !process.env.WALK_LOCAL_PORT) {
  const [port, inspectorPort] = await freePorts(2);
  process.env.WALK_LOCAL_PORT = String(port);
  process.env.WALK_LOCAL_INSPECTOR_PORT = String(inspectorPort);
}
const local = devArgs({
  port: Number(process.env.WALK_LOCAL_PORT) || undefined,
  inspectorPort: Number(process.env.WALK_LOCAL_INSPECTOR_PORT) || undefined,
});
const baseURL = process.env.WALK_BASE_URL || local.url;
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

const sizes = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};

export default defineConfig({
  testDir: "tests",
  testMatch: "walk.spec.mjs",
  outputDir: "test-results/playwright",
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: { baseURL, browserName: "chromium", channel, trace: "off" },
  projects: Object.entries(sizes).flatMap(([size, device]) =>
    ["light", "dark"].map((scheme) => ({
      name: `${size}-${scheme}`,
      use: { ...device, colorScheme: scheme },
      metadata: { size, scheme },
    }))),
  webServer: process.env.WALK_BASE_URL ? undefined : {
    command: `"${process.execPath}" ${local.args.map((a) => `"${a}"`).join(" ")}`,
    url: local.url,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { WRANGLER_SEND_METRICS: "false", CI: "true" },
  },
});
