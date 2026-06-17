package store

import (
	"context"
	"time"
)

type Routine struct {
	ID                 string    `json:"id"`
	WorkspaceID        string    `json:"workspace_id"`
	Name               string    `json:"name"`
	Prompt             string    `json:"prompt"`
	SessionPrefix      string    `json:"session_prefix"`
	Enabled            bool      `json:"enabled"`
	ScheduleCron       *string   `json:"schedule_cron,omitempty"`
	ScheduleTZ         string    `json:"schedule_tz"`
	TemporalScheduleID *string   `json:"temporal_schedule_id,omitempty"`
	FireTokenHash      *string   `json:"-"` // never serialized to JSON
	HasFireToken       bool      `json:"has_fire_token"` // computed: FireTokenHash != nil
	CreatedBy          *string   `json:"created_by,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type RoutineRun struct {
	ID              string    `json:"id"`
	RoutineID       string    `json:"routine_id"`
	WorkspaceID     string    `json:"workspace_id"`
	TriggerType     string    `json:"trigger_type"`
	Status          string    `json:"status"`
	SessionKey      *string   `json:"session_key,omitempty"`
	WorkflowID      *string   `json:"workflow_id,omitempty"`
	TemporalRunID   *string   `json:"temporal_run_id,omitempty"`
	InputText       *string   `json:"input_text,omitempty"`
	OutputPreview   *string   `json:"output_preview,omitempty"`
	Error           *string   `json:"error,omitempty"`
	InputTokens     int       `json:"input_tokens"`
	OutputTokens    int       `json:"output_tokens"`
	Iterations      int       `json:"iterations"`
	StartedAt       time.Time `json:"started_at"`
	FinishedAt      *time.Time `json:"finished_at,omitempty"`
	DurationMs      int64     `json:"duration_ms"`
}

type RoutineStore interface {
	List(ctx context.Context, workspaceID string) ([]Routine, error)
	Get(ctx context.Context, workspaceID, id string) (*Routine, error)
	GetByID(ctx context.Context, id string) (*Routine, error)
	Create(ctx context.Context, workspaceID string, r *Routine) error
	Update(ctx context.Context, workspaceID string, r *Routine) error
	Delete(ctx context.Context, workspaceID, id string) error
	GetByFireToken(ctx context.Context, tokenHash string) (*Routine, error)
	// ListUnscheduled returns all enabled routines that have a cron expression
	// but no temporal_schedule_id — i.e. schedules that were never registered
	// (e.g. because Temporal was down at creation time).
	ListUnscheduled(ctx context.Context) ([]Routine, error)
}

type RoutineRunStore interface {
	Create(ctx context.Context, r *RoutineRun) error
	Finish(ctx context.Context, id string, status string, outputPreview *string, errMsg *string, inputTokens, outputTokens, iterations int, durationMs int64) error
	Upsert(ctx context.Context, r *RoutineRun) error
	ListByRoutine(ctx context.Context, workspaceID, routineID string, limit int) ([]RoutineRun, error)
	Get(ctx context.Context, workspaceID, id string) (*RoutineRun, error)
}
