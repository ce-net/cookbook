//! Recipe 02 — Stream blocks live over SSE.
//!
//! Teaches: consuming `GET /blocks/stream` as a typed async `Stream<Item = Result<BlockEvent>>`.
//! Every block accepted by the node (mined or received) is pushed as it happens. This is the
//! pattern dashboards and indexers use to react to chain activity without polling.
//!
//! Run:  cargo run --example 02_stream_blocks
//!
//! Note: against a `--no-mine` node with no peers there may be no blocks in the window; the
//! recipe still proves the stream *opens and decodes*, which is the contract under test.

use ce_rs::CeClient;
use futures_util::StreamExt;
use std::time::Duration;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("CE_BASE_URL").unwrap_or_else(|_| ce_rs::DEFAULT_BASE_URL.into());
    let ce = CeClient::new(base);

    // Opening the stream is itself the contract: a successful SSE handshake on /blocks/stream.
    let stream = ce.blocks_stream().await?;
    futures_util::pin_mut!(stream);

    println!("listening for blocks (up to 4s)...");
    let mut seen = 0u32;
    let deadline = tokio::time::timeout(Duration::from_secs(4), async {
        while let Some(item) = stream.next().await {
            let b = item?;
            println!(
                "  #{} {} | {} txs | miner {}",
                b.index,
                &b.hash[..12.min(b.hash.len())],
                b.tx_count,
                &b.miner[..12.min(b.miner.len())]
            );
            seen += 1;
            if seen >= 3 {
                break;
            }
        }
        anyhow::Ok(())
    })
    .await;

    // A timeout (no blocks on an idle no-mine node) is an acceptable outcome; the stream opened.
    match deadline {
        Ok(r) => r?,
        Err(_) => println!("  (no block in window — stream opened OK on an idle node)"),
    }

    println!("RECIPE_OK 02_stream_blocks (blocks_seen={seen})");
    Ok(())
}
