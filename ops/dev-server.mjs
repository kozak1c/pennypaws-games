// How the local copy of the site is started: one place, used by ops/with-site.mjs and by
// playwright.config.mjs, so the checks and the browser walk run against the same server.
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

export const PRODUCTION_HOST = "pennypawsgames.com";

// Ports on 127.0.0.1 that nothing is listening on, all different. The checks ask for them
// each run instead of using fixed numbers: another program on a fixed port (a second local
// server, another checkout's run) would otherwise be checked in the site's place. The probes
// are held open together, so two ports asked for at once can never be the same one.
export async function freePorts(count) {
  const probes = [];
  try {
    for (let i = 0; i < count; i++) {
      probes.push(await new Promise((resolve, reject) => {
        const probe = createServer();
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", () => resolve(probe));
      }));
    }
    return probes.map((probe) => probe.address().port);
  } finally {
    await Promise.all(probes.map((probe) => new Promise((done) => probe.close(done))));
  }
}

// Whether something already listens on a port of 127.0.0.1.
export function portInUse(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(true));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(false)));
  });
}

// "wrangler dev" arguments (for `node`), the port and the address.
//   asProduction: the production Worker's config, with every request arriving as if it were
//   for the public host (wrangler's --local-upstream), on port 8788 instead of 8787.
//   port, inspectorPort: fixed numbers; the defaults are for `npm run dev`, the checks pass
//   free ones.
export function devArgs({ asProduction = false, port, inspectorPort } = {}) {
  const p = port ?? (asProduction ? 8788 : 8787);
  const args = [wrangler, "dev", "--env", asProduction ? "production" : "staging",
    "--ip", "127.0.0.1", "--port", String(p), "--inspector-port", String(inspectorPort ?? p + 1000),
    "--show-interactive-dev-session=false"];
  if (asProduction) args.push("--local-upstream", PRODUCTION_HOST);
  return { args, port: p, url: `http://127.0.0.1:${p}` };
}
