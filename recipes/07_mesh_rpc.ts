/**
 * Recipe 07 — Mesh request/reply (the canonical app RPC pattern).
 *
 * Teaches: device-to-device app messaging over the mesh. A server subscribes to a topic and
 * answers inbound requests via `mesh.reply(replyToken, ...)`; a client calls
 * `mesh.request(node, topic, payload, timeout)` and awaits the reply. This is the building block
 * every CE *app* uses for cross-node features (the node stays primitives-only).
 *
 * Run:  npx tsx recipes/07_mesh_rpc.ts
 *
 * needs: two-nodes (a real request needs a peer running the reply loop). With one node we
 * exercise subscribe + the inbox snapshot, the single-node-testable slice of the contract.
 * Set CE_PEER_NODE_ID to run a live two-node round-trip.
 */
import { CeClient, utf8ToBytes, bytesToUtf8 } from "@ce-net/sdk";

async function main(): Promise<void> {
  const baseUrl = process.env["CE_BASE_URL"] ?? "http://127.0.0.1:8844";
  const token = process.env["CE_API_TOKEN"];
  const ce = token ? new CeClient({ baseUrl, token }) : CeClient.local();

  const topic = "cookbook/ping";

  // Server side: subscribe so inbound requests land in the inbox + stream.
  await ce.mesh.subscribe(topic);
  console.log(`subscribed to '${topic}'`);

  // The reply loop an app would run (drains requests, answers each):
  //
  //   for await (const m of ce.mesh.streamMessages()) {
  //     if (m.topic === topic && m.replyToken != null) {
  //       await ce.mesh.reply(m.replyToken, utf8ToBytes("pong"));
  //     }
  //   }
  //
  // Client side, on a *different* node:
  //
  //   const reply = await ce.mesh.request(serverNodeId, topic, new Uint8Array(), 5000);
  //   console.log(bytesToUtf8(reply)); // "pong"

  // Single-node-testable slice: the inbox snapshot is reachable and returns a (possibly empty) list.
  const inbox = await ce.mesh.messages();
  console.log(`inbox snapshot: ${inbox.length} message(s)`);

  const peer = process.env["CE_PEER_NODE_ID"];
  if (peer) {
    try {
      const reply = await ce.mesh.request(peer, topic, utf8ToBytes(""), 5000);
      console.log(`round-trip reply: ${bytesToUtf8(reply)}`);
    } catch (e) {
      console.log(`peer round-trip skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    console.log("(set CE_PEER_NODE_ID to run a live two-node request/reply)");
  }

  console.log("RECIPE_OK 07_mesh_rpc");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
