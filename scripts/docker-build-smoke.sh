#!/usr/bin/env bash
# Smoke test: build the Docker image, start a container, and verify key endpoints.
# Requires Docker daemon running. Pass VITE_* build args for the SPA.
set -euo pipefail

IMAGE="ezclaude-smoke:test"
CONTAINER=""
PORT=3199

cleanup() {
  [ -n "$CONTAINER" ] && docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Building image..."
docker build \
  --platform linux/amd64 \
  --build-arg VITE_SUPABASE_URL=https://test.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=pk_test \
  --build-arg VITE_GITHUB_OAUTH_CLIENT_ID=test_id \
  -t "$IMAGE" .

echo "==> Starting container on :$PORT..."
CONTAINER=$(docker run -d -p "$PORT:3000" \
  -e SUPABASE_URL=https://test.supabase.co \
  -e SUPABASE_PUBLISHABLE_KEY=pk_test \
  -e ANTHROPIC_API_KEY=sk-ant-test \
  "$IMAGE")

echo "==> Waiting for server..."
for i in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done

check() {
  local desc="$1" url="$2" expect_status="$3"
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  if [ "$status" = "$expect_status" ]; then
    echo "  ✓ $desc → $status"
  else
    echo "  ✗ $desc → $status (expected $expect_status)"
    exit 1
  fi
}

echo "==> Checking endpoints..."
check "GET /"             "http://localhost:$PORT/"             200
check "GET /studio (SPA)" "http://localhost:$PORT/studio"      200
check "GET /api/health"   "http://localhost:$PORT/api/health"  200
check "POST /api/agent/chat (no auth)" "http://localhost:$PORT/api/agent/chat" 401

echo "==> All checks passed ✓"
