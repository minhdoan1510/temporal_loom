package cmd

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/rbac"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/config"
	mcpmgr "gitlab.zalopay.vn/fin/lending/lending-claw/internal/mcp"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/memory"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
	qdrantsvc "gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/qdrant"
	translatorsvc "gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/translator"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/skills"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store/mysql"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
	knowledgetool "gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools/knowledge"
	memorytool "gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools/memorytools"
	skillsearchtool "gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools/skillsearch"
)

// AppDeps holds all shared application dependencies.
type AppDeps struct {
	Config      *config.Config
	DB          *sql.DB
	Stores      *store.Stores
	Provider    providers.Provider
	SkillsCache *skills.Cache
	MemManager  *memory.Manager
	ToolsReg    *tools.Registry
	MCPManager  *mcpmgr.Manager
	HasMemory   bool
	Enforcer    *rbac.Enforcer
}

// BuildDeps initializes all shared dependencies. The returned cleanup func
// must be called on shutdown (it closes DB, stops caches, etc.).
func BuildDeps(ctx context.Context) (*AppDeps, func(), error) {
	var cleanups []func()
	cleanup := func() {
		for i := len(cleanups) - 1; i >= 0; i-- {
			cleanups[i]()
		}
	}

	// 1. Load config
	cfgPath := resolveConfigPath()
	cfg, err := config.Load(cfgPath)
	if err != nil {
		return nil, nil, fmt.Errorf("load config: %w", err)
	}

	// 2. Validate required config
	if cfg.LLM.APIKey == "" {
		return nil, nil, fmt.Errorf("llm.api_key is required in config")
	}
	if cfg.LLM.Model == "" {
		return nil, nil, fmt.Errorf("LLM model is required (set llm.model in config)")
	}
	if cfg.MySQL.DSN == "" {
		return nil, nil, fmt.Errorf("mysql.dsn is required in config")
	}

	// 3. Open MySQL DB — ensure utf8mb4 charset
	dsn := cfg.MySQL.DSN
	if !strings.Contains(dsn, "charset=") {
		if strings.Contains(dsn, "?") {
			dsn += "&charset=utf8mb4"
		} else {
			dsn += "?charset=utf8mb4"
		}
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, nil, fmt.Errorf("open database: %w", err)
	}
	cleanups = append(cleanups, func() { db.Close() })

	if err := db.PingContext(ctx); err != nil {
		cleanup()
		return nil, nil, fmt.Errorf("database ping failed: %w", err)
	}

	// 4. Create stores
	stores := mysql.NewStores(db, cfg.Server.EncryptionKey)

	// 4b. Backfill legacy skills to the Claude-standard frontmatter model
	// (name/description live in SKILL.md frontmatter). Idempotent — runs before
	// the skills cache is built so it loads the migrated data.
	if bf, ok := stores.Skills.(interface {
		BackfillFrontmatter(context.Context) (int, error)
	}); ok {
		if n, err := bf.BackfillFrontmatter(ctx); err != nil {
			slog.WarnContext(ctx, "skill frontmatter backfill failed", "error", err)
		} else if n > 0 {
			slog.InfoContext(ctx, "skill frontmatter backfill complete", "updated", n)
		}
	}

	// 5. Seed context files. TODO: Uncomment this when we have a way to seed context files.
	// if err := bootstrap.SeedContextFiles(ctx, stores.ContextFiles); err != nil {
	// 	slog.Warn("failed to seed context files", "error", err)
	// }

	// 6. Build provider
	provider := providers.NewOpenAIProvider(
		cfg.LLM.Provider,
		cfg.LLM.APIKey,
		cfg.LLM.BaseURL,
		cfg.LLM.Model,
		providers.WithProxy(cfg.LLM.Proxy),
	)

	// 7. Build skills cache
	var skillsCache *skills.Cache
	if stores.Skills != nil {
		skillsCache = skills.NewCache(stores.Skills, cfg.Skills.CacheRefreshInterval)
		skillsCache.Start(ctx)
		cleanups = append(cleanups, func() { skillsCache.Stop() })
	}

	// 8. Build memory manager
	var memManager *memory.Manager
	hasMemory := false
	if cfg.Embedding.BaseURL != "" && cfg.Qdrant.Host != "" {
		memEmbProvider := memory.NewOpenAIEmbeddingProvider(
			"embedding",
			cfg.LLM.APIKey,
			cfg.Embedding.BaseURL,
			cfg.Embedding.Model,
		)

		memCfg := memory.ManagerConfig{
			QdrantHost:     cfg.Qdrant.Host,
			QdrantPort:     cfg.Qdrant.Port,
			QdrantAPIKey:   cfg.Qdrant.APIKey,
			QdrantTLS:      cfg.Qdrant.Port == 443,
			VectorSize:     cfg.Embedding.VectorSize,
			MaxChunkLen:    1000,
			MaxResults:     6,
			ScoreThreshold: cfg.Qdrant.ScoreThreshold,
		}

		memManager = memory.NewManager(memCfg, stores.Memory, stores.Workspaces, memEmbProvider)

		// Memory collections are per-workspace and created lazily on first write.
		// Ensure the default workspace's collection at boot to validate Qdrant
		// connectivity and gate the memory feature.
		if err := memManager.EnsureCollection(ctx, store.DefaultWorkspaceID); err != nil {
			slog.WarnContext(ctx, "failed to ensure qdrant collection, memory search may be unavailable", "error", err)
		} else {
			hasMemory = true
		}
	}

	// 9. Build embedding provider (shared between memory and KB)
	var embProvider memory.EmbeddingProvider
	if cfg.Embedding.BaseURL != "" {
		embProvider = memory.NewOpenAIEmbeddingProvider(
			"embedding",
			cfg.LLM.APIKey,
			cfg.Embedding.BaseURL,
			cfg.Embedding.Model,
		)
	}

	// 10. Build query translator (vi→en) for cross-lingual search
	var translator *translatorsvc.Translator
	if cfg.Translator.BaseURL != "" && cfg.Translator.Model != "" {
		apiKey := cfg.Translator.APIKey
		if apiKey == "" {
			apiKey = cfg.LLM.APIKey
		}
		translatorProvider := providers.NewOpenAIProvider("translator", apiKey, cfg.Translator.BaseURL, cfg.Translator.Model)
		translator = translatorsvc.NewTranslator(translatorProvider)
		slog.InfoContext(ctx, "query translator enabled", "model", cfg.Translator.Model)
	}

	// Inject translator into memory manager
	if memManager != nil && translator != nil {
		memManager.SetTranslator(translator)
	}

	// 11. Build tools registry — only platform tools register here.
	// Domain tools (jira/opensearch/loan) come from external MCP servers and
	// are registered by the MCP Manager after discovery (step 12 below).
	toolsReg := tools.NewRegistry()

	// Knowledge base search (Qdrant) — stays in-process because it shares
	// the embedding provider and Qdrant collection with the memory subsystem.
	if cfg.Qdrant.Host != "" && embProvider != nil {
		kbClient := qdrantsvc.NewQdrantClient(cfg.Qdrant, "cash_loan_knowledge_base", embProvider)
		if translator != nil {
			kbClient.SetTranslator(translator)
		}
		toolsReg.Register(knowledgetool.NewSearchKnowledgeTool(kbClient, stores.Knowledge))
	}

	// Skill tools
	if skillsCache != nil {
		toolsReg.Register(skillsearchtool.NewSkillSearchTool(skillsCache))
		toolsReg.Register(skillsearchtool.NewReadSkillTool(skillsCache, stores.Skills))
		toolsReg.Register(skillsearchtool.NewReadSkillFileTool(skillsCache, stores.Skills))
	}

	// Memory tools
	if memManager != nil && stores.Memory != nil {
		toolsReg.Register(memorytool.NewMemorySearchTool(memManager, stores.Memory))
		toolsReg.Register(memorytool.NewMemoryGetTool(memManager, stores.Memory))
		toolsReg.Register(memorytool.NewMemorySetTool(memManager, stores.Memory))
		toolsReg.Register(memorytool.NewMemoryDeleteTool(memManager, stores.Memory))
	}

	// 12. Build MCP manager (loads enabled mcp_servers, discovers tools, registers
	// RemoteTool adapters into toolsReg). Non-blocking — connect failures are
	// logged but never prevent startup.
	mcpManager := mcpmgr.NewManager(stores.MCPServers, toolsReg)
	// Load the cached function list from DB into the registry. No tools/list
	// call here — that only happens when admin clicks Refresh / saves a new
	// server. Startup stays fast and works offline.
	if err := mcpManager.LoadAll(ctx); err != nil {
		slog.WarnContext(ctx, "mcp.load_all_failed", "error", err)
	}
	cleanups = append(cleanups, mcpManager.CloseAll)

	// 13. Build RBAC enforcer
	var enforcer *rbac.Enforcer
	if cfg.RBAC.Enabled {
		enforcer, err = rbac.NewEnforcer(db)
		if err != nil {
			slog.WarnContext(ctx, "failed to create RBAC enforcer, RBAC disabled", "error", err)
		} else {
			slog.InfoContext(ctx, "RBAC enforcer enabled")
		}
	}

	return &AppDeps{
		Config:      cfg,
		DB:          db,
		Stores:      stores,
		Provider:    provider,
		SkillsCache: skillsCache,
		MemManager:  memManager,
		ToolsReg:    toolsReg,
		MCPManager:  mcpManager,
		HasMemory:   hasMemory,
		Enforcer:    enforcer,
	}, cleanup, nil
}
