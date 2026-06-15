package agent

import (
	"context"
	"log/slog"
	"regexp"
	"strings"
)

// SanitizeAssistantContent applies the full sanitization pipeline to assistant
// response text before saving to session and sending to user.
func SanitizeAssistantContent(ctx context.Context, content string) string {
	if content == "" {
		return content
	}

	original := content

	content = stripGarbledToolXML(ctx, content)
	if content == "" {
		return ""
	}
	content = stripDowngradedToolCallText(content)
	content = stripThinkingTags(content)
	content = stripFinalTags(content)
	content = stripEchoedSystemMessages(content)
	content = collapseConsecutiveDuplicateBlocks(content)
	content = stripMediaPaths(content)
	content = stripLeadingBlankLines(content)
	content = strings.TrimSpace(content)

	if content != original {
		slog.DebugContext(ctx, "sanitized assistant content",
			"original_len", len(original),
			"cleaned_len", len(content),
		)
	}

	return content
}

// --- Garbled tool-call XML ---

var garbledToolXMLPattern = regexp.MustCompile(
	`(?s)</?(?:function_calls?|functioninvoke|invoke|invfunction_calls|tool_call|tool_use|parameter)[^>]*>`,
)

var garbledToolXMLIndicators = []string{
	"invfunction_calls",
	"functioninvoke",
	"<parameter name=",
	"</parameter",
	"<function_call",
	"<tool_call",
	"<tool_use",
}

func stripGarbledToolXML(ctx context.Context, content string) string {
	hasIndicator := false
	lower := strings.ToLower(content)
	for _, ind := range garbledToolXMLIndicators {
		if strings.Contains(lower, strings.ToLower(ind)) {
			hasIndicator = true
			break
		}
	}
	if !hasIndicator {
		return content
	}

	cleaned := garbledToolXMLPattern.ReplaceAllString(content, "")
	cleaned = strings.TrimSpace(cleaned)

	if cleaned == "" {
		slog.WarnContext(ctx, "stripped entirely garbled tool call response",
			"original_len", len(content),
		)
		return ""
	}

	if cleaned != content {
		slog.WarnContext(ctx, "stripped garbled tool call XML from response",
			"original_len", len(content),
			"cleaned_len", len(cleaned),
		)
	}

	return cleaned
}

// --- Downgraded tool call text ---

func stripDowngradedToolCallText(content string) string {
	if !strings.Contains(content, "[Tool Call:") &&
		!strings.Contains(content, "[Tool Result") &&
		!strings.Contains(content, "[Historical context:") {
		return content
	}

	lines := strings.Split(content, "\n")
	var result []string
	skipping := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "[Tool Call:") ||
			strings.HasPrefix(trimmed, "[Tool Result") ||
			strings.HasPrefix(trimmed, "[Historical context:") {
			skipping = true
			continue
		}

		if skipping {
			if trimmed == "" || strings.HasPrefix(trimmed, "Arguments:") ||
				strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "}") {
				continue
			}
			skipping = false
		}

		result = append(result, line)
	}

	return strings.TrimSpace(strings.Join(result, "\n"))
}

// --- Thinking/reasoning tags ---

var thinkingTagPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?is)<think>.*?</think>`),
	regexp.MustCompile(`(?is)<thinking>.*?</thinking>`),
	regexp.MustCompile(`(?is)<thought>.*?</thought>`),
	regexp.MustCompile(`(?is)<antThinking>.*?</antThinking>`),
	regexp.MustCompile(`(?is)<antthinking>.*?</antthinking>`),
}

func stripThinkingTags(content string) string {
	lower := strings.ToLower(content)
	if !strings.Contains(lower, "<think") && !strings.Contains(lower, "<thought") &&
		!strings.Contains(lower, "<antthinking") {
		return content
	}
	result := content
	for _, pat := range thinkingTagPatterns {
		result = pat.ReplaceAllString(result, "")
	}
	return strings.TrimSpace(result)
}

// --- <final> tags ---

var finalTagPattern = regexp.MustCompile(`(?i)<\s*/?\s*final\s*>`)

func stripFinalTags(content string) string {
	if !strings.Contains(strings.ToLower(content), "final") {
		return content
	}
	return finalTagPattern.ReplaceAllString(content, "")
}

// --- Echoed [System Message] ---

func stripEchoedSystemMessages(content string) string {
	if !strings.Contains(content, "[System Message]") {
		return content
	}

	lines := strings.Split(content, "\n")
	var result []string
	skipping := false

	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "[System Message]") {
			skipping = true
			continue
		}
		if skipping {
			if strings.TrimSpace(line) == "" {
				skipping = false
				continue
			}
			continue
		}
		result = append(result, line)
	}

	return strings.TrimSpace(strings.Join(result, "\n"))
}

// --- Collapse consecutive duplicate blocks ---

func collapseConsecutiveDuplicateBlocks(content string) string {
	blocks := strings.Split(content, "\n\n")
	if len(blocks) <= 1 {
		return content
	}

	var result []string
	for i, block := range blocks {
		trimmed := strings.TrimSpace(block)
		if trimmed == "" {
			continue
		}
		if i > 0 && len(result) > 0 && trimmed == strings.TrimSpace(result[len(result)-1]) {
			continue
		}
		result = append(result, block)
	}

	return strings.Join(result, "\n\n")
}

// --- Strip MEDIA: paths ---

func stripMediaPaths(content string) string {
	if !strings.Contains(content, "MEDIA:") {
		return content
	}
	lines := strings.Split(content, "\n")
	var result []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "[[audio_as_voice]]") {
			continue
		}
		if strings.Contains(trimmed, "MEDIA:/") {
			continue
		}
		result = append(result, line)
	}
	return strings.TrimSpace(strings.Join(result, "\n"))
}

// --- Strip leading blank lines ---

var leadingBlankLinesPattern = regexp.MustCompile(`^(?:[ \t]*\r?\n)+`)

func stripLeadingBlankLines(content string) string {
	return leadingBlankLinesPattern.ReplaceAllString(content, "")
}

// --- NO_REPLY detection ---

// IsSilentReply checks if the text is a NO_REPLY token.
func IsSilentReply(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}
	const token = "NO_REPLY"
	if trimmed == token {
		return true
	}
	if strings.HasPrefix(trimmed, token) {
		rest := trimmed[len(token):]
		if rest == "" || !isWordChar(rest[0]) {
			return true
		}
	}
	if strings.HasSuffix(trimmed, token) {
		before := trimmed[:len(trimmed)-len(token)]
		if before == "" || !isWordChar(before[len(before)-1]) {
			return true
		}
	}
	return false
}

func isWordChar(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '_'
}
