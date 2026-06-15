package confluence

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/memory"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/qdrant"
)

// ConfluenceIndexer crawls Confluence pages, chunks text, embeds, and upserts to Qdrant.
type ConfluenceIndexer struct {
	confluence *ConfluenceClient
	embedding  memory.EmbeddingProvider
	qdrant     *qdrant.QdrantClient
	translator qdrant.QueryTranslator
}

// SetTranslator sets the query translator used to translate chunks before embedding.
// Original content is preserved in the Qdrant payload; only the embedding input is translated.
func (idx *ConfluenceIndexer) SetTranslator(t qdrant.QueryTranslator) {
	idx.translator = t
}

// NewConfluenceIndexer creates an indexer with the given clients.
func NewConfluenceIndexer(confluence *ConfluenceClient, embedding memory.EmbeddingProvider, qdrant *qdrant.QdrantClient) *ConfluenceIndexer {
	return &ConfluenceIndexer{
		confluence: confluence,
		embedding:  embedding,
		qdrant:     qdrant,
	}
}

// IndexRequest configures a Confluence indexing run.
type IndexRequest struct {
	SpaceKey      string
	RootPageTitle string
	Collection    string // Qdrant collection name e.g. "cash_loan_knowledge_base"
	ChunkSize     int    // default 1000
	ChunkOverlap  int    // default 200
	Reset         bool
	VectorSize    int
}

// IndexResult summarizes the indexing run.
type IndexResult struct {
	TotalPages  int
	TotalChunks int
	TotalPoints int
}

const embeddingBatchSize = 32

// Index runs the full Confluence → Qdrant indexing workflow.
func (idx *ConfluenceIndexer) Index(ctx context.Context, req IndexRequest) (*IndexResult, error) {
	if req.ChunkSize <= 0 {
		req.ChunkSize = 1000
	}
	if req.ChunkOverlap <= 0 {
		req.ChunkOverlap = 200
	}

	// 1. Find root page
	slog.InfoContext(ctx, "finding root page", "space", req.SpaceKey, "title", req.RootPageTitle)
	rootPage, err := idx.confluence.GetPageByTitle(ctx, req.SpaceKey, req.RootPageTitle)
	if err != nil {
		return nil, fmt.Errorf("find root page: %w", err)
	}
	slog.InfoContext(ctx, "found root page", "id", rootPage.ID, "title", rootPage.Title)

	// 2. Fetch all descendants
	slog.InfoContext(ctx, "fetching all descendant pages")
	descendants, err := idx.confluence.GetAllDescendants(ctx, rootPage.ID)
	if err != nil {
		return nil, fmt.Errorf("fetch descendants: %w", err)
	}

	allPages := append([]*ConfluencePage{rootPage}, descendants...)
	slog.InfoContext(ctx, "total pages found", "count", len(allPages))

	// 3. Reset collection if requested
	if req.Reset {
		slog.InfoContext(ctx, "resetting collection", "collection", req.Collection)
		if err := idx.qdrant.DeleteCollection(ctx); err != nil {
			slog.WarnContext(ctx, "delete collection (may not exist)", "error", err)
		}
	}

	// 4. Ensure collection exists
	if err := idx.qdrant.EnsureCollection(ctx, req.VectorSize); err != nil {
		return nil, fmt.Errorf("ensure collection: %w", err)
	}

	// 5. Process each page
	result := &IndexResult{TotalPages: len(allPages)}

	for i, page := range allPages {
		slog.InfoContext(ctx, "indexing page", "index", i+1, "total", len(allPages), "title", page.Title, "id", page.ID)

		// HTML → text
		text := htmlToText(page.Body)
		if strings.TrimSpace(text) == "" {
			slog.DebugContext(ctx, "skip empty page", "title", page.Title)
			continue
		}

		// Prepend title
		text = fmt.Sprintf("# %s\n\n%s", page.Title, text)

		// Chunk with overlap
		chunks := memory.ChunkTextWithOverlap(text, req.ChunkSize, req.ChunkOverlap)
		if len(chunks) == 0 {
			continue
		}
		result.TotalChunks += len(chunks)

		// Build labels string
		labelsStr := strings.Join(page.Labels, ",")
		category := "general"
		if len(page.Labels) > 0 {
			category = page.Labels[0]
		}

		// Batch embed and upsert
		for batchStart := 0; batchStart < len(chunks); batchStart += embeddingBatchSize {
			batchEnd := batchStart + embeddingBatchSize
			if batchEnd > len(chunks) {
				batchEnd = len(chunks)
			}
			batch := chunks[batchStart:batchEnd]

			// Collect texts for embedding; translate if translator is configured
			texts := make([]string, len(batch))
			for j, chunk := range batch {
				t := chunk.Text
				if idx.translator != nil {
					t = idx.translator.Translate(ctx, t)
				}
				texts[j] = t
			}

			// Embed batch (using translated texts)
			embeddings, err := idx.embedding.Embed(ctx, texts)
			if err != nil {
				return nil, fmt.Errorf("embed batch for page %s: %w", page.ID, err)
			}

			// Build Qdrant points
			points := make([]qdrant.QdrantPoint, len(batch))
			for j, chunk := range batch {
				chunkIdx := batchStart + j
				// Qdrant requires UUID or uint64 IDs — use deterministic UUID v5
				pointKey := fmt.Sprintf("%s_%s#%d", req.Collection, page.ID, chunkIdx)
				pointID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(pointKey)).String()
				points[j] = qdrant.QdrantPoint{
					ID:     pointID,
					Vector: embeddings[j],
					Payload: map[string]interface{}{
						"page_id":  page.ID,
						"title":    page.Title,
						"space":    page.SpaceKey,
						"url":      page.URL,
						"labels":   labelsStr,
						"category": category,
						"source":   "confluence",
						"content":  chunk.Text,
					},
				}
			}

			// Upsert
			if err := idx.qdrant.UpsertPoints(ctx, points); err != nil {
				return nil, fmt.Errorf("upsert points for page %s: %w", page.ID, err)
			}
			result.TotalPoints += len(points)
		}
	}

	slog.InfoContext(ctx, "indexing complete",
		"pages", result.TotalPages,
		"chunks", result.TotalChunks,
		"points", result.TotalPoints,
	)
	return result, nil
}
