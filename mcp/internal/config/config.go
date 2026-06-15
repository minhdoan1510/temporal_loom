package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	MCPServer  MCPServerConfig  `yaml:"mcp_server"`
	Telemetry  TelemetryConfig  `yaml:"telemetry"`
	Jira       JiraConfig       `yaml:"jira"`
	OpenSearch OpenSearchConfig `yaml:"opensearch"`
	Onboarding OnboardingConfig `yaml:"onboarding"`
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
