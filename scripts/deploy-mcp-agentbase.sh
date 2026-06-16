#!/usr/bin/env bash
# Roll out a new version of the standalone MCP AgentBase runtime.
#
# Used by the `deploy-mcp` job in .github/workflows/deploy-agentbase.yml. It does
# NOT create a runtime — the MCP runtime must already exist (created once in the
# AgentBase console); this only pushes a new version pointing at a freshly built
# image, carrying over the previous version's flavor / autoscaling / imageAuth /
# network config.
#
# Required environment variables:
#   TOKEN_URL      IAM token endpoint (client_credentials)
#   API            AgentBase runtime API base
#   CLIENT_ID      IAM service-account client id
#   CLIENT_SECRET  IAM service-account client secret
#   RUNTIME_ID     target runtime id
#   IMAGE          full image url (registry/repo/name:tag)
#   ENV_VARS       newline-separated KEY=VALUE pairs to set as environmentVariables
#                  (only non-empty values are forwarded)
set -uo pipefail

log() { echo "[debug] $*"; }

echo "::group::Step 0 — Preflight checks"
log "TOKEN_URL=${TOKEN_URL}"
log "API=${API}"
log "IMAGE=${IMAGE}"
log "RUNTIME_ID set? $([ -n "${RUNTIME_ID:-}" ] && echo yes || echo NO)"
log "CLIENT_ID set? $([ -n "${CLIENT_ID:-}" ] && echo yes || echo NO)"
log "CLIENT_SECRET set? $([ -n "${CLIENT_SECRET:-}" ] && echo yes || echo NO)"
log "curl version: $(curl --version | head -n1)"
log "jq version: $(jq --version)"
echo "::endgroup::"

echo "::group::Step 1 — Exchange credentials for access token"
log "POST ${TOKEN_URL} (grant_type=client_credentials)"
TOKEN_HTTP=$(curl -sS -o /tmp/token.json -w '%{http_code}' \
  -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  "${TOKEN_URL}")
log "token endpoint HTTP=${TOKEN_HTTP}"
TOKEN=$(jq -r '.access_token // .data.accessToken // empty' /tmp/token.json)
if [ -z "$TOKEN" ]; then
  log "response keys: $(jq -r 'keys? // [] | join(",")' /tmp/token.json 2>/dev/null || echo '<non-json>')"
  echo "Failed to obtain access token"; exit 1
fi
log "token acquired (length=${#TOKEN})"
echo "::add-mask::${TOKEN}"
echo "::endgroup::"

echo "::group::Step 2 — Build payload (env + carried-over config)"
# environmentVariables from ENV_VARS (KEY=VALUE lines); only non-empty forwarded.
ENV_JSON=$(jq -n '{}')
while IFS= read -r line; do
  [ -z "$line" ] && continue
  key="${line%%=*}"
  val="${line#*=}"
  [ -n "$val" ] && ENV_JSON=$(jq --arg k "$key" --arg v "$val" '. + {($k):$v}' <<<"$ENV_JSON")
done <<<"${ENV_VARS:-}"
log "environmentVariables keys: $(jq -r 'keys | join(",")' <<<"$ENV_JSON")"

log "GET ${API}/agent-runtimes/${RUNTIME_ID}/versions"
VERS_HTTP=$(curl -sS -o /tmp/versions.json -w '%{http_code}' \
  "${API}/agent-runtimes/${RUNTIME_ID}/versions?page=1&size=100" \
  -H "Authorization: Bearer ${TOKEN}")
log "versions endpoint HTTP=${VERS_HTTP}"
if ! { [ "$VERS_HTTP" -ge 200 ] && [ "$VERS_HTTP" -lt 300 ]; }; then
  log "GET versions failed — response body:"
  cat /tmp/versions.json || true
  echo
fi
log "version count: $(jq -r '(.listData // []) | length' /tmp/versions.json 2>/dev/null || echo '?')"
log "latest version: $(jq -r '((.listData // []) | max_by(.version) | .version) // "none"' /tmp/versions.json 2>/dev/null || echo '?')"
PAYLOAD=$(jq -n \
  --arg img "$IMAGE" \
  --argjson env "$ENV_JSON" \
  --slurpfile v /tmp/versions.json \
  '($v[0].listData // [] | max_by(.version)) as $cur
   | {
       imageUrl: $img,
       environmentVariables: $env,
       flavorId: ($cur.flavorId // "runtime-s2-general-4x8"),
       autoscaling: ($cur.autoscaling // {minReplicas:1,maxReplicas:1,cpuUtilization:70,memoryUtilization:70}),
       imageAuth: ($cur.imageAuth // {enabled:true, useAgentBaseRegistryCredentials:true}),
       networkConfig: ($cur.networkConfig // {mode:"PUBLIC"})
     }')
log "payload (env redacted):"
jq '.environmentVariables |= (with_entries(.value = "***"))' <<<"$PAYLOAD"
echo "::endgroup::"

echo "::group::Step 3 — Create new runtime version"
log "POST ${API}/agent-runtimes/${RUNTIME_ID}/versions -> ${IMAGE}"
HTTP=$(curl -sS -o /tmp/resp.json -D /tmp/resp.headers -w '%{http_code}' \
  -X POST "${API}/agent-runtimes/${RUNTIME_ID}/versions" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
log "create version HTTP=${HTTP}"
log "response body:"
cat /tmp/resp.json || true
echo
if ! { [ "$HTTP" -ge 200 ] && [ "$HTTP" -lt 300 ]; }; then
  log "response headers (for trace/correlation IDs):"
  cat /tmp/resp.headers || true
  echo "::endgroup::"
  echo "Rollout failed"; exit 1
fi
echo "::endgroup::"

echo "::group::Step 4 — Wait for runtime to become ACTIVE"
for i in $(seq 1 60); do
  STATUS=$(curl -sS "${API}/agent-runtimes/${RUNTIME_ID}" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r '.status // .data.status // "UNKNOWN"')
  log "poll ${i}/60 status=${STATUS}"
  case "$STATUS" in
    ACTIVE) echo "Deployed."; echo "::endgroup::"; exit 0 ;;
    FAILED|ERROR) echo "Deployment failed."; echo "::endgroup::"; exit 1 ;;
  esac
  sleep 10
done
echo "::endgroup::"
echo "Timed out waiting for ACTIVE"; exit 1
