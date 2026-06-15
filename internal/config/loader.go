package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

// Load reads a YAML config file, applies env overrides, and returns the config.
func Load(path string) (*Config, error) {
	var cfg Config

	// #nosec G304 -- path is an operator-supplied config file location, not untrusted user input
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
