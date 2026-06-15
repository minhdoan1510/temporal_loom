package cmd

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/spf13/cobra"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/config"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/memory"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/confluence"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/qdrant"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/translator"
)

// Collection presets: collection name → (spaceKey, rootPageTitle).
var collectionPresets = map[string]struct {
	Space string
	Page  string
}{
	"cash_loan_knowledge_base": {Space: "ZTM", Page: "[PCF-FS][Cash Loan] Knowledge base"},
}

func init() {
	rootCmd.AddCommand(indexCmd())
}

func indexCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "index",
		Short: "Index external data sources into vector store",
	}
	cmd.AddCommand(indexConfluenceCmd())
	return cmd
}

func indexConfluenceCmd() *cobra.Command {
	var (
		collection string
		space      string
		page       string
		chunkSize  int
		overlap    int
		reset      bool
	)

	cmd := &cobra.Command{
		Use:   "confluence",
		Short: "Index Confluence pages into Qdrant",
		Long: `Crawl a Confluence page tree (root + all descendants), chunk text with overlap,
embed via the configured embedding provider, and upsert into a Qdrant collection.

Presets (when --space/--page not provided):
  cash_loan_knowledge_base    → ZTM / "[PCF-FS][Cash Loan] Knowledge base"`,
		Example: `  lending-claw index confluence --collection cash_loan_knowledge_base --reset
  lending-claw index confluence --space ZTM --page "My Page" --collection MY_COLLECTION`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runIndexConfluence(collection, space, page, chunkSize, overlap, reset)
		},
	}

	cmd.Flags().StringVar(&collection, "collection", "cash_loan_knowledge_base", "Qdrant collection name")
	cmd.Flags().StringVar(&space, "space", "", "Confluence space key (uses preset if not specified)")
	cmd.Flags().StringVar(&page, "page", "", "Root page title (uses preset if not specified)")
	cmd.Flags().IntVar(&chunkSize, "chunk-size", 1000, "Chunk size in characters")
	cmd.Flags().IntVar(&overlap, "chunk-overlap", 200, "Overlap between chunks in characters")
	cmd.Flags().BoolVar(&reset, "reset", false, "Delete and recreate collection before indexing")

	return cmd
}

func runIndexConfluence(collection, space, page string, chunkSize, overlap int, reset bool) error {
	ctx := context.Background()

	// Load config
	cfg, err := config.Load(resolveConfigPath())
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	// Validate required config
	if cfg.Confluence.URL == "" {
		return fmt.Errorf("confluence.url is required in config")
	}
	if cfg.Confluence.APIKey == "" {
		return fmt.Errorf("confluence.api_key is required in config")
	}
	if cfg.Embedding.BaseURL == "" {
		return fmt.Errorf("embedding.base_url is required in config")
	}
	if cfg.Qdrant.Host == "" {
		return fmt.Errorf("qdrant.host is required in config")
	}

	// Apply presets if space/page not provided
	if space == "" || page == "" {
		preset, ok := collectionPresets[collection]
		if !ok && (space == "" || page == "") {
			return fmt.Errorf("no preset for collection %q — provide --space and --page", collection)
		}
		if space == "" {
			space = preset.Space
		}
		if page == "" {
			page = preset.Page
		}
	}

	slog.InfoContext(ctx, "confluence indexer",
		"collection", collection,
		"space", space,
		"page", page,
		"chunk_size", chunkSize,
		"chunk_overlap", overlap,
		"reset", reset,
	)

	// Build clients
	confluenceClient := confluence.NewConfluenceClient(cfg.Confluence)

	embProvider := memory.NewOpenAIEmbeddingProvider(
		"embedding",
		cfg.LLM.APIKey,
		cfg.Embedding.BaseURL,
		cfg.Embedding.Model,
	)

	qdrantClient := qdrant.NewQdrantClient(cfg.Qdrant, collection, embProvider)

	indexer := confluence.NewConfluenceIndexer(confluenceClient, embProvider, qdrantClient)

	// Wire translator for cross-lingual embedding (vi→en)
	if cfg.Translator.BaseURL != "" && cfg.Translator.Model != "" {
		apiKey := cfg.Translator.APIKey
		if apiKey == "" {
			apiKey = cfg.LLM.APIKey
		}
		translatorProvider := providers.NewOpenAIProvider("translator", apiKey, cfg.Translator.BaseURL, cfg.Translator.Model)
		indexer.SetTranslator(translator.NewTranslator(translatorProvider))
		slog.InfoContext(ctx, "query translator enabled for indexing", "model", cfg.Translator.Model)
	}

	result, err := indexer.Index(ctx, confluence.IndexRequest{
		SpaceKey:      space,
		RootPageTitle: page,
		Collection:    collection,
		ChunkSize:     chunkSize,
		ChunkOverlap:  overlap,
		Reset:         reset,
		VectorSize:    cfg.Embedding.VectorSize,
	})
	if err != nil {
		return fmt.Errorf("indexing failed: %w", err)
	}

	fmt.Printf("Done! Pages: %d, Chunks: %d, Points upserted: %d\n",
		result.TotalPages, result.TotalChunks, result.TotalPoints)
	return nil
}
