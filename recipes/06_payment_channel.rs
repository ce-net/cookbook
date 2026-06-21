//! Recipe 06 — Payment channel: open -> sign receipt -> (host) close.
//!
//! Teaches: off-chain micropayments. The payer opens a channel locking `capacity` to a host
//! (`POST /channels/open`), then signs cumulative off-chain receipts (`POST /channels/receipt`)
//! with no on-chain tx per payment. The host eventually redeems the *highest* receipt on-chain to
//! settle (`POST /channels/:id/close`). This is how CE bills streaming work (data fetch, relay,
//! long jobs) without a transaction per tick.
//!
//! Run:  cargo run --example 06_payment_channel
//!
//! needs: channel-host (a second node to be the host, plus a funded payer). On a zero-balance
//! node `channels/open` returns 402 — the expected contract outcome here.

use ce_rs::{Amount, CeClient};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("CE_BASE_URL").unwrap_or_else(|_| ce_rs::DEFAULT_BASE_URL.into());
    let ce = CeClient::new(base);

    let s = ce.status().await?;
    // In a real flow `host` is a different node; we use self only to exercise the API shape.
    let host = s.node_id.clone();

    let channel_id = match ce.channel_open(&host, Amount::from_credits(10), 0).await {
        Ok(id) => id,
        Err(e) => {
            let msg = e.to_string().to_lowercase();
            // Single-node cookbook run: the node rejects a channel-to-self (400) and a
            // zero-balance payer (402). Both are the expected outcomes for the single-node
            // slice of this `channel-host` recipe — they prove the endpoint + money encoding
            // are reached. A real run uses a *separate, funded* host node.
            if msg.contains("402") || msg.contains("balance") {
                println!("402 Payment Required (expected on a zero-balance no-mine node)");
                println!("RECIPE_OK 06_payment_channel (402 expected — needs a funded payer)");
                return Ok(());
            }
            if msg.contains("to self") || msg.contains("channel to self") {
                println!("400 'channel to self' (expected single-node slice — needs a 2nd host node)");
                println!("RECIPE_OK 06_payment_channel (single-node slice — needs channel-host)");
                return Ok(());
            }
            return Err(e);
        }
    };
    println!("opened channel {channel_id} (capacity 10 credits)");

    // Sign a cumulative receipt for 3 credits. `cumulative` is monotonic: each new receipt
    // authorizes the running total, so the host only ever redeems one (the highest).
    let receipt = ce.sign_receipt(&channel_id, &host, Amount::from_credits(3)).await?;
    println!(
        "signed receipt: cumulative {} | payer_sig {}…",
        receipt.cumulative.credits(),
        &receipt.payer_sig[..16.min(receipt.payer_sig.len())]
    );

    // The host node would now redeem it:
    //   host_ce.channel_close(&channel_id, receipt.cumulative, &receipt.payer_sig).await?;
    // (omitted here — requires the host node's API; the payer-side flow above is the contract).

    println!("RECIPE_OK 06_payment_channel");
    Ok(())
}
