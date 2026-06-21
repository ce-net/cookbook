/**
 * Recipe 06 — Payment channel: open -> sign receipt -> (host) close.
 *
 * Teaches: off-chain micropayments. The payer opens a channel locking `capacity` to a host
 * (`POST /channels/open`), then signs cumulative off-chain receipts (`POST /channels/receipt`)
 * with no on-chain tx per payment. The host eventually redeems the *highest* receipt on-chain
 * (`POST /channels/:id/close`). This is how CE bills streaming work without a tx per tick.
 *
 * Run:  npx tsx recipes/06_payment_channel.ts
 *
 * needs: channel-host (a second node host + a funded payer). On a zero-balance node
 * `channels/open` returns 402 — the expected contract outcome here.
 */
import { CeClient, Amount, CeInsufficientFundsError, CeBadRequestError } from "@ce-net/sdk";

async function main(): Promise<void> {
  const baseUrl = process.env["CE_BASE_URL"] ?? "http://127.0.0.1:8844";
  const token = process.env["CE_API_TOKEN"];
  const ce = token ? new CeClient({ baseUrl, token }) : CeClient.local();

  const s = await ce.getStatus();
  const host = s.nodeId; // a real flow targets a *different* node; self exercises the API shape.

  let channelId: string;
  try {
    channelId = await ce.channels.open(host, Amount.fromCredits("10"));
  } catch (e) {
    // Single-node cookbook run: the node rejects a channel-to-self (400) and a zero-balance
    // payer (402). Both are the expected outcomes for the single-node slice of this
    // `channel-host` recipe — they prove the endpoint + money encoding are reached. A real run
    // uses a *separate, funded* host node.
    if (e instanceof CeInsufficientFundsError) {
      console.log("402 Payment Required (expected on a zero-balance no-mine node)");
      console.log("RECIPE_OK 06_payment_channel (402 expected — needs a funded payer)");
      return;
    }
    if (e instanceof CeBadRequestError && /to self/i.test(e.message)) {
      console.log("400 'channel to self' (expected single-node slice — needs a 2nd host node)");
      console.log("RECIPE_OK 06_payment_channel (single-node slice — needs channel-host)");
      return;
    }
    throw e;
  }
  console.log(`opened channel ${channelId} (capacity 10 credits)`);

  // Cumulative receipt for 3 credits. `cumulative` is monotonic: each new receipt authorizes the
  // running total, so the host only ever redeems one (the highest).
  const receipt = await ce.channels.signReceipt(channelId, host, Amount.fromCredits("3"));
  console.log(`signed receipt: cumulative ${receipt.cumulative.toCredits()} | payerSig ${receipt.payerSig.slice(0, 16)}…`);

  // The host node would now redeem it:
  //   await hostCe.channels.close(channelId, receipt.cumulative, receipt.payerSig);
  // (omitted — requires the host node's API; the payer-side flow above is the contract).

  console.log("RECIPE_OK 06_payment_channel");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
