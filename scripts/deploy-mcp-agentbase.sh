#!/usr/bin/env bash
# Roll out a new version of the standalone MCP AgentBase runtime.
#
# Used by the `deploy-mcp` job in .github/workflows/deploy-agentbase.yml. It does
# NOT create a runtime — the MCP runtime must already exist (created once in the
# AgentBase console). It mirrors the app deploy job: PATCH /agent-runtimes/{id}
# creates a new version (carrying over the previous version's flavor / autoscaling
# / network config), then a per-commit endpoint is created/repointed and polled
# until ACTIVE.
#
# NOTE: the platform IAM denies POST /agent-runtimes/{id}/versions; the supported
# write path is PATCH /agent-runtimes/{id}.
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
# Optional:
#   VCR_USERNAME / VCR_PASSWORD  private-registry creds for imageAuth (falls back
#                                to the current version's imageAuth when unset)
#   GITHUB_SHA     used to name the per-commit endpoint (dep-<short-sha>)
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

# imageAuth for the private vCR registry: prefer explicit creds, else carry over.
if [ -n "${VCR_USERNAME:-}" ] && [ -n "${VCR_PASSWORD:-}" ]; then
  IMAGE_AUTH=$(jq -n --arg u "$VCR_USERNAME" --arg p "$VCR_PASSWORD" \
    '{enabled:true, username:$u, password:$p}')
  log "imageAuth: explicit vCR credentials (username=${VCR_USERNAME})"
else
  IMAGE_AUTH=$(jq -r '((.listData // []) | max_by(.version) | .imageAuth) // {enabled:true}' /tmp/versions.json)
  log "imageAuth: carried over from latest version"
fi

# Carry over flavor/autoscaling/networkConfig from the latest version; swap only
# image, env, imageAuth. PATCH /agent-runtimes/{id} creates a new version.
PAYLOAD=$(jq -n \
  --arg img "$IMAGE" \
  --argjson env "$ENV_JSON" \
  --argjson imageAuth "$IMAGE_AUTH" \
  --slurpfile v /tmp/versions.json \
  '($v[0].listData // [] | max_by(.version)) as $cur
   | {
       imageUrl: $img,
       description: ($cur.description // ""),
       command: [],
       args: [],
       environmentVariables: $env,
       flavorId: ($cur.flavorId // "runtime-s2-general-4x8"),
       autoscaling: ($cur.autoscaling // {minReplicas:1,maxReplicas:1,cpuUtilization:70,memoryUtilization:70}),
       imageAuth: $imageAuth
     }
   + (if ($cur.networkConfig // null) != null then {networkConfig: $cur.networkConfig} else {} end)')
log "payload (secrets redacted):"
jq '(.environmentVariables |= (with_entries(.value = "***")))
    | (if .imageAuth.password then .imageAuth.password = "***" else . end)' <<<"$PAYLOAD"
echo "::endgroup::"

echo "::group::Step 3 — Deploy new runtime version (PATCH)"
log "PATCH ${API}/agent-runtimes/${RUNTIME_ID} -> ${IMAGE}"
HTTP=$(curl -sS -o /tmp/resp.json -D /tmp/resp.headers -w '%{http_code}' \
  -X PATCH "${API}/agent-runtimes/${RUNTIME_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
log "deploy HTTP=${HTTP}"
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

echo "::group::Step 3.5 — Resolve the freshly created version number"
NEW_VERSION=$(jq -r '.version // .data.version // empty' /tmp/resp.json 2>/dev/null || true)
if [ -z "${NEW_VERSION:-}" ]; then
  log "PATCH response had no .version — querying versions list"
  curl -sS -o /tmp/versions.json \
    "${API}/agent-runtimes/${RUNTIME_ID}/versions?page=1&size=100" \
    -H "Authorization: Bearer ${TOKEN}" || true
  NEW_VERSION=$(jq -r '((.listData // []) | max_by(.version) | .version) // empty' /tmp/versions.json 2>/dev/null || true)
fi
if [ -z "${NEW_VERSION:-}" ]; then
  echo "Could not determine the new version number"; echo "::endgroup::"; exit 1
fi
log "new version = ${NEW_VERSION}"
echo "::endgroup::"

echo "::group::Step 4 — Create a NEW endpoint for this version"
# Each deploy gets its own endpoint named after the short commit SHA so previous
# endpoints/versions keep serving. Endpoint names: lowercase + hyphens.
SHORT_SHA=$(printf '%s' "${GITHUB_SHA:-manual}" | cut -c1-7)
EP_NAME="dep-${SHORT_SHA}"
log "endpoint name = ${EP_NAME} -> version ${NEW_VERSION}"
EP_PAYLOAD=$(jq -n --arg n "$EP_NAME" --argjson v "$NEW_VERSION" '{name:$n, version:$v}')
EP_HTTP=$(curl -sS -o /tmp/ep.json -w '%{http_code}' \
  -X POST "${API}/agent-runtimes/${RUNTIME_ID}/endpoints" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$EP_PAYLOAD")
log "create endpoint HTTP=${EP_HTTP}"
if { [ "$EP_HTTP" -ge 200 ] && [ "$EP_HTTP" -lt 300 ]; }; then
  EP_ID=$(jq -r '.id // .data.id // empty' /tmp/ep.json 2>/dev/null || true)
  log "created endpoint id=${EP_ID:-?}"
else
  # Re-running the same commit hits a name conflict. Find the existing endpoint by
  # name and repoint it to the new version instead.
  log "create failed (likely name already exists) — response body:"
  cat /tmp/ep.json || true; echo
  curl -sS -o /tmp/eplist.json \
    "${API}/agent-runtimes/${RUNTIME_ID}/endpoints?page=1&size=100" \
    -H "Authorization: Bearer ${TOKEN}" || true
  EP_ID=$(jq -r --arg n "$EP_NAME" '((.listData // []) | map(select(.name==$n)) | .[0].id) // empty' /tmp/eplist.json 2>/dev/null || true)
  if [ -z "${EP_ID:-}" ]; then
    echo "Endpoint create failed and no existing endpoint named ${EP_NAME} found"; echo "::endgroup::"; exit 1
  fi
  log "endpoint ${EP_NAME} (${EP_ID}) exists — PATCH to version ${NEW_VERSION}"
  UP_HTTP=$(curl -sS -o /tmp/ep.json -w '%{http_code}' \
    -X PATCH "${API}/agent-runtimes/${RUNTIME_ID}/endpoints/${EP_ID}?version=${NEW_VERSION}" \
    -H "Authorization: Bearer ${TOKEN}")
  log "update endpoint HTTP=${UP_HTTP}"
  if ! { [ "$UP_HTTP" -ge 200 ] && [ "$UP_HTTP" -lt 300 ]; }; then
    cat /tmp/ep.json || true; echo
    echo "Failed to update existing endpoint"; echo "::endgroup::"; exit 1
  fi
fi
echo "::endgroup::"

echo "::group::Step 5 — Wait for the new endpoint to become ACTIVE"
for i in $(seq 1 60); do
  curl -sS -o /tmp/eplist.json \
    "${API}/agent-runtimes/${RUNTIME_ID}/endpoints?page=1&size=100" \
    -H "Authorization: Bearer ${TOKEN}" || true
  EP_JSON=$(jq -c --arg n "$EP_NAME" '((.listData // []) | map(select(.name==$n)) | .[0]) // {}' /tmp/eplist.json 2>/dev/null || echo '{}')
  STATUS=$(jq -r '.status // "UNKNOWN"' <<<"$EP_JSON")
  EP_URL=$(jq -r '.url // empty' <<<"$EP_JSON")
  log "poll ${i}/60 endpoint=${EP_NAME} status=${STATUS}"
  case "$STATUS" in
    ACTIVE)
      echo "Deployed endpoint ${EP_NAME} (version ${NEW_VERSION})."
      [ -n "$EP_URL" ] && echo "Endpoint URL: ${EP_URL}"
      echo "::endgroup::"; exit 0 ;;
    ERROR|FAILED|DELETING)
      log "endpoint detail: ${EP_JSON}"
      echo "Endpoint rollout failed."; echo "::endgroup::"; exit 1 ;;
  esac
  sleep 10
done
echo "::endgroup::"
echo "Timed out waiting for endpoint ${EP_NAME} to become ACTIVE"; exit 1
