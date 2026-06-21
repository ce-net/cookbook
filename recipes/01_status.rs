//! Recipe 01 — Read node status, balance breakdown, and the capacity atlas.
//!
//! Teaches: the first call every app makes. `GET /status` returns the node id, chain
//! height, and a balance split into free / locked-in-channels / locked-in-bond buckets.
//! `GET /atlas` is the live capacity snapshot of every peer (used for host selection).
//!
//! Run:  cargo run --example 01_status
//! Env:  CE_BASE_URL (default http://127.0.0.1:8844), CE_API_TOKEN (auto-discovered from
//!       <data_dir>/api.token when unset).
//!
//! Money rule: amounts are integer base units (1 credit = 10^18 base units), carried on the
//! wire as decimal strings — never floats. `Amount::credits()` renders the human decimal.

use ce_rs::CeClient;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("CE_BASE_URL").unwrap_or_else(|_| ce_rs::DEFAULT_BASE_URL.into());
    let ce = CeClient::new(base);

    let s = ce.status().await?;
    println!(
        "node {} | height {} | difficulty {} | balance {} ({} base units)",
        s.node_id,
        s.height,
        s.difficulty,
        s.balance.credits(),
        s.balance.base(),
    );

    let atlas = ce.atlas().await?;
    println!("atlas: {} peer(s) advertising capacity", atlas.len());
    for h in atlas.iter().take(5) {
        println!(
            "  {} | {} cores | {} MB | jobs={} | tags=[{}]",
            &h.node_id[..16.min(h.node_id.len())],
            h.cpu_cores,
            h.mem_mb,
            h.running_jobs,
            h.tags.join(",")
        );
    }

    // Contract assertion (this IS the test): a node id is always 64 hex chars.
    anyhow::ensure!(s.node_id.len() == 64, "node_id must be 64 hex chars");
    println!("RECIPE_OK 01_status");
    Ok(())
}
