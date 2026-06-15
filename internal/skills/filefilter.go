package skills

import (
	"path"
	"strings"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// referenceExtensions is the allowlist of skill reference-file formats. The
// agent reads these as text into its context (Level 3 resources). Scripts and
// binary formats are excluded — lending-claw has no code-execution tool, so
// scripts are useless, and binaries cannot be read as text.
var referenceExtensions = map[string]bool{
	".md":       true,
	".markdown": true,
	".txt":      true,
	".json":     true,
	".yaml":     true,
	".yml":      true,
	".csv":      true,
	".html":     true,
}

// IsReferenceFile reports whether a bundle file path is an allowed reference
// document. SKILL.md itself is handled separately and is not a reference file.
func IsReferenceFile(p string) bool {
	clean := strings.TrimSpace(p)
	if clean == "" {
		return false
	}
	base := path.Base(clean)
	if strings.EqualFold(base, "SKILL.md") {
		return false
	}
	// Reject anything under a scripts/ directory regardless of extension.
	for _, seg := range strings.Split(clean, "/") {
		if strings.EqualFold(seg, "scripts") {
			return false
		}
	}
	ext := strings.ToLower(path.Ext(base))
	return referenceExtensions[ext]
}

// SplitReferenceFiles partitions files into the allowed reference set and the
// skipped set (scripts, binaries, SKILL.md duplicates, etc.).
func SplitReferenceFiles(files []store.SkillFile) (keep, skipped []store.SkillFile) {
	for _, f := range files {
		if IsReferenceFile(f.Path) {
			keep = append(keep, f)
		} else {
			skipped = append(skipped, f)
		}
	}
	return keep, skipped
}
