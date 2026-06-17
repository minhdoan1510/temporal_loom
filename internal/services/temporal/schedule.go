package temporal

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	sdkclient "go.temporal.io/sdk/client"
	"go.temporal.io/api/enums/v1"
)

type Schedule struct {
	client sdkclient.Client
}

func NewSchedule(client sdkclient.Client) *Schedule {
	return &Schedule{client: client}
}

func ScheduleID(wsID, routineID string) string {
	return fmt.Sprintf("routine@%s@%s", wsID, routineID)
}

func WorkflowID(wsID, routineID, runID string) string {
	return fmt.Sprintf("routine-run@%s@%s@%s", wsID, routineID, runID)
}

func (s *Schedule) Upsert(ctx context.Context, r *store.Routine) error {
	sid := ScheduleID(r.WorkspaceID, r.ID)

	if r.ScheduleCron == nil || !r.Enabled {
		return s.Pause(ctx, r.WorkspaceID, r.ID)
	}

	action := &sdkclient.ScheduleWorkflowAction{
		ID:        fmt.Sprintf("routine-run@%s@%s@scheduled", r.WorkspaceID, r.ID),
		Workflow:  RoutineRunWorkflow,
		Args:      []interface{}{WorkflowInput{RoutineID: r.ID, TriggerType: "schedule"}},
		TaskQueue: TaskQueue,
	}

	scheduleOpts := sdkclient.ScheduleOptions{
		ID: sid,
		Spec: sdkclient.ScheduleSpec{
			CronExpressions: []string{*r.ScheduleCron},
			TimeZoneName:    r.ScheduleTZ,
		},
		Action:        action,
		Overlap:       enums.SCHEDULE_OVERLAP_POLICY_SKIP,
		CatchupWindow: 1 * time.Minute,
		Paused:        !r.Enabled,
	}

	handle := s.client.ScheduleClient().GetHandle(ctx, sid)
	paused := !r.Enabled
	err := handle.Update(ctx, sdkclient.ScheduleUpdateOptions{
		DoUpdate: func(input sdkclient.ScheduleUpdateInput) (*sdkclient.ScheduleUpdate, error) {
			updated := input.Description.Schedule
			updated.Action = action
			updated.Spec = &sdkclient.ScheduleSpec{
				CronExpressions: []string{*r.ScheduleCron},
				TimeZoneName:    r.ScheduleTZ,
			}
			policies := updated.Policy
			if policies == nil {
				policies = &sdkclient.SchedulePolicies{}
			}
			policies.Overlap = enums.SCHEDULE_OVERLAP_POLICY_SKIP
			policies.CatchupWindow = 1 * time.Minute
			updated.Policy = policies
			// Unpause when routine is enabled
			if r.Enabled {
				updated.State = &sdkclient.ScheduleState{Note: "", Paused: false}
			}
			return &sdkclient.ScheduleUpdate{Schedule: &updated}, nil
		},
	})
	_ = paused // used above

	if err != nil {
		_, createErr := s.client.ScheduleClient().Create(ctx, scheduleOpts)
		if createErr != nil {
			// If already exists, retry Update once
			if strings.Contains(createErr.Error(), "already exists") || strings.Contains(createErr.Error(), "AlreadyExists") {
				return handle.Update(ctx, sdkclient.ScheduleUpdateOptions{
					DoUpdate: func(input sdkclient.ScheduleUpdateInput) (*sdkclient.ScheduleUpdate, error) {
						updated := input.Description.Schedule
						updated.Action = action
						updated.Spec = &sdkclient.ScheduleSpec{
							CronExpressions: []string{*r.ScheduleCron},
							TimeZoneName:    r.ScheduleTZ,
						}
						return &sdkclient.ScheduleUpdate{Schedule: &updated}, nil
					},
				})
			}
			return fmt.Errorf("create schedule %q: %w", sid, createErr)
		}
	}

	return nil
}

func (s *Schedule) Pause(ctx context.Context, wsID, routineID string) error {
	sid := ScheduleID(wsID, routineID)
	handle := s.client.ScheduleClient().GetHandle(ctx, sid)
	err := handle.Pause(ctx, sdkclient.SchedulePauseOptions{Note: "routine disabled"})
	if err != nil {
		// API-only routines never register a schedule, so pausing a
		// non-existent schedule is expected and not an error.
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "NotFound") {
			return nil
		}
		return fmt.Errorf("pause schedule %q: %w", sid, err)
	}
	return nil
}

func (s *Schedule) Delete(ctx context.Context, wsID, routineID string) error {
	sid := ScheduleID(wsID, routineID)
	handle := s.client.ScheduleClient().GetHandle(ctx, sid)
	err := handle.Delete(ctx)
	if err != nil {
		return fmt.Errorf("delete schedule %q: %w", sid, err)
	}
	return nil
}
