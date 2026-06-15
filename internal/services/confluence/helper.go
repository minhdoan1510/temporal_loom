package confluence

import (
	"html"
	"regexp"
	"strings"
)

var (
	reScript     = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	reStyle      = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	reBR         = regexp.MustCompile(`(?i)<br\s*/?>`)
	reBlockClose = regexp.MustCompile(`(?i)</(p|div|h[1-6]|li|tr)>`)
	reLI         = regexp.MustCompile(`(?i)<li[^>]*>`)
	reTableTags  = regexp.MustCompile(`(?i)</?(table|tbody|thead)[^>]*>`)
	reTD         = regexp.MustCompile(`(?i)<t[dh][^>]*>`)
	reH1         = regexp.MustCompile(`(?i)<h1[^>]*>`)
	reH2         = regexp.MustCompile(`(?i)<h2[^>]*>`)
	reH3         = regexp.MustCompile(`(?i)<h3[^>]*>`)
	reH4         = regexp.MustCompile(`(?i)<h4[^>]*>`)
	reH5         = regexp.MustCompile(`(?i)<h5[^>]*>`)
	reH6         = regexp.MustCompile(`(?i)<h6[^>]*>`)
	reAllTags    = regexp.MustCompile(`<[^>]+>`)
	reBlankLines = regexp.MustCompile(`\n\s*\n`)
	reSpaces     = regexp.MustCompile(`[ \t]+`)
)

// HTMLToText converts HTML content to plain text, preserving basic structure.
func htmlToText(htmlContent string) string {
	if htmlContent == "" {
		return ""
	}

	text := htmlContent

	// Remove script and style elements
	text = reScript.ReplaceAllString(text, "")
	text = reStyle.ReplaceAllString(text, "")

	// Convert common elements
	text = reBR.ReplaceAllString(text, "\n")
	text = reBlockClose.ReplaceAllString(text, "\n")
	text = reLI.ReplaceAllString(text, "- ")
	text = reTableTags.ReplaceAllString(text, "\n")
	text = reTD.ReplaceAllString(text, " | ")

	// Convert headers
	text = reH1.ReplaceAllString(text, "\n# ")
	text = reH2.ReplaceAllString(text, "\n## ")
	text = reH3.ReplaceAllString(text, "\n### ")
	text = reH4.ReplaceAllString(text, "\n#### ")
	text = reH5.ReplaceAllString(text, "\n##### ")
	text = reH6.ReplaceAllString(text, "\n###### ")

	// Remove remaining tags
	text = reAllTags.ReplaceAllString(text, "")

	// Unescape HTML entities
	text = html.UnescapeString(text)

	// Clean up whitespace
	text = reBlankLines.ReplaceAllString(text, "\n\n")
	text = reSpaces.ReplaceAllString(text, " ")
	text = strings.TrimSpace(text)

	return text
}
