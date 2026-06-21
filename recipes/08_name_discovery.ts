/**
 * Recipe 08 — Claim a name + advertise/find a service over the DHT.
 *
 * Teaches: human-readable naming and service discovery. `names.claim` submits an on-chain
 * NameClaim (takes effect when mined; first claim wins); `names.resolve` maps a name back to a
 * NodeId. `discovery.advertise` puts this node into the DHT under a service string;
 * `discovery.find` returns the NodeIds advertising it. Together these let apps find each other
 * without any hardcoded ip:port (mesh-first).
 *
 * Run:  npx tsx recipes/08_name_discovery.ts
 */
import { CeClient } from "@ce-net/sdk";

async function main(): Promise<void> {
  const baseUrl = process.env["CE_BASE_URL"] ?? "http://127.0.0.1:8844";
  const token = process.env["CE_API_TOKEN"];
  const ce = token ? new CeClient({ baseUrl, token }) : CeClient.local();

  const s = await ce.getStatus();

  // --- naming --- (3-32 chars, lowercase a-z / 0-9 / hyphen)
  const name = `cookbook-${s.nodeId.slice(0, 6)}`;
  try {
    await ce.names.claim(name);
    console.log(`submitted name claim '${name}' (effective once mined)`);
  } catch (e) {
    console.log(`name claim returned: ${e instanceof Error ? e.message : String(e)} (acceptable: already claimed / unmined)`);
  }
  // Resolution only succeeds after the claim is mined; null is expected on a fresh no-mine node.
  const owner = await ce.names.resolve(name);
  console.log(owner ? `'${name}' resolves to ${owner.slice(0, 16)}` : `'${name}' not yet resolvable (claim pending — expected on no-mine)`);

  // --- service discovery (DHT, no chain wait) ---
  const service = "cookbook-demo";
  await ce.discovery.advertise(service);
  console.log(`advertised service '${service}'`);

  const providers = await ce.discovery.find(service);
  console.log(`'${service}' has ${providers.length} provider(s)`);

  console.log("RECIPE_OK 08_name_discovery");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
