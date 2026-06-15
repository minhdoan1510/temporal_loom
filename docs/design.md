# Lending Claw — Design Documents

Technical design of the lending-claw AI agent platform.

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | System overview, design principles, data flow |
| [Agent Loop](agent-loop.md) | Think-act-observe cycle, lifecycle, events, auto-summarization |
| [Context Management](context-management.md) | System prompt, history pipeline, context pruning |
| [Tools](tools.md) | Tool interface, registry, credential scrubbing, tool reference |
| [Skills](skills.md) | DB-backed skills, BM25 cache, inline vs search modes |
| [Memory](memory.md) | Long-term memory, Qdrant vectors, memory flush, fallback |
| [RBAC](rbac.md) | Role-based access control, CRUD permissions, Casbin enforcer |
