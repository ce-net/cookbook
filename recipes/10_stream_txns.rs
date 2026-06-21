//! Recipe 10 — Stream transactions live + read verifiable randomness (beacon).
//!
//! Teaches: two more read primitives. `GET /transactions/stream` pushes every verified tx as it
//! enters the pool (watch the economy live). `GET /beacon` returns the PoW tip height + hash —
//! unpredictable, globally-agreed public randomness apps use to seed auditable host selection.
//!
//! Run:  cargo run --example 10_stream_txns

use ce_rs::CeClient;
use futures_util::StreamExt;
use std::time::Duration;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("CE_BASE_URL").unwrap_or_else(|_| ce_rs::DEFAULT_BASE_URL.into());
    let ce = CeClient::new(base);

    // Verifiable randomness from the chain tip.
    let beacon = ce.beacon().await?;
    println!("beacon: height {} | hash {}", beacon.height, &beacon.hash[..16.min(beacon.hash.len())]);
    anyhow::ensure!(beacon.hash.len() == 64, "beacon hash must be 64 hex chars");

    // Open the tx stream (the handshake is the contract); print any txs that arrive in a window.
    let stream = ce.transactions_stream_events().await?;
    futures_util::pin_mut!(stream);
    println!("listening for transactions (up to 3s)...");

    let mut seen = 0u32;
    let _ = tokio::time::timeout(Duration::from_secs(3), async {
        while let Some(item) = stream.next().await {
            let tx = item?;
            println!("  {} {} {}", &tx.id[..12.min(tx.id.len())], tx.kind, tx.amount.credits());
            seen += 1;
            if seen >= 3 {
                break;
            }
        }
        anyhow::Ok(())
    })
    .await;

    println!("RECIPE_OK 10_stream_txns (txns_seen={seen})");
    Ok(())
}
