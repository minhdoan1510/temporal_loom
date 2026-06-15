package translator

import (
	"context"
	"log/slog"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
)

// Translator translates queries from Vietnamese to English using an LLM.
// It implements memory.QueryTranslator and qdrant.QueryTranslator.
type Translator struct {
	provider providers.Provider
}

// NewTranslator creates a new translator backed by the given LLM provider.
func NewTranslator(provider providers.Provider) *Translator {
	return &Translator{provider: provider}
}

const translatorSystemPrompt = `You are a translator. Translate the following Vietnamese text to English.
Rules:
- Return ONLY the English translation, nothing else
- Keep technical terms, codes, ticket IDs, and proper nouns unchanged
- If the text is already in English, return it as-is
- Do not add explanations or notes`

// Translate translates a query to English. If the query contains no Vietnamese
// characters or if translation fails, the original query is returned.
func (t *Translator) Translate(ctx context.Context, query string) string {
	if !containsVietnamese(query) {
		return query
	}

	temp := float64(0)
	resp, err := t.provider.Chat(ctx, providers.ChatRequest{
		Messages: []providers.Message{
			{Role: "system", Content: translatorSystemPrompt},
			{Role: "user", Content: query},
		},
		Options: providers.ChatOptions{
			MaxTokens:   16384,
			Temperature: &temp,
		},
	})
	if err != nil {
		slog.WarnContext(ctx, "query translation failed, using original", "error", err, "query", query)
		return query
	}

	translated := strings.TrimSpace(resp.Content)
	if translated == "" {
		return query
	}

	slog.InfoContext(ctx, "query translated", "original", query, "translated", translated)
	return translated
}

// containsVietnamese checks if a string contains Vietnamese-specific Unicode characters.
// Checks for: Đ/đ, horn vowels (Ơ/ơ/Ư/ư), and Latin Extended Additional block
// characters with Vietnamese diacritics (U+1EA0-U+1EF9).
func containsVietnamese(s string) bool {
	for _, r := range s {
		if r == 'Đ' || r == 'đ' {
			return true
		}
		if r == 'Ơ' || r == 'ơ' || r == 'Ư' || r == 'ư' {
			return true
		}
		// Latin Extended Additional: Vietnamese-specific precomposed chars
		// (ạ, ả, ấ, ầ, ẩ, ẫ, ậ, ắ, ằ, ẳ, ẵ, ặ, ẹ, ẻ, ẽ, ế, ề, ...)
		if r >= 0x1EA0 && r <= 0x1EF9 {
			return true
		}
	}
	return false
}
