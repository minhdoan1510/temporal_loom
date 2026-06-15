package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/config"
	"gitlab.zalopay.vn/fin/lending/lending-claw-mcp/internal/services/jira"
)

const jql = `("Customer Request Type" in (Lending_cashloan, Lending_Creditscore)) AND Type = "Production Issue" AND status not in (CLOSED, Rejected, Resolved) AND labels is EMPTY ORDER BY cf[13611] ASC`

//	go run scripts/auto_resolve_ticket.go \
//	  --jira-token "" \
//	  --jwt-secret "" \
//	  --api-url "https://dev-fin-lending-cs-tool.zalopay.vn"
func main() {
	jiraURL := flag.String("jira-url", "https://jira.zalopay.vn", "JIRA base URL (e.g. https://jira.zalopay.vn)")
	jiraToken := flag.String("jira-token", "", "JIRA personal access token")

	jwtSecret := flag.String("jwt-secret", "", "JWT secret for agent API auth")
	jwtSub := flag.String("jwt-sub", "csbot", "JWT subject for agent API auth")

	apiURL := flag.String("api-url", "http://localhost:8080", "Agent API base URL")

	flag.Parse()

	if *jiraURL == "" || *jiraToken == "" || *jwtSecret == "" || *jwtSub == "" {
		log.Fatal("--jira-url, --jira-token, --jwt-sub, and --jwt-secret are required")
	}

	client := jira.NewJiraClient(config.JiraConfig{
		URL:           *jiraURL,
		PersonalToken: *jiraToken,
	})

	bearerToken, err := mintJWT(*jwtSub, *jwtSecret)
	if err != nil {
		log.Fatalf("mint JWT: %v", err)
	}

	ctx := context.Background()
	log.Println("searching JIRA tickets...")

	tickets, err := client.SearchJQL(ctx, jql, 50)
	if err != nil {
		log.Fatalf("JIRA search failed: %v", err)
	}
	log.Printf("found %d tickets", len(tickets))

	baseURL := strings.TrimRight(*apiURL, "/")
	httpClient := &http.Client{Timeout: 5 * time.Minute}

	for i, t := range tickets {
		log.Printf("[%d/%d] processing %s — %s", i+1, len(tickets), t.Key, t.Summary)

		result, err := callAgent(ctx, httpClient, baseURL, bearerToken, t.Key)
		if err != nil {
			log.Printf("[%d/%d] FAILED %s: %v", i+1, len(tickets), t.Key, err)
			continue
		}
		log.Printf("[%d/%d] OK %s — %d iterations, response: %.200s",
			i+1, len(tickets), t.Key, result.Iterations, result.Content)
	}

	log.Println("done")
}

type agentRequest struct {
	SessionKey string `json:"session_key"`
	Message    string `json:"message"`
	Channel    string `json:"channel"`
	Stream     bool   `json:"stream"`
}

type agentResponse struct {
	Content    string `json:"content"`
	RunID      string `json:"runId"`
	Iterations int    `json:"iterations"`
}

func callAgent(ctx context.Context, client *http.Client, baseURL, token, jiraKey string) (*agentResponse, error) {
	body := agentRequest{
		SessionKey: "cl_cs_ticket_" + jiraKey,
		Message:    fmt.Sprintf("Xử lý ticket %s và đăng comment vào JIRA ticket", jiraKey),
		Channel:    "script",
		Stream:     false,
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/api/v1/agent/run", bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var result agentResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	return &result, nil
}

func mintJWT(sub, secret string) (string, error) {
	now := time.Now()
	claims := jwt.RegisteredClaims{
		Subject:   sub,
		ExpiresAt: jwt.NewNumericDate(now.Add(1 * time.Hour)),
		IssuedAt:  jwt.NewNumericDate(now),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}
