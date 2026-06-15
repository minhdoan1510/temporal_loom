package skills

import (
	"context"
	"log/slog"
	"math"
	"strings"
	"sync"
	"unicode"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// SearchResult is a single result from a skill search.
type SearchResult struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Score       float64 `json:"score"`
}

// skillDoc is an internal representation of a skill document for BM25 scoring.
type skillDoc struct {
	skill  store.Skill
	tokens []string // pre-tokenized search text (lowercased)
}

// scored pairs a document with its BM25 relevance score.
type scored struct {
	doc   skillDoc
	score float64
}

// Index is an in-memory BM25 index for skill search.
type Index struct {
	mu    sync.RWMutex
	docs  []skillDoc
	df    map[string]int // document frequency: term -> number of docs containing it
	avgDL float64        // average document length (in tokens)
	k1    float64        // BM25 term frequency saturation (default 1.2)
	b     float64        // BM25 length normalization (default 0.75)
}

// NewIndex creates a new empty skill search index.
func NewIndex() *Index {
	return &Index{
		df: make(map[string]int),
		k1: 1.2,
		b:  0.75,
	}
}

// Build indexes a list of skills for BM25 search.
func (idx *Index) Build(skills []store.Skill) {
	idx.mu.Lock()
	defer idx.mu.Unlock()

	idx.docs = make([]skillDoc, 0, len(skills))
	idx.df = make(map[string]int)

	totalTokens := 0

	for _, s := range skills {
		searchText := s.Name + " " + s.Description
		tokens := tokenize(searchText)

		idx.docs = append(idx.docs, skillDoc{
			skill:  s,
			tokens: tokens,
		})

		// Count document frequency (unique terms per document)
		seen := make(map[string]bool)
		for _, t := range tokens {
			if !seen[t] {
				idx.df[t]++
				seen[t] = true
			}
		}

		totalTokens += len(tokens)
	}

	if len(idx.docs) > 0 {
		idx.avgDL = float64(totalTokens) / float64(len(idx.docs))
	}
}

// Search performs a BM25 search over the indexed skills.
// Returns up to maxResults results sorted by relevance score (highest first).
func (idx *Index) Search(ctx context.Context, query string, maxResults int) []SearchResult {
	if maxResults <= 0 {
		maxResults = 5
	}

	queryTokens := tokenize(query)
	if len(queryTokens) == 0 {
		return nil
	}

	idx.mu.RLock()
	defer idx.mu.RUnlock()

	if len(idx.docs) == 0 {
		return nil
	}

	N := float64(len(idx.docs))

	var results []scored

	for _, doc := range idx.docs {
		score := 0.0
		dl := float64(len(doc.tokens))

		// Count term frequencies in this document
		tf := make(map[string]int)
		for _, t := range doc.tokens {
			tf[t]++
		}

		for _, qt := range queryTokens {
			termFreq := float64(tf[qt])
			if termFreq == 0 {
				continue
			}

			// IDF: log((N - df + 0.5) / (df + 0.5) + 1)
			dfTerm := float64(idx.df[qt])
			idf := math.Log((N-dfTerm+0.5)/(dfTerm+0.5) + 1)

			// BM25: IDF * tf * (k1+1) / (tf + k1 * (1 - b + b * dl/avgdl))
			numerator := termFreq * (idx.k1 + 1)
			denominator := termFreq + idx.k1*(1-idx.b+idx.b*dl/idx.avgDL)
			score += idf * numerator / denominator
		}

		if score > 0 {
			results = append(results, scored{doc: doc, score: score})
		}
	}

	// Sort by score descending (insertion sort for small N)
	for i := 1; i < len(results); i++ {
		key := results[i]
		j := i - 1
		for j >= 0 && results[j].score < key.score {
			results[j+1] = results[j]
			j--
		}
		results[j+1] = key
	}

	if len(results) > maxResults {
		results = results[:maxResults]
	}

	out := make([]SearchResult, len(results))
	for i, r := range results {
		out[i] = SearchResult{
			Name:        r.doc.skill.Name,
			Description: r.doc.skill.Description,
			Score:       r.score,
		}
	}
	slog.InfoContext(ctx, "--------skill search results", "query", query, "results", out)
	return out
}

// Count returns the number of indexed documents.
func (idx *Index) Count() int {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	return len(idx.docs)
}

// tokenize splits text into lowercase tokens, removing punctuation.
func tokenize(text string) []string {
	lower := strings.ToLower(text)

	cleaned := strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return r
		}
		return ' '
	}, lower)

	fields := strings.Fields(cleaned)

	// Filter out very short tokens (1 char)
	var tokens []string
	for _, f := range fields {
		if len(f) > 1 {
			tokens = append(tokens, f)
		}
	}
	return tokens
}
