/**
 * Recipe 03 — Content-addressed storage: blob round-trip + chunked object.
 *
 * Teaches: the data layer. `data.putBlob` stores raw bytes and returns their SHA256 hash (the
 * CID); `data.getBlob` fetches by hash (with a mesh DHT fallback). `data.putObject`/`getObject`
 * layer a client-side chunker + manifest on top so you can store arbitrarily large payloads,
 * each chunk verified against its CID on the way back (trustless reassembly).
 *
 * Run:  npx tsx recipes/03_blob_object.ts
 */
import { CeClient, utf8ToBytes, bytesToUtf8 } from "@ce-net/sdk";

async function main(): Promise<void> {
  const baseUrl = process.env["CE_BASE_URL"] ?? "http://127.0.0.1:8844";
  const token = process.env["CE_API_TOKEN"];
  const ce = token ? new CeClient({ baseUrl, token }) : CeClient.local();

  // --- small blob round-trip ---
  const payload = utf8ToBytes("hello from the CE cookbook");
  const hash = await ce.data.putBlob(payload);
  console.log(`stored blob -> ${hash}`);
  if (hash.length !== 64) throw new Error("blob hash must be 64 hex chars");

  const back = await ce.data.getBlob(hash);
  if (bytesToUtf8(back) !== "hello from the CE cookbook") throw new Error("blob round-trip mismatch");
  console.log(`blob round-trip verified (${back.length} bytes)`);

  // --- large object: chunked + manifest CID ---
  const big = new Uint8Array(3 * 1024 * 1024); // 3 MiB, larger than one chunk
  for (let i = 0; i < big.length; i++) big[i] = i & 0xff;

  const cid = await ce.data.putObject(big);
  console.log(`stored object -> ${cid}`);

  const restored = await ce.data.getObject(cid);
  const equal = restored.length === big.length && restored.every((b, i) => b === big[i]);
  if (!equal) throw new Error("object round-trip mismatch");
  console.log(`object round-trip verified (${restored.length} bytes)`);

  console.log("RECIPE_OK 03_blob_object");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
