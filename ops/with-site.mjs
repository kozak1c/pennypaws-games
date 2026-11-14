// Run a command against a local copy of the site, then stop it.
//
//   node ops/with-site.mjs -- python ops/health.py {site} --expect staging
//   node ops/with-site.mjs --as-production -- python ops/health.py {site} --expect production
//
// It starts "wrangler dev" (the same asset server Cloudflare runs) on 127.0.0.1, waits until
// the home page answers, runs the command with every {site} replaced by the server's address,
// and always stops the server, also on Windows, where wrangler's child processes outlive a
// plain kill.
//
// The port is a free one, chosen each run, so the command can never be pointed at some other
// program that happens to hold a fixed port.
//
//   default           the staging Worker's config. Requests arrive with the local host name,
//                     so the site behaves like any address that is not the public one.
//   --as-production   the production Worker's config, and every request arrives as if it were
//                     for pennypawsgames.com (wrangler's --local-upstream). This is how the
//                     "public address is indexable" rule in _headers is tested before anything
//                     is deployed.
//   --port N          use this port; it is an error if something already listens on it.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { devArgs, freePort, portInUse } from "./dev-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function stop(child) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
  }
}

async function waitFor(url, child, seconds = 60) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited with code ${child.exitCode}`);
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status === 200) return;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not answer within ${seconds} s`);
}

async function main() {
  const argv = process.argv.slice(2);
  const split = argv.indexOf("--");
  if (split < 0 || split === argv.length - 1) {
    console.error("usage: node ops/with-site.mjs [--as-production] [--port N] -- <command> [args...]");
    return 2;
  }
  const flags = argv.slice(0, split);
  const portAt = flags.indexOf("--port");
  const port = portAt >= 0 ? Number(flags[portAt + 1]) : await freePort();
  if (portAt >= 0 && await portInUse(port)) {
    console.error(`with-site: something already listens on 127.0.0.1:${port}; stop it or leave --port out`);
    return 1;
  }
  const { args, url } = devArgs({
    asProduction: flags.includes("--as-production"),
    port,
    inspectorPort: await freePort(),
  });
  const command = argv.slice(split + 1).map((a) => a.replaceAll("{site}", url));

  const server = spawn(process.execPath, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32", // its own process group, so stop() takes the children too
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" },
  });
  let log = "";
  server.stdout.on("data", (d) => { log += d; });
  server.stderr.on("data", (d) => { log += d; });
  const onSignal = () => { stop(server); process.exit(130); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    await waitFor(url + "/", server);
    const run = spawnSync(command[0], command.slice(1), { cwd: root, stdio: "inherit" });
    if (run.error) throw run.error;
    return run.status ?? 1;
  } catch (err) {
    console.error(`with-site: ${err.message}`);
    console.error(log.trim().split("\n").slice(-20).join("\n"));
    return 1;
  } finally {
    stop(server);
  }
}

process.exit(await main());
