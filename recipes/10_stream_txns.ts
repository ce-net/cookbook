/**
 * Recipe 10 — Stream transactions live + read verifiable randomness (beacon).
 *
 * Teaches: two more read primitives. `GET /transactions/stream` pushes every verified tx as it
 * enters the pool (watch the economy live). `GET /beacon` returns the PoW tip height + hash —
 * unpredictable, globally-agreed public randomness apps use to seed auditable host selection.
 *
 * Run:  npx tsx recipes/10_stream_txns.ts
 */
import { CeClient } from "@ce-net/sdk";

async function main(): Promise<void> {
  const baseUrl = process.env["CE_BASE_URL"] ?? "http://127.0.0.1:8844";
  const token = process.env["CE_API_TOKEN"];
  const ce = token ? new CeClient({ baseUrl, token }) : CeClient.local();

  // Verifiable randomness from the chain tip.
  const beacon = await ce.beacon();
  console.log(`beacon: height ${beacon.height} | hash ${beacon.hash.slice(0, 16)}`);
  if (beacon.hash.length !== 64) throw new Error("beacon hash must be 64 hex chars");

  // Open the tx stream (the handshake is the contract); print any txs that arrive in a window.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  let seen = 0;
  console.log("listening for transactions (up to 3s)...");
  try {
    for await (const tx of ce.streams.transactions({ signal: ctrl.signal })) {
      console.log(`  ${tx.id.slice(0, 12)} ${tx.kind} ${tx.amount.toCredits()}`);
      if (++seen >= 3) break;
    }
  } catch (e) {
    if (!(e instanceof Error) || e.name !== "AbortError") throw e;
  } finally {
    clearTimeout(timer);
  }

  console.log(`RECIPE_OK 10_stream_txns (txns_seen=${seen})`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
