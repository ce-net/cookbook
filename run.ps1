#!/usr/bin/env pwsh
#
# CE Cookbook runner (PowerShell) = the contract test, Windows-native.
#
# Cross-platform PowerShell (pwsh 7+) port of run.sh. Boots an ephemeral throwaway CE node on a
# unique port, then runs every cookbook recipe (Rust via `cargo run --example`, TypeScript via
# `tsx`) against it and asserts each prints its `RECIPE_OK <id>` marker. A failure here means the
# node API, an SDK, or the OpenAPI spec drifted from the recipes — exactly the drift this harness
# exists to catch.
#
# Usage:
#   ./run.ps1                  # run both languages against a fresh ephemeral node
#   ./run.ps1 -Lang rs         # Rust recipes only
#   ./run.ps1 -Lang ts         # TypeScript recipes only
#   ./run.ps1 -KeepNode        # leave the ephemeral node running on exit (for debugging)
#
# Env overrides (identical to run.sh):
#   CE_BIN        path to the ce binary  (default: ../ce/target/release/ce[.exe])
#   CE_API_PORT   api port               (default: random in 18900-18999)
#   CE_P2P_PORT   p2p port               (default: random in 14900-14999)
#
# This script never touches the developer's primary node on :8844 — it always uses its own port
# and an ephemeral, throwaway data dir that is deleted on exit.

[CmdletBinding()]
param(
    [ValidateSet('both', 'rs', 'ts')]
    [string]$Lang = 'both',
    [switch]$KeepNode
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Here = $PSScriptRoot
$Root = Split-Path -Parent $Here

# On Windows the released binary is ce.exe; on unix it is ce. Honor CE_BIN if set.
# $IsWindows is an automatic var in pwsh 6+; on Windows PowerShell 5.1 it is absent, so probe safely.
$OnWindows = if (Test-Path 'variable:IsWindows') { $IsWindows } else { $true }
$ExeSuffix = if ($OnWindows) { '.exe' } else { '' }
$CeBin = if ($env:CE_BIN) { $env:CE_BIN } else { Join-Path $Root "ce/target/release/ce$ExeSuffix" }

$ApiPort = if ($env:CE_API_PORT) { [int]$env:CE_API_PORT } else { 18900 + (Get-Random -Maximum 100) }
$P2pPort = if ($env:CE_P2P_PORT) { [int]$env:CE_P2P_PORT } else { 14900 + (Get-Random -Maximum 100) }
$BaseUrl = "http://127.0.0.1:$ApiPort"
$DataDir = Join-Path ([System.IO.Path]::GetTempPath()) ("ce-cookbook-" + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$script:NodeProc = $null

function Write-Red([string]$s) { Write-Host $s -ForegroundColor Red -NoNewline }
function Write-Grn([string]$s) { Write-Host $s -ForegroundColor Green -NoNewline }
function Write-Dim([string]$s) { Write-Host $s -ForegroundColor DarkGray }

function Invoke-Cleanup {
    if ($script:NodeProc -and -not $KeepNode) {
        if (-not $script:NodeProc.HasExited) {
            try { $script:NodeProc.Kill($true) } catch { }
        }
    }
    if (-not $KeepNode) {
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $DataDir
    }
    else {
        $pidText = if ($script:NodeProc) { $script:NodeProc.Id } else { 'n/a' }
        Write-Host "node left running (pid $pidText) on $BaseUrl ; data dir $DataDir"
    }
}

function Get-Health {
    try {
        return (Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec 2).Content.Trim()
    }
    catch {
        return ''
    }
}

try {
    # ---- boot the ephemeral node -------------------------------------------------
    if (-not (Test-Path $CeBin)) {
        Write-Red "FATAL"; Write-Host ": ce binary not found at $CeBin"
        Write-Host "build it first: (cd $Root/ce; cargo build --release)"
        exit 1
    }

    Write-Host "booting ephemeral node: api=$BaseUrl p2p=:$P2pPort data=$DataDir"
    $nodeLog = Join-Path $DataDir 'node.log'
    # --data-dir is a GLOBAL flag and MUST come before the subcommand.
    $nodeArgs = @(
        '--data-dir', $DataDir, 'start',
        '--no-mine', '--api-port', "$ApiPort", '--port', "$P2pPort", '--ephemeral', '--no-mdns'
    )
    $script:NodeProc = Start-Process -FilePath $CeBin -ArgumentList $nodeArgs `
        -RedirectStandardOutput $nodeLog -RedirectStandardError "$nodeLog.err" `
        -NoNewWindow -PassThru

    # wait for health
    $healthy = $false
    for ($i = 1; $i -le 60; $i++) {
        if ((Get-Health) -eq 'ok') {
            Write-Host "node healthy after ${i}s"
            $healthy = $true
            break
        }
        if ($script:NodeProc.HasExited) {
            Write-Red "FATAL"; Write-Host ": node exited during boot. log tail:"
            if (Test-Path $nodeLog) { Get-Content $nodeLog -Tail 30 }
            if (Test-Path "$nodeLog.err") { Get-Content "$nodeLog.err" -Tail 30 }
            exit 1
        }
        Start-Sleep -Seconds 1
    }

    if (-not $healthy) {
        Write-Red "FATAL"; Write-Host ": node never became healthy"
        if (Test-Path $nodeLog) { Get-Content $nodeLog -Tail 30 }
        exit 1
    }

    $tokenFile = Join-Path $DataDir 'api.token'
    $apiToken = if (Test-Path $tokenFile) { (Get-Content $tokenFile -Raw).Trim() } else { '' }
    $env:CE_BASE_URL = $BaseUrl
    $env:CE_API_TOKEN = $apiToken

    # Recipe ids, in order. (Kept in sync with recipes.toml; the lint below asserts they match.)
    $Recipes = @(
        '01_status', '02_stream_blocks', '03_blob_object', '04_transfer', '05_place_job',
        '06_payment_channel', '07_mesh_rpc', '08_name_discovery', '09_wallet', '10_stream_txns'
    )

    # ---- registry lint: every recipe has both files + a registry entry --------------
    $recipesToml = Get-Content (Join-Path $Here 'recipes.toml') -Raw
    $lintOk = $true
    foreach ($id in $Recipes) {
        foreach ($f in @("recipes/$id.rs", "recipes/$id.ts")) {
            if (-not (Test-Path (Join-Path $Here $f))) {
                Write-Red "LINT"; Write-Host ": missing $f"; $lintOk = $false
            }
        }
        if ($recipesToml -notmatch "id\s*=\s*`"$id`"") {
            Write-Red "LINT"; Write-Host ": $id not in recipes.toml"; $lintOk = $false
        }
    }
    # And every registry id must be in the Recipes run list.
    $registryIds = [regex]::Matches($recipesToml, 'id\s*=\s*"([0-9a-z_]+)"') | ForEach-Object { $_.Groups[1].Value }
    foreach ($rid in $registryIds) {
        if ($Recipes -notcontains $rid) {
            Write-Red "LINT"; Write-Host ": recipes.toml id '$rid' missing from run list"; $lintOk = $false
        }
    }
    if (-not $lintOk) {
        Write-Red "FATAL"; Write-Host ": registry lint failed"; exit 1
    }

    $script:Pass = 0
    $script:Fail = 0

    function Invoke-Recipe([string]$RLang, [string]$Id, [scriptblock]$Cmd) {
        $marker = "RECIPE_OK $Id"
        Write-Host ("  {0,-6} {1,-20} " -f "[$RLang]", $Id) -NoNewline
        $out = & $Cmd 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0 -and $out -match [regex]::Escape($marker)) {
            Write-Grn "PASS"; Write-Host ''
            $script:Pass++
        }
        else {
            Write-Red "FAIL"; Write-Host ''
            ($out -split "`n" | Select-Object -Last 12) | ForEach-Object { Write-Host "        $_" }
            $script:Fail++
        }
    }

    # ---- Rust recipes ------------------------------------------------------------
    if ($Lang -eq 'both' -or $Lang -eq 'rs') {
        Write-Host ''
        Write-Host '== Rust (ce-rs) =='
        Push-Location $Here
        try {
            # Build once so per-recipe timing is just the run.
            cargo build --examples 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Red "FATAL"; Write-Host ": cargo build --examples failed"
                cargo build --examples 2>&1 | Select-Object -Last 30
                exit 1
            }
            foreach ($id in $Recipes) {
                Invoke-Recipe 'rs' $id { cargo run --quiet --example $id }
            }
        }
        finally { Pop-Location }
    }

    # ---- TypeScript recipes ------------------------------------------------------
    if ($Lang -eq 'both' -or $Lang -eq 'ts') {
        Write-Host ''
        Write-Host '== TypeScript (@ce-net/sdk) =='
        Push-Location $Here
        try {
            if (-not (Test-Path (Join-Path $Here 'node_modules/@ce-net/sdk'))) {
                Write-Dim 'installing TS deps (npm install)...'
                npm install --silent
                if ($LASTEXITCODE -ne 0) { Write-Red "FATAL"; Write-Host ": npm install failed"; exit 1 }
            }
            foreach ($id in $Recipes) {
                Invoke-Recipe 'ts' $id { npx --yes tsx "recipes/$id.ts" }
            }
        }
        finally { Pop-Location }
    }

    # ---- summary -----------------------------------------------------------------
    Write-Host ''
    Write-Host "SUMMARY  pass=$($script:Pass)  fail=$($script:Fail)"
    if ($script:Fail -gt 0) {
        exit 1
    }
    Write-Grn "all cookbook recipes passed against the ephemeral node"; Write-Host ''
}
finally {
    Invoke-Cleanup
}
