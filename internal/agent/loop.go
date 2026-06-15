package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/memory"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/providers"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/skills"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/langfuse"
)

// MemorySearcher recalls relevant memory snippets for a query. Implemented by
// *memory.Manager. Used to prefetch memory context before each turn so the
// agent recalls relevant facts without having to call memory_search itself.
type MemorySearcher interface {
	Search(ctx context.Context, workspaceID, query string, maxResults int) ([]memory.SearchResult, error)
}

// Loop is the agent execution loop.
// Think → Act → Observe cycle with tool execution.
type Loop struct {
	id              string
	provider        providers.Provider
	model           string
	contextWindow   int
	maxIterations   int
	maxHistoryShare float64
	temperature     float64
	topP            float64

	sessions     store.SessionStore
	contextFiles store.ContextFileStore
	tools        *tools.Registry

	// Phase 1c: skills and memory
	skillsCache             *skills.Cache
	hasMemory               bool
	memory                  MemorySearcher
	memoryCaptureEveryTurns int
	memoryRecallMinScore    float64
	pruningCfg              PruningConfig

	// Input injection guard
	inputGuard      *InputGuard
	injectionAction string // "log", "warn" (default), "block", "off"

	onEvent func(context.Context, AgentEvent)

	maxMessageChars int

	// Per-session summarization lock
	summarizeMu sync.Map // sessionKey -> *sync.Mutex

	// Per-run event callbacks (keyed by RunID)
	runCallbacks sync.Map // runID -> func(AgentEvent)
}

// LoopConfig configures a new Loop.
type LoopConfig struct {
	ID              string
	Provider        providers.Provider
	Model           string
	ContextWindow   int
	MaxIterations   int
	MaxHistoryShare float64 // fraction of context window for history before compact; 0 = default 0.75
	Temperature     float64 // main agent-loop sampling temperature; 0 = default 1.0
	TopP            float64 // main agent-loop top_p; 0 = default 1.0
	Sessions        store.SessionStore
	ContextFiles    store.ContextFileStore
	Tools           *tools.Registry
	OnEvent         func(context.Context, AgentEvent)
	MaxMessageChars int

	// Phase 1c
	SkillsCache     *skills.Cache
	HasMemory       bool
	Memory          MemorySearcher // optional; enables per-turn memory prefetch
	PruningCfg      *PruningConfig
	InjectionAction string // "log", "warn" (default), "block", "off"

	// MemoryCaptureEveryTurns, when > 0, runs a memory-capture flush every N
	// user turns (in addition to the pre-compaction flush). 0 disables it.
	MemoryCaptureEveryTurns int

	// MemoryRecallMinScore filters per-turn memory prefetch: snippets below this
	// score are dropped. 0 uses the default (0.3); a negative value disables
	// filtering entirely.
	MemoryRecallMinScore float64
}

// NewLoop creates a new agent loop.
func NewLoop(cfg LoopConfig) *Loop {
	if cfg.MaxIterations <= 0 {
		cfg.MaxIterations = 20
	}
	if cfg.ContextWindow <= 0 {
		cfg.ContextWindow = 200000
	}
	if cfg.MaxMessageChars <= 0 {
		cfg.MaxMessageChars = 32000
	}
	if cfg.MaxHistoryShare <= 0 || cfg.MaxHistoryShare >= 1 {
		cfg.MaxHistoryShare = 0.75
	}
	if cfg.MemoryRecallMinScore == 0 {
		cfg.MemoryRecallMinScore = 0.3 // default; negative disables filtering
	}
	if cfg.Temperature <= 0 {
		cfg.Temperature = 1.0
	}
	if cfg.TopP <= 0 {
		cfg.TopP = 1.0
	}

	pruningCfg := DefaultPruningConfig()
	if cfg.PruningCfg != nil {
		pruningCfg = *cfg.PruningCfg
	}

	injectionAction := cfg.InjectionAction
	if injectionAction == "" {
		injectionAction = "warn"
	}

	var guard *InputGuard
	if injectionAction != "off" {
		guard = NewInputGuard()
	}

	return &Loop{
		id:                      cfg.ID,
		provider:                cfg.Provider,
		model:                   cfg.Model,
		contextWindow:           cfg.ContextWindow,
		maxIterations:           cfg.MaxIterations,
		maxHistoryShare:         cfg.MaxHistoryShare,
		temperature:             cfg.Temperature,
		topP:                    cfg.TopP,
		sessions:                cfg.Sessions,
		contextFiles:            cfg.ContextFiles,
		tools:                   cfg.Tools,
		skillsCache:             cfg.SkillsCache,
		hasMemory:               cfg.HasMemory,
		memory:                  cfg.Memory,
		memoryCaptureEveryTurns: cfg.MemoryCaptureEveryTurns,
		memoryRecallMinScore:    cfg.MemoryRecallMinScore,
		pruningCfg:              pruningCfg,
		inputGuard:              guard,
		injectionAction:         injectionAction,
		onEvent:                 cfg.OnEvent,
		maxMessageChars:         cfg.MaxMessageChars,
	}
}

// Run processes a single message through the agent loop.
func (l *Loop) Run(ctx context.Context, req RunRequest) (*RunResult, error) {
	// Default to the default workspace for non-HTTP channels (CLI/jira) and
	// expose it in context so tools scope their data correctly.
	if req.WorkspaceID == "" {
		req.WorkspaceID = store.DefaultWorkspaceID
	}
	ctx = tools.WithWorkspace(ctx, req.WorkspaceID)

	// Tracing: open the root run span (generation/tool spans nest under it,
	// emitted by the provider and tool registry respectively).
	ctx, runSpan := langfuse.StartRun(ctx, langfuse.RunInfo{
		Name:        req.Channel,
		SessionID:   req.SessionKey,
		UserID:      req.UserID,
		Input:       req.Message,
		WorkspaceID: req.WorkspaceID,
		Channel:     req.Channel,
		RunID:       req.RunID,
	})

	// Register per-request callback if provided
	if req.OnEvent != nil {
		l.runCallbacks.Store(req.RunID, req.OnEvent)
		defer l.runCallbacks.Delete(req.RunID)
	}

	inputPreview := req.Message
	if len(inputPreview) > 200 {
		inputPreview = inputPreview[:200]
	}

	l.emit(ctx, AgentEvent{
		Type:    EventRunStarted,
		AgentID: l.id,
		RunID:   req.RunID,
		Payload: map[string]interface{}{
			"session_key":   req.SessionKey,
			"channel":       req.Channel,
			"user_id":       req.UserID,
			"input_preview": inputPreview,
		},
	})

	result, err := l.runLoop(ctx, req)
	if err != nil {
		runSpan.Fail(err)
		l.emit(ctx, AgentEvent{
			Type:    EventRunFailed,
			AgentID: l.id,
			RunID:   req.RunID,
			Payload: map[string]string{"error": err.Error()},
		})
		return nil, err
	}

	var inTok, outTok int
	if result.Usage != nil {
		inTok, outTok = result.Usage.PromptTokens, result.Usage.CompletionTokens
	}
	runSpan.End(result.Content, inTok, outTok, result.Iterations)

	outputPreview := result.Content
	if len(outputPreview) > 200 {
		outputPreview = outputPreview[:200]
	}

	l.emit(ctx, AgentEvent{
		Type:    EventRunCompleted,
		AgentID: l.id,
		RunID:   req.RunID,
		Payload: map[string]interface{}{
			"content":        result.Content,
			"output_preview": outputPreview,
			"input_tokens":   result.Usage.PromptTokens,
			"output_tokens":  result.Usage.CompletionTokens,
			"iterations":     result.Iterations,
		},
	})
	return result, nil
}

func (l *Loop) runLoop(ctx context.Context, req RunRequest) (*RunResult, error) {
	// Truncate oversized user messages
	if len(req.Message) > l.maxMessageChars {
		originalLen := len(req.Message)
		req.Message = req.Message[:l.maxMessageChars] +
			fmt.Sprintf("\n\n[System: Message was truncated from %d to %d characters due to size limit.]",
				originalLen, l.maxMessageChars)
		slog.WarnContext(ctx, "security.message_truncated",
			"agent", l.id, "user", req.UserID,
			"original_len", originalLen, "truncated_to", l.maxMessageChars,
		)
	}

	// Input injection guard
	if l.inputGuard != nil {
		if matches := l.inputGuard.Scan(req.Message); len(matches) > 0 {
			slog.WarnContext(ctx, "security.injection_detected",
				"agent", l.id, "patterns", matches, "user", req.UserID)
			if l.injectionAction == "block" {
				return nil, fmt.Errorf("message rejected: potential prompt injection detected")
			}
		}
	}

	// 1. Build messages from session history
	history := l.sessions.GetHistory(req.WorkspaceID, req.SessionKey)
	summary := l.sessions.GetSummary(req.WorkspaceID, req.SessionKey)
	messages := l.buildMessages(ctx, history, summary, req.Message, req.ExtraSystemPrompt, req.Channel, req.WorkspaceID, req.UserID, req.HistoryLimit)

	// 2. Buffer new messages — write to session only AFTER the run completes.
	var pendingMsgs []providers.Message
	pendingMsgs = append(pendingMsgs, providers.Message{
		Role:    "user",
		Content: req.Message,
	})

	// 3. Run LLM iteration loop
	var totalUsage providers.Usage
	iteration := 0
	var finalContent string
	var loopDetector toolLoopState
	var midLoopCompacted bool

	for iteration < l.maxIterations {
		iteration++

		slog.DebugContext(ctx, "agent iteration", "agent", l.id, "iteration", iteration, "messages", len(messages))

		toolDefs := l.tools.ProviderDefs(ctx)

		temp := l.temperature
		topP := l.topP
		chatReq := providers.ChatRequest{
			Messages: messages,
			Tools:    toolDefs,
			Model:    l.model,
			Options: providers.ChatOptions{
				MaxTokens:   16384,
				Temperature: &temp,
				TopP:        &topP,
			},
		}

		// Call LLM
		var resp *providers.ChatResponse
		var err error

		slog.InfoContext(ctx, "LLM call", "agent", l.id, "iteration", iteration, "messages", messages, "model", l.model, "max_tokens", chatReq.Options.MaxTokens, "tools", len(toolDefs))

		// The LLM call is traced inside the provider (langfuse.StartGeneration).
		if req.Stream {
			resp, err = l.provider.ChatStream(ctx, chatReq, func(chunk providers.StreamChunk) {
				if chunk.Content != "" {
					l.emit(ctx, AgentEvent{
						Type:    EventChunk,
						AgentID: l.id,
						RunID:   req.RunID,
						Payload: map[string]string{"content": chunk.Content},
					})
				}
			})
		} else {
			resp, err = l.provider.Chat(ctx, chatReq)
		}

		if err != nil {
			return nil, fmt.Errorf("LLM call failed (iteration %d): %w", iteration, err)
		}

		if resp.Usage != nil {
			totalUsage.PromptTokens += resp.Usage.PromptTokens
			totalUsage.CompletionTokens += resp.Usage.CompletionTokens
			totalUsage.TotalTokens += resp.Usage.TotalTokens

			// Store calibration data for token estimation
			l.sessions.SetLastPromptTokens(req.WorkspaceID, req.SessionKey, resp.Usage.PromptTokens, len(messages))
		}

		// Mid-loop compaction: summarize messages when context window fills up
		if !midLoopCompacted && l.contextWindow > 0 && resp.Usage != nil {
			threshold := int(float64(l.contextWindow) * l.maxHistoryShare)
			if resp.Usage.PromptTokens >= threshold {
				midLoopCompacted = true
				if compacted := l.compactMessagesInPlace(ctx, messages); compacted != nil {
					messages = compacted
					slog.InfoContext(ctx, "mid_loop_compacted", "agent", l.id, "iteration", iteration)
				}
			}
		}

		// No tool calls → done
		if len(resp.ToolCalls) == 0 {
			finalContent = resp.Content
			break
		}

		// Build assistant message with tool calls
		assistantMsg := providers.Message{
			Role:      "assistant",
			Content:   resp.Content,
			ToolCalls: resp.ToolCalls,
		}
		messages = append(messages, assistantMsg)
		pendingMsgs = append(pendingMsgs, assistantMsg)

		// Execute tool calls
		if len(resp.ToolCalls) == 1 {
			tc := resp.ToolCalls[0]
			l.emit(ctx, AgentEvent{
				Type:    EventToolCall,
				AgentID: l.id,
				RunID:   req.RunID,
				Payload: map[string]interface{}{"name": tc.Name, "id": tc.ID, "arguments": tc.Arguments},
			})

			argsJSON, _ := json.Marshal(tc.Arguments)
			slog.InfoContext(ctx, "tool call", "agent", l.id, "tool", tc.Name, "args_len", len(argsJSON))

			argsHash := loopDetector.record(tc.Name, tc.Arguments)
			result := l.tools.ExecuteWithContext(ctx, tc.Name, tc.Arguments)
			loopDetector.recordResult(argsHash, result.ForLLM)

			if result.IsError {
				errMsg := result.ForLLM
				if len(errMsg) > 200 {
					errMsg = errMsg[:200] + "..."
				}
				slog.WarnContext(ctx, "tool error", "agent", l.id, "tool", tc.Name, "error", errMsg)
			}

			l.emit(ctx, AgentEvent{
				Type:    EventToolResult,
				AgentID: l.id,
				RunID:   req.RunID,
				Payload: map[string]interface{}{
					"name":     tc.Name,
					"id":       tc.ID,
					"is_error": result.IsError,
					"result":   result.ForLLM,
				},
			})

			toolMsg := providers.Message{
				Role:       "tool",
				Content:    result.ForLLM,
				ToolCallID: tc.ID,
			}
			messages = append(messages, toolMsg)
			pendingMsgs = append(pendingMsgs, toolMsg)

			// Tool loop detection
			if level, msg := loopDetector.detect(tc.Name, argsHash); level != "" {
				if level == "critical" {
					slog.WarnContext(ctx, "tool loop critical", "agent", l.id, "tool", tc.Name)
					finalContent = msg
					break
				}
				// Warning: inject system message
				slog.WarnContext(ctx, "tool loop warning", "agent", l.id, "tool", tc.Name)
				warnMsg := providers.Message{Role: "user", Content: msg}
				messages = append(messages, warnMsg)
				pendingMsgs = append(pendingMsgs, warnMsg)
			}
		} else {
			// Multiple tools: parallel execution
			type indexedResult struct {
				idx    int
				tc     providers.ToolCall
				result *tools.Result
			}

			for _, tc := range resp.ToolCalls {
				l.emit(ctx, AgentEvent{
					Type:    EventToolCall,
					AgentID: l.id,
					RunID:   req.RunID,
					Payload: map[string]interface{}{"name": tc.Name, "id": tc.ID, "arguments": tc.Arguments},
				})
			}

			resultCh := make(chan indexedResult, len(resp.ToolCalls))
			var wg sync.WaitGroup

			for i, tc := range resp.ToolCalls {
				wg.Add(1)
				go func(idx int, tc providers.ToolCall) {
					defer wg.Done()
					argsJSON, _ := json.Marshal(tc.Arguments)
					slog.InfoContext(ctx, "tool call", "agent", l.id, "tool", tc.Name, "args_len", len(argsJSON), "parallel", true)
					result := l.tools.ExecuteWithContext(ctx, tc.Name, tc.Arguments)
					resultCh <- indexedResult{idx: idx, tc: tc, result: result}
				}(i, tc)
			}

			go func() { wg.Wait(); close(resultCh) }()

			collected := make([]indexedResult, 0, len(resp.ToolCalls))
			for r := range resultCh {
				collected = append(collected, r)
			}

			sort.Slice(collected, func(i, j int) bool {
				return collected[i].idx < collected[j].idx
			})

			var loopCritical bool
			for _, r := range collected {
				if r.result.IsError {
					errMsg := r.result.ForLLM
					if len(errMsg) > 200 {
						errMsg = errMsg[:200] + "..."
					}
					slog.WarnContext(ctx, "tool error", "agent", l.id, "tool", r.tc.Name, "error", errMsg)
				}

				l.emit(ctx, AgentEvent{
					Type:    EventToolResult,
					AgentID: l.id,
					RunID:   req.RunID,
					Payload: map[string]interface{}{
						"name":     r.tc.Name,
						"id":       r.tc.ID,
						"is_error": r.result.IsError,
						"result":   r.result.ForLLM,
					},
				})

				argsHash := loopDetector.record(r.tc.Name, r.tc.Arguments)
				loopDetector.recordResult(argsHash, r.result.ForLLM)

				toolMsg := providers.Message{
					Role:       "tool",
					Content:    r.result.ForLLM,
					ToolCallID: r.tc.ID,
				}
				messages = append(messages, toolMsg)
				pendingMsgs = append(pendingMsgs, toolMsg)

				if level, msg := loopDetector.detect(r.tc.Name, argsHash); level != "" {
					if level == "critical" {
						slog.WarnContext(ctx, "tool loop critical", "agent", l.id, "tool", r.tc.Name)
						finalContent = msg
						loopCritical = true
						break
					}
					slog.WarnContext(ctx, "tool loop warning", "agent", l.id, "tool", r.tc.Name)
					warnMsg := providers.Message{Role: "user", Content: msg}
					messages = append(messages, warnMsg)
					pendingMsgs = append(pendingMsgs, warnMsg)
				}
			}
			if loopCritical {
				break
			}
		}
	}

	// 4. Sanitize
	finalContent = SanitizeAssistantContent(ctx, finalContent)

	// 5. Fallback for empty content
	if finalContent == "" {
		finalContent = "..."
	}

	// Remove NO_REPLY prefix artifacts
	finalContent = strings.TrimSpace(finalContent)

	pendingMsgs = append(pendingMsgs, providers.Message{
		Role:    "assistant",
		Content: finalContent,
	})

	// 6. Flush all buffered messages to session atomically
	for _, msg := range pendingMsgs {
		l.sessions.AddMessage(req.WorkspaceID, req.SessionKey, msg)
	}

	l.sessions.UpdateMetadata(req.WorkspaceID, req.SessionKey, l.model, l.provider.Name(), req.Channel)
	l.sessions.AccumulateTokens(req.WorkspaceID, req.SessionKey, int64(totalUsage.PromptTokens), int64(totalUsage.CompletionTokens))
	if err := l.sessions.Save(req.WorkspaceID, req.SessionKey); err != nil {
		slog.WarnContext(ctx, "failed to save session", "session", req.SessionKey, "error", err)
	}

	// 7. Check if auto-summarization is needed (runs in background)
	l.maybeSummarize(ctx, req.WorkspaceID, req.SessionKey)

	// 8. Periodic memory capture (throttled, every N turns; no-op when disabled)
	l.maybePeriodicMemoryCapture(ctx, req.WorkspaceID, req.SessionKey)

	return &RunResult{
		Content:    finalContent,
		RunID:      req.RunID,
		Iterations: iteration,
		Usage:      &totalUsage,
	}, nil
}

// maybeSummarize checks if the session needs auto-summarization and runs it in background.
func (l *Loop) maybeSummarize(ctx context.Context, workspaceID, sessionKey string) {
	history := l.sessions.GetHistory(workspaceID, sessionKey)
	lastTokens, lastCount := l.sessions.GetLastPromptTokens(workspaceID, sessionKey)
	tokenEstimate := EstimateTokensWithCalibration(history, lastTokens, lastCount)
	threshold := int(float64(l.contextWindow) * l.maxHistoryShare)

	if len(history) <= 50 && tokenEstimate <= threshold {
		return
	}

	// Per-session lock: prevent concurrent summarization
	muI, _ := l.summarizeMu.LoadOrStore(workspaceID+"\x00"+sessionKey, &sync.Mutex{})
	sessionMu := muI.(*sync.Mutex)
	if !sessionMu.TryLock() {
		slog.DebugContext(ctx, "summarization already in progress, skipping", "session", sessionKey)
		return
	}

	// Memory flush runs synchronously before summarization
	l.memoryFlush(ctx, workspaceID, sessionKey)

	// Summarize in background
	go func() {
		defer sessionMu.Unlock()

		// Re-check after acquiring lock
		history := l.sessions.GetHistory(workspaceID, sessionKey)
		splitIdx := historyTurnStartIndex(history, postRunKeepTurns)
		if splitIdx <= 0 {
			return
		}

		sctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 120*time.Second)
		defer cancel()

		summary := l.sessions.GetSummary(workspaceID, sessionKey)
		toSummarize := history[:splitIdx]

		var sb strings.Builder
		for _, m := range toSummarize {
			if m.Role == "user" {
				sb.WriteString(fmt.Sprintf("user: %s\n", m.Content))
			} else if m.Role == "assistant" {
				sb.WriteString(fmt.Sprintf("assistant: %s\n", SanitizeAssistantContent(ctx, m.Content)))
			}
		}

		var promptB strings.Builder
		promptB.WriteString(compactionSummaryPrompt)
		if summary != "" {
			promptB.WriteString("Existing context: ")
			promptB.WriteString(summary)
			promptB.WriteString("\n\n")
		}
		promptB.WriteString(sb.String())

		inTokens := estimateSummaryInputTokens(toSummarize)
		maxOut := dynamicSummaryMax(inTokens)
		slog.InfoContext(sctx, "compact_budget",
			"session", sessionKey, "in_tokens", inTokens, "out_tokens", maxOut)

		temp := 0.3
		resp, err := l.provider.Chat(sctx, providers.ChatRequest{
			Messages: []providers.Message{{Role: "user", Content: promptB.String()}},
			Model:    l.model,
			Options: providers.ChatOptions{
				MaxTokens:   maxOut,
				Temperature: &temp,
			},
		})
		if err != nil {
			slog.WarnContext(sctx, "summarization failed", "session", sessionKey, "error", err)
			return
		}

		cleaned := SanitizeAssistantContent(sctx, resp.Content)
		if cleaned == "" {
			slog.WarnContext(sctx, "summarization produced empty content, skipping save",
				"session", sessionKey, "raw_len", len(resp.Content),
				"finish_reason", resp.FinishReason)
			return
		}
		l.sessions.SetSummary(workspaceID, sessionKey, cleaned)
		l.sessions.TruncateHistory(workspaceID, sessionKey, len(history)-splitIdx)
		l.sessions.IncrementCompaction(workspaceID, sessionKey)
		l.sessions.SetSessionMetaValue(workspaceID, sessionKey, SessionMetaKeyLastCompactionAt,
			time.Now().UTC().Format(time.RFC3339))
		if err := l.sessions.Save(workspaceID, sessionKey); err != nil {
			slog.WarnContext(sctx, "failed to save after summarization", "session", sessionKey, "error", err)
		}

		slog.InfoContext(sctx, "session summarized", "session", sessionKey,
			"messages_before", len(history), "compaction", l.sessions.GetCompactionCount(workspaceID, sessionKey))
	}()
}

func (l *Loop) emit(ctx context.Context, event AgentEvent) {
	if l.onEvent != nil {
		l.onEvent(ctx, event)
	}
	// Also dispatch to per-run callback if registered
	if cb, ok := l.runCallbacks.Load(event.RunID); ok {
		cb.(func(AgentEvent))(event)
	}
}

// EnsureSession initializes a session if it doesn't exist.
func (l *Loop) EnsureSession(workspaceID, key, createdBy string) {
	if workspaceID == "" {
		workspaceID = store.DefaultWorkspaceID
	}
	l.sessions.GetOrCreate(workspaceID, key, createdBy)
}

// GetCurrentTime returns the current timestamp (for system prompt).
func GetCurrentTime() time.Time {
	return time.Now()
}
