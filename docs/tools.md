# Tools

Tools extend the agent's capabilities. Each tool is a self-contained unit that the LLM can invoke autonomously during the think-act-observe loop.

## Interface

```go
// internal/tools/types.go
type Tool interface {
    Name() string                          // Unique identifier
    Description() string                   // LLM-facing description
    Parameters() map[string]interface{}    // JSON Schema for parameters
    Execute(ctx, args map[string]interface{}) *Result
}

type Result struct {
    ForLLM  string  // Text sent to the LLM
    ForUser string  // Optional user-facing display text
    IsError bool    // Error flag for the LLM
    Err     error   // Go error (internal)
}
```

## Registry

`internal/tools/registry.go` manages tool lifecycle:

```mermaid
flowchart LR
    A[Startup] --> B[Register tools]
    B --> C[Convert to LLM definitions]
    C --> D[LLM sees available tools]
    D --> E[LLM returns tool_calls]
    E --> F[Registry.ExecuteWithContext]
    F --> G[Credential Scrubbing]
    G --> H[Result back to LLM]
```

**Features**:
- Thread-safe (RWMutex)
- Credential scrubbing on all tool outputs (API keys, tokens, connection strings → `[REDACTED]`)
- Execution logging with timing
- Parallel execution support (multiple tool calls in one iteration)

## Tool Registration

Tools are registered conditionally based on config at startup (`cmd/wire.go`):

```mermaid
flowchart TD
    R[Tool Registry]

    J{JIRA configured?} -->|Yes| JT[JIRA tools]
    Q{Qdrant configured?} -->|Yes| QT[search_knowledge]
    O{OpenSearch configured?} -->|Yes| OT[OpenSearch tools]
    G{gRPC configured?} -->|Yes| GT[Loan tools]
    SK{Skills cache?} -->|Yes| SKT[Skill tools]
    M{Memory manager?} -->|Yes| MT[Memory tools]

    JT --> R
    QT --> R
    OT --> R
    GT --> R
    SKT --> R
    MT --> R
```

## Credential Scrubbing

`internal/tools/scrub.go` applies regex-based scrubbing to all tool outputs before they reach the LLM:

| Pattern | Example |
|---------|---------|
| OpenAI keys | `sk-abc123...` → `[REDACTED]` |
| Anthropic keys | `sk-ant-...` → `[REDACTED]` |
| GitHub tokens | `ghp_...`, `gho_...` → `[REDACTED]` |
| AWS keys | `AKIA...` → `[REDACTED]` |
| Connection strings | `mysql://user:pass@host` → `[REDACTED]` |
| Env-var patterns | `API_KEY=secret` → `[REDACTED]` |
| Long hex strings | 64+ char hex → `[REDACTED]` |
| Generic patterns | `token=...`, `password=...`, `bearer ...` |

## Available Tools

### Platform Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `skill_search` | `query` (string), `max_results` (int, default 5) | BM25 search over DB-backed skills |
| `read_skill` | `name` (string) | Read full skill content by name |
| `memory_search` | `query` (string), `max_results` (int, default 6) | Semantic vector search over long-term memory |
| `memory_get` | `path` (string), `from` (int), `lines` (int) | Read specific memory document with line range |

### Domain Tools (CS Use Case)

| Tool | Parameters | Source |
|------|-----------|--------|
| `read_jira_ticket` | `ticket_id` | JIRA REST API |
| `comment_jira` | `ticket_id`, `comment` | JIRA REST API |
| `get_jira_comments` | `ticket_id` | JIRA REST API |
| `search_knowledge` | `query`, `max_results` | Qdrant vector DB |
| `search_http_errors` | `zalopay_id`, `event_time` | OpenSearch |
| `get_logs_by_trace_id` | `trace_id` | OpenSearch |
| `get_loan_detail` | `loan_application_id` | Onboarding gRPC |
| `get_customer_loans` | `zalopay_id` | Onboarding gRPC |
