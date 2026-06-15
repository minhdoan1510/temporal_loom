package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// MySQLWorkspaceStore implements store.WorkspaceStore backed by MySQL.
type MySQLWorkspaceStore struct {
	db *sql.DB
}

func NewMySQLWorkspaceStore(db *sql.DB) *MySQLWorkspaceStore {
	return &MySQLWorkspaceStore{db: db}
}

const workspaceCols = `id, slug, name, description, created_by, created_at, updated_at`

func scanWorkspace(row interface{ Scan(...any) error }) (store.Workspace, error) {
	var ws store.Workspace
	err := row.Scan(&ws.ID, &ws.Slug, &ws.Name, &ws.Description,
		&ws.CreatedBy, &ws.CreatedAt, &ws.UpdatedAt)
	return ws, err
}

func (s *MySQLWorkspaceStore) List(ctx context.Context) ([]store.Workspace, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+workspaceCols+` FROM workspaces ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	defer rows.Close()

	wss := make([]store.Workspace, 0)
	for rows.Next() {
		ws, err := scanWorkspace(rows)
		if err != nil {
			return nil, fmt.Errorf("scan workspace: %w", err)
		}
		wss = append(wss, ws)
	}
	return wss, rows.Err()
}

func (s *MySQLWorkspaceStore) ListForUser(ctx context.Context, userSub string) ([]store.Workspace, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT w.id, w.slug, w.name, w.description, w.created_by, w.created_at, w.updated_at
		 FROM workspaces w
		 JOIN workspace_members m ON m.workspace_id = w.id
		 WHERE m.user_sub = ?
		 ORDER BY w.name`, userSub)
	if err != nil {
		return nil, fmt.Errorf("list workspaces for user: %w", err)
	}
	defer rows.Close()

	wss := make([]store.Workspace, 0)
	for rows.Next() {
		ws, err := scanWorkspace(rows)
		if err != nil {
			return nil, fmt.Errorf("scan workspace: %w", err)
		}
		wss = append(wss, ws)
	}
	return wss, rows.Err()
}

func (s *MySQLWorkspaceStore) Get(ctx context.Context, idOrSlug string) (*store.Workspace, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+workspaceCols+` FROM workspaces WHERE id = ? OR slug = ?`, idOrSlug, idOrSlug)
	ws, err := scanWorkspace(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workspace %q not found", idOrSlug)
	}
	if err != nil {
		return nil, fmt.Errorf("get workspace %q: %w", idOrSlug, err)
	}
	return &ws, nil
}

func (s *MySQLWorkspaceStore) Create(ctx context.Context, ws *store.Workspace) error {
	if ws.ID == "" {
		ws.ID = uuid.New().String()
	}
	now := time.Now()
	ws.CreatedAt = now
	ws.UpdatedAt = now

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO workspaces (id, slug, name, description, created_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		ws.ID, ws.Slug, ws.Name, ws.Description, ws.CreatedBy, ws.CreatedAt, ws.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create workspace: %w", err)
	}
	return nil
}

func (s *MySQLWorkspaceStore) Update(ctx context.Context, ws *store.Workspace) error {
	ws.UpdatedAt = time.Now()
	_, err := s.db.ExecContext(ctx,
		`UPDATE workspaces SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
		ws.Name, ws.Description, ws.UpdatedAt, ws.ID,
	)
	if err != nil {
		return fmt.Errorf("update workspace: %w", err)
	}
	return nil
}

func (s *MySQLWorkspaceStore) Delete(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("delete workspace: begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "DELETE FROM workspace_members WHERE workspace_id = ?", id); err != nil {
		return fmt.Errorf("delete workspace members: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM workspaces WHERE id = ?", id); err != nil {
		return fmt.Errorf("delete workspace: %w", err)
	}
	return tx.Commit()
}

func (s *MySQLWorkspaceStore) AddMember(ctx context.Context, workspaceID, userSub string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO workspace_members (workspace_id, user_sub) VALUES (?, ?)
		 ON DUPLICATE KEY UPDATE user_sub = user_sub`,
		workspaceID, userSub,
	)
	if err != nil {
		return fmt.Errorf("add workspace member: %w", err)
	}
	return nil
}

func (s *MySQLWorkspaceStore) RemoveMember(ctx context.Context, workspaceID, userSub string) error {
	_, err := s.db.ExecContext(ctx,
		"DELETE FROM workspace_members WHERE workspace_id = ? AND user_sub = ?",
		workspaceID, userSub,
	)
	if err != nil {
		return fmt.Errorf("remove workspace member: %w", err)
	}
	return nil
}

func (s *MySQLWorkspaceStore) ListMembers(ctx context.Context, workspaceID string) ([]store.WorkspaceMember, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT workspace_id, user_sub, added_at FROM workspace_members
		 WHERE workspace_id = ? ORDER BY added_at`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list workspace members: %w", err)
	}
	defer rows.Close()

	members := make([]store.WorkspaceMember, 0)
	for rows.Next() {
		var m store.WorkspaceMember
		if err := rows.Scan(&m.WorkspaceID, &m.UserSub, &m.AddedAt); err != nil {
			return nil, fmt.Errorf("scan workspace member: %w", err)
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

func (s *MySQLWorkspaceStore) IsMember(ctx context.Context, workspaceID, userSub string) (bool, error) {
	var one int
	err := s.db.QueryRowContext(ctx,
		"SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_sub = ? LIMIT 1",
		workspaceID, userSub,
	).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check workspace membership: %w", err)
	}
	return true, nil
}
