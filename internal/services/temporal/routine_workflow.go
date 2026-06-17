package temporal

import (
	"context"
	"math/rand/v2"
	"strconv"
	"time"

	"go.temporal.io/sdk/worker"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/agent"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/tools"
	"gitlab.zalopay.vn/fin/lending/lending-claw/pkg/rbac"
	act "go.temporal.io/sdk/activity"
	temporalerrors "go.temporal.io/sdk/temporal"
	sdkworkflow "go.temporal.io/sdk/workflow"
)

// ---------------------------------------------------------------------------
// Workflow input type

type WorkflowInput struct {
	RoutineID   string
	TriggerType string
	InputText   string
}

// ---------------------------------------------------------------------------
// Workflow definition

func RoutineRunWorkflow(ctx sdkworkflow.Context, in WorkflowInput) error {
	ao := sdkworkflow.ActivityOptions{
		StartToCloseTimeout: 60 * time.Minute,
		HeartbeatTimeout:    2 * time.Minute,
		RetryPolicy: &temporalerrors.RetryPolicy{
			MaximumAttempts:        3,
			NonRetryableErrorTypes: []string{"INVALID_ROUTINE"},
		},
	}
	ctx = sdkworkflow.WithActivityOptions(ctx, ao)

	var result error
	err := sdkworkflow.ExecuteActivity(ctx, ExecuteRoutineActivity, in).Get(ctx, &result)
	if err != nil {
		return err
	}
	return nil
}

// ---------------------------------------------------------------------------
// Activity implementation

type Activities struct {
	Loop     *agent.Loop
	Routines store.RoutineStore
	Runs     store.RoutineRunStore
}

func ExecuteRoutineActivity(ctx context.Context, in WorkflowInput) error {
	info := act.GetInfo(ctx)

	routine, err := routines().GetByID(ctx, in.RoutineID)
	if err != nil {
		return temporalerrors.NewNonRetryableApplicationError(
			"INVALID_ROUTINE: "+err.Error(),
			"INVALID_ROUTINE",
			err,
		)
	}

	wsID := routine.WorkspaceID

	runID := uuid.New().String()
	workflowID := info.WorkflowExecution.ID
	sessionKey := newChatSessionKey()

	now := time.Now()
	run := &store.RoutineRun{
		ID:          runID,
		RoutineID:   in.RoutineID,
		WorkspaceID: wsID,
		TriggerType: in.TriggerType,
		Status:      "running",
		SessionKey:  &sessionKey,
		WorkflowID:  &workflowID,
		StartedAt:   now,
	}

	if in.InputText != "" {
		run.InputText = &in.InputText
	}

	if err := runs().Upsert(ctx, run); err != nil {
		return err
	}

	message := routine.Prompt
	if in.InputText != "" {
		message = message + "\n\n" + in.InputText
	}

	loops().EnsureSession(wsID, sessionKey, "system", "routine")

	// Resolve routine_bot role permissions from Casbin and inject into context.
	// Empty perms = no routine_bot role in workspace = full access (backward compat).
	if enf := _enforcer; enf != nil {
		if perms := enf.GetUserPermissions("routine-bot", wsID); len(perms) > 0 {
			ctx = tools.WithAllowedTools(ctx, rbac.FilterToolPermissions(perms))
		}
	}

	startTime := time.Now()

	result, agentErr := loops().Run(ctx, agent.RunRequest{
		WorkspaceID: wsID,
		SessionKey:  sessionKey,
		Message:     message,
		Channel:     "routine",
		RunID:       runID,
	})

	durationMs := time.Since(startTime).Milliseconds()

	var (
		status        = "success"
		outputPreview *string
		errStr        *string
		inputTokens   int
		outputTokens  int
		iterations    int
	)

	if agentErr != nil {
		status = "failed"
		e := agentErr.Error()
		errStr = &e
	} else if result != nil {
		preview := result.Content
		if len(preview) > 2000 {
			preview = preview[:2000]
		}
		outputPreview = &preview
		if result.Usage != nil {
			inputTokens = result.Usage.PromptTokens
			outputTokens = result.Usage.CompletionTokens
		}
		iterations = result.Iterations
	}

	if err := runs().Finish(ctx, runID, status, outputPreview, errStr,
		inputTokens, outputTokens, iterations, durationMs); err != nil {
		return err
	}

	if agentErr != nil {
		return agentErr
	}

	return nil
}

func RegisterWorker(w worker.Worker) {
	w.RegisterWorkflow(RoutineRunWorkflow)
	w.RegisterActivity(ExecuteRoutineActivity)
}

// ---------------------------------------------------------------------------
// lazy deps — set before any activity runs

var (
	_loops     *agent.Loop
	_routines  store.RoutineStore
	_runs      store.RoutineRunStore
	_enforcer  *rbac.Enforcer
)

func RegisterActivityDeps(loop *agent.Loop, routineStore store.RoutineStore, runStore store.RoutineRunStore, enforcer *rbac.Enforcer) {
	_loops = loop
	_routines = routineStore
	_runs = runStore
	_enforcer = enforcer
}

func loops() *agent.Loop           { return _loops }
func routines() store.RoutineStore { return _routines }
func runs() store.RoutineRunStore  { return _runs }

// newChatSessionKey mirrors the frontend createChatSessionKey
// (ui/web/src/lib/chat-session.ts) so routine-run sessions share the same
// "chat-<base36 ms>-<random>" key shape as user chats.
func newChatSessionKey() string {
	const base36 = "0123456789abcdefghijklmnopqrstuvwxyz"
	ts := strconv.FormatInt(time.Now().UnixMilli(), 36)
	suffix := make([]byte, 4)
	for i := range suffix {
		suffix[i] = base36[rand.IntN(len(base36))]
	}
	return "chat-" + ts + "-" + string(suffix)
}
