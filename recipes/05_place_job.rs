//! Recipe 05 — Place a job and poll it through its lifecycle.
//!
//! Teaches: `POST /jobs/bid` (broadcast a container job any host with capacity may take) then
//! `GET /jobs/:id` to watch it move pending -> running -> settled/failed. The bid amount is
//! locked from your balance the moment the bid lands.
//!
//! Run:  cargo run --example 05_place_job
//!
//! needs: docker (a Docker-capable host on the mesh actually runs the container). On a fresh
//! zero-balance node the bid returns 402 — treated as the expected contract outcome here.

use ce_rs::{Amount, BidSpec, CeClient};
use std::time::Duration;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("CE_BASE_URL").unwrap_or_else(|_| ce_rs::DEFAULT_BASE_URL.into());
    let ce = CeClient::new(base);

    let spec = BidSpec {
        image: "alpine:latest".into(),
        cmd: vec!["echo".into(), "hello from CE".into()],
        cpu_cores: 1,
        mem_mb: 64,
        duration_secs: 30,
        bid: Amount::from_credits(1),
    };

    let job_id = match ce.bid(&spec).await {
        Ok(id) => id,
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("402") || msg.to_lowercase().contains("balance") {
                println!("402 Payment Required (expected on a zero-balance no-mine node)");
                println!("RECIPE_OK 05_place_job (402 expected)");
                return Ok(());
            }
            return Err(e);
        }
    };
    println!("placed job {job_id}");

    // Poll a few times; without a Docker host the job may stay pending — that's fine for the demo.
    for _ in 0..3 {
        let job = ce.job(&job_id).await?;
        println!("  status: {}", job.status);
        if matches!(job.status.as_str(), "settled" | "failed") {
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    println!("RECIPE_OK 05_place_job");
    Ok(())
}
