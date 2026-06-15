package agent

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
)

// compactMessagesInPlace summarizes the first ~70% of messages into a condensed
// summary, keeping the last ~30% intact. Operates purely on the local messages
// slice — no session state touched, no locks needed.
// Returns nil on failure (caller keeps original messages).
func (l *Loop) compactMessagesInPlace(ctx context.Context, messages []providers.Message) []providers.Message {
	if len(messages) < 6 {
		return nil
	}

	keepCount := 4
	if minKeep := len(messages) * 3 / 10; minKeep > keepCount {
		keepCount = minKeep
	}

	splitIdx := len(messages) - keepCount

	// Walk backward from splitIdx to find a clean boundary —
	// avoid splitting tool_use → tool_result pairs.
	for splitIdx > 0 {
		m := messages[splitIdx]
		if m.Role == "tool" || (m.Role == "assistant" && len(m.ToolCalls) > 0) {
			splitIdx--
			continue
		}
		break
	}
	if splitIdx <= 1 {
		return nil
	}

	toSummarize := messages[:splitIdx]
	var sb strings.Builder
	for _, m := range toSummarize {
		switch m.Role {
		case "user":
			fmt.Fprintf(&sb, "user: %s\n", m.Content)
		case "assistant":
			fmt.Fprintf(&sb, "assistant: %s\n", SanitizeAssistantContent(ctx, m.Content))
		}
	}

	sctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	inTokens := estimateSummaryInputTokens(toSummarize)
	maxOut := dynamicSummaryMax(inTokens)
	slog.InfoContext(ctx, "compact_budget",
		"agent", l.id, "in_tokens", inTokens, "out_tokens", maxOut)

	temp := 0.3
	resp, err := l.provider.Chat(sctx, providers.ChatRequest{
		Messages: []providers.Message{{
			Role:    "user",
			Content: compactionSummaryPrompt + sb.String(),
		}},
		Model: l.model,
		Options: providers.ChatOptions{
			MaxTokens:   maxOut,
			Temperature: &temp,
		},
	})
	if err != nil {
		slog.WarnContext(ctx, "mid_loop_compaction_failed", "agent", l.id, "error", err)
		return nil
	}

	summary := providers.Message{
		Role:    "user",
		Content: compactionSummaryPrefix + SanitizeAssistantContent(ctx, resp.Content),
	}
	result := make([]providers.Message, 0, 1+keepCount)
	result = append(result, summary)
	result = append(result, messages[splitIdx:]...)

	slog.InfoContext(ctx, "mid_loop_compacted",
		"agent", l.id,
		"original_msgs", len(messages),
		"summarized", splitIdx,
		"kept", len(result))

	return result
}
