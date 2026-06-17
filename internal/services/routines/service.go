package routines

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/robfig/cron/v3"

	sdkclient "go.temporal.io/sdk/client"

	temporalsvc "gitlab.zalopay.vn/fin/lending/lending-claw/internal/services/temporal"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// scheduleManager abstracts Temporal schedule operations (Upsert/Delete).
// *temporalsvc.Schedule implements this interface.
type scheduleManager interface {
	Upsert(ctx context.Context, r *store.Routine) error
	Delete(ctx context.Context, wsID, routineID string) error
}

type Service struct {
	routines store.RoutineStore
	runs     store.RoutineRunStore
	sched    scheduleManager
	client   sdkclient.Client
}

func NewService(
	routines store.RoutineStore,
	runs store.RoutineRunStore,
	sched *temporalsvc.Schedule,
	client sdkclient.Client,
) *Service {
	// Wrap concrete *temporalsvc.Schedule into the scheduleManager interface.
	// nil sched means schedules are disabled (e.g., temporal not configured).
	var sm scheduleManager
	if sched != nil {
		sm = sched
	}
	return &Service{
		routines: routines,
		runs:     runs,
		sched:    sm,
		client:   client,
	}
}

func (s *Service) List(ctx context.Context, wsID string) ([]store.Routine, error) {
	return s.routines.List(ctx, wsID)
}

func (s *Service) Get(ctx context.Context, wsID, id string) (*store.Routine, error) {
	return s.routines.Get(ctx, wsID, id)
}

func (s *Service) Create(ctx context.Context, wsID string, r *store.Routine) (*store.Routine, error) {
	normalizeCron(r)
	if err := s.validate(r); err != nil {
		return nil, err
	}

	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	r.WorkspaceID = wsID
	if r.ScheduleTZ == "" {
		r.ScheduleTZ = "Asia/Ho_Chi_Minh"
	}
	if r.SessionPrefix == "" {
		r.SessionPrefix = "routine"
	}

	if err := s.routines.Create(ctx, wsID, r); err != nil {
		return nil, fmt.Errorf("create routine: %w", err)
	}

	if s.sched != nil {
		if err := s.sched.Upsert(ctx, r); err != nil {
			slog.WarnContext(ctx, "schedule upsert failed after create",
				"routine_id", r.ID, "error", err)
		} else {
			sid := temporalsvc.ScheduleID(wsID, r.ID)
			r.TemporalScheduleID = &sid
			if err := s.routines.Update(ctx, wsID, r); err != nil {
				slog.WarnContext(ctx, "failed to persist temporal_schedule_id after create",
					"routine_id", r.ID, "error", err)
			}
		}
	}

	return r, nil
}

func (s *Service) Update(ctx context.Context, wsID string, r *store.Routine) (*store.Routine, error) {
	existing, err := s.routines.Get(ctx, wsID, r.ID)
	if err != nil {
		return nil, err
	}

	normalizeCron(r)
	if err := s.validate(r); err != nil {
		return nil, err
	}

	r.WorkspaceID = wsID
	r.FireTokenHash = existing.FireTokenHash
	r.HasFireToken = existing.HasFireToken
	r.TemporalScheduleID = existing.TemporalScheduleID

	if err := s.routines.Update(ctx, wsID, r); err != nil {
		return nil, fmt.Errorf("update routine: %w", err)
	}

	if s.sched != nil {
		if err := s.sched.Upsert(ctx, r); err != nil {
			slog.WarnContext(ctx, "schedule upsert failed after update",
				"routine_id", r.ID, "error", err)
		} else {
			sid := temporalsvc.ScheduleID(wsID, r.ID)
			r.TemporalScheduleID = &sid
			if err := s.routines.Update(ctx, wsID, r); err != nil {
				slog.WarnContext(ctx, "failed to persist temporal_schedule_id after update",
					"routine_id", r.ID, "error", err)
			}
		}
	}

	return r, nil
}

func (s *Service) Delete(ctx context.Context, wsID, id string) error {
	if s.sched != nil {
		if err := s.sched.Delete(ctx, wsID, id); err != nil {
			slog.WarnContext(ctx, "schedule delete failed, routine still removed from store",
				"routine_id", id, "error", err)
		}
	}

	if err := s.routines.Delete(ctx, wsID, id); err != nil {
		return fmt.Errorf("delete routine: %w", err)
	}
	return nil
}

func (s *Service) GenerateFireToken(ctx context.Context, wsID, id string) (string, error) {
	r, err := s.routines.Get(ctx, wsID, id)
	if err != nil {
		return "", err
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	plain := hex.EncodeToString(raw)

	hash := tokenHash(plain)
	r.FireTokenHash = &hash
	r.HasFireToken = true

	if err := s.routines.Update(ctx, wsID, r); err != nil {
		return "", fmt.Errorf("store token hash: %w", err)
	}

	return plain, nil
}

func (s *Service) RotateFireToken(ctx context.Context, wsID, id string) (string, error) {
	return s.GenerateFireToken(ctx, wsID, id)
}

func (s *Service) RevokeFireToken(ctx context.Context, wsID, id string) error {
	r, err := s.routines.Get(ctx, wsID, id)
	if err != nil {
		return err
	}

	r.FireTokenHash = nil
	r.HasFireToken = false

	return s.routines.Update(ctx, wsID, r)
}

func (s *Service) VerifyFireToken(ctx context.Context, wsID, id, tokenPlain string) error {
	hash := tokenHash(tokenPlain)
	r, err := s.routines.GetByFireToken(ctx, hash)
	if err != nil {
		return fmt.Errorf("invalid fire token")
	}

	if r.WorkspaceID != wsID {
		return fmt.Errorf("cross-workspace token rejected")
	}
	if r.ID != id {
		return fmt.Errorf("cross-routine token rejected")
	}

	return nil
}

func (s *Service) Fire(ctx context.Context, wsID, id, inputText, trigger string) (string, string, error) {
	if s.client == nil {
		return "", "", fmt.Errorf("temporal client unavailable, scheduling disabled")
	}

	r, err := s.routines.Get(ctx, wsID, id)
	if err != nil {
		return "", "", err
	}

	runID := uuid.New().String()
	workflowID := temporalsvc.WorkflowID(wsID, id, runID)

	opts := sdkclient.StartWorkflowOptions{
		ID:        workflowID,
		TaskQueue: temporalsvc.TaskQueue,
	}

	_, err = s.client.ExecuteWorkflow(ctx, opts, temporalsvc.RoutineRunWorkflow,
		temporalsvc.WorkflowInput{
			RoutineID:   r.ID,
			TriggerType: trigger,
			InputText:   inputText,
		},
	)
	if err != nil {
		return "", "", fmt.Errorf("execute workflow: %w", err)
	}

	return workflowID, runID, nil
}

// SyncSchedules re-registers Temporal schedules for all enabled routines that
// have a cron expression but were never registered (temporal_schedule_id IS NULL).
// This is called at startup to recover from cases where Temporal was unavailable
// when a routine was originally created.
func (s *Service) SyncSchedules(ctx context.Context) error {
	if s.sched == nil {
		return nil
	}

	pending, err := s.routines.ListUnscheduled(ctx)
	if err != nil {
		return fmt.Errorf("list unscheduled routines: %w", err)
	}

	if len(pending) == 0 {
		return nil
	}

	slog.InfoContext(ctx, "syncing unregistered temporal schedules", "count", len(pending))

	var errs []string
	for i := range pending {
		r := &pending[i]
		if err := s.sched.Upsert(ctx, r); err != nil {
			slog.WarnContext(ctx, "schedule sync failed",
				"routine_id", r.ID, "workspace_id", r.WorkspaceID, "error", err)
			errs = append(errs, fmt.Sprintf("routine %s: %v", r.ID, err))
			continue
		}
		sid := temporalsvc.ScheduleID(r.WorkspaceID, r.ID)
		r.TemporalScheduleID = &sid
		if err := s.routines.Update(ctx, r.WorkspaceID, r); err != nil {
			slog.WarnContext(ctx, "failed to persist temporal_schedule_id during sync",
				"routine_id", r.ID, "error", err)
		} else {
			slog.InfoContext(ctx, "temporal schedule synced",
				"routine_id", r.ID, "schedule_id", sid)
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("schedule sync completed with %d error(s): %s", len(errs), strings.Join(errs, "; "))
	}
	return nil
}

func (s *Service) ListRuns(ctx context.Context, wsID, routineID string, limit int) ([]store.RoutineRun, error) {
	return s.runs.ListByRoutine(ctx, wsID, routineID, limit)
}

func (s *Service) GetRun(ctx context.Context, wsID, runID string) (*store.RoutineRun, error) {
	return s.runs.Get(ctx, wsID, runID)
}

func (s *Service) validate(r *store.Routine) error {
	if strings.TrimSpace(r.Name) == "" {
		return fmt.Errorf("name is required")
	}
	if strings.TrimSpace(r.Prompt) == "" {
		return fmt.Errorf("prompt is required")
	}

	if r.ScheduleCron != nil && *r.ScheduleCron != "" {
		parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
		sched, err := parser.Parse(*r.ScheduleCron)
		if err != nil {
			return fmt.Errorf("invalid cron expression: %w", err)
		}

		// Enforce minimum 1-hour interval: check next two scheduled times
		now := time.Now()
		t1 := sched.Next(now)
		if t1.IsZero() {
			return fmt.Errorf("cron expression never fires")
		}
		t2 := sched.Next(t1)
		if t2.Sub(t1) < time.Hour {
			return fmt.Errorf("cron interval must be at least 1 hour")
		}
	}

	return nil
}

// normalizeCron treats a blank schedule_cron as "no schedule" (nil) so that
// deselecting the Schedule trigger clears the cron and pauses any Temporal
// schedule instead of registering an empty/invalid expression.
func normalizeCron(r *store.Routine) {
	if r.ScheduleCron != nil && strings.TrimSpace(*r.ScheduleCron) == "" {
		r.ScheduleCron = nil
	}
}

func tokenHash(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
