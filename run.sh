#!/usr/bin/env bash
#
# CE Cookbook runner = the contract test.
#
# Boots an ephemeral throwaway CE node on a unique port, then runs every cookbook recipe
# (Rust via `cargo run --example`, TypeScript via `tsx`) against it and asserts each prints its
# `RECIPE_OK <id>` marker. A failure here means the node API, an SDK, or the OpenAPI spec drifted
# from the recipes — exactly the drift this harness exists to catch.
#
# Usage:
#   ./run.sh                  # run both languages against a fresh ephemeral node
#   ./run.sh --lang rs        # Rust recipes only
#   ./run.sh --lang ts        # TypeScript recipes only
#   ./run.sh --keep-node      # leave the ephemeral node running on exit (for debugging)
#
# Env overrides:
#   CE_BIN        path to the ce binary  (default: ../ce/target/release/ce)
#   CE_API_PORT   api port               (default: random in 18900-18999)
#   CE_P2P_PORT   p2p port               (default: random in 14900-14999)
#
# This script never touches the developer's primary node on :8844 — it always uses its own port
# and an ephemeral, in-memory data dir that is deleted on exit.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

LANG_FILTER="both"
KEEP_NODE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang) LANG_FILTER="$2"; shift 2 ;;
    --keep-node) KEEP_NODE=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

CE_BIN="${CE_BIN:-$ROOT/ce/target/release/ce}"
CE_API_PORT="${CE_API_PORT:-$((18900 + RANDOM % 100))}"
CE_P2P_PORT="${CE_P2P_PORT:-$((14900 + RANDOM % 100))}"
BASE_URL="http://127.0.0.1:${CE_API_PORT}"
DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ce-cookbook-XXXXXX")"
NODE_PID=""

c_red() { printf '\033[31m%s\033[0m' "$1"; }
c_grn() { printf '\033[32m%s\033[0m' "$1"; }
c_dim() { printf '\033[2m%s\033[0m' "$1"; }

cleanup() {
  if [[ -n "$NODE_PID" && "$KEEP_NODE" -eq 0 ]]; then
    kill "$NODE_PID" >/dev/null 2>&1 || true
    wait "$NODE_PID" 2>/dev/null || true
  fi
  if [[ "$KEEP_NODE" -eq 0 ]]; then
    rm -rf "$DATA_DIR" || true
  else
    echo "node left running (pid $NODE_PID) on $BASE_URL ; data dir $DATA_DIR"
  fi
}
trap cleanup EXIT

# ---- boot the ephemeral node -------------------------------------------------
if [[ ! -x "$CE_BIN" ]]; then
  echo "$(c_red "FATAL"): ce binary not found at $CE_BIN" >&2
  echo "build it first: (cd $ROOT/ce && cargo build --release)" >&2
  exit 1
fi

echo "booting ephemeral node: api=$BASE_URL p2p=:$CE_P2P_PORT data=$DATA_DIR"
# --data-dir is a GLOBAL flag and MUST come before the subcommand.
"$CE_BIN" --data-dir "$DATA_DIR" start \
  --no-mine --api-port "$CE_API_PORT" --port "$CE_P2P_PORT" --ephemeral --no-mdns \
  > "$DATA_DIR/node.log" 2>&1 &
NODE_PID=$!

# wait for health
for i in $(seq 1 60); do
  if [[ "$(curl -s "$BASE_URL/health" 2>/dev/null || true)" == "ok" ]]; then
    echo "node healthy after ${i}s"
    break
  fi
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo "$(c_red "FATAL"): node exited during boot. log tail:" >&2
    tail -n 30 "$DATA_DIR/node.log" >&2 || true
    exit 1
  fi
  sleep 1
done

if [[ "$(curl -s "$BASE_URL/health" 2>/dev/null || true)" != "ok" ]]; then
  echo "$(c_red "FATAL"): node never became healthy" >&2
  tail -n 30 "$DATA_DIR/node.log" >&2 || true
  exit 1
fi

API_TOKEN="$(cat "$DATA_DIR/api.token" 2>/dev/null || true)"
export CE_BASE_URL="$BASE_URL"
export CE_API_TOKEN="$API_TOKEN"

# Recipe ids, in order. (Kept in sync with recipes.toml; the lint below asserts they match.)
RECIPES=(
  01_status 02_stream_blocks 03_blob_object 04_transfer 05_place_job
  06_payment_channel 07_mesh_rpc 08_name_discovery 09_wallet 10_stream_txns
)

# ---- registry lint: every recipe has both files + a registry entry --------------
# Cheap anti-drift guard: if someone adds a recipe to recipes.toml but forgets a file (or vice
# versa), or the RECIPES list above falls out of sync, fail loudly before running anything.
lint_ok=1
for id in "${RECIPES[@]}"; do
  for f in "recipes/$id.rs" "recipes/$id.ts"; do
    [[ -f "$HERE/$f" ]] || { echo "$(c_red "LINT"): missing $f"; lint_ok=0; }
  done
  grep -q "id *= *\"$id\"" "$HERE/recipes.toml" \
    || { echo "$(c_red "LINT"): $id not in recipes.toml"; lint_ok=0; }
done
# And every registry id must be in the RECIPES run list.
while IFS= read -r rid; do
  printf '%s\n' "${RECIPES[@]}" | grep -qx "$rid" \
    || { echo "$(c_red "LINT"): recipes.toml id '$rid' missing from run list"; lint_ok=0; }
done < <(grep -oE 'id *= *"[0-9a-z_]+"' "$HERE/recipes.toml" | sed -E 's/.*"([0-9a-z_]+)".*/\1/')
[[ "$lint_ok" -eq 1 ]] || { echo "$(c_red "FATAL"): registry lint failed"; exit 1; }

PASS=0
FAIL=0
declare -a RESULTS=()

run_one() {
  local lang="$1" id="$2" cmd="$3" marker="RECIPE_OK $2"
  local out
  printf '  %-6s %-20s ' "[$lang]" "$id"
  if out="$(eval "$cmd" 2>&1)" && grep -q "$marker" <<<"$out"; then
    echo "$(c_grn PASS)"
    PASS=$((PASS + 1))
    RESULTS+=("PASS $lang $id")
  else
    echo "$(c_red FAIL)"
    echo "$out" | sed 's/^/        /' | tail -n 12
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL $lang $id")
  fi
}

# ---- Rust recipes ------------------------------------------------------------
if [[ "$LANG_FILTER" == "both" || "$LANG_FILTER" == "rs" ]]; then
  echo
  echo "== Rust (ce-rs) =="
  # Build once so per-recipe timing is just the run.
  ( cd "$HERE" && cargo build --examples >/dev/null 2>&1 ) || {
    echo "$(c_red "FATAL"): cargo build --examples failed" >&2
    ( cd "$HERE" && cargo build --examples 2>&1 | tail -n 30 ) >&2 || true
    exit 1
  }
  for id in "${RECIPES[@]}"; do
    run_one "rs" "$id" "cd '$HERE' && cargo run --quiet --example '$id'"
  done
fi

# ---- TypeScript recipes ------------------------------------------------------
if [[ "$LANG_FILTER" == "both" || "$LANG_FILTER" == "ts" ]]; then
  echo
  echo "== TypeScript (@ce-net/sdk) =="
  if [[ ! -d "$HERE/node_modules/@ce-net/sdk" ]]; then
    echo "$(c_dim "installing TS deps (npm install)...")"
    ( cd "$HERE" && npm install --silent ) || {
      echo "$(c_red "FATAL"): npm install failed" >&2; exit 1; }
  fi
  TSX="$HERE/node_modules/.bin/tsx"
  [[ -x "$TSX" ]] || TSX="npx --yes tsx"
  for id in "${RECIPES[@]}"; do
    run_one "ts" "$id" "cd '$HERE' && '$TSX' 'recipes/$id.ts'"
  done
fi

# ---- summary -----------------------------------------------------------------
echo
echo "SUMMARY  pass=$PASS  fail=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "$(c_grn "all cookbook recipes passed against the ephemeral node")"
