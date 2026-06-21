//! Recipe 08 — Claim a name + advertise/find a service over the DHT.
//!
//! Teaches: human-readable naming and service discovery. `claim_name` submits an on-chain
//! NameClaim (takes effect when mined; first claim wins); `resolve_name` maps a name back to a
//! NodeId. `advertise_service` puts this node into the DHT under a service string; `find_service`
//! returns the NodeIds advertising it. Together these let apps find each other without any
//! hardcoded ip:port (mesh-first).
//!
//! Run:  cargo run --example 08_name_discovery

use ce_rs::CeClient;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("CE_BASE_URL").unwrap_or_else(|_| ce_rs::DEFAULT_BASE_URL.into());
    let ce = CeClient::new(base);

    let s = ce.status().await?;

    // --- naming ---
    // Names are 3-32 chars, lowercase a-z / 0-9 / hyphen. A unique-ish name avoids clashing
    // with an already-claimed one when this recipe runs repeatedly.
    let name = format!("cookbook-{}", &s.node_id[..6]);
    match ce.claim_name(&name).await {
        Ok(()) => println!("submitted name claim '{name}' (effective once mined)"),
        Err(e) => println!("name claim returned: {e} (acceptable: already claimed / unmined)"),
    }
    // Resolution only succeeds after the claim is mined; None is expected on a fresh no-mine node.
    match ce.resolve_name(&name).await? {
        Some(owner) => println!("'{name}' resolves to {}", &owner[..16]),
        None => println!("'{name}' not yet resolvable (claim pending — expected on no-mine)"),
    }

    // --- service discovery (DHT, no chain wait) ---
    let service = "cookbook-demo";
    ce.advertise_service(service).await?;
    println!("advertised service '{service}'");

    let providers = ce.find_service(service).await?;
    println!("'{service}' has {} provider(s)", providers.len());

    println!("RECIPE_OK 08_name_discovery");
    Ok(())
}
