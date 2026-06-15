# Overview Architecture

Lending Claw is a **domain-agnostic AI agent platform** built on a single think-act-observe loop. Agent behavior is driven by **skills** and **context files** stored in MySQL — not hardcoded workflows. The same loop serves all use cases; only the skills and available tools change.

```mermaid
flowchart TD
    subgraph Inbound [Inbound Channels]
        HTTP_API[HTTP API]
        JIRA_WH[JIRA Webhook]
    end

    subgraph Gateway [Gateway Layer]
        Router[HTTP Router]
        SSE[SSE Stream]
        Auth[Auth Middleware]
        RBAC[RBAC Middleware]
    end

    subgraph Core [Agent Core - Generic]
        Loop[Agent Loop - think/act/observe]
        SP["System Prompt Builder<br/>(context files + skill summaries)"]
        Guard[Input Guard]
        HistoryPipeline["History Pipeline<br/>(limit/prune/sanitize)"]
        Summarizer[Auto-Summarizer]
    end

    subgraph LLM [LLM Providers]
        OAI[OpenAI-Compatible]
        Anthropic[Anthropic Native]
    end

    subgraph PlatformTools [Platform Tools - Always Available]
        SkillTool[skill_search / read_skill]
        MemTool[memory_search / memory_get]
    end

    subgraph DomainTools ["Domain Tools - Per Use Case (CS initial)"]
        JiraTool[JIRA Tools]
        KBTool[Knowledge Base Tools]
        LogTool[OpenSearch Log Tools]
        LoanTool[Onboarding gRPC Tools]
    end

    subgraph PlatformStores [Platform Stores - MySQL]
        SessionStore[Session Store]
        ContextFileStore[Context File Store]
        SkillStore[Skill Store]
        MemoryStore[Memory Store]
        TraceStore[Trace Store]
    end

    subgraph External [External Services]
        JIRA_EXT[JIRA API]
        OS_EXT[OpenSearch]
        gRPC_EXT[Onboarding gRPC]
        EmbAPI[Embedding API]
    end

    MySQL[(MySQL)]
    Qdrant[(Qdrant)]

    %% Inbound -> Gateway -> Agent
    HTTP_API --> Router
    JIRA_WH --> Router
    Router --> Auth --> RBAC --> Loop
    Router --> SSE

    %% Agent Loop internals
    Loop --> SP
    Loop --> Guard
    Loop --> HistoryPipeline
    Loop --> Summarizer

    %% Agent Loop -> LLM (think)
    Loop --> LLM

    %% Agent Loop -> Tools (act)
    Loop --> PlatformTools
    Loop --> DomainTools

    %% Agent Loop -> Storage (observe/persist)
    Loop --> SessionStore
    Summarizer --> SessionStore

    %% System Prompt reads context files + skills from DB
    SP --> ContextFileStore
    SP --> SkillStore

    %% Platform tools -> stores
    SkillTool --> SkillStore
    MemTool --> MemoryStore
    MemTool --> Qdrant
    MemTool --> EmbAPI

    %% Domain tools -> external services
    JiraTool --> JIRA_EXT
    LogTool --> OS_EXT
    LoanTool --> gRPC_EXT
    KBTool --> Qdrant

    %% All stores -> MySQL
    SessionStore --> MySQL
    ContextFileStore --> MySQL
    SkillStore --> MySQL
    MemoryStore --> MySQL
    TraceStore --> MySQL
```

## Key Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Domain-agnostic core** | Agent loop has no domain logic. Behavior comes from skills + tools. |
| **Interface-first stores** | All stores defined as interfaces in `internal/store/`, implemented in `internal/store/mysql/`. |
| **Extensible tools** | Tools implement a simple interface and register at startup. Adding a tool = implement interface + register. |
| **DB-backed skills** | Skills are CRUD-managed in MySQL. No code changes to add/modify agent behavior. |
| **Observable** | Every run produces traces and spans for debugging and monitoring. |
| **Resilient** | Memory falls back to MySQL keyword search if Qdrant is unavailable. |

## Data Flow

```mermaid
flowchart LR
    A[User Message] --> B[Load Session]
    B --> C[Build System Prompt]
    C --> D[LLM Iteration Loop]
    D --> E{Tool Calls?}
    E -->|Yes| F[Execute Tools]
    F --> D
    E -->|No| G[Sanitize Response]
    G --> H[Save Session]
    H --> I[Auto-Summarize?]
    I -->|Yes| J[Memory Flush + Compaction]
    I -->|No| K[Return Response]
    J --> K
```
