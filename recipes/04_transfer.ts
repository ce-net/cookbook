/**
 * Recipe 04 — Transfer credits (the money model, base-unit strings, no floats).
 *
 * Teaches: `POST /transfer`. Money in CE is integer base units: 1 credit = 10^18 base units,
 * wei-style. NEVER use floats for money. In TS, `Amount` is bigint-backed: `Amount.fromCredits("1")`
 * is exactly 1_000_000_000_000_000_000n base units and serializes as the string
 * "1000000000000000000" on the wire (the value exceeds JS's 2^53 safe-integer limit, so strings
 * are mandatory).
 *
 * Run:  npx tsx recipes/04_transfer.ts
 *
 * Contract note: on a fresh `--no-mine` node the balance is 0, so the node returns 402 Payment
 * Required (a `CeInsufficientFundsError`). That is the *correct* documented behavior — this recipe
 * treats it as a pass (it proves the endpoint + money encoding work).
 */
import { CeClient, Amount, CeInsufficientFundsError } from "@ce-net/sdk";

async function main(): Promise<void> {
  const baseUrl = process.env["CE_BASE_URL"] ?? "http://127.0.0.1:8844";
  const token = process.env["CE_API_TOKEN"];
  const ce = token ? new CeClient({ baseUrl, token }) : CeClient.local();

  const s = await ce.getStatus();
  const recipient = s.nodeId; // self-transfer keeps the recipe self-contained

  const amount = Amount.fromCredits("1");
  console.log(`transferring ${amount.toCredits()} (${amount.toBaseUnits()} base units) to ${recipient.slice(0, 16)}`);
  if (amount.toBaseUnits() !== "1000000000000000000") throw new Error("1 credit == 10^18 base units");

  try {
    const txId = await ce.transfer(recipient, amount);
    console.log(`transfer accepted, tx ${txId}`);
    console.log("RECIPE_OK 04_transfer (settled)");
  } catch (e) {
    if (e instanceof CeInsufficientFundsError) {
      console.log("402 Payment Required (expected on a zero-balance no-mine node)");
      console.log("RECIPE_OK 04_transfer (402 expected)");
    } else {
      throw e;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
