package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	MCPServer     MCPServerConfig     `yaml:"mcp_server"`
	Telemetry     TelemetryConfig     `yaml:"telemetry"`
	Jira          JiraConfig          `yaml:"jira"`
	OpenSearch    OpenSearchConfig    `yaml:"opensearch"`
	Onboarding    OnboardingConfig    `yaml:"onboarding"`
	LLM           LLMConfig           `yaml:"llm"`
	Mail          MailConfig          `yaml:"mail"`
	Datawarehouse DatawarehouseConfig `yaml:"datawarehouse"`
}

type TelemetryConfig struct {
	ServiceName  string `yaml:"service_name"`
	OTLPEndpoint string `yaml:"otlp_endpoint"`
}

type MCPServerConfig struct {
	Host      string `yaml:"host"`
	Port      int    `yaml:"port"`
	AuthToken string `yaml:"auth_token"`
}

type JiraConfig struct {
	URL           string `yaml:"url"`
	PersonalToken string `yaml:"personal_token"`
}

type OpenSearchConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	Index    string `yaml:"index"`
}

type OnboardingConfig struct {
	GRPCAddress string `yaml:"grpc_address"`
	GRPCSecure  bool   `yaml:"grpc_secure"`
	ClientID    string `yaml:"client_id"`
	ClientKey   string `yaml:"client_key"`
}

// LLMConfig configures an OpenAI-compatible LLM endpoint (LiteLLM, vLLM, etc.).
// Shared with the main app's `llm:` config block.
type LLMConfig struct {
	Provider string `yaml:"provider"`
	Model    string `yaml:"model"`
	BaseURL  string `yaml:"base_url"`
	APIKey   string `yaml:"api_key"`
}

// MailConfig configures the Resend transactional email API.
type MailConfig struct {
	ResendAPIKey string `yaml:"resend_api_key"`
	FromEmail    string `yaml:"from_email"`
}

// DatawarehouseConfig configures the (mock) data warehouse query tool.
// When Mock is true (default), query_sql returns LLM-synthesized rows instead
// of hitting a real warehouse. Model overrides the shared LLM model if set.
type DatawarehouseConfig struct {
	Mock  bool   `yaml:"mock"`
	Model string `yaml:"model"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	return &cfg, nil
}
