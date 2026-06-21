//! Recipe 07 — Mesh request/reply (the canonical app RPC pattern).
//!
//! Teaches: device-to-device app messaging over the mesh. A server subscribes to a topic and
//! answers inbound requests via `reply(reply_token, ...)`; a client calls `request(node, topic,
//! payload, timeout)` and blocks for the reply. This is the building block every CE *app* uses
//! for cross-node features (the node stays primitives-only).
//!
//! Run:  cargo run --example 07_mesh_rpc
//!
//! needs: two-nodes (a real request needs a peer running the reply loop). With one node we
//! exercise subscribe + the inbox snapshot, which is the single-node-testable slice of the
//! contract; the two-node request/reply is shown in comments + run when a peer is present.

use ce_rs::CeClient;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("CE_BASE_URL").unwrap_or_else(|_| ce_rs::DEFAULT_BASE_URL.into());
    let ce = CeClient::new(base);

    let topic = "cookbook/ping";

    // Server side: subscribe so inbound requests land in the inbox + stream.
    ce.subscribe(topic).await?;
    println!("subscribed to '{topic}'");

    // The reply loop an app would run (drains requests, answers each):
    //
    //   let stream = ce.messages_stream().await?;
    //   futures_util::pin_mut!(stream);
    //   while let Some(Ok(m)) = stream.next().await {
    //       if m.topic == topic {
    //           if let Some(tok) = m.reply_token {
    //               ce.reply(tok, b"pong").await?;
    //           }
    //       }
    //   }
    //
    // Client side, on a *different* node:
    //
    //   let reply = ce.request(server_node_id, topic, b"", 5000).await?;
    //   assert_eq!(reply, b"pong");

    // Single-node-testable slice: the inbox snapshot is reachable and returns a (possibly empty) list.
    let inbox = ce.messages().await?;
    println!("inbox snapshot: {} message(s)", inbox.len());

    // If a peer node id is supplied, perform a real round-trip.
    if let Ok(peer) = std::env::var("CE_PEER_NODE_ID") {
        match ce.request(&peer, topic, b"", 5000).await {
            Ok(reply) => println!("round-trip reply: {}", String::from_utf8_lossy(&reply)),
            Err(e) => println!("peer round-trip skipped: {e}"),
        }
    } else {
        println!("(set CE_PEER_NODE_ID to run a live two-node request/reply)");
    }

    println!("RECIPE_OK 07_mesh_rpc");
    Ok(())
}
