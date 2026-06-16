# Auto-deploy to AgentBase (GitHub Actions)

Workflow: [`.github/workflows/deploy-agentbase.yml`](../../.github/workflows/deploy-agentbase.yml)

On every push to `main` (touching app code / image files) it runs four jobs:

1. **build-and-push** — builds `Dockerfile.agentbase` (all-in-one: app + MCP + MySQL +
   Qdrant) on a native amd64 runner and pushes to
   `vcr.vngcloud.vn/<VCR_REPO>/lending-claw:<sha>` (+ `:latest`).
2. **build-and-push-mcp** — builds the standalone `mcp/Dockerfile` (MCP server only,
   port 7080) and pushes `vcr.vngcloud.vn/<VCR_REPO>/lending-claw-mcp:<sha>` (+ `:latest`).
3. **deploy** — rolls a new **version** of the app runtime (`AGENTBASE_RUNTIME_ID`),
   using its own inline rollout script.
4. **deploy-mcp** — rolls a new **version** of the standalone MCP runtime
   (`AGENTBASE_MCP_RUNTIME_ID`) via `scripts/deploy-mcp-agentbase.sh`.

Each rollout exchanges the IAM service-account credentials for a token, carries over
the latest version's flavor/autoscaling/imageAuth/network config, `POST`s a new
version pointing at the freshly pushed image, then polls until `ACTIVE`.

> The MCP runtime is **not** created by CI — pre-create it once in the AgentBase
> console (network `PUBLIC`), copy its `runtime-...` id into `AGENTBASE_MCP_RUNTIME_ID`.
> Then point the app's `mcp_servers` rows (Settings → MCP Servers) at
> `https://<mcp-runtime-public-url>/mcp/{jira,opensearch,loan}` with `MCP_AUTH_TOKEN`.
> The MCP bundled inside the all-in-one image keeps running, so cutover is gradual.

## Required repository secrets

Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value | Where to get it |
|--------|-------|-----------------|
| `VCR_USERNAME` | `111480-gui111767` | Container Registry → Credentials |
| `VCR_PASSWORD` | *(registry secret key)* | Container Registry → Credentials |
| `AGENTBASE_RUNTIME_ID` | `runtime-35e09d01-431e-433a-a44a-bc94f1e99783` | Runtime detail URL |
| `AGENTBASE_MCP_RUNTIME_ID` | *(MCP runtime id)* | MCP runtime detail URL (pre-create in console) |
| `AGENTBASE_CLIENT_ID` | *(service-account Client ID)* | IAM → Service account → Security credentials |
| `AGENTBASE_CLIENT_SECRET` | *(service-account Client Secret)* | IAM → Service account → Security credentials (Reset to reveal) |
| `MYSQL_PASSWORD` | *(same as deployed)* | `deploy/agentbase/.env` |
| `JWT_SECRET` | *(same as deployed)* | `deploy/agentbase/.env` |
| `ENCRYPTION_KEY` | *(same as deployed)* | `deploy/agentbase/.env` |
| `MCP_AUTH_TOKEN` | *(same as deployed)* | `deploy/agentbase/.env` |
| `LLM_API_KEY` | *(litellm/MaaS key)* | provided |
| `JIRA_PERSONAL_TOKEN` | *(Jira PAT)* | needed by standalone MCP (jira tools) |
| `OPENSEARCH_PASSWORD` | *(opensearch password)* | needed by standalone MCP (opensearch tools) |

> `VCR_REPO` (`111480-abp111767`) is **not** a secret — it's set in the workflow `env:`.

## How the deploy step authenticates

The AgentBase console uses session cookies (not reusable from CI), so CI authenticates
as an **IAM service account** via the OAuth `client_credentials` flow:

1. `POST https://iam.api.vngcloud.vn/accounts-api/v2/auth/token` with HTTP Basic
   `ClientID:ClientSecret` and `grant_type=client_credentials` → `access_token`.
2. Call `https://agentbase.api.vngcloud.vn/runtime/agent-runtimes/<id>/versions` with
   `Authorization: Bearer <access_token>`.

The service account must have the **`AgentBaseFullAccess`** policy attached. See
[IAM setup](#iam-setup) below.

The `POST .../versions` body (`imageUrl` + `environmentVariables`) was inferred from the
console's create flow; if the API returns a 4xx, capture the real schema (DevTools →
Network when creating a version in the console) and adjust `PAYLOAD` in the workflow.

## IAM setup

In the AI Platform console → **Team & Permissions → Service Accounts** (or the IAM
console at `iam.console.vngcloud.vn` → Service account):

1. Use an existing service account that has **`AgentBaseFullAccess`** (e.g. `claw-a-thon-26`)
   or create a new one and attach that policy under **Permission → Attach policies**.
2. Open **Security credentials** → copy the **Client ID**; click **Reset client secret**
   to reveal the **Client Secret** (shown once — copy it immediately).
   - ⚠️ Reset invalidates the previous secret. Don't reset a service account that another
     system is already using; create a dedicated one for CI instead.
3. Put the Client ID / Secret into `AGENTBASE_CLIENT_ID` / `AGENTBASE_CLIENT_SECRET`.

### Fallback (no service account)

Keep only `build-and-push` and roll out from the console (AgentBase → Agent runtime →
lending-claw → new version → image `:latest` or the pushed `:<sha>` tag).
