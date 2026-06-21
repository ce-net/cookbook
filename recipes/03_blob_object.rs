//! Recipe 03 — Content-addressed storage: blob round-trip + chunked object.
//!
//! Teaches: the data layer. `put_blob` stores raw bytes and returns their SHA256 hash (the CID);
//! `get_blob` fetches by hash (with a mesh DHT fallback). `put_object`/`get_object` layer a
//! client-side chunker + manifest on top so you can store arbitrarily large payloads, each chunk
//! verified against its CID on the way back (trustless reassembly).
//!
//! Run:  cargo run --example 03_blob_object

use ce_rs::CeClient;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("CE_BASE_URL").unwrap_or_else(|_| ce_rs::DEFAULT_BASE_URL.into());
    let ce = CeClient::new(base);

    // --- small blob round-trip ---
    let payload = b"hello from the CE cookbook".to_vec();
    let hash = ce.put_blob(payload.clone()).await?;
    println!("stored blob -> {hash}");
    anyhow::ensure!(hash.len() == 64, "blob hash must be 64 hex chars");

    let back = ce.get_blob(&hash).await?;
    anyhow::ensure!(back == payload, "blob round-trip mismatch");
    println!("blob round-trip verified ({} bytes)", back.len());

    // --- large object: chunked + manifest CID ---
    let mut big = vec![0u8; 3 * 1024 * 1024]; // 3 MiB, larger than one chunk
    for (i, b) in big.iter_mut().enumerate() {
        *b = (i & 0xff) as u8;
    }
    let cid = ce.put_object(&big).await?;
    println!("stored object -> {cid}");

    let restored = ce.get_object(&cid).await?;
    anyhow::ensure!(restored == big, "object round-trip mismatch");
    println!("object round-trip verified ({} bytes)", restored.len());

    println!("RECIPE_OK 03_blob_object");
    Ok(())
}
