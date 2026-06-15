package mysql

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/crypto"
)

// MySQLMCPServerStore implements store.MCPServerStore backed by MySQL.
//
// auth_token is encrypted at rest with AES-256-GCM when encryptionKey is set.
// Legacy plaintext rows are read as-is (no prefix → returned unchanged) and
// re-encrypted on the next Update.
type MySQLMCPServerStore struct {
	db            *sql.DB
	encryptionKey string
}

func NewMySQLMCPServerStore(db *sql.DB, encryptionKey string) *MySQLMCPServerStore {
	return &MySQLMCPServerStore{db: db, encryptionKey: encryptionKey}
}

const serverCols = `workspace_id, name, url, auth_token, enabled, description, last_synced, created_at, updated_at`

func (s *MySQLMCPServerStore) List(ctx context.Context, workspaceID string) ([]store.MCPServer, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+serverCols+` FROM mcp_servers WHERE workspace_id = ? ORDER BY name`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list mcp servers: %w", err)
	}
	defer rows.Close()

	servers := make([]store.MCPServer, 0)
	for rows.Next() {
		srv, err := scanServer(rows)
		if err != nil {
			return nil, err
		}
		srv.AuthToken = s.decryptToken(ctx, srv.Name, srv.AuthToken)
		servers = append(servers, srv)
	}
	return servers, rows.Err()
}

func (s *MySQLMCPServerStore) ListAllServers(ctx context.Context) ([]store.MCPServer, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+serverCols+` FROM mcp_servers ORDER BY workspace_id, name`)
	if err != nil {
		return nil, fmt.Errorf("list all mcp servers: %w", err)
	}
	defer rows.Close()

	servers := make([]store.MCPServer, 0)
	for rows.Next() {
		srv, err := scanServer(rows)
		if err != nil {
			return nil, err
		}
		srv.AuthToken = s.decryptToken(ctx, srv.Name, srv.AuthToken)
		servers = append(servers, srv)
	}
	return servers, rows.Err()
}

func (s *MySQLMCPServerStore) Get(ctx context.Context, workspaceID, name string) (*store.MCPServer, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+serverCols+` FROM mcp_servers WHERE workspace_id = ? AND name = ?`, workspaceID, name)
	srv, err := scanServer(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("mcp server %q not found", name)
	}
	if err != nil {
		return nil, fmt.Errorf("get mcp server %q: %w", name, err)
	}
	srv.AuthToken = s.decryptToken(ctx, srv.Name, srv.AuthToken)
	return &srv, nil
}

func (s *MySQLMCPServerStore) Create(ctx context.Context, srv store.MCPServer) error {
	token, err := s.encryptToken(srv.AuthToken)
	if err != nil {
		return fmt.Errorf("encrypt auth_token: %w", err)
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO mcp_servers (workspace_id, name, url, auth_token, enabled, description)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		srv.WorkspaceID, srv.Name, srv.URL, token, srv.Enabled, srv.Description,
	); err != nil {
		return fmt.Errorf("create mcp server: %w", err)
	}
	return nil
}

func (s *MySQLMCPServerStore) Update(ctx context.Context, srv store.MCPServer) error {
	token, err := s.encryptToken(srv.AuthToken)
	if err != nil {
		return fmt.Errorf("encrypt auth_token: %w", err)
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE mcp_servers SET url = ?, auth_token = ?, enabled = ?, description = ?
		 WHERE workspace_id = ? AND name = ?`,
		srv.URL, token, srv.Enabled, srv.Description, srv.WorkspaceID, srv.Name,
	); err != nil {
		return fmt.Errorf("update mcp server: %w", err)
	}
	return nil
}

// encryptToken encrypts a plaintext auth_token for storage. When the store has
// no encryptionKey it is a no-op. Idempotent on already-encrypted values.
func (s *MySQLMCPServerStore) encryptToken(plain string) (string, error) {
	return crypto.Encrypt(plain, s.encryptionKey)
}

// decryptToken decrypts an auth_token read from the DB. Legacy plaintext rows
// (no aes-gcm: prefix) are returned unchanged. On decrypt failure the value
// is returned as-is and the error is logged so the caller still gets a usable
// (possibly invalid) token rather than crashing the manager startup.
func (s *MySQLMCPServerStore) decryptToken(ctx context.Context, name, stored string) string {
	plain, err := crypto.Decrypt(stored, s.encryptionKey)
	if err != nil {
		slog.WarnContext(ctx, "mcp_servers.auth_token decrypt failed",
			"server", name, "error", err)
		return stored
	}
	return plain
}

func (s *MySQLMCPServerStore) Delete(ctx context.Context, workspaceID, name string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("delete mcp server: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		"DELETE FROM mcp_functions WHERE workspace_id = ? AND server_name = ?", workspaceID, name); err != nil {
		return fmt.Errorf("delete mcp functions: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		"DELETE FROM mcp_servers WHERE workspace_id = ? AND name = ?", workspaceID, name); err != nil {
		return fmt.Errorf("delete mcp server: %w", err)
	}
	return tx.Commit()
}

// SyncFunctions reconciles the cached function rows with a fresh discovery
// result. Existing rows have their description/schema refreshed but the
// enabled flag is preserved; new rows default to enabled=true; rows no
// longer in funcs are deleted. Bumps last_synced.
func (s *MySQLMCPServerStore) SyncFunctions(ctx context.Context, workspaceID, serverName string, funcs []store.MCPFunction) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// Delete rows no longer present.
	if len(funcs) == 0 {
		if _, err := tx.ExecContext(ctx,
			"DELETE FROM mcp_functions WHERE workspace_id = ? AND server_name = ?", workspaceID, serverName); err != nil {
			return fmt.Errorf("delete missing functions: %w", err)
		}
	} else {
		keep := make([]any, 0, len(funcs)+2)
		keep = append(keep, workspaceID, serverName)
		placeholders := make([]string, len(funcs))
		for i, f := range funcs {
			placeholders[i] = "?"
			keep = append(keep, f.Name)
		}
		// #nosec G201 -- interpolated value is only "?" placeholders; all names are bound parameters
		q := fmt.Sprintf(
			"DELETE FROM mcp_functions WHERE workspace_id = ? AND server_name = ? AND name NOT IN (%s)",
			strings.Join(placeholders, ","),
		)
		if _, err := tx.ExecContext(ctx, q, keep...); err != nil {
			return fmt.Errorf("delete missing functions: %w", err)
		}
	}

	// Upsert each function. Preserve `enabled` via ON DUPLICATE KEY UPDATE
	// (do not list enabled in the update set).
	if len(funcs) > 0 {
		stmt, err := tx.PrepareContext(ctx,
			`INSERT INTO mcp_functions (workspace_id, server_name, name, description, schema_json, enabled)
			 VALUES (?, ?, ?, ?, ?, 1)
			 ON DUPLICATE KEY UPDATE
			   description = VALUES(description),
			   schema_json = VALUES(schema_json)`)
		if err != nil {
			return fmt.Errorf("prepare upsert: %w", err)
		}
		defer stmt.Close()
		for _, f := range funcs {
			schema := f.SchemaJSON
			if len(schema) == 0 {
				schema = json.RawMessage("{}")
			}
			if _, err := stmt.ExecContext(ctx, workspaceID, serverName, f.Name, f.Description, []byte(schema)); err != nil {
				return fmt.Errorf("upsert function %s: %w", f.Name, err)
			}
		}
	}

	if _, err := tx.ExecContext(ctx,
		"UPDATE mcp_servers SET last_synced = ? WHERE workspace_id = ? AND name = ?", time.Now(), workspaceID, serverName); err != nil {
		return fmt.Errorf("update last_synced: %w", err)
	}
	return tx.Commit()
}

func (s *MySQLMCPServerStore) SetFunctionEnabled(ctx context.Context, workspaceID, serverName, funcName string, enabled bool) error {
	res, err := s.db.ExecContext(ctx,
		"UPDATE mcp_functions SET enabled = ? WHERE workspace_id = ? AND server_name = ? AND name = ?",
		enabled, workspaceID, serverName, funcName)
	if err != nil {
		return fmt.Errorf("set function enabled: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("mcp function %s/%s not found", serverName, funcName)
	}
	return nil
}

const fnSelect = `SELECT workspace_id, server_name, name, description, schema_json, enabled, updated_at FROM mcp_functions`

func scanFunction(rows *sql.Rows) (store.MCPFunction, error) {
	var f store.MCPFunction
	var desc sql.NullString
	var schemaBytes []byte
	if err := rows.Scan(&f.WorkspaceID, &f.ServerName, &f.Name, &desc, &schemaBytes, &f.Enabled, &f.UpdatedAt); err != nil {
		return f, fmt.Errorf("scan function: %w", err)
	}
	f.Description = desc.String
	f.SchemaJSON = json.RawMessage(schemaBytes)
	return f, nil
}

func (s *MySQLMCPServerStore) ListFunctions(ctx context.Context, workspaceID, serverName string) ([]store.MCPFunction, error) {
	rows, err := s.db.QueryContext(ctx, fnSelect+" WHERE workspace_id = ? AND server_name = ? ORDER BY name", workspaceID, serverName)
	if err != nil {
		return nil, fmt.Errorf("list functions: %w", err)
	}
	defer rows.Close()
	funcs := make([]store.MCPFunction, 0)
	for rows.Next() {
		f, err := scanFunction(rows)
		if err != nil {
			return nil, err
		}
		funcs = append(funcs, f)
	}
	return funcs, rows.Err()
}

func (s *MySQLMCPServerStore) ListAllFunctions(ctx context.Context, workspaceID string) (map[string][]store.MCPFunction, error) {
	rows, err := s.db.QueryContext(ctx, fnSelect+" WHERE workspace_id = ? ORDER BY server_name, name", workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list all functions: %w", err)
	}
	defer rows.Close()
	out := make(map[string][]store.MCPFunction)
	for rows.Next() {
		f, err := scanFunction(rows)
		if err != nil {
			return nil, err
		}
		out[f.ServerName] = append(out[f.ServerName], f)
	}
	return out, rows.Err()
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanServer(r rowScanner) (store.MCPServer, error) {
	var srv store.MCPServer
	var lastSynced sql.NullTime
	if err := r.Scan(&srv.WorkspaceID, &srv.Name, &srv.URL, &srv.AuthToken, &srv.Enabled, &srv.Description,
		&lastSynced, &srv.CreatedAt, &srv.UpdatedAt); err != nil {
		return srv, err
	}
	if lastSynced.Valid {
		srv.LastSynced = &lastSynced.Time
	}
	return srv, nil
}
