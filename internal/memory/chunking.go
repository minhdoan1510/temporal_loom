package memory

import "strings"

// TextChunk is a chunk of text with line number metadata.
type TextChunk struct {
	Text      string
	StartLine int
	EndLine   int
}

// ChunkTextWithOverlap splits text into chunks at paragraph boundaries with overlap.
// Paragraphs are delimited by double newlines. When a chunk is flushed, trailing
// paragraphs that fit within the overlap size are carried forward to the next chunk.
// Defaults: chunkSize=1000, overlap=200.
func ChunkTextWithOverlap(text string, chunkSize, overlap int) []TextChunk {
	if chunkSize <= 0 {
		chunkSize = 1000
	}
	if overlap < 0 {
		overlap = 0
	}

	paragraphs := strings.Split(text, "\n\n")

	var chunks []TextChunk
	var current []string
	currentLen := 0
	lineOffset := 1

	flush := func() {
		if len(current) == 0 {
			return
		}
		content := strings.TrimSpace(strings.Join(current, "\n\n"))
		if content == "" {
			return
		}
		endLine := lineOffset + strings.Count(content, "\n")
		chunks = append(chunks, TextChunk{
			Text:      content,
			StartLine: lineOffset,
			EndLine:   endLine,
		})

		// Keep trailing paragraphs that fit in overlap for the next chunk
		var carry []string
		carryLen := 0
		for i := len(current) - 1; i >= 0; i-- {
			pLen := len(current[i])
			if carryLen+pLen > overlap {
				break
			}
			carry = append([]string{current[i]}, carry...)
			carryLen += pLen
		}

		lineOffset = endLine + 1
		current = carry
		currentLen = carryLen
	}

	for _, para := range paragraphs {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}

		// Force-split paragraphs larger than chunkSize
		if len(para) > chunkSize {
			// Flush current accumulator first
			flush()
			for len(para) > 0 {
				end := chunkSize
				if end > len(para) {
					end = len(para)
				}
				current = append(current, para[:end])
				currentLen += end
				para = para[end:]
				if len(para) > 0 {
					flush()
				}
			}
			continue
		}

		sepLen := 0
		if len(current) > 0 {
			sepLen = 2 // "\n\n" separator
		}
		if currentLen+sepLen+len(para) > chunkSize && len(current) > 0 {
			flush()
		}
		current = append(current, para)
		currentLen += len(para)
		if len(current) > 1 {
			currentLen += 2 // account for "\n\n" separator
		}
	}

	flush()
	return chunks
}

// ChunkText splits text into chunks at paragraph boundaries.
// Each chunk includes its starting line number in the source file.
func ChunkText(text string, maxChunkLen int) []TextChunk {
	if maxChunkLen <= 0 {
		maxChunkLen = 1000
	}

	lines := strings.Split(text, "\n")
	var chunks []TextChunk
	var current strings.Builder
	startLine := 1

	flush := func(endLine int) {
		content := strings.TrimSpace(current.String())
		if content != "" {
			chunks = append(chunks, TextChunk{
				Text:      content,
				StartLine: startLine,
				EndLine:   endLine,
			})
		}
		current.Reset()
		startLine = endLine + 1
	}

	for i, line := range lines {
		lineNum := i + 1

		// Paragraph boundary: empty line
		if strings.TrimSpace(line) == "" && current.Len() > 0 {
			if current.Len() >= maxChunkLen/2 {
				flush(lineNum - 1)
				continue
			}
		}

		if current.Len() > 0 {
			current.WriteString("\n")
		}
		current.WriteString(line)

		// Force flush if too large
		if current.Len() >= maxChunkLen {
			flush(lineNum)
		}
	}

	// Flush remaining
	if current.Len() > 0 {
		flush(len(lines))
	}

	return chunks
}
