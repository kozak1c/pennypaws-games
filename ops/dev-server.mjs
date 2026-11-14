// How the local copy of the site is started: one place, used by ops/with-site.mjs and by
// playwright.config.mjs, so the checks and the browser walk run against the same server.
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

export const PRODUCTION_HOST = "pennypawsgames.com";

// "wrangler dev" arguments (for `node`), the port and the address.
//   asProduction: the production Worker's config, with every request arriving as if it were
//   for the public host (wrangler's --local-upstream), on port 8788 instead of 8787.
export function devArgs({ asProduction = false, port } = {}) {
  const p = port ?? (asProduction ? 8788 : 8787);
  const args = [wrangler, "dev", "--env", asProduction ? "production" : "staging",
    "--ip", "127.0.0.1", "--port", String(p), "--inspector-port", String(p + 1000),
    "--show-interactive-dev-session=false"];
  if (asProduction) args.push("--local-upstream", PRODUCTION_HOST);
  return { args, port: p, url: `http://127.0.0.1:${p}` };
}
