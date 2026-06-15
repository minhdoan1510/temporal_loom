package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"strconv"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
)

// SessionMetaKeyLastPeriodicFlushTurn stores the user-turn count at which the
// last throttled periodic memory capture ran, so it does not repeat within the
// same turn count.
const SessionMetaKeyLastPeriodicFlushTurn = "last_periodic_flush_turn"

const (
	memoryFlushPrompt = "Pre-compaction memory flush. " +
		"Save only durable, confirmed memories using memory_set; skip guesses and transient state. " +
		"ALWAYS run memory_search first: if you find a CONFLICTING entry, correct it with overwrite " +
		"(or memory_delete) instead of appending a contradiction. " +
		"For facts that change over time use a topic file (e.g. memory/preferences.md) with overwrite; " +
		"for immutable events append to memory/YYYY-MM-DD.md. " +
		"If nothing important to store, reply with NO_REPLY."

	memoryFlushSystemPrompt = "Pre-compaction memory flush turn. " +
		"The session is near auto-compaction; capture durable memories via memory_set. " +
		"You may reply, but usually NO_REPLY is correct."
)

// memoryFlush runs a memory flush turn before compaction.
// It sends a flush prompt to the LLM with tool access so it can save memories.
// Deduplicated per compaction cycle.
func (l *Loop) memoryFlush(ctx context.Context, workspaceID, sessionKey string) {
	if !l.hasMemory {
		return
	}

	// Dedup: skip if already flushed in this compaction cycle
	compactionCount := l.sessions.GetCompactionCount(workspaceID, sessionKey)
	lastFlushAt := l.sessions.GetMemoryFlushAt(workspaceID, sessionKey)
	if lastFlushAt >= compactionCount {
		slog.DebugContext(ctx, "memory flush already done for this compaction cycle",
			"session", sessionKey, "compaction", compactionCount, "last_flush", lastFlushAt)
		return
	}

	l.doMemoryFlush(ctx, workspaceID, sessionKey)

	// Mark flush done for this compaction cycle
	l.sessions.SetMemoryFlushAt(workspaceID, sessionKey, compactionCount)
}

// maybePeriodicMemoryCapture runs a memory-capture flush every N user turns
// (configured via MemoryCaptureEveryTurns), independently of the pre-compaction
// flush. Runs in the background; failures are non-fatal. No-op when disabled or
// when memory is unavailable.
func (l *Loop) maybePeriodicMemoryCapture(ctx context.Context, workspaceID, sessionKey string) {
	if !l.hasMemory || l.memoryCaptureEveryTurns <= 0 {
		return
	}

	history := l.sessions.GetHistory(workspaceID, sessionKey)
	userTurns := 0
	for _, m := range history {
		if m.Role == "user" {
			userTurns++
		}
	}
	if userTurns == 0 || userTurns%l.memoryCaptureEveryTurns != 0 {
		return
	}

	// Dedup: skip if we already captured at this exact turn count.
	marker := strconv.Itoa(userTurns)
	if l.sessions.GetSessionMetaValue(workspaceID, sessionKey, SessionMetaKeyLastPeriodicFlushTurn) == marker {
		return
	}
	l.sessions.SetSessionMetaValue(workspaceID, sessionKey, SessionMetaKeyLastPeriodicFlushTurn, marker)

	go l.doMemoryFlush(context.WithoutCancel(ctx), workspaceID, sessionKey)
}

// doMemoryFlush performs the actual memory-capture turn: it sends a flush prompt
// to the LLM with tool access so it can persist durable memories. Callers own
// any dedup/throttling — this always runs.
func (l *Loop) doMemoryFlush(ctx context.Context, workspaceID, sessionKey string) {
	slog.InfoContext(ctx, "memory flush: starting", "session", sessionKey)

	flushCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	// Build messages for flush turn
	history := l.sessions.GetHistory(workspaceID, sessionKey)
	summary := l.sessions.GetSummary(workspaceID, sessionKey)

	var messages []providers.Message

	// Minimal system prompt for flush
	systemPrompt := "You are an AI agent. " + memoryFlushSystemPrompt
	messages = append(messages, providers.Message{
		Role:    "system",
		Content: systemPrompt,
	})

	// Include conversation summary for context
	if summary != "" {
		messages = append(messages, providers.Message{
			Role:    "user",
			Content: compactionSummaryPrefix + summary,
		})
		messages = append(messages, providers.Message{
			Role:    "assistant",
			Content: "Understood.",
		})
	}

	// Include recent history (last 10 messages for context)
	recentHistory := history
	if len(recentHistory) > 10 {
		recentHistory = recentHistory[len(recentHistory)-10:]
	}
	messages = append(messages, sanitizeHistory(flushCtx, recentHistory)...)

	// Flush prompt
	messages = append(messages, providers.Message{
		Role:    "user",
		Content: memoryFlushPrompt,
	})

	toolDefs := l.tools.ProviderDefs()

	// Run LLM iteration loop (max 5 iterations for flush)
	for i := 0; i < 5; i++ {
		temp := 0.3
		resp, err := l.provider.Chat(flushCtx, providers.ChatRequest{
			Messages: messages,
			Tools:    toolDefs,
			Model:    l.model,
			Options: providers.ChatOptions{
				MaxTokens:   16384,
				Temperature: &temp,
			},
		})
		if err != nil {
			slog.WarnContext(flushCtx, "memory flush: LLM call failed", "error", err)
			break
		}

		// No tool calls → done
		if len(resp.ToolCalls) == 0 {
			content := SanitizeAssistantContent(flushCtx, resp.Content)
			if content != "" && !IsSilentReply(content) {
				slog.InfoContext(flushCtx, "memory flush: completed with response", "content_len", len(content))
			} else {
				slog.InfoContext(flushCtx, "memory flush: nothing to save")
			}
			break
		}

		// Process tool calls
		assistantMsg := providers.Message{
			Role:      "assistant",
			Content:   resp.Content,
			ToolCalls: resp.ToolCalls,
		}
		messages = append(messages, assistantMsg)

		for _, tc := range resp.ToolCalls {
			argsJSON, _ := json.Marshal(tc.Arguments)
			slog.InfoContext(flushCtx, "memory flush: tool call", "tool", tc.Name, "args_len", len(argsJSON))

			result := l.tools.ExecuteWithContext(flushCtx, tc.Name, tc.Arguments)

			messages = append(messages, providers.Message{
				Role:       "tool",
				Content:    result.ForLLM,
				ToolCallID: tc.ID,
			})
		}
	}

	slog.InfoContext(ctx, "memory flush: completed", "session", sessionKey)
}
