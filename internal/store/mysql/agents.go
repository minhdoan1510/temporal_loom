package mysql

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// MySQLAgentStore implements store.AgentStore backed by MySQL.
type MySQLAgentStore struct {
	db *sql.DB
}

// NewMySQLAgentStore creates an AgentStore.
func NewMySQLAgentStore(db *sql.DB) *MySQLAgentStore {
	return &MySQLAgentStore{db: db}
}

func (s *MySQLAgentStore) List(ctx context.Context, workspaceID string) ([]store.Agent, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, description, system_instruction, skills, memory_access, mcp_servers, tools, created_at, updated_at
		 FROM agents WHERE workspace_id = ? ORDER BY name`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	defer rows.Close()

	var list []store.Agent
	for rows.Next() {
		var a store.Agent
		var skillsJSON, mcpServersJSON, toolsJSON []byte
		err := rows.Scan(
			&a.ID, &a.Name, &a.Description, &a.SystemInstruction,
			&skillsJSON, &a.MemoryAccess, &mcpServersJSON, &toolsJSON,
			&a.CreatedAt, &a.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan agent: %w", err)
		}
		a.WorkspaceID = workspaceID
		
		_ = json.Unmarshal(skillsJSON, &a.Skills)
		_ = json.Unmarshal(mcpServersJSON, &a.MCPServers)
		_ = json.Unmarshal(toolsJSON, &a.Tools)
		if a.Skills == nil {
			a.Skills = []string{}
		}
		if a.MCPServers == nil {
			a.MCPServers = []string{}
		}
		if a.Tools == nil {
			a.Tools = []string{}
		}

		list = append(list, a)
	}
	return list, rows.Err()
}

func (s *MySQLAgentStore) Get(ctx context.Context, workspaceID, name string) (*store.Agent, error) {
	var a store.Agent
	var skillsJSON, mcpServersJSON, toolsJSON []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, description, system_instruction, skills, memory_access, mcp_servers, tools, created_at, updated_at
		 FROM agents WHERE workspace_id = ? AND name = ?`, workspaceID, name,
	).Scan(
		&a.ID, &a.Name, &a.Description, &a.SystemInstruction,
		&skillsJSON, &a.MemoryAccess, &mcpServersJSON, &toolsJSON,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("agent %q not found", name)
	}
	if err != nil {
		return nil, fmt.Errorf("get agent %q: %w", name, err)
	}
	a.WorkspaceID = workspaceID

	_ = json.Unmarshal(skillsJSON, &a.Skills)
	_ = json.Unmarshal(mcpServersJSON, &a.MCPServers)
	_ = json.Unmarshal(toolsJSON, &a.Tools)
	if a.Skills == nil {
		a.Skills = []string{}
	}
	if a.MCPServers == nil {
		a.MCPServers = []string{}
	}
	if a.Tools == nil {
		a.Tools = []string{}
	}

	return &a, nil
}

func (s *MySQLAgentStore) GetByID(ctx context.Context, workspaceID, id string) (*store.Agent, error) {
	var a store.Agent
	var skillsJSON, mcpServersJSON, toolsJSON []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, description, system_instruction, skills, memory_access, mcp_servers, tools, created_at, updated_at
		 FROM agents WHERE workspace_id = ? AND id = ?`, workspaceID, id,
	).Scan(
		&a.ID, &a.Name, &a.Description, &a.SystemInstruction,
		&skillsJSON, &a.MemoryAccess, &mcpServersJSON, &toolsJSON,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("agent ID %q not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get agent ID %q: %w", id, err)
	}
	a.WorkspaceID = workspaceID

	_ = json.Unmarshal(skillsJSON, &a.Skills)
	_ = json.Unmarshal(mcpServersJSON, &a.MCPServers)
	_ = json.Unmarshal(toolsJSON, &a.Tools)
	if a.Skills == nil {
		a.Skills = []string{}
	}
	if a.MCPServers == nil {
		a.MCPServers = []string{}
	}
	if a.Tools == nil {
		a.Tools = []string{}
	}

	return &a, nil
}

func (s *MySQLAgentStore) Create(ctx context.Context, workspaceID string, agent *store.Agent) error {
	if agent.ID == "" {
		agent.ID = uuid.New().String()
	}
	now := time.Now()
	agent.CreatedAt = now
	agent.UpdatedAt = now
	agent.WorkspaceID = workspaceID

	skillsJSON, _ := json.Marshal(agent.Skills)
	mcpServersJSON, _ := json.Marshal(agent.MCPServers)
	toolsJSON, _ := json.Marshal(agent.Tools)

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO agents (id, workspace_id, name, description, system_instruction, skills, memory_access, mcp_servers, tools, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		agent.ID, workspaceID, agent.Name, agent.Description, agent.SystemInstruction,
		skillsJSON, agent.MemoryAccess, mcpServersJSON, toolsJSON, agent.CreatedAt, agent.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create agent: %w", err)
	}
	return nil
}

func (s *MySQLAgentStore) Update(ctx context.Context, workspaceID string, agent *store.Agent) error {
	agent.UpdatedAt = time.Now()

	skillsJSON, _ := json.Marshal(agent.Skills)
	mcpServersJSON, _ := json.Marshal(agent.MCPServers)
	toolsJSON, _ := json.Marshal(agent.Tools)

	_, err := s.db.ExecContext(ctx,
		`UPDATE agents SET name = ?, description = ?, system_instruction = ?, skills = ?, memory_access = ?, mcp_servers = ?, tools = ?, updated_at = ?
		 WHERE workspace_id = ? AND id = ?`,
		agent.Name, agent.Description, agent.SystemInstruction, skillsJSON, agent.MemoryAccess, mcpServersJSON, toolsJSON, agent.UpdatedAt,
		workspaceID, agent.ID,
	)
	if err != nil {
		return fmt.Errorf("update agent: %w", err)
	}
	return nil
}

func (s *MySQLAgentStore) Delete(ctx context.Context, workspaceID, id string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM agents WHERE workspace_id = ? AND id = ?", workspaceID, id)
	if err != nil {
		return fmt.Errorf("delete agent: %w", err)
	}
	return nil
}
