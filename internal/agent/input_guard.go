package agent

import (
	"regexp"
	"strings"
)

// guardPattern pairs a human-readable name with a compiled regex.
type guardPattern struct {
	name    string
	pattern *regexp.Regexp
}

// InputGuard scans user input for known prompt injection patterns.
type InputGuard struct {
	patterns []guardPattern
}

// NewInputGuard creates an InputGuard with the default set of injection detection patterns.
func NewInputGuard() *InputGuard {
	return &InputGuard{
		patterns: defaultGuardPatterns(),
	}
}

// Scan checks a message against all known injection patterns.
// Returns the names of matched patterns (empty slice = no matches).
func (g *InputGuard) Scan(message string) []string {
	if message == "" {
		return nil
	}
	var matches []string
	for _, gp := range g.patterns {
		if gp.pattern.MatchString(message) {
			matches = append(matches, gp.name)
		}
	}
	return matches
}

func defaultGuardPatterns() []guardPattern {
	return []guardPattern{
		{
			name:    "ignore_instructions",
			pattern: regexp.MustCompile(`(?i)ignore\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|prompts?|directives?|guidelines?)`),
		},
		{
			name:    "role_override",
			pattern: regexp.MustCompile(`(?i)(you are now|from now on you are|pretend you are|act as if you are|imagine you are)\s+`),
		},
		{
			name:    "system_tags",
			pattern: regexp.MustCompile(`(?i)</?system>|\[SYSTEM\]|\[INST\]|<<SYS>>|<\|im_start\|>system`),
		},
		{
			name:    "instruction_injection",
			pattern: regexp.MustCompile(`(?i)(new instructions?:|override:|system prompt:|<\|system\|>)`),
		},
		{
			name:    "null_bytes",
			pattern: regexp.MustCompile(`\x00`),
		},
		{
			name:    "delimiter_escape",
			pattern: regexp.MustCompile(`(?i)(end of system|begin user input|</?(instructions?|rules|prompt|context)>)`),
		},
	}
}

// ContainsNullBytes is a fast check for null bytes without regex overhead.
func ContainsNullBytes(s string) bool {
	return strings.ContainsRune(s, 0)
}
