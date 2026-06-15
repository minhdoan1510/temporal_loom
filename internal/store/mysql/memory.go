package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// MySQLMemoryStore implements store.MemoryStore backed by MySQL.
type MySQLMemoryStore struct {
	db *sql.DB
}

func NewMySQLMemoryStore(db *sql.DB) *MySQLMemoryStore {
	return &MySQLMemoryStore{db: db}
}

func (s *MySQLMemoryStore) GetDocument(ctx context.Context, workspaceID, scope, userID, path string) (*store.MemoryDoc, error) {
	var doc store.MemoryDoc
	var err error

	if userID == "" {
		err = s.db.QueryRowContext(ctx,
			`SELECT id, scope, user_id, path, content, metadata, created_at, updated_at
			 FROM memory_docs WHERE workspace_id = ? AND scope = ? AND user_id IS NULL AND path = ?`,
			workspaceID, scope, path,
		).Scan(&doc.ID, &doc.Scope, &doc.UserID, &doc.Path, &doc.Content,
			&doc.Metadata, &doc.CreatedAt, &doc.UpdatedAt)
	} else {
		err = s.db.QueryRowContext(ctx,
			`SELECT id, scope, user_id, path, content, metadata, created_at, updated_at
			 FROM memory_docs WHERE workspace_id = ? AND scope = ? AND user_id = ? AND path = ?`,
			workspaceID, scope, userID, path,
		).Scan(&doc.ID, &doc.Scope, &doc.UserID, &doc.Path, &doc.Content,
			&doc.Metadata, &doc.CreatedAt, &doc.UpdatedAt)
	}

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("memory doc %q not found", path)
	}
	if err != nil {
		return nil, fmt.Errorf("get memory doc: %w", err)
	}
	return &doc, nil
}

func (s *MySQLMemoryStore) GetByID(ctx context.Context, workspaceID, id string) (*store.MemoryDoc, error) {
	var doc store.MemoryDoc
	err := s.db.QueryRowContext(ctx,
		`SELECT id, scope, user_id, path, content, metadata, created_at, updated_at
		 FROM memory_docs WHERE workspace_id = ? AND id = ?`, workspaceID, id,
	).Scan(&doc.ID, &doc.Scope, &doc.UserID, &doc.Path, &doc.Content,
		&doc.Metadata, &doc.CreatedAt, &doc.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("memory doc with id %q not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get memory doc by id: %w", err)
	}
	return &doc, nil
}

func (s *MySQLMemoryStore) ListDocuments(ctx context.Context, workspaceID, scope, userID string) ([]store.MemoryDoc, error) {
	var rows *sql.Rows
	var err error

	if userID == "" {
		rows, err = s.db.QueryContext(ctx,
			`SELECT id, scope, user_id, path, content, metadata, created_at, updated_at
			 FROM memory_docs WHERE workspace_id = ? AND scope = ? AND user_id IS NULL
			 ORDER BY path`, workspaceID, scope)
	} else {
		rows, err = s.db.QueryContext(ctx,
			`SELECT id, scope, user_id, path, content, metadata, created_at, updated_at
			 FROM memory_docs WHERE workspace_id = ? AND scope = ? AND user_id = ?
			 ORDER BY path`, workspaceID, scope, userID)
	}
	if err != nil {
		return nil, fmt.Errorf("list memory docs: %w", err)
	}
	defer rows.Close()

	var docs []store.MemoryDoc
	for rows.Next() {
		var doc store.MemoryDoc
		if err := rows.Scan(&doc.ID, &doc.Scope, &doc.UserID, &doc.Path, &doc.Content,
			&doc.Metadata, &doc.CreatedAt, &doc.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan memory doc: %w", err)
		}
		docs = append(docs, doc)
	}
	return docs, rows.Err()
}

func (s *MySQLMemoryStore) Upsert(ctx context.Context, workspaceID string, doc *store.MemoryDoc) error {
	if doc.ID == "" {
		doc.ID = uuid.New().String()
	}
	now := time.Now()
	doc.UpdatedAt = now

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO memory_docs (id, workspace_id, scope, user_id, path, content, metadata, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE content = VALUES(content), metadata = VALUES(metadata), updated_at = VALUES(updated_at)`,
		doc.ID, workspaceID, doc.Scope, doc.UserID, doc.Path, doc.Content,
		doc.Metadata, now, now,
	)
	if err != nil {
		return fmt.Errorf("upsert memory doc: %w", err)
	}
	return nil
}

func (s *MySQLMemoryStore) Delete(ctx context.Context, workspaceID, id string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM memory_docs WHERE workspace_id = ? AND id = ?", workspaceID, id)
	if err != nil {
		return fmt.Errorf("delete memory doc: %w", err)
	}
	return nil
}
