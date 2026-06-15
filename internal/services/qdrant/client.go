package qdrant

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/config"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/memory"
)

// KBSearchResult is a single knowledge base search result.
type KBSearchResult struct {
	Title    string  `json:"title"`
	Category string  `json:"category"`
	Source   string  `json:"source"`
	URL      string  `json:"url"`
	DocLink  string  `json:"doc_link"`
	Content  string  `json:"content"`
	Score    float64 `json:"score"`
}

// QueryTranslator translates queries (e.g. Vietnamese → English) before embedding.
type QueryTranslator interface {
	Translate(ctx context.Context, query string) string
}

// QdrantClient is a client for Qdrant vector search (knowledge base).
type QdrantClient struct {
	host           string
	port           int
	apiKey         string
	useTLS         bool
	collection     string
	embedding      memory.EmbeddingProvider
	scoreThreshold float64
	translator     QueryTranslator
	client         *http.Client
}

// NewQdrantClient creates a Qdrant client for knowledge base search.
func NewQdrantClient(cfg config.QdrantConfig, collection string, embedding memory.EmbeddingProvider) *QdrantClient {
	useTLS := cfg.Port == 443
	client := &http.Client{Timeout: 30 * time.Second}
	if useTLS {
		client.Transport = &http.Transport{
			TLSClientConfig: &tls.Config{},
		}
	}

	return &QdrantClient{
		host:           cfg.Host,
		port:           cfg.Port,
		apiKey:         cfg.APIKey,
		useTLS:         useTLS,
		collection:     collection,
		embedding:      embedding,
		scoreThreshold: cfg.ScoreThreshold,
		client:         client,
	}
}

// SetTranslator sets the query translator for cross-lingual search.
func (c *QdrantClient) SetTranslator(t QueryTranslator) {
	c.translator = t
}

// SearchKnowledge performs a vector similarity search on the client's default
// knowledge base collection.
func (c *QdrantClient) SearchKnowledge(ctx context.Context, query string, maxResults int) ([]KBSearchResult, error) {
	return c.SearchKnowledgeIn(ctx, c.collection, query, maxResults)
}

// SearchKnowledgeIn performs a vector similarity search on a specific
// collection. Used to search a workspace's knowledge bases by their own
// per-KB collection names.
func (c *QdrantClient) SearchKnowledgeIn(ctx context.Context, collection, query string, maxResults int) ([]KBSearchResult, error) {
	if collection == "" {
		collection = c.collection
	}
	if maxResults <= 0 {
		maxResults = 5
	}

	// Translate query if translator is configured
	if c.translator != nil {
		query = c.translator.Translate(ctx, query)
	}

	// Generate query embedding
	embeddings, err := c.embedding.Embed(ctx, []string{query})
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
	if c.scoreThreshold > 0 {
		searchBody["score_threshold"] = c.scoreThreshold
	}
	bodyJSON, _ := json.Marshal(searchBody)

	url := fmt.Sprintf("%s/collections/%s/points/search", c.baseURL(), collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	c.setHeaders(req)

	resp, err := c.client.Do(req)
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

	var results []KBSearchResult
	for _, r := range searchResp.Result {
		result := KBSearchResult{
			Score: r.Score,
		}
		if v, ok := r.Payload["title"].(string); ok {
			result.Title = v
		}
		if v, ok := r.Payload["category"].(string); ok {
			result.Category = v
		}
		if v, ok := r.Payload["source"].(string); ok {
			result.Source = v
		}
		if v, ok := r.Payload["url"].(string); ok {
			result.URL = v
		}
		if v, ok := r.Payload["doc_link"].(string); ok {
			result.DocLink = v
		}
		if v, ok := r.Payload["content"].(string); ok {
			result.Content = v
		}
		// Also check nested document field (some Qdrant collections store text in "document")
		if result.Content == "" {
			if v, ok := r.Payload["document"].(string); ok {
				result.Content = v
			}
		}
		results = append(results, result)
	}

	return results, nil
}

// QdrantPoint is a point to upsert into a Qdrant collection.
type QdrantPoint struct {
	ID      string                 `json:"id"`
	Vector  []float32              `json:"vector"`
	Payload map[string]interface{} `json:"payload"`
}

// EnsureCollection checks if the collection exists, creates it if not.
func (c *QdrantClient) EnsureCollection(ctx context.Context, vectorSize int) error {
	// Check if collection exists
	url := fmt.Sprintf("%s/collections/%s", c.baseURL(), c.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	c.setHeaders(req)

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("check collection: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return nil // already exists
	}

	// Create collection
	body := map[string]interface{}{
		"vectors": map[string]interface{}{
			"size":     vectorSize,
			"distance": "Cosine",
		},
	}
	bodyJSON, _ := json.Marshal(body)

	req, err = http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	c.setHeaders(req)

	resp, err = c.client.Do(req)
	if err != nil {
		return fmt.Errorf("create collection: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("create collection failed %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// DeleteCollection deletes the collection.
func (c *QdrantClient) DeleteCollection(ctx context.Context) error {
	url := fmt.Sprintf("%s/collections/%s", c.baseURL(), c.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	c.setHeaders(req)

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("delete collection: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete collection failed %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// UpsertPoints upserts a batch of points into the collection.
func (c *QdrantClient) UpsertPoints(ctx context.Context, points []QdrantPoint) error {
	body := map[string]interface{}{
		"points": points,
	}
	bodyJSON, _ := json.Marshal(body)

	url := fmt.Sprintf("%s/collections/%s/points?wait=true", c.baseURL(), c.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	c.setHeaders(req)

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("upsert points: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("upsert points failed %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// DeletePointsByPayload deletes all points whose payload field equals value.
// Used to clear a single knowledge base's points from a shared collection
// without dropping the whole collection.
func (c *QdrantClient) DeletePointsByPayload(ctx context.Context, field, value string) error {
	body := map[string]interface{}{
		"filter": map[string]interface{}{
			"must": []map[string]interface{}{
				{"key": field, "match": map[string]interface{}{"value": value}},
			},
		},
	}
	bodyJSON, _ := json.Marshal(body)

	url := fmt.Sprintf("%s/collections/%s/points/delete?wait=true", c.baseURL(), c.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	c.setHeaders(req)

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("delete points by payload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete points by payload failed %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// Collection returns the collection name.
func (c *QdrantClient) Collection() string {
	return c.collection
}

func (c *QdrantClient) baseURL() string {
	scheme := "http"
	if c.useTLS {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s:%d", scheme, c.host, c.port)
}

func (c *QdrantClient) setHeaders(req *http.Request) {
	if c.apiKey != "" {
		req.Header.Set("api-key", c.apiKey)
	}
}
