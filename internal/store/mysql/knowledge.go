package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// MySQLKnowledgeStore implements store.KnowledgeStore backed by MySQL.
type MySQLKnowledgeStore struct {
	db *sql.DB
}

func NewMySQLKnowledgeStore(db *sql.DB) *MySQLKnowledgeStore {
	return &MySQLKnowledgeStore{db: db}
}

const knowledgeCols = `id, name, collection, source, space_key, root_page, content,
	chunk_size, chunk_overlap, status, error_msg,
	total_pages, total_chunks, total_points, last_synced,
	created_by, created_at, updated_at`

func scanKnowledgeBase(row interface{ Scan(...any) error }) (store.KnowledgeBase, error) {
	var kb store.KnowledgeBase
	var content sql.NullString
	err := row.Scan(
		&kb.ID, &kb.Name, &kb.Collection, &kb.Source, &kb.SpaceKey, &kb.RootPage, &content,
		&kb.ChunkSize, &kb.ChunkOverlap, &kb.Status, &kb.ErrorMsg,
		&kb.TotalPages, &kb.TotalChunks, &kb.TotalPoints, &kb.LastSynced,
		&kb.CreatedBy, &kb.CreatedAt, &kb.UpdatedAt,
	)
	kb.Content = content.String
	return kb, err
}

func (s *MySQLKnowledgeStore) List(ctx context.Context, workspaceID string) ([]store.KnowledgeBase, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+knowledgeCols+` FROM knowledge_bases WHERE workspace_id = ? ORDER BY name`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list knowledge bases: %w", err)
	}
	defer rows.Close()

	var kbs []store.KnowledgeBase
	for rows.Next() {
		kb, err := scanKnowledgeBase(rows)
		if err != nil {
			return nil, fmt.Errorf("scan knowledge base: %w", err)
		}
		kbs = append(kbs, kb)
	}
	return kbs, rows.Err()
}

func (s *MySQLKnowledgeStore) Get(ctx context.Context, workspaceID, id string) (*store.KnowledgeBase, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+knowledgeCols+` FROM knowledge_bases WHERE workspace_id = ? AND id = ?`, workspaceID, id)
	kb, err := scanKnowledgeBase(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("knowledge base %q not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get knowledge base %q: %w", id, err)
	}
	return &kb, nil
}

func (s *MySQLKnowledgeStore) Create(ctx context.Context, workspaceID string, kb *store.KnowledgeBase) error {
	if kb.ID == "" {
		kb.ID = uuid.New().String()
	}
	if kb.Source == "" {
		kb.Source = "confluence"
	}
	if kb.Status == "" {
		kb.Status = "idle"
	}
	now := time.Now()
	kb.CreatedAt = now
	kb.UpdatedAt = now

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO knowledge_bases (id, workspace_id, name, collection, source, space_key, root_page, content,
			chunk_size, chunk_overlap, status, created_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		kb.ID, workspaceID, kb.Name, kb.Collection, kb.Source, kb.SpaceKey, kb.RootPage, kb.Content,
		kb.ChunkSize, kb.ChunkOverlap, kb.Status, kb.CreatedBy,
		kb.CreatedAt, kb.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create knowledge base: %w", err)
	}
	return nil
}

func (s *MySQLKnowledgeStore) Update(ctx context.Context, workspaceID string, kb *store.KnowledgeBase) error {
	kb.UpdatedAt = time.Now()
	_, err := s.db.ExecContext(ctx,
		`UPDATE knowledge_bases
		 SET name = ?, collection = ?, space_key = ?, root_page = ?, content = ?,
		     chunk_size = ?, chunk_overlap = ?, updated_at = ?
		 WHERE workspace_id = ? AND id = ?`,
		kb.Name, kb.Collection, kb.SpaceKey, kb.RootPage, kb.Content,
		kb.ChunkSize, kb.ChunkOverlap, kb.UpdatedAt, workspaceID, kb.ID,
	)
	if err != nil {
		return fmt.Errorf("update knowledge base: %w", err)
	}
	return nil
}

func (s *MySQLKnowledgeStore) Delete(ctx context.Context, workspaceID, id string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM knowledge_bases WHERE workspace_id = ? AND id = ?", workspaceID, id)
	if err != nil {
		return fmt.Errorf("delete knowledge base: %w", err)
	}
	return nil
}

func (s *MySQLKnowledgeStore) UpdateSyncStatus(ctx context.Context, workspaceID, id, status string, errorMsg *string, pages, chunks, points int) error {
	var lastSynced *time.Time
	if status == "done" {
		now := time.Now()
		lastSynced = &now
	}
	_, err := s.db.ExecContext(ctx,
		`UPDATE knowledge_bases
		 SET status = ?, error_msg = ?, total_pages = ?, total_chunks = ?, total_points = ?,
		     last_synced = ?, updated_at = NOW()
		 WHERE workspace_id = ? AND id = ?`,
		status, errorMsg, pages, chunks, points, lastSynced, workspaceID, id,
	)
	if err != nil {
		return fmt.Errorf("update sync status: %w", err)
	}
	return nil
}
