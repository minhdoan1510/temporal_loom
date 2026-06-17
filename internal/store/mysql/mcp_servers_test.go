package mysql

import (
	"context"
	"testing"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/crypto"
)

func TestOAuthConfigEncryptionRoundTrip(t *testing.T) {
	s := NewMySQLMCPServerStore(nil, "12345678901234567890123456789012")
	cfg := &store.MCPOAuthConfig{
		Provider:     "notion",
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		AccessToken:  "access-token",
		RefreshToken: "refresh-token",
		CodeVerifier: "code-verifier",
		State:        "state-value",
	}

	encrypted, err := s.encryptOAuthConfig(cfg)
	if err != nil {
		t.Fatalf("encryptOAuthConfig: %v", err)
	}
	if encrypted.ClientSecret == cfg.ClientSecret {
		t.Fatal("ClientSecret was not encrypted")
	}
	if encrypted.AccessToken == cfg.AccessToken {
		t.Fatal("AccessToken was not encrypted")
	}
	if encrypted.RefreshToken == cfg.RefreshToken {
		t.Fatal("RefreshToken was not encrypted")
	}
	if encrypted.CodeVerifier == cfg.CodeVerifier {
		t.Fatal("CodeVerifier was not encrypted")
	}
	if !crypto.IsEncrypted(encrypted.AccessToken) {
		t.Fatalf("AccessToken lacks encrypted prefix: %q", encrypted.AccessToken)
	}

	decrypted := s.decryptOAuthConfig(context.Background(), "notion", encrypted)
	if decrypted.ClientSecret != cfg.ClientSecret {
		t.Fatalf("ClientSecret = %q", decrypted.ClientSecret)
	}
	if decrypted.AccessToken != cfg.AccessToken {
		t.Fatalf("AccessToken = %q", decrypted.AccessToken)
	}
	if decrypted.RefreshToken != cfg.RefreshToken {
		t.Fatalf("RefreshToken = %q", decrypted.RefreshToken)
	}
	if decrypted.CodeVerifier != cfg.CodeVerifier {
		t.Fatalf("CodeVerifier = %q", decrypted.CodeVerifier)
	}
	if decrypted.State != cfg.State {
		t.Fatalf("State = %q", decrypted.State)
	}
}
