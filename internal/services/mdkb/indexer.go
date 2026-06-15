// Package mdkb indexes a markdown knowledge base document into Qdrant.
//
// Unlike the Confluence indexer, the source is a single markdown document whose
// raw text is stored on the knowledge base record. Each sync chunks that text,
// embeds it, and upserts the chunks into the workspace's shared Qdrant
// collection. Points are tagged with kb_id so a re-sync can cleanly replace this
// knowledge base's points without touching others in the same collection.
package mdkb

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/memory"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/qdrant"
)

// Indexer chunks markdown text, embeds it, and upserts to Qdrant.
type Indexer struct {
	embedding  memory.EmbeddingProvider
	qdrant     *qdrant.QdrantClient
	translator qdrant.QueryTranslator
}

// NewIndexer creates an indexer with the given clients.
func NewIndexer(embedding memory.EmbeddingProvider, qdrant *qdrant.QdrantClient) *Indexer {
	return &Indexer{embedding: embedding, qdrant: qdrant}
}

// SetTranslator sets the translator applied to chunk text before embedding.
// The original text is preserved in the Qdrant payload.
func (idx *Indexer) SetTranslator(t qdrant.QueryTranslator) {
	idx.translator = t
}

// IndexRequest configures a markdown indexing run.
type IndexRequest struct {
	KBID         string // knowledge base id, used as the point payload "kb_id"
	Title        string // knowledge base name, prepended as an H1
	Content      string // raw markdown document text
	Collection   string
	ChunkSize    int
	ChunkOverlap int
	VectorSize   int
}

// IndexResult summarizes the indexing run.
type IndexResult struct {
	TotalPages  int
	TotalChunks int
	TotalPoints int
}

const embeddingBatchSize = 32

// Index runs the full markdown → Qdrant indexing workflow.
func (idx *Indexer) Index(ctx context.Context, req IndexRequest) (*IndexResult, error) {
	if req.ChunkSize <= 0 {
		req.ChunkSize = 1000
	}
	if req.ChunkOverlap <= 0 {
		req.ChunkOverlap = 200
	}

	// Ensure the collection exists.
	if err := idx.qdrant.EnsureCollection(ctx, req.VectorSize); err != nil {
		return nil, fmt.Errorf("ensure collection: %w", err)
	}

	// Clear this knowledge base's previous points so a re-sync replaces them
	// cleanly (stale chunks are removed even if the document shrank).
	if err := idx.qdrant.DeletePointsByPayload(ctx, "kb_id", req.KBID); err != nil {
		slog.WarnContext(ctx, "delete previous kb points (may not exist)", "kb_id", req.KBID, "error", err)
	}

	text := strings.TrimSpace(req.Content)
	if text == "" {
		return &IndexResult{}, nil
	}
	text = fmt.Sprintf("# %s\n\n%s", req.Title, text)

	chunks := memory.ChunkTextWithOverlap(text, req.ChunkSize, req.ChunkOverlap)
	if len(chunks) == 0 {
		return &IndexResult{}, nil
	}

	result := &IndexResult{TotalPages: 1, TotalChunks: len(chunks)}

	for batchStart := 0; batchStart < len(chunks); batchStart += embeddingBatchSize {
		batchEnd := batchStart + embeddingBatchSize
		if batchEnd > len(chunks) {
			batchEnd = len(chunks)
		}
		batch := chunks[batchStart:batchEnd]

		// Collect texts for embedding; translate if a translator is configured.
		texts := make([]string, len(batch))
		for j, chunk := range batch {
			t := chunk.Text
			if idx.translator != nil {
				t = idx.translator.Translate(ctx, t)
			}
			texts[j] = t
		}

		embeddings, err := idx.embedding.Embed(ctx, texts)
		if err != nil {
			return nil, fmt.Errorf("embed batch: %w", err)
		}

		points := make([]qdrant.QdrantPoint, len(batch))
		for j, chunk := range batch {
			chunkIdx := batchStart + j
			// Qdrant requires UUID or uint64 IDs — use deterministic UUID v5.
			pointKey := fmt.Sprintf("%s_md_%s#%d", req.Collection, req.KBID, chunkIdx)
			pointID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(pointKey)).String()
			points[j] = qdrant.QdrantPoint{
				ID:     pointID,
				Vector: embeddings[j],
				Payload: map[string]interface{}{
					"kb_id":    req.KBID,
					"title":    req.Title,
					"source":   "markdown",
					"category": "general",
					"content":  chunk.Text,
				},
			}
		}

		if err := idx.qdrant.UpsertPoints(ctx, points); err != nil {
			return nil, fmt.Errorf("upsert points: %w", err)
		}
		result.TotalPoints += len(points)
	}

	slog.InfoContext(ctx, "markdown indexing complete",
		"kb_id", req.KBID,
		"chunks", result.TotalChunks,
		"points", result.TotalPoints,
	)
	return result, nil
}
