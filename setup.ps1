# VibeLink Setup (Windows)
# Requires: Node.js 22+, Claude Code CLI, WSL2 (for bridge runtime)
param(
    [switch]$Auto
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  _    _ ___ ___  ___ _    ___ _  _ _  __"
Write-Host " | |  / |_ _| _ )| __| |  |_ _| \| | |/ /"
Write-Host " | \/|  || || _ \| _|| |__ | ||    |   < "
Write-Host "  \_/\_/|___|___/|___|____|___|_|\_|_|\_\"
Write-Host ""

# check prerequisites
$missing = @()
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { $missing += "claude" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $missing += "node" }
if ($missing.Count -gt 0) {
    Write-Host "error: missing prerequisites: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    Write-Host "warning: tailscale not found, remote access won't work" -ForegroundColor Yellow
}

# check WSL2
$wslAvailable = $false
try {
    wsl --status 2>$null | Out-Null
    $wslAvailable = $true
} catch {}

if (-not $wslAvailable) {
    Write-Host "warning: WSL2 not found. the bridge server requires WSL2 on Windows." -ForegroundColor Yellow
    Write-Host "         install WSL2: wsl --install" -ForegroundColor Yellow
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# build bridge
Write-Host "building bridge server..."
Push-Location "$ScriptDir\bridge"
npm install
npm run build
Pop-Location

# build mcp server
Write-Host "building mcp server..."
Push-Location "$ScriptDir\mcp-server"
npm install
npm run build
Pop-Location

# register mcp with claude
Write-Host "registering vibelink mcp server..."
$mcpPath = Resolve-Path "$ScriptDir\mcp-server\dist\index.js"
claude mcp add vibelink --scope user -- node $mcpPath

# register permission hook
Write-Host "registering permission approval hook..."
$settingsFile = Join-Path $env:USERPROFILE ".claude\settings.json"
$hookCmd = "node $ScriptDir\hooks\permission-hook.js"

if (Test-Path $settingsFile) {
    $settings = Get-Content $settingsFile -Raw | ConvertFrom-Json
    if (-not $settings.hooks) {
        $settings | Add-Member -NotePropertyName "hooks" -NotePropertyValue @{}
    }
    $hookEntry = @{ type = "command"; command = $hookCmd }
    $existing = $settings.hooks.PreToolUse
    if (-not $existing) {
        $settings.hooks | Add-Member -NotePropertyName "PreToolUse" -NotePropertyValue @($hookEntry)
    } elseif ($existing.command -notcontains $hookCmd) {
        $settings.hooks.PreToolUse += $hookEntry
    }
    $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsFile
} else {
    $dir = Split-Path $settingsFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    @{
        hooks = @{
            PreToolUse = @(
                @{ type = "command"; command = $hookCmd }
            )
        }
    } | ConvertTo-Json -Depth 10 | Set-Content $settingsFile
}

# generate auth token
$envFile = Join-Path $ScriptDir "bridge\.env"
if (-not (Test-Path $envFile)) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $token = [BitConverter]::ToString($bytes) -replace '-', '' | ForEach-Object { $_.ToLower() }
    "AUTH_TOKEN=$token" | Set-Content $envFile
    "PORT=3400" | Add-Content $envFile
    Write-Host "auth token generated"
} else {
    Write-Host "bridge\.env already exists, keeping existing config"
    $token = (Get-Content $envFile | Select-String "AUTH_TOKEN=(.*)").Matches.Groups[1].Value
}

# detect tailscale IP
$ip = "localhost"
if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    try { $ip = (tailscale ip -4 2>$null).Trim() } catch {}
}

$port = "3400"

# output
Write-Host ""
Write-Host "=================================="
Write-Host "  VibeLink setup complete"
Write-Host "=================================="

if ($Auto) {
    Write-Host ""
    Write-Host "  bridge url: ${ip}:${port}"
    Write-Host "  auth token: $token"
    Write-Host ""
    Write-Host "  Tell the user to:"
    Write-Host "  1. Download the APK from the GitHub Releases page"
    Write-Host "  2. Install Tailscale on their phone (same account as computer)"
    Write-Host "  3. Open VibeLink app and enter:"
    Write-Host "     Bridge: ${ip}:${port}"
    Write-Host "     Token:  $token"
} else {
    Write-Host ""
    Write-Host "  step 1: download the app"
    Write-Host "  get the APK from GitHub Releases:"
    Write-Host "  https://github.com/jd1207/vibelink/releases/latest"
    Write-Host ""
    try {
        node "$ScriptDir\scripts\show-qr.js" $ip $port $token
    } catch {
        Write-Host "  bridge url: ${ip}:${port}"
        Write-Host "  auth token: $token"
    }
}

# convert windows path to WSL path via string replacement
$wslPath = ($ScriptDir -replace '\\', '/') -replace '^([A-Za-z]):', { '/mnt/' + $_.Groups[1].Value.ToLower() }
Write-Host ""
Write-Host "  note: run the bridge server in WSL2:"
Write-Host "  wsl -- bash -c 'cd $wslPath/bridge && node dist/server.js'"
Write-Host "=================================="
