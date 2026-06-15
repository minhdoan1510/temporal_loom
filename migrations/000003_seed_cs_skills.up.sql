-- Seed initial CS (Customer Support) skills for the lending agent.
-- These skills guide the agent's behavior when handling CS tickets.

INSERT INTO skills (id, name, description, content, metadata) VALUES
(UUID(), 'cs_ticket_triage', 'Triage and classify incoming CS tickets',
'# CS Ticket Triage

When you receive a new CS ticket to analyze, follow these steps:

1. **Read the ticket** using `read_jira_ticket` to understand the issue
2. **Check comments** using `get_jira_comments` for any prior context
3. **Classify the issue** into one of these categories:
   - Loan application error (status/code issues)
   - Payment/disbursement problem
   - Account/KYC verification issue
   - General inquiry or complaint
   - Technical error (HTTP errors, timeouts)

4. **Gather relevant data** based on the issue type:
   - For loan issues: Use `get_loan_detail` or `get_customer_loans`
   - For technical errors: Use `search_http_errors` and `get_logs_by_trace_id`
   - For knowledge questions: Use `search_knowledge`

5. **Provide analysis** with:
   - Root cause identification
   - Recommended resolution steps
   - Any relevant knowledge base references

Always be thorough in your investigation before providing conclusions.',
'{"category": "workflow", "priority": 1}')
ON DUPLICATE KEY UPDATE content = VALUES(content), metadata = VALUES(metadata);

INSERT INTO skills (id, name, description, content, metadata) VALUES
(UUID(), 'loan_investigation', 'Investigate loan application issues and errors',
'# Loan Investigation

When investigating a loan application issue:

1. **Get loan details** using `get_loan_detail` with the loan_application_id
2. **Check the status and code** fields:
   - Status indicates the overall loan state
   - Code and code_message give specific error/state info
   - Current step shows where in the process the loan is
3. **Review timeline**:
   - created_at → submit_info_at → face_authen_at → approved_at → sign_contract_at
   - Gaps or missing timestamps indicate where the process stalled
4. **For error codes**, search the knowledge base using `search_knowledge` with the code/message
5. **For HTTP errors**, use `search_http_errors` with the user_id around the event time
6. **If trace IDs are found** in logs, use `get_logs_by_trace_id` to trace the full request flow

Common status codes:
- Partner-specific codes vary by partner_code (check knowledge base)
- Validation field may contain JSON with specific validation errors',
'{"category": "domain", "priority": 2}')
ON DUPLICATE KEY UPDATE content = VALUES(content), metadata = VALUES(metadata);

INSERT INTO skills (id, name, description, content, metadata) VALUES
(UUID(), 'log_analysis', 'Analyze application logs and trace errors',
'# Log Analysis

When analyzing application logs:

1. **Search by user ID** using `search_http_errors` to find error patterns:
   - Set event_time to when the issue was reported
   - Start with hours_delta=24, narrow down if too many results
2. **Trace specific requests** using `get_logs_by_trace_id`:
   - Look for trace IDs in the initial error search results
   - Follow the request flow across services
3. **Interpret log entries**:
   - Level: error/warn/info indicates severity
   - Trace ID: groups all logs for a single request
   - Span ID: identifies specific service operations
   - Error/Message: the actual error details
4. **Common error patterns**:
   - HTTP 4xx: client-side issues (bad request, auth failure)
   - HTTP 5xx: server-side issues (internal error, timeout)
   - gRPC errors: partner service connectivity issues
   - Timeout errors: usually partner API slowness',
'{"category": "domain", "priority": 3}')
ON DUPLICATE KEY UPDATE content = VALUES(content), metadata = VALUES(metadata);

INSERT INTO skills (id, name, description, content, metadata) VALUES
(UUID(), 'ticket_response', 'Write professional CS ticket responses',
'# Ticket Response Guidelines

When writing a comment on a CS ticket using `comment_jira`:

## Format
- Start with a brief summary of findings
- List investigation steps taken
- Provide root cause analysis
- Recommend next steps or resolution
- Use markdown formatting for readability

## Tone
- Professional and clear
- Avoid technical jargon when possible
- Be specific about findings (include IDs, timestamps, error codes)
- If uncertain, clearly state what is known vs. unknown

## Template
```
**Investigation Summary**

**Issue:** [Brief description]

**Investigation Steps:**
1. [What was checked]
2. [What was found]

**Root Cause:** [Explanation]

**Resolution/Next Steps:**
- [Action items]

**References:**
- Loan ID: [if applicable]
- Trace ID: [if applicable]
- KB Article: [if applicable]
```',
'{"category": "workflow", "priority": 4}')
ON DUPLICATE KEY UPDATE content = VALUES(content), metadata = VALUES(metadata);

INSERT INTO skills (id, name, description, content, metadata) VALUES
(UUID(), 'cs_check_issue', 'Full CS ticket investigation workflow: read ticket, classify, investigate loan/logs/KB, analyze root cause, post JIRA comment',
'# CS Ticket Issue Investigation

Skill for investigating and resolving customer support JIRA tickets in the Zalopay system.

## When to Use

Activate this skill when:
- User provides a JIRA ticket ID (e.g., LENDING-123, CSKH-456)
- User asks to check, investigate, or resolve a CS ticket
- User mentions customer complaints about loan applications

## Investigation Workflow

Follow these steps in order. Do NOT skip steps.

### Step 1: Read & Parse Ticket

1. Call `read_jira_ticket` with the ticket ID
2. Call `get_jira_comments` to see prior context
3. Extract: zalopay_id, loan_application_id, event_time, partner_code

### Step 2: Classify the Issue

Determine category: loan stage (registration/approval/contract_signing/disbursement/repayment), symptom (cannot_continue_otp/face_auth_failure/timeout_error), account issues, or technical errors.
Use `search_knowledge` with ticket summary + suspected category.

### Step 3: Investigate

Priority order:
- Have loan_application_id → `get_loan_detail`
- Have zalopay_id only → `get_customer_loans` then `get_loan_detail` on most recent
- Have zalopay_id + event_time → `search_http_errors`
- Found trace_id in logs → `get_logs_by_trace_id` (max 2-3 traces)
- Need process/policy info → `search_knowledge`

CRITICAL: Always analyze the NEWEST loan application first.

### Step 4: Analyze Root Cause

Identify: root cause, which step stalled (check timeline gaps), resolved or ongoing, actionability.
Max 2 enrichment rounds. If still insufficient, note uncertainty and escalate.

### Step 5: Post JIRA Comment

Use `comment_jira` with JIRA wiki markup (NOT Markdown).

Template:
h3. *Kết luận*: [summary + CTA]

h3. Thông tin ticket
* *Zalopay ID*: [value]
* *Loan Application ID*: [value]
* *Event time*: [value]
* *Partner*: [value]

h3. Phân loại ticket
* *Label*: [category]
* *Recommended Action*: [CTA]

h3. Kết quả tra cứu
* Loan status / Current step / Code

h3. Nguyên nhân
[Root cause or state unknown + escalation]

h3. Log lỗi (nếu có)
{code}[error logs]{code}

h3. Giải pháp
[Specific resolution or escalate]

h3. Tham khảo
* [Title|URL]

## Rules
- JIRA wiki syntax: h3. for headers, *bold*, * for bullets, {code} for code, [text|url] for links
- Partner-specific: use ONLY info matching the exact partner_code
- Quality: verify root cause, CTA clarity, all IDs included, sources referenced, no contradictions',
'{"category": "workflow", "priority": 0}')
ON DUPLICATE KEY UPDATE content = VALUES(content), metadata = VALUES(metadata);
