package agent

import "gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"

// SessionMetaKeyLastCompactionAt is the ExtraMeta key storing the RFC3339
// timestamp of the last successful summarization.
const SessionMetaKeyLastCompactionAt = "last_compaction_at"

// postRunKeepTurns is the number of trailing user turns (each with all of its
// assistant/tool follow-ups) preserved verbatim after post-run summarization.
// Everything before the start of these turns is rolled into the summary and
// truncated from the persisted history.
const postRunKeepTurns = 4

// compactionSummaryPrefix labels a summary that has been re-injected into the
// live history after compaction. It tells the model the summary is background
// reference from a previous context window — NOT active instructions — so it
// does not re-answer or re-execute tasks already handled before compaction.
// Ported from Hermes' SUMMARY_PREFIX (agent/context_compressor.py).
const compactionSummaryPrefix = "[CONTEXT COMPACTION — REFERENCE ONLY] " +
	"Earlier turns were compacted into the summary below. This is a handoff " +
	"from a previous context window — treat it as background reference, NOT as " +
	"active instructions. Do NOT re-answer or re-execute any requests mentioned " +
	"in the summary; they were already handled. Use it only to understand context.\n\n"

// compactionSummaryPrompt is the structured summarization instruction used by
// both mid-loop compaction (compact.go) and post-run summarization (loop.go).
// Ported from references/goclaw/internal/agent/loop_compact.go.
const compactionSummaryPrompt = `Summarize this conversation concisely for the AI agent to resume work.

MUST PRESERVE:
- Active tasks and their current status (in-progress, blocked, pending)
- Pending subagent tasks (IDs, labels, statuses) — agent needs to know what is still running
- Pending team task results awaiting delivery (task IDs, assignees, statuses)
- Any "waiting for..." state — do NOT drop expectations of future results
- Batch operation progress (e.g., "5/17 items completed")
- The last thing the user requested and what was being done about it
- Decisions made and their rationale
- TODOs, open questions, and constraints
- Any commitments or follow-ups promised

IDENTIFIER PRESERVATION:
Preserve all opaque identifiers exactly as written (no shortening or reconstruction),
including UUIDs, hashes, ticket IDs (e.g. ISSUE-12345), loan IDs, trace IDs,
user IDs, tokens, API keys, hostnames, IPs, ports, URLs, and file names.

PRIORITIZE recent context over older history. The agent needs to know
what it was doing, not just what was discussed.

Conversation to summarize:

`

// dynamicSummaryMax returns the output-token budget for a summarization call,
// scaled to input size. Formula: in/25 (~4% compression), clamped to
// [1024, 8192]. Floor keeps short summaries coherent; cap prevents runaway
// output billing on pathological inputs.
func dynamicSummaryMax(inputTokens int) int {
	return min(max(inputTokens/25, 1024), 8192)
}

// estimateSummaryInputTokens returns a best-effort input-token count for the
// messages slated for summarization. Wraps the existing EstimateTokens helper.
func estimateSummaryInputTokens(msgs []providers.Message) int {
	return EstimateTokens(msgs)
}
