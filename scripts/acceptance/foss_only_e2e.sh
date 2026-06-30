#!/usr/bin/env bash
# M10-D FOSS_ONLY 手动闸：CE 小说 -> MP4，LLM 用真实 key，媒体生成走 --mock。
set -euo pipefail

PROJECT=${FOSS_ONLY_PROJECT:-foss_e2e}
NOVEL_FIXTURE=${FOSS_ONLY_NOVEL:-tests/fixtures/foss_only_short_novel.txt}
VIDEO_DIR="output/${PROJECT}/videos"
STEP_TIMEOUT=${FOSS_ONLY_STEP_TIMEOUT:-900}

export ST_EDITION=ce
export ST_CONTROL_PLANE_DSN=
export ST_REDIS_URL=
export ST_CELERY_BROKER_URL=
export ST_CELERY_RESULT_BACKEND=

if [ ! -f "$NOVEL_FIXTURE" ]; then
  echo "FOSS_ONLY fixture missing: $NOVEL_FIXTURE" >&2
  exit 2
fi

PROVIDER_CHECK=$(python3 - <<'PY'
import os

def load_env_file(path=".env"):
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except FileNotFoundError:
        return
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)

load_env_file()
provider = os.environ.get("MODEL_PROVIDER", "").strip().lower()
if not provider and os.environ.get("NEWAPI_API_KEY") and os.environ.get("NEWAPI_BASE_URL"):
    # NewAPI is OpenAI-compatible for the generic get_pydantic_model() call sites.
    provider = "openai"
    os.environ.setdefault("MODEL_API_KEY", os.environ["NEWAPI_API_KEY"])
    os.environ.setdefault("MODEL_BASE_URL", os.environ["NEWAPI_BASE_URL"])
provider = provider or "volcengine"
aliases = {
    "doubao": "volcengine",
    "ark": "volcengine",
    "claude": "anthropic",
    "gpt": "openai",
    "google": "gemini",
    "or": "openrouter",
}
provider = aliases.get(provider, provider)
key_env = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GOOGLE_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "volcengine": "ARK_API_KEY",
}.get(provider)
has_key = bool(os.environ.get("MODEL_API_KEY") or (key_env and os.environ.get(key_env)))
print(f"{provider}:{key_env or 'MODEL_API_KEY'}:{int(has_key)}")
PY
)
PROVIDER=${PROVIDER_CHECK%%:*}
PROVIDER_KEY_INFO=${PROVIDER_CHECK#*:}
PROVIDER_KEY_ENV=${PROVIDER_KEY_INFO%:*}
PROVIDER_HAS_KEY=${PROVIDER_CHECK##*:}

if [ "$PROVIDER_HAS_KEY" != 1 ]; then
  echo "FOSS_ONLY requires a real LLM key in env for MODEL_PROVIDER=$PROVIDER." >&2
  echo "Set MODEL_PROVIDER plus MODEL_API_KEY, or provider-specific key $PROVIDER_KEY_ENV." >&2
  exit 2
fi

run_step() {
  local name=$1
  shift
  echo "FOSS_ONLY STEP ▶ $name"
  if python3 - "$STEP_TIMEOUT" "$@" <<'PY'
import subprocess
import sys

timeout_s = int(sys.argv[1])
cmd = sys.argv[2:]
try:
    raise SystemExit(subprocess.run(cmd, timeout=timeout_s).returncode)
except subprocess.TimeoutExpired:
    print(f"command timed out after {timeout_s}s: {' '.join(cmd)}", file=sys.stderr)
    raise SystemExit(124)
PY
  then
    echo "FOSS_ONLY PASS ✔ $name"
  else
    local status=$?
    echo "FOSS_ONLY FAIL ✘ $name (exit=$status, timeout=${STEP_TIMEOUT}s)" >&2
    return "$status"
  fi
}

uv run python - <<'PY'
from novelvideo.ports.registry import ensure_bootstrap
from novelvideo.ports import get_task_backend
from novelvideo.ports.local.tasks import InlineTaskBackend

ensure_bootstrap()
backend = get_task_backend()
if not isinstance(backend, InlineTaskBackend):
    raise SystemExit(f"expected InlineTaskBackend, got {type(backend).__name__}")
print(f"Inline backend: {type(backend).__name__}")
PY

mkdir -p "$VIDEO_DIR" acceptance-logs
MARKER=$(mktemp "acceptance-logs/foss-only-marker-XXXXXX")

echo "FOSS_ONLY project=$PROJECT provider=$PROVIDER fixture=$NOVEL_FIXTURE"

run_step "cognee-ingest" \
  uv run novelvideo cognee-ingest --project "$PROJECT" --novel "$NOVEL_FIXTURE" --episodes 1
run_step "generate-script" \
  uv run novelvideo generate-script --project "$PROJECT" --episode 1 --duration 10
run_step "generate --mock" \
  uv run novelvideo generate --project "$PROJECT" --episode 1 --mock

shopt -s nullglob
videos=("$VIDEO_DIR"/ep001_*.mp4)
shopt -u nullglob

if [ "${#videos[@]}" -eq 0 ]; then
  echo "No output video matched $VIDEO_DIR/ep001_*.mp4" >&2
  exit 1
fi

selected=
for video in "${videos[@]}"; do
  if [ -s "$video" ] && [ "$video" -nt "$MARKER" ]; then
    selected=$video
    break
  fi
done

if [ -z "$selected" ]; then
  echo "No non-empty ep001_*.mp4 was produced after this run" >&2
  exit 1
fi

ffprobe -v error "$selected" >/dev/null
echo "FOSS_ONLY MP4 OK: $selected"
