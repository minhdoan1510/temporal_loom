package mysql

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// MySQLContextFileStore implements store.ContextFileStore backed by MySQL.
type MySQLContextFileStore struct {
	db *sql.DB
}

func NewMySQLContextFileStore(db *sql.DB) *MySQLContextFileStore {
	return &MySQLContextFileStore{db: db}
}

func (s *MySQLContextFileStore) GetForUser(ctx context.Context, workspaceID, userID string) ([]store.ContextFile, error) {
	globalFiles, err := s.GetGlobal(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	if userID == "" {
		return globalFiles, nil
	}

	// Fetch user-scoped files
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, scope, user_id, path, content, updated_at
		 FROM context_files WHERE workspace_id = ? AND scope = 'user' AND user_id = ?`, workspaceID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	userFiles, err := scanContextFiles(rows)
	if err != nil {
		return nil, err
	}

	if len(userFiles) == 0 {
		return globalFiles, nil
	}

	// Merge: user files override global files with same path
	userSet := make(map[string]store.ContextFile, len(userFiles))
	for _, f := range userFiles {
		userSet[f.Path] = f
	}

	var merged []store.ContextFile
	for _, g := range globalFiles {
		if uf, ok := userSet[g.Path]; ok {
			merged = append(merged, uf)
			delete(userSet, g.Path)
		} else {
			merged = append(merged, g)
		}
	}
	// Append remaining user-only files
	for _, f := range userFiles {
		if _, exists := userSet[f.Path]; exists {
			merged = append(merged, f)
		}
	}

	return merged, nil
}

func (s *MySQLContextFileStore) GetGlobal(ctx context.Context, workspaceID string) ([]store.ContextFile, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, scope, user_id, path, content, updated_at
		 FROM context_files WHERE workspace_id = ? AND scope = 'global' ORDER BY path`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanContextFiles(rows)
}

func (s *MySQLContextFileStore) Upsert(ctx context.Context, workspaceID string, file *store.ContextFile) error {
	if file.ID == "" {
		file.ID = uuid.New().String()
	}
	file.UpdatedAt = time.Now()

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO context_files (id, workspace_id, scope, user_id, path, content, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = VALUES(updated_at)`,
		file.ID, workspaceID, file.Scope, file.UserID, file.Path, file.Content, file.UpdatedAt,
	)
	return err
}

func (s *MySQLContextFileStore) Delete(ctx context.Context, workspaceID, scope string, userID *string, path string) error {
	if userID != nil {
		_, err := s.db.ExecContext(ctx,
			`DELETE FROM context_files WHERE workspace_id = ? AND scope = ? AND user_id = ? AND path = ?`,
			workspaceID, scope, *userID, path)
		return err
	}
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM context_files WHERE workspace_id = ? AND scope = ? AND user_id IS NULL AND path = ?`,
		workspaceID, scope, path)
	return err
}

func (s *MySQLContextFileStore) List(ctx context.Context, workspaceID string) ([]store.ContextFile, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, scope, user_id, path, content, updated_at
		 FROM context_files WHERE workspace_id = ? ORDER BY scope, path`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanContextFiles(rows)
}

func scanContextFiles(rows *sql.Rows) ([]store.ContextFile, error) {
	var files []store.ContextFile
	for rows.Next() {
		var f store.ContextFile
		if err := rows.Scan(&f.ID, &f.Scope, &f.UserID, &f.Path, &f.Content, &f.UpdatedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}
