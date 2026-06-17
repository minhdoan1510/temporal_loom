#!/usr/bin/env bash
# Container entrypoint + lightweight process manager for the AgentBase
# all-in-one image. Runs MySQL, Qdrant, the MCP server and the lending-claw app
# in one container.
#   1. Render /apps/config/config.yaml from env vars.
#   2. On first boot: init MySQL data dir, create DB + user, apply migrations
#      (with the bundled mysql client).
#   3. Start mysqld + qdrant, wait until ready, then start mcp + the app.
#      If any process exits, tear everything down so AgentBase restarts the pod.
set -uo pipefail

CONFIG_TMPL=/apps/config/config.agentbase.yaml.tmpl
CONFIG_OUT=/apps/config/config.yaml
DATADIR=/var/lib/mysql
INIT_SOCK=/tmp/mysql-init.sock
MYSQL_DB=lending_agent
MYSQL_USER_NAME=agent
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"

log() { echo "[entrypoint] $*"; }

# --- 1. Render config ----------------------------------------------------------
export JWT_SECRET="${JWT_SECRET:-}"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"
export MCP_AUTH_TOKEN="${MCP_AUTH_TOKEN:-}"
export LLM_API_KEY="${LLM_API_KEY:-}"
export JIRA_PERSONAL_TOKEN="${JIRA_PERSONAL_TOKEN:-}"
export OPENSEARCH_PASSWORD="${OPENSEARCH_PASSWORD:-}"
export LANGFUSE_PUBLIC_KEY="${LANGFUSE_PUBLIC_KEY:-}"
export LANGFUSE_SECRET_KEY="${LANGFUSE_SECRET_KEY:-}"
export CONFLUENCE_API_KEY="${CONFLUENCE_API_KEY:-}"
export MYSQL_PASSWORD

log "rendering config -> ${CONFIG_OUT}"
envsubst < "${CONFIG_TMPL}" > "${CONFIG_OUT}"

wait_mysql() { # socket-or-tcp readiness via mysqladmin ping
  for _ in $(seq 1 120); do
    if mysqladmin "$@" ping >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

wait_tcp() { # host port
  for _ in $(seq 1 120); do
    if (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null; then exec 3>&- 3<&-; return 0; fi
    sleep 1
  done
  return 1
}

# --- 2. First-boot MySQL init --------------------------------------------------
if [ ! -d "${DATADIR}/mysql" ]; then
  log "initializing MySQL data dir at ${DATADIR}"
  mkdir -p "${DATADIR}"
  chown -R mysql:mysql "${DATADIR}"
  mysqld --user=mysql --datadir="${DATADIR}" --initialize-insecure

  log "starting temporary mysqld for bootstrap"
  mysqld --user=mysql --datadir="${DATADIR}" --socket="${INIT_SOCK}" --skip-networking &
  init_pid=$!

  log "waiting for temporary mysqld"
  wait_mysql --socket="${INIT_SOCK}" || { log "temporary mysqld did not come up"; exit 1; }

  log "creating database '${MYSQL_DB}' and user '${MYSQL_USER_NAME}'"
  mysql --socket="${INIT_SOCK}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${MYSQL_USER_NAME}'@'%' IDENTIFIED WITH mysql_native_password BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DB}\`.* TO '${MYSQL_USER_NAME}'@'%';
FLUSH PRIVILEGES;
SQL

  # Prefer restoring from the bundled mysqldump (schema + seed data). The dump
  # DROPs and recreates every table, so it fully defines the schema — no need to
  # also run migrations. Fall back to applying migrations if the dump is absent.
  DUMP=/apps/db/agent.dump
  if [ -f "${DUMP}" ]; then
    log "restoring database from dump ${DUMP}"
    # Strip the SET @@GLOBAL.GTID_PURGED line: the source DB had GTID enabled but
    # the freshly initialized local mysqld runs with GTID_MODE=OFF, where setting
    # GTID_PURGED errors out and aborts the restore. (The dump is generated with
    # extended-insert OFF so every row is its own short INSERT — large rows stay
    # well under the mysql client's line-parsing limits and import cleanly.)
    if ! grep -v '^SET @@GLOBAL.GTID_PURGED' "${DUMP}" | mysql --socket="${INIT_SOCK}" "${MYSQL_DB}"; then
      log "restore failed: ${DUMP}"
      exit 1
    fi
  else
    log "no dump found; applying migrations"
    for f in $(ls /apps/migrations/*.up.sql | sort); do
      log "  -> $(basename "$f")"
      if ! mysql --socket="${INIT_SOCK}" "${MYSQL_DB}" < "$f"; then
        log "migration failed: $f"
        exit 1
      fi
    done
  fi

  log "stopping temporary mysqld"
  mysqladmin --socket="${INIT_SOCK}" shutdown
  wait "${init_pid}" 2>/dev/null || true
else
  log "MySQL data dir already initialized; skipping init"
fi

# --- 3. Run everything ---------------------------------------------------------
pids=()
shutdown() {
  log "shutting down child processes"
  kill "${pids[@]}" 2>/dev/null || true
}
trap shutdown TERM INT

log "starting mysqld"
mysqld --user=mysql --datadir="${DATADIR}" &
pids+=($!)

log "starting qdrant"
(
  cd /qdrant || exit 1
  QDRANT__SERVICE__HTTP_PORT=6333 \
  QDRANT__SERVICE__GRPC_PORT=6334 \
  QDRANT__STORAGE__STORAGE_PATH=/qdrant/storage \
  exec ./qdrant
) &
pids+=($!)

log "waiting for MySQL (127.0.0.1:3306)"
wait_mysql -h 127.0.0.1 -P 3306 || { log "MySQL not ready"; shutdown; exit 1; }
log "waiting for Qdrant (127.0.0.1:6333)"
wait_tcp 127.0.0.1 6333 || { log "Qdrant not ready"; shutdown; exit 1; }

log "starting MCP server (port 8090)"
/apps/mcp --config "${CONFIG_OUT}" &
pids+=($!)

log "starting lending-claw (port 8080)"
/apps/lending-claw serve &
pids+=($!)

# Exit as soon as any managed process dies; AgentBase will restart the pod.
wait -n
log "a managed process exited — tearing down"
shutdown
exit 1
