package memory

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// QueryTranslator translates queries (e.g. Vietnamese → English) before embedding.
type QueryTranslator interface {
	Translate(ctx context.Context, query string) string
}

// ManagerConfig configures the memory manager.
type ManagerConfig struct {
	// Qdrant settings
	QdrantHost   string
	QdrantPort   int
	QdrantAPIKey string
	QdrantTLS    bool

	// Vector size from embedding model
	VectorSize int

	// Chunking
	MaxChunkLen int

	// Search
	MaxResults     int
	ScoreThreshold float64
}

// DefaultManagerConfig returns sensible defaults.
func DefaultManagerConfig() ManagerConfig {
	return ManagerConfig{
		QdrantHost:  "localhost",
		QdrantPort:  6333,
		VectorSize:  1024,
		MaxChunkLen: 1000,
		MaxResults:  6,
	}
}

// WorkspaceCollectionName returns the per-workspace Qdrant collection name for
// memory, derived from the workspace's (stable, unique) slug:
// "lending_memory_workspace_<slug with '-' replaced by '_'>". This mirrors the
// knowledge-base collection naming (lending_agent_workspace_<slug>) so memory
// is isolated per workspace, while a distinct prefix keeps memory vectors out
// of the knowledge-base collection.
func WorkspaceCollectionName(slug string) string {
	return "lending_memory_workspace_" + strings.ReplaceAll(slug, "-", "_")
}

// Manager coordinates memory indexing and search using MySQL + Qdrant.
//
// Memory is scoped per workspace: each workspace gets its own Qdrant collection
// (see WorkspaceCollectionName), resolved from the workspace slug. The slug→name
// mapping and the set of already-ensured collections are cached in-process.
type Manager struct {
	memStore   store.MemoryStore
	workspaces store.WorkspaceStore
	embedding  EmbeddingProvider
	translator QueryTranslator
	config     ManagerConfig
	client     *http.Client

	mu       sync.RWMutex
	collByWS map[string]string // workspaceID → collection name
	ensured  map[string]bool   // collection name → EnsureCollection done
}

// NewManager creates a memory manager.
func NewManager(cfg ManagerConfig, memStore store.MemoryStore, workspaces store.WorkspaceStore, embedding EmbeddingProvider) *Manager {
	client := &http.Client{}
	if cfg.QdrantTLS {
		client.Transport = &http.Transport{
			TLSClientConfig: &tls.Config{},
		}
	}

	return &Manager{
		memStore:   memStore,
		workspaces: workspaces,
		embedding:  embedding,
		config:     cfg,
		client:     client,
		collByWS:   make(map[string]string),
		ensured:    make(map[string]bool),
	}
}

// collectionFor resolves the Qdrant collection name for a workspace. An empty
// workspaceID falls back to the default workspace. Slugs are immutable, so the
// resolved name is cached per workspace to avoid a store lookup on every call.
func (m *Manager) collectionFor(ctx context.Context, workspaceID string) (string, error) {
	if workspaceID == "" {
		workspaceID = store.DefaultWorkspaceID
	}

	m.mu.RLock()
	name, ok := m.collByWS[workspaceID]
	m.mu.RUnlock()
	if ok {
		return name, nil
	}

	ws, err := m.workspaces.Get(ctx, workspaceID)
	if err != nil {
		return "", fmt.Errorf("resolve workspace %s: %w", workspaceID, err)
	}
	name = WorkspaceCollectionName(ws.Slug)

	m.mu.Lock()
	m.collByWS[workspaceID] = name
	m.mu.Unlock()
	return name, nil
}

// SetTranslator sets the query translator for cross-lingual search.
func (m *Manager) SetTranslator(t QueryTranslator) {
	m.translator = t
}

// qdrantURL returns the base URL for Qdrant REST API.
func (m *Manager) qdrantURL() string {
	scheme := "http"
	if m.config.QdrantTLS {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s:%d", scheme, m.config.QdrantHost, m.config.QdrantPort)
}

// EnsureCollection creates the workspace's Qdrant collection if it doesn't
// exist. Idempotent and cached: once a collection is ensured in this process,
// subsequent calls return immediately without hitting Qdrant.
func (m *Manager) EnsureCollection(ctx context.Context, workspaceID string) error {
	collection, err := m.collectionFor(ctx, workspaceID)
	if err != nil {
		return err
	}
	return m.ensureCollection(ctx, collection)
}

// ensureCollection creates the named Qdrant collection if it doesn't exist.
func (m *Manager) ensureCollection(ctx context.Context, collection string) error {
	m.mu.RLock()
	done := m.ensured[collection]
	m.mu.RUnlock()
	if done {
		return nil
	}

	url := fmt.Sprintf("%s/collections/%s", m.qdrantURL(), collection)

	// Check if collection exists
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	m.setQdrantHeaders(req)

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("check qdrant collection: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		// Collection exists — still (idempotently) ensure the payload index so
		// filter-deletes by doc_id work (collection uses on_disk_payload).
		m.ensurePayloadIndex(ctx, collection, "doc_id")
		m.markEnsured(collection)
		return nil
	}

	// Create collection
	body := map[string]interface{}{
		"vectors": map[string]interface{}{
			"size":     m.config.VectorSize,
			"distance": "Cosine",
		},
	}
	bodyJSON, _ := json.Marshal(body)

	req, err = http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	m.setQdrantHeaders(req)

	resp, err = m.client.Do(req)
	if err != nil {
		return fmt.Errorf("create qdrant collection: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("create qdrant collection failed %d: %s", resp.StatusCode, string(respBody))
	}

	slog.InfoContext(ctx, "qdrant collection created", "name", collection)
	m.ensurePayloadIndex(ctx, collection, "doc_id")
	m.markEnsured(collection)
	return nil
}

// markEnsured records that a collection has been ensured this process.
func (m *Manager) markEnsured(collection string) {
	m.mu.Lock()
	m.ensured[collection] = true
	m.mu.Unlock()
}

// ensurePayloadIndex creates a keyword payload index on the given field so it
// can be used in Qdrant filter conditions (required for filter-deletes when the
// collection stores payload on disk). Idempotent and non-fatal: if the index
// already exists or creation fails, it is logged and ignored.
func (m *Manager) ensurePayloadIndex(ctx context.Context, collection, field string) {
	body := map[string]interface{}{
		"field_name":   field,
		"field_schema": "keyword",
	}
	bodyJSON, _ := json.Marshal(body)

	url := fmt.Sprintf("%s/collections/%s/index?wait=true", m.qdrantURL(), collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(bodyJSON))
	if err != nil {
		slog.WarnContext(ctx, "qdrant: build payload index request failed", "field", field, "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	m.setQdrantHeaders(req)

	resp, err := m.client.Do(req)
	if err != nil {
		slog.WarnContext(ctx, "qdrant: create payload index failed", "field", field, "error", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		// Already-exists is fine; log at debug-ish warn for visibility.
		slog.WarnContext(ctx, "qdrant: payload index not created (may already exist)",
			"field", field, "status", resp.StatusCode, "body", string(respBody))
		return
	}
	slog.InfoContext(ctx, "qdrant payload index ensured", "field", field)
}

// IndexDocument chunks a memory document, generates embeddings, and stores
// vectors in the given workspace's Qdrant collection (created lazily if needed).
func (m *Manager) IndexDocument(ctx context.Context, workspaceID string, doc *store.MemoryDoc) error {
	if m.embedding == nil {
		slog.DebugContext(ctx, "no embedding provider, skipping vector indexing", "path", doc.Path)
		return nil
	}

	collection, err := m.collectionFor(ctx, workspaceID)
	if err != nil {
		return err
	}
	if err := m.ensureCollection(ctx, collection); err != nil {
		return fmt.Errorf("ensure collection: %w", err)
	}

	chunks := ChunkText(doc.Content, m.config.MaxChunkLen)
	if len(chunks) == 0 {
		return nil
	}

	// Collect texts for batch embedding
	texts := make([]string, len(chunks))
	for i, c := range chunks {
		texts[i] = c.Text
	}

	embeddings, err := m.embedding.Embed(ctx, texts)
	if err != nil {
		slog.WarnContext(ctx, "embedding generation failed", "path", doc.Path, "error", err)
		return fmt.Errorf("embed chunks: %w", err)
	}

	// Upsert points to Qdrant
	points := make([]map[string]interface{}, 0, len(chunks))
	for i, chunk := range chunks {
		if i >= len(embeddings) {
			break
		}
		// Qdrant point IDs must be an unsigned integer or a UUID. doc.ID is a
		// UUID, so "<uuid>#<i>" is rejected (400). Derive a deterministic UUIDv5
		// from "<doc.ID>#<i>" instead — stable across re-index, and per-doc
		// deletion still works via the doc_id payload filter.
		pointID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(fmt.Sprintf("%s#%d", doc.ID, i))).String()
		points = append(points, map[string]interface{}{
			"id":     pointID,
			"vector": embeddings[i],
			"payload": map[string]interface{}{
				"doc_id":     doc.ID,
				"path":       doc.Path,
				"scope":      doc.Scope,
				"user_id":    doc.UserID,
				"text":       chunk.Text,
				"start_line": chunk.StartLine,
				"end_line":   chunk.EndLine,
				"updated_at": doc.UpdatedAt.Format(time.RFC3339),
			},
		})
	}

	return m.upsertPoints(ctx, collection, points)
}

// Search performs a vector search over the given workspace's indexed memory.
func (m *Manager) Search(ctx context.Context, workspaceID, query string, maxResults int) ([]SearchResult, error) {
	if maxResults <= 0 {
		maxResults = m.config.MaxResults
	}

	if m.embedding == nil {
		return nil, fmt.Errorf("no embedding provider configured")
	}

	collection, err := m.collectionFor(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	// Translate query if translator is configured
	if m.translator != nil {
		query = m.translator.Translate(ctx, query)
	}

	// Generate query embedding
	embeddings, err := m.embedding.Embed(ctx, []string{query})
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}
	if len(embeddings) == 0 || len(embeddings[0]) == 0 {
		return nil, fmt.Errorf("empty embedding returned")
	}

	// Search Qdrant
	searchBody := map[string]interface{}{
		"vector":       embeddings[0],
		"limit":        maxResults,
		"with_payload": true,
	}
	if m.config.ScoreThreshold > 0 {
		searchBody["score_threshold"] = m.config.ScoreThreshold
	}
	bodyJSON, _ := json.Marshal(searchBody)

	url := fmt.Sprintf("%s/collections/%s/points/search", m.qdrantURL(), collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	m.setQdrantHeaders(req)

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("qdrant search: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant search failed %d: %s", resp.StatusCode, string(respBody))
	}

	var searchResp struct {
		Result []struct {
			Score   float64                `json:"score"`
			Payload map[string]interface{} `json:"payload"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, fmt.Errorf("decode qdrant response: %w", err)
	}

	var results []SearchResult
	for _, r := range searchResp.Result {
		result := SearchResult{
			Score: r.Score,
		}
		if v, ok := r.Payload["path"].(string); ok {
			result.Path = v
		}
		if v, ok := r.Payload["text"].(string); ok {
			result.Text = v
		}
		if v, ok := r.Payload["start_line"].(float64); ok {
			result.StartLine = int(v)
		}
		if v, ok := r.Payload["end_line"].(float64); ok {
			result.EndLine = int(v)
		}
		if v, ok := r.Payload["updated_at"].(string); ok {
			result.UpdatedAt = v
		}
		results = append(results, result)
	}

	return results, nil
}

// SearchResult is a single memory search result.
type SearchResult struct {
	Path      string  `json:"path"`
	Text      string  `json:"text"`
	StartLine int     `json:"start_line"`
	EndLine   int     `json:"end_line"`
	Score     float64 `json:"score"`
	UpdatedAt string  `json:"updated_at,omitempty"`
}

// DeleteDocumentVectors removes all vectors for a document from the given
// workspace's Qdrant collection.
func (m *Manager) DeleteDocumentVectors(ctx context.Context, workspaceID, docID string) error {
	collection, err := m.collectionFor(ctx, workspaceID)
	if err != nil {
		return err
	}

	filterBody := map[string]interface{}{
		"filter": map[string]interface{}{
			"must": []map[string]interface{}{
				{
					"key": "doc_id",
					"match": map[string]interface{}{
						"value": docID,
					},
				},
			},
		},
	}
	bodyJSON, _ := json.Marshal(filterBody)

	url := fmt.Sprintf("%s/collections/%s/points/delete?wait=true", m.qdrantURL(), collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	m.setQdrantHeaders(req)

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant delete: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("qdrant delete failed %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// GetDocument reads a memory document from the store, with optional line range extraction.
func (m *Manager) GetDocument(ctx context.Context, workspaceID, scope, userID, path string, fromLine, numLines int) (string, error) {
	doc, err := m.memStore.GetDocument(ctx, workspaceID, scope, userID, path)
	if err != nil {
		return "", err
	}

	return extractLines(doc.Content, fromLine, numLines), nil
}

// extractLines extracts a range of lines from content.
// fromLine is 1-indexed. If 0, starts from beginning. If numLines is 0, returns all.
func extractLines(content string, fromLine, numLines int) string {
	if fromLine <= 0 && numLines <= 0 {
		return content
	}

	lines := strings.Split(content, "\n")
	start := 0
	if fromLine > 0 {
		start = fromLine - 1
	}
	if start >= len(lines) {
		return ""
	}

	end := len(lines)
	if numLines > 0 && start+numLines < end {
		end = start + numLines
	}

	return strings.Join(lines[start:end], "\n")
}

// upsertPoints upserts a batch of points to Qdrant.
func (m *Manager) upsertPoints(ctx context.Context, collection string, points []map[string]interface{}) error {
	if len(points) == 0 {
		return nil
	}

	body := map[string]interface{}{
		"points": points,
	}
	bodyJSON, _ := json.Marshal(body)

	url := fmt.Sprintf("%s/collections/%s/points?wait=true", m.qdrantURL(), collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	m.setQdrantHeaders(req)

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant upsert: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("qdrant upsert failed %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// setQdrantHeaders sets the API key header if configured.
func (m *Manager) setQdrantHeaders(req *http.Request) {
	if m.config.QdrantAPIKey != "" {
		req.Header.Set("api-key", m.config.QdrantAPIKey)
	}
}
