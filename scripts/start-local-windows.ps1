$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiExecutable = Join-Path $repoRoot ".venv\Scripts\novelvideo.exe"

if (-not (Test-Path -LiteralPath $apiExecutable)) {
    throw "Local virtual environment not found: $apiExecutable"
}

# Keep the host development instance isolated from Docker's ports and volume.
$env:NOVELVIDEO_API_PORT = "8781"
$env:NOVELVIDEO_DATA_ROOT = $repoRoot
$env:NOVELVIDEO_STATE_DIR = Join-Path $repoRoot "state"
$env:NOVELVIDEO_OUTPUT_DIR = Join-Path $repoRoot "output"
$env:NOVELVIDEO_RUNTIME_DIR = Join-Path $repoRoot "runtime"
$env:FREEZONE_VISION_MODEL = "qwen-vl-max"

Set-Location -LiteralPath $repoRoot
& $apiExecutable api --port 8781
exit $LASTEXITCODE
