package agent

import (
	"fmt"
	"unicode/utf8"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
)

// Context pruning defaults
const (
	defaultKeepLastAssistants   = 3
	defaultSoftTrimRatio        = 0.3
	defaultHardClearRatio       = 0.5
	defaultMinPrunableToolChars = 50000
	defaultSoftTrimMaxChars     = 4000
	defaultSoftTrimHeadChars    = 1500
	defaultSoftTrimTailChars    = 1500
	defaultHardClearPlaceholder = "[Old tool result content cleared]"
	charsPerTokenEstimate       = 4
)

// PruningConfig controls context pruning behavior.
type PruningConfig struct {
	KeepLastAssistants   int
	SoftTrimRatio        float64
	HardClearRatio       float64
	MinPrunableToolChars int
	SoftTrimMaxChars     int
	SoftTrimHeadChars    int
	SoftTrimTailChars    int
	HardClearEnabled     bool
	HardClearPlaceholder string
	Mode                 string // "" (always on) or "disabled"
}

// DefaultPruningConfig returns sensible defaults.
func DefaultPruningConfig() PruningConfig {
	return PruningConfig{
		KeepLastAssistants:   defaultKeepLastAssistants,
		SoftTrimRatio:        defaultSoftTrimRatio,
		HardClearRatio:       defaultHardClearRatio,
		MinPrunableToolChars: defaultMinPrunableToolChars,
		SoftTrimMaxChars:     defaultSoftTrimMaxChars,
		SoftTrimHeadChars:    defaultSoftTrimHeadChars,
		SoftTrimTailChars:    defaultSoftTrimTailChars,
		HardClearEnabled:     true,
		HardClearPlaceholder: defaultHardClearPlaceholder,
	}
}

// pruneContextMessages trims old tool results to reduce context window usage.
// Two-pass approach:
//  1. Soft trim: keep head + tail of long tool results, drop middle.
//  2. Hard clear: replace entire tool result with placeholder.
//
// Only tool results older than KeepLastAssistants are eligible for pruning.
func pruneContextMessages(msgs []providers.Message, contextWindowTokens int, cfg PruningConfig) []providers.Message {
	if cfg.Mode == "disabled" {
		return msgs
	}
	if contextWindowTokens <= 0 || len(msgs) == 0 {
		return msgs
	}

	charWindow := contextWindowTokens * charsPerTokenEstimate

	// Find cutoff: protect last N assistant messages
	cutoffIndex := findAssistantCutoff(msgs, cfg.KeepLastAssistants)
	if cutoffIndex < 0 {
		return msgs
	}

	// Find first user message — never prune before it
	pruneStart := len(msgs)
	for i, m := range msgs {
		if m.Role == "user" {
			pruneStart = i
			break
		}
	}

	// Estimate total chars
	totalChars := 0
	for _, m := range msgs {
		totalChars += estimateMessageChars(m)
	}

	ratio := float64(totalChars) / float64(charWindow)
	if ratio < cfg.SoftTrimRatio {
		return msgs // context is small enough
	}

	// Collect prunable tool result indexes
	var prunableIndexes []int
	for i := pruneStart; i < cutoffIndex; i++ {
		if msgs[i].Role == "tool" && msgs[i].Content != "" {
			prunableIndexes = append(prunableIndexes, i)
		}
	}

	if len(prunableIndexes) == 0 {
		return msgs
	}

	// Pass 1: Soft trim long tool results
	var result []providers.Message
	for _, idx := range prunableIndexes {
		msg := msgs[idx]
		msgChars := estimateMessageChars(msg)

		if msgChars <= cfg.SoftTrimMaxChars {
			continue
		}

		// Lazy copy
		if result == nil {
			result = make([]providers.Message, len(msgs))
			copy(result, msgs)
		}

		head := takeHead(msg.Content, cfg.SoftTrimHeadChars)
		tail := takeTail(msg.Content, cfg.SoftTrimTailChars)
		trimmed := fmt.Sprintf("%s\n...\n%s\n\n[Tool result trimmed: kept first %d chars and last %d chars of %d chars.]",
			head, tail, cfg.SoftTrimHeadChars, cfg.SoftTrimTailChars, msgChars)

		result[idx] = providers.Message{
			Role:       msg.Role,
			Content:    trimmed,
			ToolCallID: msg.ToolCallID,
		}
		totalChars += len(trimmed) - msgChars
	}

	output := msgs
	if result != nil {
		output = result
	}

	// Re-check ratio after soft trim
	ratio = float64(totalChars) / float64(charWindow)
	if ratio < cfg.HardClearRatio || !cfg.HardClearEnabled {
		return output
	}

	// Check min prunable chars threshold
	prunableChars := 0
	for _, idx := range prunableIndexes {
		prunableChars += estimateMessageChars(output[idx])
	}
	if prunableChars < cfg.MinPrunableToolChars {
		return output
	}

	// Pass 2: Hard clear — replace entire tool results with placeholder
	if result == nil {
		result = make([]providers.Message, len(msgs))
		copy(result, msgs)
		output = result
	}

	for _, idx := range prunableIndexes {
		if ratio < cfg.HardClearRatio {
			break
		}
		msg := output[idx]
		beforeChars := estimateMessageChars(msg)

		output[idx] = providers.Message{
			Role:       msg.Role,
			Content:    cfg.HardClearPlaceholder,
			ToolCallID: msg.ToolCallID,
		}
		afterChars := len(cfg.HardClearPlaceholder)
		totalChars += afterChars - beforeChars
		ratio = float64(totalChars) / float64(charWindow)
	}

	return output
}

// findAssistantCutoff returns the index of the Nth-from-last assistant message.
func findAssistantCutoff(msgs []providers.Message, keepLast int) int {
	if keepLast <= 0 {
		return len(msgs)
	}

	remaining := keepLast
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role == "assistant" {
			remaining--
			if remaining == 0 {
				return i
			}
		}
	}
	return -1
}

// estimateMessageChars returns the character count of a message's content.
func estimateMessageChars(m providers.Message) int {
	return utf8.RuneCountInString(m.Content)
}

// takeHead returns the first n runes of s.
func takeHead(s string, n int) string {
	if n <= 0 {
		return ""
	}
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n])
}

// takeTail returns the last n runes of s.
func takeTail(s string, n int) string {
	if n <= 0 {
		return ""
	}
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[len(runes)-n:])
}
