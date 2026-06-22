# CE Cookbook

Copy-paste recipes that teach the CE API in **both** Rust ([`ce-rs`](https://github.com/ce-net/ce-rs)) and TypeScript ([`@ce-net/sdk`](https://github.com/ce-net/ce-ts)).

Every recipe is an **executable, CI-gated contract test**: the runner boots an ephemeral CE node and runs all ten recipes in both languages against it, asserting each prints its `RECIPE_OK` marker. If the node API, an SDK, or the OpenAPI spec drifts, the cookbook goes red. The docs cannot lie.

```
cookbook/
├── recipes/            # NN_<slug>.rs  +  NN_<slug>.ts   (Rust and TS, side by side)
├── recipes.toml        # the registry: id, title, teaches, endpoints, needs, marker
├── run.sh              # the runner = the contract test (boots a node, runs every recipe)
├── run.ps1             # Windows/PowerShell equivalent of run.sh (boots ce.exe)
├── ci.yml              # GitHub Actions job (copy into ce/.github/workflows/ — see below)
├── Cargo.toml          # Rust recipes as `cargo run --example` targets (dep: ../ce-rs)
├── package.json        # TS recipes via `tsx` (dep: file:../ce-ts)
└── README.md           # this file
```

---

## Build an app on CE in 5 minutes

A CE node exposes a small HTTP + SSE API on `127.0.0.1:8844`. You talk to it with one of the two SDKs. That's the whole model: **run a node, point an SDK at it, compose primitives** (jobs, blobs, transfers, channels, mesh messaging, naming/discovery).

### 0. Run a node

```bash
brew install ce-net/ce/ce      # or: curl -sSL https://raw.githubusercontent.com/ce-net/ce/main/install.sh | bash
ce start                       # joins the mesh, mines credits, serves the API on :8844
```

The node writes its API token to `<data_dir>/api.token` (chmod 600). Both SDKs auto-discover it on the same machine, so local apps need no config.

### 1a. Rust track

```bash
cargo new hello-ce && cd hello-ce
cargo add ce-rs --git https://github.com/ce-net/ce-rs
cargo add tokio --features full
cargo add anyhow
```

```rust
use ce_rs::CeClient;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let ce = CeClient::local();                  // http://127.0.0.1:8844, token auto-discovered
    let me = ce.status().await?;
    println!("node {} · height {} · balance {}", me.node_id, me.height, me.balance.credits());

    let hash = ce.put_blob(b"hello from CE".to_vec()).await?;   // content-addressed store
    let back = ce.get_blob(&hash).await?;
    assert_eq!(back, b"hello from CE");
    println!("stored + fetched blob {hash}");
    Ok(())
}
```

`cargo run` → prints your node's status and round-trips a blob through the content-addressed store. That is a real app on CE.

### 1b. TypeScript track

```bash
mkdir hello-ce && cd hello-ce && npm init -y && npm pkg set type=module
npm i @ce-net/sdk
npm i -D tsx typescript @types/node
```

```ts
import { CeClient, utf8ToBytes, bytesToUtf8 } from "@ce-net/sdk";

const ce = CeClient.local();                     // :8844, api.token auto-discovered (Node)
const me = await ce.getStatus();
console.log(`node ${me.nodeId} · height ${me.height} · balance ${me.balance.toCredits()}`);

const hash = await ce.data.putBlob(utf8ToBytes("hello from CE"));
const back = await ce.data.getBlob(hash);
console.log(`stored + fetched blob ${hash} -> "${bytesToUtf8(back)}"`);
```

```bash
npx tsx index.ts
```

### 2. Now go deeper

Pick a recipe below, copy its `.rs` or `.ts` file into your project, and adapt. Each one is self-contained, commented, and proven to run.

---

## The recipes

| # | id | Teaches | Endpoints | `ce-rs` | `@ce-net/sdk` | needs |
|---|----|---------|-----------|---------|---------------|-------|
| 1 | `01_status` | node status + balance breakdown + capacity atlas | `GET /status`, `GET /atlas` | `status`, `atlas` | `getStatus`, `atlas` | node |
| 2 | `02_stream_blocks` | consume the block SSE stream as an async iterable | `GET /blocks/stream` | `blocks_stream` | `streams.blocks` | node |
| 3 | `03_blob_object` | content-addressed blob round-trip + chunked object | `POST /blobs`, `GET /blobs/:hash` | `put_blob`/`get_blob`, `put_object`/`get_object` | `data.putBlob`/`getBlob`, `data.putObject`/`getObject` | node |
| 4 | `04_transfer` | the money model: base-unit strings, never floats | `POST /transfer` | `transfer` | `transfer` | node¹ |
| 5 | `05_place_job` | place a container job, poll its lifecycle | `POST /jobs/bid`, `GET /jobs/:id` | `bid`, `job` | `jobs.bid`, `jobs.get` | docker¹ |
| 6 | `06_payment_channel` | open → sign receipt → (host) close micropayments | `POST /channels/open`, `/channels/receipt`, `/channels/:id/close` | `channel_open`, `sign_receipt`, `channel_close` | `channels.open`, `signReceipt`, `close` | channel-host¹ |
| 7 | `07_mesh_rpc` | device-to-device request/reply over the mesh | `POST /mesh/subscribe`, `/mesh/request`, `/mesh/reply`, `GET /mesh/messages` | `subscribe`, `request`, `reply`, `messages` | `mesh.subscribe`, `mesh.request`, `mesh.reply`, `mesh.messages` | two-nodes² |
| 8 | `08_name_discovery` | claim a name + advertise/find a service (DHT) | `POST /names/claim`, `GET /names/:name`, `POST /discovery/advertise`, `GET /discovery/find/:s` | `claim_name`, `resolve_name`, `advertise_service`, `find_service` | `names.claim`, `names.resolve`, `discovery.advertise`, `discovery.find` | node |
| 9 | `09_wallet` | wallet balance breakdown + tx history paging | `GET /status`, `GET /transactions/:node_id` | `Wallet::balance`, `Wallet::transactions` | `wallet.balance`, `wallet.transactions` | node |
| 10 | `10_stream_txns` | tx SSE stream + verifiable randomness (beacon) | `GET /transactions/stream`, `GET /beacon` | `transactions_stream_events`, `beacon` | `streams.transactions`, `beacon` | node |

¹ **Spend recipes (4, 5, 6) on a fresh node:** a brand-new `--no-mine` node has a zero balance, so the node returns **402 Payment Required** (recipe 6 returns **400 "channel to self"** on a single node). These recipes treat that as the expected, documented outcome — they still exercise the endpoint and the money-encoding path. Run them against a node with a positive balance (and a Docker host on the mesh for recipe 5, a second host node for recipe 6) to see them settle end-to-end.

² **Mesh request/reply (7)** needs a peer running the reply loop for a full round-trip. The single-node slice (subscribe + inbox snapshot) runs everywhere; set `CE_PEER_NODE_ID` to a peer to run the live round-trip.

---

## Run the cookbook (the contract test)

```bash
cd cookbook
./run.sh                 # boots an ephemeral node on a unique port, runs all recipes both ways
./run.sh --lang rs       # Rust only
./run.sh --lang ts       # TypeScript only
./run.sh --keep-node     # leave the node up for debugging
```

On Windows (or anywhere with PowerShell 7+), use the byte-equivalent `run.ps1` instead — it boots
`ce.exe`, runs the same recipes, and asserts the same `RECIPE_OK` markers:

```powershell
cd cookbook
./run.ps1                # both languages
./run.ps1 -Lang rs       # Rust only
./run.ps1 -Lang ts       # TypeScript only
./run.ps1 -KeepNode      # leave the node up for debugging
```

The runner:

1. boots a throwaway node — `ce --data-dir <tmp> start --no-mine --ephemeral --no-mdns --api-port <18900-18999> --port <14900-14999>` (a **unique port** and an **in-memory data dir**, so it never touches a node you already have on `:8844`),
2. waits for `GET /health == ok`, reads the token from `<data_dir>/api.token`,
3. builds the Rust examples once and the TS deps, then runs every recipe and greps its `RECIPE_OK` marker,
4. kills the node and deletes the temp dir on exit.

Prereqs: a built `ce` binary (`cd ../ce && cargo build --release`, or set `CE_BIN`), a Rust toolchain, and Node 22+. Override ports with `CE_API_PORT` / `CE_P2P_PORT`.

### Live status (last verified run on macOS arm64, node `ce` release)

All **20** recipe runs pass against a fresh ephemeral node:

- **Rust:** 01–10 PASS
- **TypeScript:** 01–10 PASS

Recipes 4/5/6 pass via their documented zero-balance / single-node paths (402 / 400); recipe 7 passes its single-node slice. To verify the **full** docker/two-node/channel-host paths, run the runner against a funded node with Docker and a peer (see footnotes).

---

## CI

Two CI surfaces:

- **`.github/workflows/ci.yml`** (in this repo) — the cross-platform portability gate. A 3-OS matrix
  (`ubuntu-latest`, `macos-latest`, `windows-latest`, `fail-fast: false`) that builds the Rust
  recipes (`cargo build --examples` + `cargo test`) and typechecks the TS recipes (`tsc --noEmit`)
  on all three OSes. Sibling path deps (`ce-rs`, `ce-ts`, and `ce` for the `ce-cap` / `ce-identity`
  layout) are checked out via per-dep `actions/checkout` steps. This runs automatically.

- **`ci.yml`** (repo root, the runtime contract test) — builds the node + both SDKs, then runs
  `run.sh` against a real ephemeral node. Linux-only and hermetic.

  > **Human step:** copy root `ci.yml` into the `ce` repo at `ce/.github/workflows/cookbook.yml`. This subagent intentionally does not edit `ce/.github`. Adjust the checkout repo slugs/paths to match your monorepo or multi-repo layout (the job assumes `ce` / `ce-rs` / `ce-ts` / `cookbook` as sibling checkouts).

---

## Money rule (read this once)

CE denominates money in **integer base units**: `1 credit = 10^18 base units`, wei-style. **Never use floats for money.** On the wire amounts are **decimal strings** (the values exceed JavaScript's `2^53` safe-integer limit). Both SDKs give you an `Amount` type that does this for you:

- Rust: `Amount::from_credits(1)` → `1_000_000_000_000_000_000` base units; `.credits()` renders the human decimal.
- TS: `Amount.fromCredits("1")` → bigint `1000000000000000000n`; `.toBaseUnits()` / `.toCredits()`.

Recipe 4 demonstrates and asserts this directly.

---

## Architecture note

CE the node is **primitives only** — identity, mesh transport, blobs, ledger/economy, capability verification. Features that mutate host resources (remote exec, file sync) are **apps** built on the mesh request/reply + capability primitives (see the `rdev` repo), not node endpoints. Every recipe here uses only documented primitive endpoints; none invents an RPC. That boundary is why the cookbook can be a stable contract.
