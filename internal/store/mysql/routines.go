package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

type MySQLRoutineStore struct {
	db *sql.DB
}

func NewMySQLRoutineStore(db *sql.DB) *MySQLRoutineStore {
	return &MySQLRoutineStore{db: db}
}

const routineCols = `id, workspace_id, name, prompt, session_prefix, enabled,
	schedule_cron, schedule_tz, temporal_schedule_id, fire_token_hash,
	created_by, created_at, updated_at`

func scanRoutine(row interface{ Scan(...any) error }) (store.Routine, error) {
	var r store.Routine
	var scheduleCron, temporalScheduleID, fireTokenHash, createdBy sql.NullString
	var enabled int
	err := row.Scan(
		&r.ID, &r.WorkspaceID, &r.Name, &r.Prompt, &r.SessionPrefix, &enabled,
		&scheduleCron, &r.ScheduleTZ, &temporalScheduleID, &fireTokenHash,
		&createdBy, &r.CreatedAt, &r.UpdatedAt,
	)
	r.Enabled = enabled == 1
	if scheduleCron.Valid {
		r.ScheduleCron = &scheduleCron.String
	}
	if temporalScheduleID.Valid {
		r.TemporalScheduleID = &temporalScheduleID.String
	}
	r.HasFireToken = fireTokenHash.Valid
	if createdBy.Valid {
		r.CreatedBy = &createdBy.String
	}
	return r, err
}

func (s *MySQLRoutineStore) List(ctx context.Context, workspaceID string) ([]store.Routine, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+routineCols+` FROM routines WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY name`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list routines: %w", err)
	}
	defer rows.Close()

	var routines []store.Routine
	for rows.Next() {
		r, err := scanRoutine(rows)
		if err != nil {
			return nil, fmt.Errorf("scan routine: %w", err)
		}
		routines = append(routines, r)
	}
	return routines, rows.Err()
}

func (s *MySQLRoutineStore) Get(ctx context.Context, workspaceID, id string) (*store.Routine, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+routineCols+` FROM routines WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL`, workspaceID, id)
	r, err := scanRoutine(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("routine %q not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get routine %q: %w", id, err)
	}
	return &r, nil
}

func (s *MySQLRoutineStore) GetByID(ctx context.Context, id string) (*store.Routine, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+routineCols+` FROM routines WHERE id = ? AND deleted_at IS NULL`, id)
	r, err := scanRoutine(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("routine %q not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get routine by id %q: %w", id, err)
	}
	return &r, nil
}

func (s *MySQLRoutineStore) Create(ctx context.Context, workspaceID string, r *store.Routine) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	if r.ScheduleTZ == "" {
		r.ScheduleTZ = "Asia/Ho_Chi_Minh"
	}
	if r.SessionPrefix == "" {
		r.SessionPrefix = "routine"
	}
	now := time.Now()
	r.CreatedAt = now
	r.UpdatedAt = now

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO routines (id, workspace_id, name, prompt, session_prefix, enabled,
			schedule_cron, schedule_tz, temporal_schedule_id, fire_token_hash,
			created_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID, workspaceID, r.Name, r.Prompt, r.SessionPrefix, boolToInt(r.Enabled),
		r.ScheduleCron, r.ScheduleTZ, r.TemporalScheduleID, r.FireTokenHash,
		r.CreatedBy, r.CreatedAt, r.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create routine: %w", err)
	}
	return nil
}

func (s *MySQLRoutineStore) Update(ctx context.Context, workspaceID string, r *store.Routine) error {
	r.UpdatedAt = time.Now()
	_, err := s.db.ExecContext(ctx,
		`UPDATE routines
		 SET name = ?, prompt = ?, session_prefix = ?, enabled = ?,
		     schedule_cron = ?, schedule_tz = ?, temporal_schedule_id = ?,
		     fire_token_hash = ?, updated_at = ?
		 WHERE workspace_id = ? AND id = ?`,
		r.Name, r.Prompt, r.SessionPrefix, boolToInt(r.Enabled),
		r.ScheduleCron, r.ScheduleTZ, r.TemporalScheduleID,
		r.FireTokenHash, r.UpdatedAt, workspaceID, r.ID,
	)
	if err != nil {
		return fmt.Errorf("update routine: %w", err)
	}
	return nil
}

// Delete soft-deletes a routine: it stamps deleted_at, disables it, and clears
// the fire token so a deleted routine can no longer be triggered. The row is
// retained to preserve run history.
func (s *MySQLRoutineStore) Delete(ctx context.Context, workspaceID, id string) error {
	now := time.Now()
	_, err := s.db.ExecContext(ctx,
		`UPDATE routines
		 SET deleted_at = ?, fire_token_hash = NULL, enabled = 0, updated_at = ?
		 WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL`,
		now, now, workspaceID, id)
	if err != nil {
		return fmt.Errorf("delete routine: %w", err)
	}
	return nil
}

func (s *MySQLRoutineStore) ListUnscheduled(ctx context.Context) ([]store.Routine, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+routineCols+` FROM routines
		 WHERE enabled = 1 AND schedule_cron IS NOT NULL AND temporal_schedule_id IS NULL
		   AND deleted_at IS NULL
		 ORDER BY created_at`)
	if err != nil {
		return nil, fmt.Errorf("list unscheduled routines: %w", err)
	}
	defer rows.Close()

	var routines []store.Routine
	for rows.Next() {
		r, err := scanRoutine(rows)
		if err != nil {
			return nil, fmt.Errorf("scan routine: %w", err)
		}
		routines = append(routines, r)
	}
	return routines, rows.Err()
}

func (s *MySQLRoutineStore) GetByFireToken(ctx context.Context, tokenHash string) (*store.Routine, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+routineCols+` FROM routines WHERE fire_token_hash = ? AND deleted_at IS NULL`, tokenHash)
	r, err := scanRoutine(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("routine not found by fire token")
	}
	if err != nil {
		return nil, fmt.Errorf("get routine by fire token: %w", err)
	}
	return &r, nil
}

// ---------------------------------------------------------------------------
// MySQLRoutineRunStore

type MySQLRoutineRunStore struct {
	db *sql.DB
}

func NewMySQLRoutineRunStore(db *sql.DB) *MySQLRoutineRunStore {
	return &MySQLRoutineRunStore{db: db}
}

const routineRunCols = `id, routine_id, workspace_id, trigger_type, status, session_key,
	workflow_id, temporal_run_id, input_text, output_preview, error,
	input_tokens, output_tokens, iterations, started_at, finished_at, duration_ms`

func scanRoutineRun(row interface{ Scan(...any) error }) (store.RoutineRun, error) {
	var r store.RoutineRun
	var sessionKey, workflowID, temporalRunID, inputText, outputPreview, errMsg sql.NullString
	var finishedAt sql.NullTime
	err := row.Scan(
		&r.ID, &r.RoutineID, &r.WorkspaceID, &r.TriggerType, &r.Status,
		&sessionKey, &workflowID, &temporalRunID, &inputText, &outputPreview, &errMsg,
		&r.InputTokens, &r.OutputTokens, &r.Iterations, &r.StartedAt, &finishedAt, &r.DurationMs,
	)
	if sessionKey.Valid {
		r.SessionKey = &sessionKey.String
	}
	if workflowID.Valid {
		r.WorkflowID = &workflowID.String
	}
	if temporalRunID.Valid {
		r.TemporalRunID = &temporalRunID.String
	}
	if inputText.Valid {
		r.InputText = &inputText.String
	}
	if outputPreview.Valid {
		r.OutputPreview = &outputPreview.String
	}
	if errMsg.Valid {
		r.Error = &errMsg.String
	}
	if finishedAt.Valid {
		r.FinishedAt = &finishedAt.Time
	}
	return r, err
}

func (s *MySQLRoutineRunStore) Create(ctx context.Context, r *store.RoutineRun) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	if r.Status == "" {
		r.Status = "running"
	}
	now := time.Now()
	if r.StartedAt.IsZero() {
		r.StartedAt = now
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO routine_runs (id, routine_id, workspace_id, trigger_type, status, session_key,
			workflow_id, temporal_run_id, input_text, started_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID, r.RoutineID, r.WorkspaceID, r.TriggerType, r.Status, r.SessionKey,
		r.WorkflowID, r.TemporalRunID, r.InputText, r.StartedAt,
	)
	if err != nil {
		return fmt.Errorf("create routine run: %w", err)
	}
	return nil
}

func (s *MySQLRoutineRunStore) Upsert(ctx context.Context, r *store.RoutineRun) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	if r.Status == "" {
		r.Status = "running"
	}
	now := time.Now()
	if r.StartedAt.IsZero() {
		r.StartedAt = now
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO routine_runs (id, routine_id, workspace_id, trigger_type, status, session_key,
			workflow_id, temporal_run_id, input_text, started_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE
		   status = VALUES(status), session_key = VALUES(session_key),
		   temporal_run_id = VALUES(temporal_run_id), input_text = VALUES(input_text)`,
		r.ID, r.RoutineID, r.WorkspaceID, r.TriggerType, r.Status, r.SessionKey,
		r.WorkflowID, r.TemporalRunID, r.InputText, r.StartedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert routine run: %w", err)
	}
	return nil
}

func (s *MySQLRoutineRunStore) Finish(ctx context.Context, id string, status string, outputPreview *string, errMsg *string, inputTokens, outputTokens, iterations int, durationMs int64) error {
	now := time.Now()
	_, err := s.db.ExecContext(ctx,
		`UPDATE routine_runs
		 SET status = ?, output_preview = ?, error = ?,
		     input_tokens = ?, output_tokens = ?, iterations = ?,
		     finished_at = ?, duration_ms = ?
		 WHERE id = ?`,
		status, outputPreview, errMsg, inputTokens, outputTokens, iterations,
		now, durationMs, id,
	)
	if err != nil {
		return fmt.Errorf("finish routine run: %w", err)
	}
	return nil
}

func (s *MySQLRoutineRunStore) ListByRoutine(ctx context.Context, workspaceID, routineID string, limit int) ([]store.RoutineRun, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+routineRunCols+` FROM routine_runs
		 WHERE workspace_id = ? AND routine_id = ?
		 ORDER BY started_at DESC LIMIT ?`, workspaceID, routineID, limit)
	if err != nil {
		return nil, fmt.Errorf("list routine runs: %w", err)
	}
	defer rows.Close()

	var runs []store.RoutineRun
	for rows.Next() {
		r, err := scanRoutineRun(rows)
		if err != nil {
			return nil, fmt.Errorf("scan routine run: %w", err)
		}
		runs = append(runs, r)
	}
	return runs, rows.Err()
}

func (s *MySQLRoutineRunStore) Get(ctx context.Context, workspaceID, id string) (*store.RoutineRun, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+routineRunCols+` FROM routine_runs WHERE workspace_id = ? AND id = ?`, workspaceID, id)
	r, err := scanRoutineRun(row)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("routine run %q not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get routine run %q: %w", id, err)
	}
	return &r, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
