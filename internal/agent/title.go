package agent

import (
	"strings"

	completionapi "gitlab.zalopay.vn/fin/lending/lending-claw/internal/completions"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

const sessionTitleMaxRunes = 80

func buildSessionTitleRequest(model, userMessage, assistantMessage string) completionapi.ChatCompletionRequest {
	temp := 0.2
	prompt := strings.TrimSpace(`Tóm tắt lượt trò chuyện sau thành một tiêu đề tiếng Việt ngắn gọn.
Chỉ trả về tiêu đề, không dùng dấu ngoặc kép, không giải thích.

Người dùng:
` + userMessage + `

AI:
` + assistantMessage)

	return completionapi.ChatCompletionRequest{
		Messages:    []providers.Message{{Role: "user", Content: prompt}},
		Model:       model,
		MaxTokens:   1024,
		Temperature: &temp,
	}
}

func cleanSessionTitle(raw string) string {
	title := strings.TrimSpace(raw)
	if idx := strings.IndexAny(title, "\r\n"); idx >= 0 {
		title = title[:idx]
	}
	title = strings.TrimSpace(title)
	title = strings.Trim(title, "\"'`“”‘’")
	title = strings.TrimSpace(title)
	if title == "" {
		return ""
	}

	runes := []rune(title)
	if len(runes) > sessionTitleMaxRunes {
		title = strings.TrimSpace(string(runes[:sessionTitleMaxRunes]))
	}
	return title
}

func shouldGenerateSessionTitle(title string) bool {
	title = strings.TrimSpace(title)
	return title == "" || title == store.DefaultSessionTitle
}
