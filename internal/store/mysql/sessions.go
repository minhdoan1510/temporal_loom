package mysql

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// MySQLSessionStore implements store.SessionStore backed by MySQL. The
// in-memory cache is keyed by (workspaceID, session_key).
type MySQLSessionStore struct {
	db    *sql.DB
	mu    sync.RWMutex
	cache map[string]*store.SessionData
}

func NewMySQLSessionStore(db *sql.DB) *MySQLSessionStore {
	return &MySQLSessionStore{
		db:    db,
		cache: make(map[string]*store.SessionData),
	}
}

// ck builds the composite cache key for a (workspace, session) pair.
func ck(workspaceID, key string) string {
	return workspaceID + "\x00" + key
}

func (s *MySQLSessionStore) GetOrCreate(workspaceID, key, createdBy, kind string) *store.SessionData {
	if kind == "" {
		kind = "user"
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	cacheKey := ck(workspaceID, key)
	if cached, ok := s.cache[cacheKey]; ok {
		// Backfill created_by if not set (pre-migration sessions)
		if cached.CreatedBy == "" && createdBy != "" {
			cached.CreatedBy = createdBy
		}
		if cached.Title == "" {
			cached.Title = store.DefaultSessionTitle
		}
		return cached
	}

	data := s.loadFromDB(workspaceID, key)
	if data != nil {
		if data.CreatedBy == "" && createdBy != "" {
			data.CreatedBy = createdBy
		}
		if data.Title == "" {
			data.Title = store.DefaultSessionTitle
		}
		s.cache[cacheKey] = data
		return data
	}

	now := time.Now()
	data = &store.SessionData{
		Key:       key,
		Title:     store.DefaultSessionTitle,
		CreatedBy: createdBy,
		Messages:  []providers.Message{},
		Created:   now,
		Updated:   now,
	}
	s.cache[cacheKey] = data

	msgsJSON, _ := json.Marshal([]providers.Message{})
	metaJSON := sessionMetadata(data)
	s.db.Exec(
		`INSERT INTO sessions (session_key, title, workspace_id, kind, created_by, history, metadata, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE session_key = session_key`,
		key, data.Title, workspaceID, kind, nilStr(createdBy), msgsJSON, metaJSON, now, now,
	)

	return data
}

// Get returns the session if it exists (cache or DB) without creating one.
func (s *MySQLSessionStore) Get(workspaceID, key string) (*store.SessionData, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cacheKey := ck(workspaceID, key)
	if cached, ok := s.cache[cacheKey]; ok {
		return cached, true
	}

	data := s.loadFromDB(workspaceID, key)
	if data == nil {
		return nil, false
	}
	s.cache[cacheKey] = data
	return data, true
}

func (s *MySQLSessionStore) AddMessage(workspaceID, key string, msg providers.Message) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data := s.getOrInit(workspaceID, key)
	data.Messages = append(data.Messages, msg)
	data.Updated = time.Now()
}

func (s *MySQLSessionStore) SetMessages(workspaceID, key string, msgs []providers.Message) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data := s.getOrInit(workspaceID, key)
	data.Messages = msgs
	data.Updated = time.Now()
}

func (s *MySQLSessionStore) SetTitle(workspaceID, key, title string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data := s.getOrInit(workspaceID, key)
	data.Title = title
	data.Updated = time.Now()
}

func (s *MySQLSessionStore) GetHistory(workspaceID, key string) []providers.Message {
	cacheKey := ck(workspaceID, key)
	s.mu.RLock()
	if data, ok := s.cache[cacheKey]; ok {
		msgs := make([]providers.Message, len(data.Messages))
		copy(msgs, data.Messages)
		s.mu.RUnlock()
		return msgs
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()

	// Double-check after acquiring write lock
	if data, ok := s.cache[cacheKey]; ok {
		msgs := make([]providers.Message, len(data.Messages))
		copy(msgs, data.Messages)
		return msgs
	}

	data := s.loadFromDB(workspaceID, key)
	if data == nil {
		return nil
	}
	s.cache[cacheKey] = data
	msgs := make([]providers.Message, len(data.Messages))
	copy(msgs, data.Messages)
	return msgs
}

func (s *MySQLSessionStore) GetSummary(workspaceID, key string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		return data.Summary
	}
	return ""
}

func (s *MySQLSessionStore) SetSummary(workspaceID, key, summary string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		data.Summary = summary
		data.Updated = time.Now()
	}
}

func (s *MySQLSessionStore) UpdateMetadata(workspaceID, key, model, provider, channel string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		if model != "" {
			data.Model = model
		}
		if provider != "" {
			data.Provider = provider
		}
		if channel != "" {
			data.Channel = channel
		}
	}
}

func (s *MySQLSessionStore) AccumulateTokens(workspaceID, key string, input, output int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		data.InputTokens += input
		data.OutputTokens += output
	}
}

func (s *MySQLSessionStore) IncrementCompaction(workspaceID, key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		data.CompactionCount++
	}
}

func (s *MySQLSessionStore) GetCompactionCount(workspaceID, key string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		return data.CompactionCount
	}
	return 0
}

func (s *MySQLSessionStore) TruncateHistory(workspaceID, key string, keepLast int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		if keepLast <= 0 {
			data.Messages = []providers.Message{}
		} else if len(data.Messages) > keepLast {
			data.Messages = data.Messages[len(data.Messages)-keepLast:]
		}
		data.Updated = time.Now()
	}
}

func (s *MySQLSessionStore) Reset(workspaceID, key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		data.Messages = []providers.Message{}
		data.Summary = ""
		data.Updated = time.Now()
	}
}

func (s *MySQLSessionStore) Delete(workspaceID, key string) error {
	s.mu.Lock()
	delete(s.cache, ck(workspaceID, key))
	s.mu.Unlock()

	_, err := s.db.Exec("DELETE FROM sessions WHERE workspace_id = ? AND session_key = ?", workspaceID, key)
	return err
}

func (s *MySQLSessionStore) List(workspaceID string, kind string) []store.SessionInfo {
	var rows *sql.Rows
	var err error
	if kind == "all" {
		rows, err = s.db.Query(
			`SELECT session_key, title, created_by, JSON_LENGTH(history), created_at, updated_at,
			        JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.agent_id'))
			 FROM sessions WHERE workspace_id = ? ORDER BY created_at DESC`, workspaceID)
	} else {
		rows, err = s.db.Query(
			`SELECT session_key, title, created_by, JSON_LENGTH(history), created_at, updated_at,
			        JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.agent_id'))
			 FROM sessions WHERE workspace_id = ? AND kind = ? ORDER BY created_at DESC`, workspaceID, kind)
	}
	if err != nil {
		slog.Error("session list query failed", "workspace_id", workspaceID, "kind", kind, "error", err)
		return []store.SessionInfo{}
	}
	defer rows.Close()

	result := make([]store.SessionInfo, 0)
	for rows.Next() {
		var key string
		var title sql.NullString
		var createdBy *string
		var msgCount int
		var createdAt, updatedAt time.Time
		var agentID sql.NullString
		if err := rows.Scan(&key, &title, &createdBy, &msgCount, &createdAt, &updatedAt, &agentID); err != nil {
			continue
		}
		displayTitle := title.String
		if !title.Valid || displayTitle == "" {
			displayTitle = store.DefaultSessionTitle
		}
		result = append(result, store.SessionInfo{
			Key:          key,
			Title:        displayTitle,
			CreatedBy:    derefStr(createdBy),
			AgentID:      agentID.String,
			MessageCount: msgCount,
			CreatedAt:    createdAt,
			UpdatedAt:    updatedAt,
		})
	}
	return result
}

func (s *MySQLSessionStore) Save(workspaceID, key string) error {
	cacheKey := ck(workspaceID, key)
	s.mu.RLock()
	data, ok := s.cache[cacheKey]
	if !ok {
		s.mu.RUnlock()
		return nil
	}
	// Snapshot under read lock
	snapshot := *data
	msgs := make([]providers.Message, len(data.Messages))
	copy(msgs, data.Messages)
	snapshot.Messages = msgs
	if len(data.ExtraMeta) > 0 {
		extra := make(map[string]string, len(data.ExtraMeta))
		for k, v := range data.ExtraMeta {
			extra[k] = v
		}
		snapshot.ExtraMeta = extra
	}
	s.mu.RUnlock()

	msgsJSON, _ := json.Marshal(snapshot.Messages)

	metaJSON := sessionMetadata(&snapshot)

	_, err := s.db.Exec(
		`UPDATE sessions SET
			title = ?, history = ?, summary = ?, metadata = ?,
			compaction_count = ?, created_by = COALESCE(created_by, ?), updated_at = ?
		 WHERE workspace_id = ? AND session_key = ?`,
		snapshot.Title, msgsJSON, nilStr(snapshot.Summary), metaJSON,
		snapshot.CompactionCount, nilStr(snapshot.CreatedBy), snapshot.Updated,
		workspaceID, key,
	)
	return err
}

func (s *MySQLSessionStore) SetLastPromptTokens(workspaceID, key string, tokens, msgCount int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		data.LastPromptTokens = tokens
		data.LastMessageCount = msgCount
	}
}

func (s *MySQLSessionStore) GetLastPromptTokens(workspaceID, key string) (tokens, msgCount int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		return data.LastPromptTokens, data.LastMessageCount
	}
	return 0, 0
}

func (s *MySQLSessionStore) GetMemoryFlushAt(workspaceID, key string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		return data.MemoryFlushAt
	}
	return 0
}

func (s *MySQLSessionStore) SetMemoryFlushAt(workspaceID, key string, compactionCount int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		data.MemoryFlushAt = compactionCount
	}
}

func (s *MySQLSessionStore) SetSessionMetaValue(workspaceID, key, metaKey, value string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, ok := s.cache[ck(workspaceID, key)]
	if !ok {
		return
	}
	if metaKey == "title" {
		data.Title = value
		data.Updated = time.Now()
		return
	}
	if data.ExtraMeta == nil {
		data.ExtraMeta = make(map[string]string)
	}
	data.ExtraMeta[metaKey] = value
	data.Updated = time.Now()
}

func (s *MySQLSessionStore) GetSessionMetaValue(workspaceID, key, metaKey string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if data, ok := s.cache[ck(workspaceID, key)]; ok {
		if metaKey == "title" {
			return data.Title
		}
		return data.ExtraMeta[metaKey]
	}
	return ""
}

// --- internal helpers ---

func (s *MySQLSessionStore) getOrInit(workspaceID, key string) *store.SessionData {
	cacheKey := ck(workspaceID, key)
	if data, ok := s.cache[cacheKey]; ok {
		return data
	}

	data := s.loadFromDB(workspaceID, key)
	if data != nil {
		s.cache[cacheKey] = data
		return data
	}

	now := time.Now()
	data = &store.SessionData{
		Key:      key,
		Title:    store.DefaultSessionTitle,
		Messages: []providers.Message{},
		Created:  now,
		Updated:  now,
	}
	s.cache[cacheKey] = data

	msgsJSON, _ := json.Marshal([]providers.Message{})
	metaJSON := sessionMetadata(data)
	s.db.Exec(
		`INSERT INTO sessions (session_key, title, workspace_id, kind, history, metadata, created_at, updated_at)
		 VALUES (?, ?, ?, 'user', ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE session_key = session_key`,
		key, data.Title, workspaceID, msgsJSON, metaJSON, now, now,
	)
	return data
}

func (s *MySQLSessionStore) loadFromDB(workspaceID, key string) *store.SessionData {
	var sessionKey string
	var title string
	var createdBy *string
	var msgsJSON []byte
	var summary *string
	var metadataJSON []byte
	var compactionCount int
	var createdAt, updatedAt time.Time

	err := s.db.QueryRow(
		`SELECT session_key, title, created_by, history, summary, metadata,
		 compaction_count, created_at, updated_at
		 FROM sessions WHERE workspace_id = ? AND session_key = ?`, workspaceID, key,
	).Scan(&sessionKey, &title, &createdBy, &msgsJSON, &summary, &metadataJSON,
		&compactionCount, &createdAt, &updatedAt)
	if err != nil {
		return nil
	}

	var msgs []providers.Message
	json.Unmarshal(msgsJSON, &msgs)

	data := &store.SessionData{
		Key:             sessionKey,
		Title:           title,
		CreatedBy:       derefStr(createdBy),
		Messages:        msgs,
		Summary:         derefStr(summary),
		CompactionCount: compactionCount,
		Created:         createdAt,
		Updated:         updatedAt,
	}
	if data.Title == "" {
		data.Title = store.DefaultSessionTitle
	}

	// Parse metadata JSON
	if len(metadataJSON) > 0 {
		var meta map[string]interface{}
		if json.Unmarshal(metadataJSON, &meta) == nil {
			reserved := map[string]struct{}{
				"model": {}, "provider": {}, "channel": {},
				"title": {}, "input_tokens": {}, "output_tokens": {}, "agent_id": {},
			}
			if v, ok := meta["model"].(string); ok {
				data.Model = v
			}
			if v, ok := meta["provider"].(string); ok {
				data.Provider = v
			}
			if v, ok := meta["channel"].(string); ok {
				data.Channel = v
			}
			if v, ok := meta["agent_id"].(string); ok {
				data.AgentID = v
			}
			if v, ok := meta["title"].(string); ok && data.Title == store.DefaultSessionTitle && v != "" {
				data.Title = v
			}
			if v, ok := meta["input_tokens"].(float64); ok {
				data.InputTokens = int64(v)
			}
			if v, ok := meta["output_tokens"].(float64); ok {
				data.OutputTokens = int64(v)
			}
			for k, v := range meta {
				if _, isReserved := reserved[k]; isReserved {
					continue
				}
				if s, ok := v.(string); ok {
					if data.ExtraMeta == nil {
						data.ExtraMeta = make(map[string]string)
					}
					data.ExtraMeta[k] = s
				}
			}
		}
	}

	return data
}

func sessionMetadata(data *store.SessionData) []byte {
	meta := map[string]interface{}{
		"model":         data.Model,
		"provider":      data.Provider,
		"channel":       data.Channel,
		"title":         data.Title,
		"input_tokens":  data.InputTokens,
		"output_tokens": data.OutputTokens,
		"agent_id":      data.AgentID,
	}
	for k, v := range data.ExtraMeta {
		if _, reserved := meta[k]; reserved {
			continue
		}
		meta[k] = v
	}
	metaJSON, _ := json.Marshal(meta)
	return metaJSON
}
