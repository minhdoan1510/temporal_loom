package skills

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Skill metadata follows the Claude Agent Skills standard: a SKILL.md file
// begins with YAML frontmatter carrying `name` and `description` (Level 1
// metadata), followed by the instruction body (Level 2).
//
// See https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

const (
	maxSkillNameLen        = 64
	maxSkillDescriptionLen = 1024
)

// skillNameRe matches a valid skill name: lowercase letters, digits and hyphens,
// no leading/trailing hyphen. Mirrors the Claude standard.
var skillNameRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)

// ParseFrontmatter extracts name, description and the instruction body from a
// SKILL.md document. ok is false when the content has no leading `---` block.
func ParseFrontmatter(content string) (name, description, body string, ok bool) {
	fields, body, ok := FrontmatterFields(content)
	if !ok {
		return "", "", body, false
	}
	return fields["name"], fields["description"], body, true
}

// FrontmatterFields returns all parsed top-level frontmatter fields and the
// instruction body. ok is false when the content has no leading `---` block.
func FrontmatterFields(content string) (fields map[string]string, body string, ok bool) {
	if !strings.HasPrefix(content, "---") {
		return nil, content, false
	}
	// Skip the opening fence (allow optional trailing spaces / CRLF).
	rest := content[3:]
	rest = strings.TrimLeft(rest, "\r")
	if !strings.HasPrefix(rest, "\n") {
		return nil, content, false
	}
	rest = rest[1:]

	// Find the closing fence at the start of a line.
	end := indexClosingFence(rest)
	if end < 0 {
		return nil, content, false
	}
	fm := rest[:end]
	body = strings.TrimPrefix(rest[end:], "---")
	body = strings.TrimLeft(body, "\r")
	body = strings.TrimPrefix(body, "\n")

	return parseSimpleYAML(fm), body, true
}

// StripFrontmatter returns the instruction body (Level 2) with the frontmatter
// removed. If there is no frontmatter, the content is returned unchanged.
func StripFrontmatter(content string) string {
	_, _, body, ok := ParseFrontmatter(content)
	if !ok {
		return content
	}
	return body
}

// ValidateMetadata enforces the Claude Agent Skills constraints on name and
// description.
func ValidateMetadata(name, description string) error {
	if name == "" {
		return fmt.Errorf("frontmatter: name is required")
	}
	if len(name) > maxSkillNameLen {
		return fmt.Errorf("frontmatter: name must be at most %d characters", maxSkillNameLen)
	}
	if !skillNameRe.MatchString(name) {
		return fmt.Errorf("frontmatter: name must contain only lowercase letters, digits and hyphens (no leading/trailing hyphen)")
	}
	lower := strings.ToLower(name)
	if strings.Contains(lower, "anthropic") || strings.Contains(lower, "claude") {
		return fmt.Errorf("frontmatter: name must not contain reserved words 'anthropic' or 'claude'")
	}
	if strings.TrimSpace(description) == "" {
		return fmt.Errorf("frontmatter: description is required")
	}
	if len(description) > maxSkillDescriptionLen {
		return fmt.Errorf("frontmatter: description must be at most %d characters", maxSkillDescriptionLen)
	}
	if strings.ContainsAny(description, "<>") {
		return fmt.Errorf("frontmatter: description must not contain XML tags")
	}
	return nil
}

// BuildFrontmatter renders a minimal, valid frontmatter block followed by the
// given body. description is emitted as a plain scalar when it is YAML-safe and
// only double-quoted when it actually needs escaping.
func BuildFrontmatter(name, description, body string) string {
	desc := oneLine(description)
	var b strings.Builder
	b.WriteString("---\n")
	b.WriteString("name: ")
	b.WriteString(name)
	b.WriteString("\n")
	b.WriteString("description: ")
	if needsYAMLQuote(desc) {
		b.WriteString(strconv.Quote(desc))
	} else {
		b.WriteString(desc)
	}
	b.WriteString("\n---\n\n")
	// Trim leading newlines so the result is stable under repeated parse/build
	// round-trips: ParseFrontmatter leaves the blank separator line on the body,
	// and we always re-emit our own "\n\n" separator above. Without this, every
	// round-trip (e.g. the startup frontmatter backfill) would prepend another
	// blank line and rewrite the skill on every app start.
	b.WriteString(strings.TrimLeft(body, "\n"))
	return b.String()
}

// needsYAMLQuote reports whether a single-line scalar must be quoted to be
// parsed back as the same plain string.
func needsYAMLQuote(s string) bool {
	if s == "" || s != strings.TrimSpace(s) {
		return true
	}
	if strings.ContainsAny(s, "\n\"'#") {
		return true
	}
	if strings.Contains(s, ": ") || strings.HasSuffix(s, ":") {
		return true
	}
	switch s[0] {
	case '-', '?', ':', '&', '*', '!', '|', '>', '%', '@', '`', '[', ']', '{', '}', ',', '"', '\'':
		return true
	}
	return false
}

// NormalizeSkillName converts an arbitrary skill name into a valid Claude-style
// slug: lowercase, with runs of disallowed characters collapsed to single
// hyphens and leading/trailing hyphens trimmed. Truncated to the max length.
func NormalizeSkillName(name string) string {
	var b strings.Builder
	lastHyphen := false
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastHyphen = false
		} else if !lastHyphen {
			b.WriteByte('-')
			lastHyphen = true
		}
	}
	slug := strings.Trim(b.String(), "-")
	if len(slug) > maxSkillNameLen {
		slug = strings.Trim(slug[:maxSkillNameLen], "-")
	}
	if slug == "" {
		slug = "skill"
	}
	return slug
}

func oneLine(s string) string {
	s = strings.ReplaceAll(s, "\r\n", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	return strings.TrimSpace(s)
}

// indexClosingFence returns the offset of the closing `---` fence (the index of
// the line that starts with `---`), or -1 if none is found.
func indexClosingFence(s string) int {
	offset := 0
	for {
		line := s[offset:]
		nl := strings.IndexByte(line, '\n')
		var cur string
		if nl < 0 {
			cur = line
		} else {
			cur = line[:nl]
		}
		if strings.HasPrefix(strings.TrimRight(cur, "\r"), "---") {
			return offset
		}
		if nl < 0 {
			return -1
		}
		offset += nl + 1
		if offset >= len(s) {
			return -1
		}
	}
}

// parseSimpleYAML parses a flat "key: value" mapping. Values may be wrapped in
// single or double quotes; double-quoted values are unescaped. Nested
// structures and lists are ignored (we only need name/description).
func parseSimpleYAML(fm string) map[string]string {
	out := make(map[string]string)
	for _, raw := range strings.Split(fm, "\n") {
		line := strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		// Only treat top-level keys (no leading indentation) as fields.
		if line != trimmed {
			continue
		}
		colon := strings.IndexByte(trimmed, ':')
		if colon < 0 {
			continue
		}
		key := strings.TrimSpace(trimmed[:colon])
		val := strings.TrimSpace(trimmed[colon+1:])
		out[key] = unquoteYAML(val)
	}
	return out
}

func unquoteYAML(v string) string {
	if len(v) >= 2 {
		if v[0] == '"' && v[len(v)-1] == '"' {
			if uq, err := strconv.Unquote(v); err == nil {
				return uq
			}
			return strings.Trim(v, `"`)
		}
		if v[0] == '\'' && v[len(v)-1] == '\'' {
			return strings.ReplaceAll(strings.Trim(v, "'"), "''", "'")
		}
	}
	return v
}
