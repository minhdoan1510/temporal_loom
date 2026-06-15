package jira

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
)

// TicketInfo is JIRA issue data.
type TicketInfo struct {
	Key         string
	Summary     string
	Description *string
	Status      string
	Priority    *string
	Assignee    *string
	Reporter    *string
	Labels      []string
	Components  []string
	Created     string
	Updated     string
	IssueType   string
}

// Comment is a JIRA issue comment.
type Comment struct {
	Author  string
	Body    string
	Created string
}

// JiraClient is an HTTP client for the JIRA REST API.
type JiraClient struct {
	url        string
	token      string
	httpClient *http.Client
}

// NewJiraClient creates a JIRA client from config.
func NewJiraClient(cfg config.JiraConfig) *JiraClient {
	return &JiraClient{
		url:   strings.TrimRight(cfg.URL, "/"),
		token: cfg.PersonalToken,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GetTicket fetches a ticket by key (e.g. "LENDING-123").
func (c *JiraClient) GetTicket(ctx context.Context, ticketID string) (*TicketInfo, error) {
	url := fmt.Sprintf("%s/rest/api/2/issue/%s", c.url, ticketID)

	body, err := c.doGet(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("get ticket %s: %w", ticketID, err)
	}

	var issue jiraIssue
	if err := json.Unmarshal(body, &issue); err != nil {
		return nil, fmt.Errorf("parse ticket %s: %w", ticketID, err)
	}

	return issue.toTicketInfo(), nil
}

// GetComments fetches all comments on a ticket.
func (c *JiraClient) GetComments(ctx context.Context, ticketID string) ([]Comment, error) {
	url := fmt.Sprintf("%s/rest/api/2/issue/%s/comment", c.url, ticketID)

	body, err := c.doGet(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("get comments %s: %w", ticketID, err)
	}

	var resp jiraCommentsResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parse comments %s: %w", ticketID, err)
	}

	var comments []Comment
	for _, c := range resp.Comments {
		if _, isBot := botCommentEmails[strings.ToLower(c.Author.EmailAddress)]; isBot {
			continue
		}
		comments = append(comments, Comment{
			Author:  c.Author.DisplayName,
			Body:    c.Body,
			Created: c.Created,
		})
	}
	return comments, nil
}

// AddComment adds a comment to a JIRA ticket.
func (c *JiraClient) AddComment(ctx context.Context, ticketID, comment string) error {
	url := fmt.Sprintf("%s/rest/api/2/issue/%s/comment", c.url, ticketID)

	body := map[string]string{"body": comment}
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal comment: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("add comment to %s: %w", ticketID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("add comment to %s: HTTP %d: %s", ticketID, resp.StatusCode, string(respBody))
	}

	return nil
}

// AddLabels adds labels to a JIRA ticket using the update operation (idempotent).
func (c *JiraClient) AddLabels(ctx context.Context, ticketID string, labels []string) error {
	url := fmt.Sprintf("%s/rest/api/2/issue/%s", c.url, ticketID)

	type labelOp struct {
		Add string `json:"add"`
	}
	var ops []labelOp
	for _, l := range labels {
		ops = append(ops, labelOp{Add: l})
	}
	payload := map[string]interface{}{
		"update": map[string]interface{}{
			"labels": ops,
		},
	}
	bodyJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal labels: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("add labels to %s: %w", ticketID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("add labels to %s: HTTP %d: %s", ticketID, resp.StatusCode, string(respBody))
	}

	return nil
}

// Transition is one of the workflow transitions available on a JIRA issue.
type Transition struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	To   struct {
		Name string `json:"name"`
	} `json:"to"`
}

// GetTransitions returns the workflow transitions currently available on the
// ticket (depends on the ticket's current status + the workflow scheme).
func (c *JiraClient) GetTransitions(ctx context.Context, ticketID string) ([]Transition, error) {
	url := fmt.Sprintf("%s/rest/api/2/issue/%s/transitions", c.url, ticketID)
	body, err := c.doGet(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("get transitions %s: %w", ticketID, err)
	}
	var resp struct {
		Transitions []Transition `json:"transitions"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parse transitions %s: %w", ticketID, err)
	}
	return resp.Transitions, nil
}

// ExecuteTransition runs a workflow transition on the ticket. When fields is
// non-nil it is sent as the `fields` payload (used for transitions that require
// resolution/root-cause metadata).
func (c *JiraClient) ExecuteTransition(ctx context.Context, ticketID, transitionID string, fields map[string]interface{}) error {
	url := fmt.Sprintf("%s/rest/api/2/issue/%s/transitions", c.url, ticketID)

	payload := map[string]interface{}{
		"transition": map[string]string{"id": transitionID},
	}
	if len(fields) > 0 {
		payload["fields"] = fields
	}

	bodyJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal transition: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("execute transition on %s: %w", ticketID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("execute transition on %s: HTTP %d: %s", ticketID, resp.StatusCode, string(respBody))
	}
	return nil
}

// MarkDoneCsTicket drives a CS ticket through the configured workflow order
// (Acknowledge → Assigned → In Progress → Resolved), attaching resolution and
// root-cause metadata on the final step. If the ticket is already Resolved,
// it returns (nil, nil) so the caller can still apply post-resolve labels.
// Returns the list of `To.Name` values applied, in order.
func (c *JiraClient) MarkDoneCsTicket(ctx context.Context, ticketID, rootCauseID string) ([]string, error) {
	ticket, err := c.GetTicket(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	if ticket.Status == resolvedStatusName {
		return nil, nil
	}

	resolveFields := map[string]interface{}{
		"resolution":        map[string]string{"id": resolutionDoneID},
		rootCauseFieldID:    map[string]string{"id": rootCauseID},
		resolutionNoteField: resolutionNote,
	}

	var applied []string
	const maxSteps = 10
	for step := 0; step < maxSteps; step++ {
		trans, err := c.GetTransitions(ctx, ticketID)
		if err != nil {
			return applied, err
		}
		if len(trans) == 0 {
			return applied, fmt.Errorf("no transitions available on %s", ticketID)
		}

		var next *Transition
		for _, target := range csWorkflowOrder {
			for i := range trans {
				if trans[i].To.Name == target {
					next = &trans[i]
					break
				}
			}
			if next != nil {
				break
			}
		}
		if next == nil {
			available := make([]string, 0, len(trans))
			for _, t := range trans {
				available = append(available, t.To.Name)
			}
			return applied, fmt.Errorf("no workflow transition leads to %v from current state on %s (available: %v)", csWorkflowOrder, ticketID, available)
		}

		var fields map[string]interface{}
		if next.To.Name == resolvedStatusName {
			fields = resolveFields
		}
		if err := c.ExecuteTransition(ctx, ticketID, next.ID, fields); err != nil {
			return applied, err
		}
		applied = append(applied, next.To.Name)
		if next.To.Name == resolvedStatusName {
			return applied, nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return applied, fmt.Errorf("workflow on %s did not reach %s after %d steps", ticketID, resolvedStatusName, maxSteps)
}

// SearchJQL searches JIRA issues using a JQL query with automatic pagination.
func (c *JiraClient) SearchJQL(ctx context.Context, jql string, maxResults int) ([]TicketInfo, error) {
	endpoint := fmt.Sprintf("%s/rest/api/2/search", c.url)
	if maxResults <= 0 {
		maxResults = 50
	}

	var all []TicketInfo
	startAt := 0

	for {
		payload := map[string]interface{}{
			"jql":        jql,
			"startAt":    startAt,
			"maxResults": maxResults,
			"fields":     []string{"key", "summary", "status", "issuetype", "priority", "assignee", "reporter", "labels", "components", "created", "updated", "description"},
		}
		bodyJSON, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("marshal search request: %w", err)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyJSON))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+c.token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("jira search: %w", err)
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("read search response: %w", err)
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("jira search: HTTP %d: %s", resp.StatusCode, string(respBody))
		}

		var sr jiraSearchResponse
		if err := json.Unmarshal(respBody, &sr); err != nil {
			return nil, fmt.Errorf("parse search response: %w", err)
		}

		for i := range sr.Issues {
			all = append(all, *sr.Issues[i].toTicketInfo())
		}

		startAt += len(sr.Issues)
		if startAt >= sr.Total || len(sr.Issues) == 0 {
			break
		}
	}

	return all, nil
}

func (c *JiraClient) doGet(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}

// --- JIRA API response types ---

type jiraIssue struct {
	Key    string     `json:"key"`
	Fields jiraFields `json:"fields"`
}

type jiraFields struct {
	Summary     string           `json:"summary"`
	Description *string          `json:"description"`
	Status      jiraNameField    `json:"status"`
	Priority    *jiraNameField   `json:"priority"`
	Assignee    *jiraPersonField `json:"assignee"`
	Reporter    *jiraPersonField `json:"reporter"`
	Labels      []string         `json:"labels"`
	Components  []jiraNameField  `json:"components"`
	Created     string           `json:"created"`
	Updated     string           `json:"updated"`
	IssueType   jiraNameField    `json:"issuetype"`
}

type jiraNameField struct {
	Name string `json:"name"`
}

type jiraPersonField struct {
	DisplayName  string `json:"displayName"`
	EmailAddress string `json:"emailAddress"`
}

// botCommentEmails lists JIRA accounts whose comments should be skipped when
// reading comments (e.g. workflow boilerplate posted by the incident bot).
var botCommentEmails = map[string]struct{}{
	"incidentadministrator@zalopay.vn": {},
}

type jiraSearchResponse struct {
	StartAt int         `json:"startAt"`
	Total   int         `json:"total"`
	Issues  []jiraIssue `json:"issues"`
}

type jiraCommentsResponse struct {
	Comments []jiraComment `json:"comments"`
}

type jiraComment struct {
	Author  jiraPersonField `json:"author"`
	Body    string          `json:"body"`
	Created string          `json:"created"`
}

func (issue *jiraIssue) toTicketInfo() *TicketInfo {
	f := issue.Fields

	ticket := &TicketInfo{
		Key:         issue.Key,
		Summary:     f.Summary,
		Description: f.Description,
		Status:      f.Status.Name,
		Labels:      f.Labels,
		Created:     f.Created,
		Updated:     f.Updated,
		IssueType:   f.IssueType.Name,
	}

	if f.Priority != nil {
		ticket.Priority = &f.Priority.Name
	}
	if f.Assignee != nil {
		ticket.Assignee = &f.Assignee.DisplayName
	}
	if f.Reporter != nil {
		ticket.Reporter = &f.Reporter.DisplayName
	}

	for _, c := range f.Components {
		ticket.Components = append(ticket.Components, c.Name)
	}

	return ticket
}
