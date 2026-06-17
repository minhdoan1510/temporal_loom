#!/usr/bin/env bash
# Build the all-in-one image, push it to GreenNode vCR, and deploy/update an
# Agent Runtime on AgentBase.
#
# Usage:
#   cp deploy/agentbase/.env.example deploy/agentbase/.env   # then fill it in
#   ./scripts/deploy-agentbase.sh
#
# All configuration comes from environment variables (see deploy/agentbase/.env.example).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

# Auto-load deploy/agentbase/.env if present.
ENV_FILE="${ENV_FILE:-deploy/agentbase/.env}"
if [ -f "${ENV_FILE}" ]; then
  echo "[deploy] loading ${ENV_FILE}"
  set -a; . "${ENV_FILE}"; set +a
fi

# --- Config / defaults ---------------------------------------------------------
VCR_HOST="vcr.vngcloud.vn"
AGENTBASE_API="${AGENTBASE_API:-https://agentbase.api.vngcloud.vn}"
IMAGE_NAME="lending-claw"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
RUNTIME_NAME="${RUNTIME_NAME:-lending-claw}"
AGENTBASE_FLAVOR="${AGENTBASE_FLAVOR:-2x4-general}"

IMAGE_URL="${VCR_HOST}/${VCR_REPO}/${IMAGE_NAME}:${IMAGE_TAG}"

# --- Pre-flight ----------------------------------------------------------------
for bin in docker curl jq; do
  command -v "${bin}" >/dev/null 2>&1 || { echo "ERROR: '${bin}' not found in PATH"; exit 1; }
done

require() { eval "v=\${$1:-}"; [ -n "${v}" ] || { echo "ERROR: ${1} is required (set it in ${ENV_FILE})"; exit 1; }; }
require VCR_REPO
require VCR_USERNAME
require VCR_PASSWORD
require AGENTBASE_TOKEN
require MYSQL_PASSWORD
require LLM_API_KEY
require JWT_SECRET
require ENCRYPTION_KEY

cat <<INFO
[deploy] ---------------------------------------------------------------
[deploy]  image     : ${IMAGE_URL}
[deploy]  runtime   : ${RUNTIME_NAME}
[deploy]  flavor    : ${AGENTBASE_FLAVOR}
[deploy]  api       : ${AGENTBASE_API}
[deploy] ---------------------------------------------------------------
INFO

# --- 1. Build ------------------------------------------------------------------
echo "[deploy] building image (linux/amd64)"
docker build --platform linux/amd64 -f Dockerfile.agentbase -t "${IMAGE_URL}" .

# --- 2. Push -------------------------------------------------------------------
echo "[deploy] logging in to ${VCR_HOST}"
echo "${VCR_PASSWORD}" | docker login "${VCR_HOST}" -u "${VCR_USERNAME}" --password-stdin
echo "[deploy] pushing ${IMAGE_URL}"
docker push "${IMAGE_URL}"

# --- 3. Build runtime payload --------------------------------------------------
# environmentVariables: only forward secrets that are actually set, so the
# rendered config never carries empty mandatory values silently.
ENV_JSON=$(jq -n '{}')
add_env() {
  local key="$1"; local val="${2:-}"
  [ -n "${val}" ] && ENV_JSON=$(jq --arg k "${key}" --arg v "${val}" '. + {($k): $v}' <<<"${ENV_JSON}")
}
add_env MYSQL_PASSWORD       "${MYSQL_PASSWORD}"
add_env JWT_SECRET           "${JWT_SECRET}"
add_env ENCRYPTION_KEY       "${ENCRYPTION_KEY}"
add_env MCP_AUTH_TOKEN       "${MCP_AUTH_TOKEN:-}"
add_env LLM_API_KEY          "${LLM_API_KEY}"
add_env JIRA_PERSONAL_TOKEN  "${JIRA_PERSONAL_TOKEN:-}"
add_env OPENSEARCH_PASSWORD  "${OPENSEARCH_PASSWORD:-}"
add_env LANGFUSE_PUBLIC_KEY  "${LANGFUSE_PUBLIC_KEY:-}"
add_env LANGFUSE_SECRET_KEY  "${LANGFUSE_SECRET_KEY:-}"
add_env CONFLUENCE_API_KEY   "${CONFLUENCE_API_KEY:-}"
add_env RESEND_API_KEY       "${RESEND_API_KEY:-}"
add_env MAIL_FROM_EMAIL      "${MAIL_FROM_EMAIL:-}"

PAYLOAD=$(jq -n \
  --arg name "${RUNTIME_NAME}" \
  --arg image "${IMAGE_URL}" \
  --arg flavor "${AGENTBASE_FLAVOR}" \
  --arg user "${VCR_USERNAME}" \
  --arg pass "${VCR_PASSWORD}" \
  --argjson env "${ENV_JSON}" \
  '{
     name: $name,
     description: "lending-claw all-in-one (app + MCP + MySQL + Qdrant)",
     imageUrl: $image,
     command: [],
     args: [],
     environmentVariables: $env,
     flavorId: $flavor,
     imageAuth: { enabled: true, username: $user, password: $pass },
     autoscaling: { minReplicas: 1, maxReplicas: 1, cpuUtilization: 70, memoryUtilization: 70 }
   }')

auth_hdr=( -H "Authorization: Bearer ${AGENTBASE_TOKEN}" )
json_hdr=( -H "Content-Type: application/json" )

# --- 4. Create or update -------------------------------------------------------
echo "[deploy] looking up existing runtime '${RUNTIME_NAME}'"
EXISTING_ID=$(curl -fsS "${auth_hdr[@]}" "${AGENTBASE_API}/runtime/agent-runtimes" \
  | jq -r --arg n "${RUNTIME_NAME}" '(.items // . // [])[]? | select(.name==$n) | .id' \
  | head -n1 || true)

if [ -n "${EXISTING_ID}" ] && [ "${EXISTING_ID}" != "null" ]; then
  echo "[deploy] updating existing runtime ${EXISTING_ID}"
  RESP=$(curl -fsS -X PATCH "${auth_hdr[@]}" "${json_hdr[@]}" \
    "${AGENTBASE_API}/runtime/agent-runtimes/${EXISTING_ID}" -d "${PAYLOAD}")
  RUNTIME_ID="${EXISTING_ID}"
else
  echo "[deploy] creating new runtime"
  RESP=$(curl -fsS -X POST "${auth_hdr[@]}" "${json_hdr[@]}" \
    "${AGENTBASE_API}/runtime/agent-runtimes" -d "${PAYLOAD}")
  RUNTIME_ID=$(jq -r '.id // .data.id // empty' <<<"${RESP}")
fi

[ -n "${RUNTIME_ID}" ] || { echo "ERROR: could not determine runtime id"; echo "${RESP}"; exit 1; }
echo "[deploy] runtime id: ${RUNTIME_ID}"

# --- 5. Poll until ACTIVE ------------------------------------------------------
echo "[deploy] waiting for status ACTIVE"
for _ in $(seq 1 60); do
  DETAIL=$(curl -fsS "${auth_hdr[@]}" "${AGENTBASE_API}/runtime/agent-runtimes/${RUNTIME_ID}")
  STATUS=$(jq -r '.status // .data.status // "UNKNOWN"' <<<"${DETAIL}")
  echo "[deploy]   status=${STATUS}"
  case "${STATUS}" in
    ACTIVE) echo "[deploy] deployment is ACTIVE"; echo "${DETAIL}" | jq '{id,name,status,endpoint:(.endpoint // .url // null)}'; exit 0 ;;
    FAILED|ERROR) echo "ERROR: deployment failed"; echo "${DETAIL}" | jq .; exit 1 ;;
  esac
  sleep 10
done

echo "ERROR: timed out waiting for ACTIVE"
exit 1
