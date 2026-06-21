/**
 * Recipe 01 — Read node status, balance breakdown, and the capacity atlas.
 *
 * Teaches: the first call every app makes. `GET /status` returns the node id, chain height,
 * and a balance split into free / locked-in-channels / locked-in-bond buckets. `GET /atlas` is
 * the live capacity snapshot of every peer (used for host selection).
 *
 * Run:  npx tsx recipes/01_status.ts
 * Env:  CE_BASE_URL (default http://127.0.0.1:8844), CE_API_TOKEN (auto-discovered on Node).
 *
 * Money rule: amounts are integer base units (1 credit = 10^18 base units), carried on the wire
 * as decimal strings — never floats. `amount.toCredits()` renders the human decimal.
 */
import { CeClient } from "@ce-net/sdk";

async function main(): Promise<void> {
  const baseUrl = process.env["CE_BASE_URL"] ?? "http://127.0.0.1:8844";
  const token = process.env["CE_API_TOKEN"];
  const ce = token ? new CeClient({ baseUrl, token }) : CeClient.local();

  const s = await ce.getStatus();
  console.log(
    `node ${s.nodeId} | height ${s.height} | difficulty ${s.difficulty} | ` +
      `balance ${s.balance.toCredits()} (${s.balance.toBaseUnits()} base units)`,
  );

  const atlas = await ce.atlas();
  console.log(`atlas: ${atlas.length} peer(s) advertising capacity`);
  for (const h of atlas.slice(0, 5)) {
    console.log(
      `  ${h.nodeId.slice(0, 16)} | ${h.cpuCores} cores | ${h.memMb} MB | ` +
        `jobs=${h.runningJobs} | tags=[${h.tags.join(",")}]`,
    );
  }

  // Contract assertion (this IS the test): a node id is always 64 hex chars.
  if (s.nodeId.length !== 64) throw new Error("node_id must be 64 hex chars");
  console.log("RECIPE_OK 01_status");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
