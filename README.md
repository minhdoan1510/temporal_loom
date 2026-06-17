# Temporal Loom

Temporal Loom helps teams build focused AI agent workspaces around real
operational workflows. Each workspace can bring its own knowledge, tools,
settings, permissions, routines, skills, and answer-ready chat experience.

The first configured workspace is **Lending Claw**, a Cashloan CS workspace for
investigating loan applications, partner callbacks, onboarding evidence, report
data, and customer-service tickets.

## Why Temporal Loom

In a fintech company, teams lose hours every day to repetitive tasks,
scattered data lookups, and manual reporting. The result is operational
bottlenecks and inconsistent output.

Temporal Loom serves a wide range of domain teams, from Operations and
Customer Support to Marketing and Business Analysis, that need to automate
their workflows and get fast, grounded answers.

## What Temporal Loom Provides

Temporal Loom is more than a chat surface. It gives every workspace the product
controls needed to keep answers grounded in team context and connected systems.

| Feature               | What it does                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Routines              | Turns repeated team questions into scheduled agent runs with timing, status, and execution history.                              |
| Built-in skills       | Stores reusable `SKILL.md` bundles and lets teams generate new skills from workflows with AI.                                    |
| Knowledge bases       | Indexes Confluence or Markdown sources into Qdrant so agents retrieve approved workspace context before answering.               |
| Appearance and access | Gives admins workspace-level theme, accent color, and tab-level access controls.                                                 |
| MCP servers           | Connects authenticated Model Context Protocol servers for internal APIs, documents, tickets, mail, search, and evidence sources. |
| Chat sessions         | Keeps chat history scoped to the workspace so investigations, reports, and handoffs stay traceable.                              |

## Lending Claw Workspace

Lending Claw is a Temporal Loom workspace configured for Cashloan CS. It turns
loan IDs, partner callbacks, logs, and onboarding evidence into investigation
cards and grounded answers.

Primary Lending Claw workflows:

- **Check a loan application**: read onboarding status, partner, amount,
  contract IDs, and the failing step from one prompt.
- **Pinpoint partner errors**: connect callbacks and internal functions so the
  team can see where a flow broke.
- **Compare partner performance**: produce chart-backed readouts for loan count,
  disbursement amount, and ticket-size differences.
- **Understand onboarding drop-off**: review the funnel from app open to
  approval, contract signing, and final disbursement.

## Workspace Use Cases

The same workspace model can be adapted beyond Lending Claw:

- **Customer Services**: summarize customer context, classify issues, and draft
  the next response from workspace knowledge.
- **Query Report Data**: ask questions over report data and get chart-backed
  readouts for review.
- **Marketing**: turn campaign notes, audience signals, and competitor context
  into usable briefs.
- **Planner**: build milestones, owners, dependencies, and decision notes.
- **Report readout**: explain metric movement and prepare review summaries.
- **Data cleanup**: find mismatched values, duplicates, and records that need
  follow-up.
- **Evidence summary**: turn logs, files, and tool output into a readable
  timeline.
- **Customer reply**: draft concise updates from the resolved investigation.
- **Source compare**: highlight agreement and gaps across internal systems.
- **Status report**: package progress, blockers, and owner actions.

## Value and Extensibility

Temporal Loom cuts processing time from hours to minutes while keeping output
consistent. Just as important, the platform is built for unlimited
extensibility: by simply adding new rules, tools, or knowledge sources, any
domain team can instantly expand the agent's capabilities for its own work,
with no need to rewrite the system. 
