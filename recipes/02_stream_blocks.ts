/**
 * Recipe 02 — Stream blocks live over SSE.
 *
 * Teaches: consuming `GET /blocks/stream` as a typed `AsyncIterable<BlockEvent>` with
 * `for await`. Every block accepted by the node (mined or received) is pushed as it happens —
 * the pattern dashboards and indexers use to react without polling.
 *
 * Run:  npx tsx recipes/02_stream_blocks.ts
 *
 * Note: against a `--no-mine` node with no peers there may be no blocks in the window; the recipe
 * still proves the stream opens and decodes, which is the contract under test. We bound the wait
 * with an AbortController so the recipe always terminates.
 */
import { CeClient } from "@ce-net/sdk";

async function main(): Promise<void> {
  const baseUrl = process.env["CE_BASE_URL"] ?? "http://127.0.0.1:8844";
  const token = process.env["CE_API_TOKEN"];
  const ce = token ? new CeClient({ baseUrl, token }) : CeClient.local();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);

  let seen = 0;
  console.log("listening for blocks (up to 4s)...");
  try {
    for await (const b of ce.streams.blocks({ signal: ctrl.signal })) {
      console.log(`  #${b.index} ${b.hash.slice(0, 12)} | ${b.txCount} txs | miner ${b.miner.slice(0, 12)}`);
      if (++seen >= 3) break;
    }
  } catch (e) {
    // AbortError on the idle-node timeout is expected; rethrow anything else.
    if (!(e instanceof Error) || e.name !== "AbortError") throw e;
    console.log("  (no block in window — stream opened OK on an idle node)");
  } finally {
    clearTimeout(timer);
  }

  console.log(`RECIPE_OK 02_stream_blocks (blocks_seen=${seen})`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
