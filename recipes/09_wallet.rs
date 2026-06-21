//! Recipe 09 — Read wallet balance + transaction history.
//!
//! Teaches: the cohesive money view. `Wallet::balance` splits `/status` into total / free /
//! locked-in-channels / locked-in-bond; `Wallet::transactions` pages confirmed history newest-
//! first from `/transactions/:node_id`. No new endpoints — the wallet composes existing ones and
//! holds no key material.
//!
//! Run:  cargo run --example 09_wallet

use ce_rs::{CeClient, TxQuery, Wallet};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("CE_BASE_URL").unwrap_or_else(|_| ce_rs::DEFAULT_BASE_URL.into());
    let ce = CeClient::new(base);
    let wallet = Wallet::new(ce.clone());

    let s = ce.status().await?;
    let bal = wallet.balance().await?;
    println!(
        "balance: total {} | free {} | locked(channels) {} | locked(bond) {} | bond {}",
        bal.total.credits(),
        bal.free.credits(),
        bal.locked_channels.credits(),
        bal.locked_bond.credits(),
        bal.bond.credits(),
    );
    // Invariant the wallet maintains: free is never negative (node clamps at zero).
    anyhow::ensure!(bal.free.base() >= 0, "free balance must be >= 0");

    let txs = wallet
        .transactions(&s.node_id, TxQuery { limit: Some(10), before_height: None })
        .await?;
    println!("recent transactions: {}", txs.len());
    for t in txs.iter().take(5) {
        println!(
            "  h{} {:?} {} {} {}",
            t.height,
            t.direction,
            t.kind,
            t.amount.credits(),
            t.counterparty.as_deref().map(|c| &c[..12]).unwrap_or("-")
        );
    }

    println!("RECIPE_OK 09_wallet");
    Ok(())
}
