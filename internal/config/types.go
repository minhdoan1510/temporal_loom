package config

import "time"

// Config is the root configuration for lending-claw.
type Config struct {
	Server     ServerConfig     `yaml:"server"`
	LLM        LLMConfig        `yaml:"llm"`
	Agent      AgentConfig      `yaml:"agent"`
	MySQL      MySQLConfig      `yaml:"mysql"`
	Qdrant     QdrantConfig     `yaml:"qdrant"`
	Embedding  EmbeddingConfig  `yaml:"embedding"`
	Skills     SkillsConfig     `yaml:"skills"`
	Jira       JiraConfig       `yaml:"jira"`
	OpenSearch OpenSearchConfig `yaml:"opensearch"`
	Onboarding OnboardingConfig `yaml:"onboarding"`
	Telegram   TelegramConfig   `yaml:"telegram"`
	Confluence ConfluenceConfig `yaml:"confluence"`
	Translator TranslatorConfig `yaml:"translator"`
	Telemetry  TelemetryConfig  `yaml:"telemetry"`
	RBAC       RBACConfig       `yaml:"rbac"`
	Temporal   TemporalConfig   `yaml:"temporal"`
	CAS        CASConfig        `yaml:"cas"`
}

type ServerConfig struct {
	Host           string   `yaml:"host"`
	Port           int      `yaml:"port"`
	JWTSecret      string   `yaml:"jwt_secret"`      // HMAC key for JWT verification; empty disables auth
	AllowedOrigins []string `yaml:"allowed_origins"` // CORS origins
	WebDir         string   `yaml:"web_dir"`         // path to FE dist/; empty disables static serving
	EncryptionKey  string   `yaml:"encryption_key"`  // AES-256 key (hex 64 / base64 44 / raw 32 chars) for encrypting secrets at rest; empty disables encryption
}

type LLMConfig struct {
	Provider string `yaml:"provider"`
	Model    string `yaml:"model"`
	BaseURL  string `yaml:"base_url"`
	APIKey   string `yaml:"api_key"`
	Proxy    string `yaml:"proxy"` // optional HTTP proxy for outbound LLM calls, e.g. http://10.40.81.10:8088
}

type AgentConfig struct {
	MaxIterations   int     `yaml:"max_iterations"`
	MaxMessageChars int     `yaml:"max_message_chars"`
	ContextWindow   int     `yaml:"context_window"`
	MaxHistoryShare float64 `yaml:"max_history_share"` // fraction of context window used by history before compact triggers; 0 = default 0.75
	// MemoryCaptureEveryTurns runs a memory-capture flush every N user turns
	// (in addition to the pre-compaction flush). 0 disables periodic capture.
	MemoryCaptureEveryTurns int `yaml:"memory_capture_every_turns"`
	// MemoryRecallMinScore filters per-turn memory prefetch (B1): recalled
	// snippets scoring below this are dropped so weak/off-topic matches are not
	// auto-injected. 0 disables filtering. Tune below the relevant-match score
	// of the embedding model (qwen3-embedding ~0.45); default 0.3.
	MemoryRecallMinScore float64 `yaml:"memory_recall_min_score"`
	// Temperature and TopP are the sampling parameters for the main agent-loop
	// LLM calls. Both default to 1.0 when unset (<= 0).
	Temperature float64 `yaml:"temperature"`
	TopP        float64 `yaml:"top_p"`
}

type MySQLConfig struct {
	DSN string `yaml:"dsn"`
}

type QdrantConfig struct {
	Host           string  `yaml:"host"`
	Port           int     `yaml:"port"`
	APIKey         string  `yaml:"api_key"`
	ScoreThreshold float64 `yaml:"score_threshold"`
}

type EmbeddingConfig struct {
	BaseURL    string `yaml:"base_url"`
	Model      string `yaml:"model"`
	VectorSize int    `yaml:"vector_size"`
}

type SkillsConfig struct {
	CacheRefreshInterval time.Duration `yaml:"cache_refresh_interval"`
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

type TelegramConfig struct {
	BotToken string `yaml:"bot_token"`
}

type ConfluenceConfig struct {
	URL    string `yaml:"url"`
	APIKey string `yaml:"api_key"` // Base64(username:PAT)
}

type TranslatorConfig struct {
	Model   string `yaml:"model"`
	BaseURL string `yaml:"base_url"`
	APIKey  string `yaml:"api_key"` // falls back to llm.api_key if empty
}

type TelemetryConfig struct {
	ServiceName  string         `yaml:"service_name"`
	OTLPEndpoint string         `yaml:"otlp_endpoint"` // OTLP/gRPC collector endpoint (e.g. "host:4317")
	Langfuse     LangfuseConfig `yaml:"langfuse"`
}

// LangfuseConfig configures direct OTLP/HTTP export to a Langfuse instance.
// Langfuse only accepts OTLP over HTTP, so this is exported separately from
// the gRPC collector above; both can be enabled at once.
type LangfuseConfig struct {
	Enabled   bool   `yaml:"enabled"`
	Endpoint  string `yaml:"endpoint"`   // full traces URL, e.g. "http://langfuse:3000/api/public/otel/v1/traces"
	PublicKey string `yaml:"public_key"` // pk-lf-...
	SecretKey string `yaml:"secret_key"` // sk-lf-...
}

type TemporalConfig struct {
	HostPort  string `yaml:"host_port"`
	Namespace string `yaml:"namespace"`
	TLS       bool   `yaml:"tls"`
}

type RBACConfig struct {
	Enabled bool `yaml:"enabled"`
}

// CASConfig configures CAS SSO login. When BaseURL is empty, the CAS login
// endpoint is not registered.
type CASConfig struct {
	BaseURL  string        `yaml:"base_url"`  // e.g. https://platform-cas.zalopay.vn
	TokenTTL time.Duration `yaml:"token_ttl"` // minted-JWT lifetime; defaults to 24h when unset
	Proxy    string        `yaml:"proxy"`     // optional HTTP proxy for outbound CAS calls, e.g. http://10.40.81.10:8088
}
