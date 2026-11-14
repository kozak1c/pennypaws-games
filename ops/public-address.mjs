// Print the custom-domain address of an environment in wrangler.jsonc, or nothing.
//
//   node ops/public-address.mjs staging      https://staging.pennypawsgames.com
//   node ops/public-address.mjs production   https://pennypawsgames.com
//
// The rollback workflow uses it to know where to run the health check. A deploy does not
// need it: it reads the address from wrangler's own output (ops/site_url.py).
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { unstable_readConfig } from "wrangler";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function publicAddress(env) {
  const config = unstable_readConfig({ config: path.join(root, "wrangler.jsonc"), env });
  const domain = (config.routes ?? []).find((r) => typeof r === "object" && r.custom_domain === true && r.enabled !== false);
  return domain ? `https://${domain.pattern}` : "";
}

const env = process.argv[2];
if (env === "staging" || env === "production") {
  const address = publicAddress(env);
  if (address) console.log(address);
} else if (process.argv[1]?.endsWith("public-address.mjs")) {
  console.error("usage: node ops/public-address.mjs staging|production");
  process.exit(2);
}
