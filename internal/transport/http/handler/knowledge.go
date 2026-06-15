package handler

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/config"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/memory"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/confluence"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/mdkb"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/qdrant"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/translator"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/httputil"
)

// KnowledgeHandler handles knowledge base CRUD and sync endpoints.
type KnowledgeHandler struct {
	store      store.KnowledgeStore
	workspaces store.WorkspaceStore
	cfg        *config.Config
}

// NewKnowledgeHandler creates a KnowledgeHandler.
func NewKnowledgeHandler(s store.KnowledgeStore, workspaces store.WorkspaceStore, cfg *config.Config) *KnowledgeHandler {
	return &KnowledgeHandler{store: s, workspaces: workspaces, cfg: cfg}
}

// WorkspaceCollectionName returns the single Qdrant collection name for a
// workspace, derived from its (stable, unique) slug:
// "lending_agent_workspace_<slug with '-' replaced by '_'>".
func WorkspaceCollectionName(slug string) string {
	return "lending_agent_workspace_" + strings.ReplaceAll(slug, "-", "_")
}

// List returns all knowledge bases.
func (h *KnowledgeHandler) List(w http.ResponseWriter, r *http.Request) {
	kbs, err := h.store.List(r.Context(), httputil.WorkspaceFromContext(r.Context()))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list knowledge bases: "+err.Error())
		return
	}
	if kbs == nil {
		kbs = []store.KnowledgeBase{}
	}
	httputil.WriteJSON(w, http.StatusOK, kbs)
}

// Get returns a knowledge base by ID.
func (h *KnowledgeHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "knowledge base id is required")
		return
	}
	kb, err := h.store.Get(r.Context(), httputil.WorkspaceFromContext(r.Context()), id)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, kb)
}

// Create inserts a new knowledge base.
func (h *KnowledgeHandler) Create(w http.ResponseWriter, r *http.Request) {
	var kb store.KnowledgeBase
	if err := httputil.ReadJSON(r, &kb); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if kb.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if kb.Source == "" {
		kb.Source = "confluence"
	}
	switch kb.Source {
	case "markdown":
		if strings.TrimSpace(kb.Content) == "" {
			httputil.WriteError(w, http.StatusBadRequest, "content is required for markdown source")
			return
		}
		// Markdown KBs have no Confluence coordinates.
		kb.SpaceKey = ""
		kb.RootPage = ""
	case "confluence":
		if kb.SpaceKey == "" {
			httputil.WriteError(w, http.StatusBadRequest, "space_key is required")
			return
		}
		if kb.RootPage == "" {
			httputil.WriteError(w, http.StatusBadRequest, "root_page is required")
			return
		}
		kb.Content = ""
	default:
		httputil.WriteError(w, http.StatusBadRequest, "unsupported source: "+kb.Source)
		return
	}
	if kb.ChunkSize <= 0 {
		kb.ChunkSize = 1000
	}
	if kb.ChunkOverlap <= 0 {
		kb.ChunkOverlap = 200
	}

	// Collection is auto-generated per workspace (one collection per workspace);
	// any client-supplied value is ignored.
	ws, err := h.workspaces.Get(r.Context(), httputil.WorkspaceFromContext(r.Context()))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to resolve workspace: "+err.Error())
		return
	}
	kb.Collection = WorkspaceCollectionName(ws.Slug)

	if err := h.store.Create(r.Context(), httputil.WorkspaceFromContext(r.Context()), &kb); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create knowledge base: "+err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, kb)
}

// Update modifies a knowledge base.
func (h *KnowledgeHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "knowledge base id is required")
		return
	}
	var kb store.KnowledgeBase
	if err := httputil.ReadJSON(r, &kb); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	kb.ID = id

	// Collection is workspace-derived and immutable — keep the stored value
	// rather than whatever the client sent (or omitted).
	wsID := httputil.WorkspaceFromContext(r.Context())
	existing, err := h.store.Get(r.Context(), wsID, id)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	kb.Collection = existing.Collection

	if err := h.store.Update(r.Context(), wsID, &kb); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update knowledge base: "+err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, kb)
}

// Delete removes a knowledge base.
func (h *KnowledgeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "knowledge base id is required")
		return
	}
	if err := h.store.Delete(r.Context(), httputil.WorkspaceFromContext(r.Context()), id); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to delete knowledge base: "+err.Error())
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Sync triggers an asynchronous indexing run for a knowledge base.
func (h *KnowledgeHandler) Sync(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "knowledge base id is required")
		return
	}

	workspaceID := httputil.WorkspaceFromContext(r.Context())
	kb, err := h.store.Get(r.Context(), workspaceID, id)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	if kb.Status == "syncing" {
		httputil.WriteError(w, http.StatusConflict, "knowledge base is already syncing")
		return
	}

	// Validate required config. Embedding + Qdrant are needed for any source;
	// Confluence config only for the confluence source, content only for markdown.
	cfg := h.cfg
	if cfg.Embedding.BaseURL == "" {
		httputil.WriteError(w, http.StatusBadRequest, "embedding.base_url is required in config")
		return
	}
	if cfg.Qdrant.Host == "" {
		httputil.WriteError(w, http.StatusBadRequest, "qdrant.host is required in config")
		return
	}
	switch kb.Source {
	case "markdown":
		if strings.TrimSpace(kb.Content) == "" {
			httputil.WriteError(w, http.StatusBadRequest, "knowledge base has no content to sync")
			return
		}
	default: // confluence
		if cfg.Confluence.URL == "" || cfg.Confluence.APIKey == "" {
			httputil.WriteError(w, http.StatusBadRequest, "confluence config (url, api_key) is required")
			return
		}
	}

	reset := r.URL.Query().Get("reset") == "true"

	// Set status to syncing
	if err := h.store.UpdateSyncStatus(r.Context(), workspaceID, id, "syncing", nil, kb.TotalPages, kb.TotalChunks, kb.TotalPoints); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update status: "+err.Error())
		return
	}

	// Launch background sync
	go h.runSync(workspaceID, kb, reset)

	httputil.WriteJSON(w, http.StatusAccepted, map[string]string{"status": "syncing"})
}

func (h *KnowledgeHandler) runSync(workspaceID string, kb *store.KnowledgeBase, reset bool) {
	ctx := context.Background()
	cfg := h.cfg

	embProvider := memory.NewOpenAIEmbeddingProvider(
		"embedding",
		cfg.LLM.APIKey,
		cfg.Embedding.BaseURL,
		cfg.Embedding.Model,
	)
	qdrantClient := qdrant.NewQdrantClient(cfg.Qdrant, kb.Collection, embProvider)

	// Build the translator once; both indexers accept the same interface.
	var queryTranslator qdrant.QueryTranslator
	if cfg.Translator.BaseURL != "" && cfg.Translator.Model != "" {
		apiKey := cfg.Translator.APIKey
		if apiKey == "" {
			apiKey = cfg.LLM.APIKey
		}
		translatorProvider := providers.NewOpenAIProvider("translator", apiKey, cfg.Translator.BaseURL, cfg.Translator.Model)
		queryTranslator = translator.NewTranslator(translatorProvider)
	}

	var (
		result *mdkb.IndexResult
		err    error
	)

	switch kb.Source {
	case "markdown":
		indexer := mdkb.NewIndexer(embProvider, qdrantClient)
		if queryTranslator != nil {
			indexer.SetTranslator(queryTranslator)
		}
		result, err = indexer.Index(ctx, mdkb.IndexRequest{
			KBID:         kb.ID,
			Title:        kb.Name,
			Content:      kb.Content,
			Collection:   kb.Collection,
			ChunkSize:    kb.ChunkSize,
			ChunkOverlap: kb.ChunkOverlap,
			VectorSize:   cfg.Embedding.VectorSize,
		})
	default: // confluence
		confluenceClient := confluence.NewConfluenceClient(cfg.Confluence)
		indexer := confluence.NewConfluenceIndexer(confluenceClient, embProvider, qdrantClient)
		if queryTranslator != nil {
			indexer.SetTranslator(queryTranslator)
		}
		var cres *confluence.IndexResult
		cres, err = indexer.Index(ctx, confluence.IndexRequest{
			SpaceKey:      kb.SpaceKey,
			RootPageTitle: kb.RootPage,
			Collection:    kb.Collection,
			ChunkSize:     kb.ChunkSize,
			ChunkOverlap:  kb.ChunkOverlap,
			Reset:         reset,
			VectorSize:    cfg.Embedding.VectorSize,
		})
		if cres != nil {
			result = &mdkb.IndexResult{TotalPages: cres.TotalPages, TotalChunks: cres.TotalChunks, TotalPoints: cres.TotalPoints}
		}
	}

	if err != nil {
		errMsg := err.Error()
		slog.ErrorContext(ctx, "knowledge base sync failed", "kb_id", kb.ID, "error", errMsg)
		_ = h.store.UpdateSyncStatus(ctx, workspaceID, kb.ID, "error", &errMsg, 0, 0, 0)
		return
	}

	slog.InfoContext(ctx, "knowledge base sync completed",
		"kb_id", kb.ID,
		"pages", result.TotalPages,
		"chunks", result.TotalChunks,
		"points", result.TotalPoints,
	)
	_ = h.store.UpdateSyncStatus(ctx, workspaceID, kb.ID, "done", nil, result.TotalPages, result.TotalChunks, result.TotalPoints)
}
