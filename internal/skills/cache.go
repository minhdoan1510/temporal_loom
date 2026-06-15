package skills

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// wsEntry holds one workspace's cached skills and BM25 index.
type wsEntry struct {
	skills []store.Skill
	index  *Index
}

// Cache provides an in-memory, per-workspace cache of skills with BM25 search.
// Each workspace has its own skill corpus and index. Entries are loaded lazily
// on first access and refreshed periodically.
type Cache struct {
	store    store.SkillStore
	interval time.Duration

	mu      sync.RWMutex
	entries map[string]*wsEntry // by workspace id

	version atomic.Int64 // incremented on each refresh
	cancel  context.CancelFunc
}

// NewCache creates a new skill cache that refreshes from the store.
func NewCache(skillStore store.SkillStore, refreshInterval time.Duration) *Cache {
	if refreshInterval <= 0 {
		refreshInterval = 5 * time.Minute
	}

	return &Cache{
		store:    skillStore,
		interval: refreshInterval,
		entries:  make(map[string]*wsEntry),
	}
}

// Start begins periodic refresh of all loaded workspace entries.
func (c *Cache) Start(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	c.cancel = cancel

	go func() {
		ticker := time.NewTicker(c.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				c.refreshAll(ctx)
			}
		}
	}()
}

// Stop stops the periodic refresh.
func (c *Cache) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

func wsOrDefault(workspaceID string) string {
	if workspaceID == "" {
		return store.DefaultWorkspaceID
	}
	return workspaceID
}

// load fetches a single workspace's skills and rebuilds its index.
func (c *Cache) load(ctx context.Context, workspaceID string) *wsEntry {
	skills, err := c.store.List(ctx, workspaceID)
	if err != nil {
		slog.WarnContext(ctx, "failed to load skills for workspace", "workspace", workspaceID, "error", err)
		skills = nil
	}
	idx := NewIndex()
	idx.Build(skills)
	e := &wsEntry{skills: skills, index: idx}

	c.mu.Lock()
	c.entries[workspaceID] = e
	c.mu.Unlock()
	c.version.Add(1)
	return e
}

// refreshAll reloads every previously-accessed workspace entry.
func (c *Cache) refreshAll(ctx context.Context) {
	c.mu.RLock()
	ids := make([]string, 0, len(c.entries))
	for id := range c.entries {
		ids = append(ids, id)
	}
	c.mu.RUnlock()

	for _, id := range ids {
		c.load(ctx, id)
	}
}

// get returns the entry for a workspace, loading it lazily if absent.
func (c *Cache) get(ctx context.Context, workspaceID string) *wsEntry {
	workspaceID = wsOrDefault(workspaceID)
	c.mu.RLock()
	e, ok := c.entries[workspaceID]
	c.mu.RUnlock()
	if ok {
		return e
	}
	return c.load(ctx, workspaceID)
}

// Search performs a BM25 search over the workspace's cached skills.
func (c *Cache) Search(ctx context.Context, workspaceID, query string, maxResults int) []SearchResult {
	return c.get(ctx, workspaceID).index.Search(ctx, query, maxResults)
}

// Get returns a skill by name from the workspace's cache.
func (c *Cache) Get(ctx context.Context, workspaceID, name string) (*store.Skill, bool) {
	e := c.get(ctx, workspaceID)
	c.mu.RLock()
	defer c.mu.RUnlock()
	for i := range e.skills {
		if e.skills[i].Name == name {
			sk := e.skills[i]
			return &sk, true
		}
	}
	return nil, false
}

// List returns all cached skills for a workspace.
func (c *Cache) List(ctx context.Context, workspaceID string) []store.Skill {
	e := c.get(ctx, workspaceID)
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]store.Skill, len(e.skills))
	copy(out, e.skills)
	return out
}

// Count returns the number of cached skills for a workspace.
func (c *Cache) Count(ctx context.Context, workspaceID string) int {
	e := c.get(ctx, workspaceID)
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(e.skills)
}

// Version returns the current cache version (incremented on each refresh).
func (c *Cache) Version() int64 {
	return c.version.Load()
}

// BuildSummary generates an XML summary of available skills for the system
// prompt of the given workspace. If the number of skills exceeds maxInline,
// returns empty string (use skill_search instead).
func (c *Cache) BuildSummary(ctx context.Context, workspaceID string, maxInline int) string {
	e := c.get(ctx, workspaceID)
	c.mu.RLock()
	skills := e.skills
	c.mu.RUnlock()

	if len(skills) == 0 {
		return ""
	}

	if maxInline <= 0 {
		maxInline = 20
	}

	// Estimate tokens: ~4 chars per token
	totalChars := 0
	for _, s := range skills {
		totalChars += len(s.Name) + len(s.Description) + 50 // overhead per skill
	}
	estimatedTokens := totalChars / 4

	// If too many skills or too large, defer to skill_search
	if len(skills) > maxInline || estimatedTokens > 3500 {
		return ""
	}

	var b strings.Builder
	b.WriteString("<available_skills>\n")
	for _, s := range skills {
		b.WriteString(fmt.Sprintf("  <skill name=%q>%s</skill>\n", s.Name, s.Description))
	}
	b.WriteString("</available_skills>")

	return b.String()
}

// Refresh forces an immediate reload of a single workspace's skills.
func (c *Cache) Refresh(ctx context.Context, workspaceID string) {
	c.load(ctx, wsOrDefault(workspaceID))
}
