/**
 * Recipe 09 — Read wallet balance + transaction history.
 *
 * Teaches: the cohesive money view. `wallet.balance()` splits `/status` into total / free /
 * locked-in-channels / locked-in-bond; `wallet.transactions()` pages confirmed history
 * newest-first from `/transactions/:node_id`. No new endpoints — the wallet composes existing
 * ones and holds no key material.
 *
 * Run:  npx tsx recipes/09_wallet.ts
 */
import { CeClient } from "@ce-net/sdk";

async function main(): Promise<void> {
  const baseUrl = process.env["CE_BASE_URL"] ?? "http://127.0.0.1:8844";
  const token = process.env["CE_API_TOKEN"];
  const ce = token ? new CeClient({ baseUrl, token }) : CeClient.local();

  const s = await ce.getStatus();
  const bal = await ce.wallet.balance();
  console.log(
    `balance: total ${bal.total.toCredits()} | free ${bal.free.toCredits()} | ` +
      `locked(channels) ${bal.lockedChannels.toCredits()} | locked(bond) ${bal.lockedBond.toCredits()} | ` +
      `bond ${bal.bond.toCredits()}`,
  );
  // Invariant the wallet maintains: free is never negative (node clamps at zero).
  if (BigInt(bal.free.toBaseUnits()) < 0n) throw new Error("free balance must be >= 0");

  const txs = await ce.wallet.transactions(s.nodeId, { limit: 10 });
  console.log(`recent transactions: ${txs.length}`);
  for (const t of txs.slice(0, 5)) {
    console.log(
      `  h${t.height} ${t.direction} ${t.kind} ${t.amount.toCredits()} ${t.counterparty?.slice(0, 12) ?? "-"}`,
    );
  }

  console.log("RECIPE_OK 09_wallet");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
