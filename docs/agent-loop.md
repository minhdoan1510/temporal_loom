# Agent Loop

The agent loop (`internal/agent/loop.go`) implements a **single generic think-act-observe cycle**. It is the only execution path — all channels (CLI, HTTP, webhooks) feed into it.

## Lifecycle

```mermaid
sequenceDiagram
    participant C as Channel
    participant L as Loop.Run
    participant H as History Pipeline
    participant P as LLM Provider
    participant T as Tool Registry
    participant S as Session Store

    C->>L: RunRequest

    Note over L: emit run.started

    L->>S: GetSession
    L->>H: buildMessages

    Note over H: Load context files, resolve skills, build system prompt, limit turns, prune context, sanitize pairs

    H-->>L: Messages

    loop Max 20 iterations
        L->>P: Chat with tool definitions

        alt Streaming enabled
            P-->>L: chunks via callback
            Note over L: emit chunk per token
        end

        P-->>L: ChatResponse

        alt No tool_calls
            Note over L: Final response ready
        else Has tool_calls
            Note over L: emit tool.call per tool

            alt Single tool call
                L->>T: Execute tool
            else Multiple tool calls
                L->>T: Execute in parallel
            end

            T-->>L: Results
            Note over L: emit tool.result per tool
            Note over L: Append to messages
        end
    end

    L->>L: Sanitize content
    L->>S: SaveSession

    Note over L: emit run.completed

    L->>L: maybeSummarize in background
    L-->>C: RunResult
```

## Configuration

```go
type LoopConfig struct {
    ID              string             // Agent identifier
    Provider        providers.Provider // LLM provider
    Model           string             // Model name
    ContextWindow   int                // Token limit (default: 200,000)
    MaxIterations   int                // Max think-act-observe cycles (default: 20)
    MaxMessageChars int                // Input message truncation (default: 32,000)
    Sessions        store.SessionStore
    ContextFiles    store.ContextFileStore
    Tools           *tools.Registry
    SkillsCache     *skills.Cache
    HasMemory       bool
    PruningCfg      *PruningConfig
    OnEvent         func(AgentEvent)   // Global event handler
}
```

## Event System

Events are emitted throughout the loop for SSE streaming and tracing:

```mermaid
graph LR
    E[emit] --> G[Global OnEvent - tracing recorder]
    E --> R[Per-Run OnEvent - SSE writer]
```

| Event | When | Payload |
|-------|------|---------|
| `run.started` | Run begins | `session_key`, `channel`, `user_id`, `input_preview` |
| `chunk` | Each streamed token | `content` |
| `tool.call` | Before tool execution | `name`, `id` |
| `tool.result` | After tool execution | `name`, `id`, `is_error` |
| `run.completed` | Run finishes | `content`, `output_preview`, token counts |
| `run.failed` | Run errors | `error` |

## Auto-Summarization

After each run, the loop checks if summarization is needed:

```mermaid
flowchart TD
    A[Run completed] --> B{History > 50 msgs OR tokens > 75%?}
    B -->|No| C[Done]
    B -->|Yes| D[Acquire per-session mutex]
    D --> E[Memory Flush]
    E --> F[Summarize old messages]
    F --> G[Keep last 4 messages]
    G --> H[Save summary + truncated history]
    H --> I[Increment compaction_count]
```
