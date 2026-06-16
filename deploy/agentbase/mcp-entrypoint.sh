#!/bin/sh
# Entrypoint for the standalone MCP server image (separate AgentBase runtime).
# Renders the config from env vars (the MCP binary reads plain YAML, no env
# interpolation) then execs the server.
#
# POSIX sh (not bash): the alpine base image ships busybox ash, no bash.
set -u

CONFIG_TMPL=/etc/mcp/config.mcp.yaml.tmpl
CONFIG_OUT=/etc/mcp/config.yaml

export MCP_AUTH_TOKEN="${MCP_AUTH_TOKEN:-}"
export JIRA_PERSONAL_TOKEN="${JIRA_PERSONAL_TOKEN:-}"
export OPENSEARCH_PASSWORD="${OPENSEARCH_PASSWORD:-}"

echo "[mcp-entrypoint] rendering config -> ${CONFIG_OUT}"
envsubst < "${CONFIG_TMPL}" > "${CONFIG_OUT}"

exec /app/mcp-server --config "${CONFIG_OUT}"
