//! Recipe 04 — Transfer credits (the money model, base-unit strings, no floats).
//!
//! Teaches: `POST /transfer`. Money in CE is integer base units: 1 credit = 10^18 base units,
//! wei-style. NEVER use floats for money. `Amount::from_credits(1)` is exactly
//! 1_000_000_000_000_000_000 base units and serializes as the string "1000000000000000000" on the
//! wire (the value exceeds JavaScript's 2^53 safe-integer limit, so strings are mandatory).
//!
//! Run:  cargo run --example 04_transfer
//!
//! Contract note: on a fresh `--no-mine` node the balance is 0, so the node returns 402 Payment
//! Required. That is the *correct* documented behavior — this recipe treats a 402 as a pass
//! (it proves the endpoint + money encoding work) and only fails on an unexpected error.

use ce_rs::{Amount, CeClient};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("CE_BASE_URL").unwrap_or_else(|_| ce_rs::DEFAULT_BASE_URL.into());
    let ce = CeClient::new(base);

    let s = ce.status().await?;
    let recipient = &s.node_id; // self-transfer keeps the recipe self-contained

    // One credit, shown as base units to make the no-floats rule explicit.
    let amount = Amount::from_credits(1);
    println!(
        "transferring {} ({} base units) to {}",
        amount.credits(),
        amount.base(),
        &recipient[..16]
    );
    anyhow::ensure!(amount.base() == 1_000_000_000_000_000_000, "1 credit == 10^18 base units");

    match ce.transfer(recipient, amount).await {
        Ok(tx_id) => {
            println!("transfer accepted, tx {tx_id}");
            println!("RECIPE_OK 04_transfer (settled)");
        }
        Err(e) => {
            let msg = e.to_string();
            // 402 / "balance" on a zero-balance node is the expected, documented outcome.
            if msg.contains("402") || msg.to_lowercase().contains("balance") {
                println!("402 Payment Required (expected on a zero-balance no-mine node)");
                println!("RECIPE_OK 04_transfer (402 expected)");
            } else {
                return Err(e);
            }
        }
    }
    Ok(())
}
