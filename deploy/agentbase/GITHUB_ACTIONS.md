# Auto-deploy to AgentBase (GitHub Actions)

Workflow: [`.github/workflows/deploy-agentbase.yml`](../../.github/workflows/deploy-agentbase.yml)

On every push to `main` (touching app code / image files) it:

1. **build-and-push** — builds `Dockerfile.agentbase` (all-in-one: app + MCP + MySQL +
   Qdrant) on a native amd64 runner and pushes to
   `vcr.vngcloud.vn/<VCR_REPO>/lending-claw:<sha>` (+ `:latest`).
2. **deploy** — creates a new **version** of the AgentBase runtime pointing at the new
   image, via `POST {console}/runtime-api/agent-runtimes/<RUNTIME_ID>/versions`, then
   polls until `ACTIVE`.

## Required repository secrets

Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value | Where to get it |
|--------|-------|-----------------|
| `VCR_REPO` | `111480-abp111767` | Container Registry repo name |
| `VCR_USERNAME` | `111480-gui111767` | Container Registry → Credentials |
| `VCR_PASSWORD` | *(registry secret key)* | Container Registry → Credentials |
| `AGENTBASE_RUNTIME_ID` | `runtime-35e09d01-431e-433a-a44a-bc94f1e99783` | Runtime detail URL |
| `AGENTBASE_API_TOKEN` | *(API token — see note)* | AI Platform → **API Keys**, or an IAM service account |
| `MYSQL_PASSWORD` | *(same as deployed)* | `deploy/agentbase/.env` |
| `JWT_SECRET` | *(same as deployed)* | `deploy/agentbase/.env` |
| `ENCRYPTION_KEY` | *(same as deployed)* | `deploy/agentbase/.env` |
| `MCP_AUTH_TOKEN` | *(same as deployed)* | `deploy/agentbase/.env` |
| `LLM_API_KEY` | *(litellm/MaaS key)* | provided |

> Tip: `gh secret set VCR_PASSWORD` (and so on) sets them from the CLI without pasting
> into the web UI.

## Note on the deploy step (auth)

The **build-and-push** job is fully verified — registry push works with the robot
credentials above.

The **deploy** job needs a token-based credential because the AgentBase console
authenticates with **session cookies** (httpOnly, not reusable from CI). CI therefore
needs its own API token via `AGENTBASE_API_TOKEN`:

- First try an **API Key** from AI Platform → *API Keys* (e.g. the `runtime-service`
  key) as the bearer token.
- If the `runtime-api` rejects it, the platform likely uses an **IAM service account**
  (client id/secret → OAuth access token); generate one in IAM and exchange it for a
  bearer token in an extra step before the curl.

The exact `POST .../versions` body schema (`imageUrl` + `environmentVariables`) was
inferred from the console's create flow; if the API returns 4xx, capture the real schema
from the console (DevTools → Network when creating a version) and adjust the `PAYLOAD`
in the workflow.

### Fallback (no API token)

If a CI-usable token isn't available, drop the `deploy` job and keep only
`build-and-push`; then roll out the new image from the console (AgentBase → Agent
runtime → lending-claw → new version → image `:latest` or the pushed `:<sha>` tag).
