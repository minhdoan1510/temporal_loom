package temporal

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/testsuite"
)

func TestRoutineRunWorkflow_Success(t *testing.T) {
	suite := testsuite.WorkflowTestSuite{}
	env := suite.NewTestWorkflowEnvironment()

	env.RegisterActivity(ExecuteRoutineActivity)

	in := WorkflowInput{
		RoutineID:   "r-123",
		TriggerType: "manual",
		InputText:   "hello",
	}

	// Mock activity to succeed
	env.OnActivity(ExecuteRoutineActivity, mock.Anything, in).Return(nil)

	env.ExecuteWorkflow(RoutineRunWorkflow, in)

	if !env.IsWorkflowCompleted() {
		t.Fatal("workflow did not complete")
	}

	if err := env.GetWorkflowError(); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestRoutineRunWorkflow_ActivityFailure(t *testing.T) {
	suite := testsuite.WorkflowTestSuite{}
	env := suite.NewTestWorkflowEnvironment()

	env.RegisterActivity(ExecuteRoutineActivity)

	in := WorkflowInput{
		RoutineID:   "r-999",
		TriggerType: "schedule",
	}

	// Mock activity to fail
	activityErr := fmt.Errorf("agent execution failed: timeout")
	env.OnActivity(ExecuteRoutineActivity, mock.Anything, in).Return(activityErr)

	env.ExecuteWorkflow(RoutineRunWorkflow, in)

	if !env.IsWorkflowCompleted() {
		t.Fatal("workflow did not complete")
	}

	err := env.GetWorkflowError()
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	// The Temporal SDK wraps the activity error with workflow/activity context.
	// Verify the original error message is contained within.
	if !strings.Contains(err.Error(), activityErr.Error()) {
		t.Errorf("expected error to contain %q, got %q", activityErr.Error(), err.Error())
	}
}

func TestRoutineRunWorkflow_NoInputActivityFailure(t *testing.T) {
	// Simulate a scenario where the activity fails with a non-retryable error.
	suite := testsuite.WorkflowTestSuite{}
	env := suite.NewTestWorkflowEnvironment()

	env.RegisterActivity(ExecuteRoutineActivity)

	in := WorkflowInput{
		RoutineID:   "r-not-found",
		TriggerType: "manual",
	}

	// The activity returns error (e.g., routine not found)
	env.OnActivity(ExecuteRoutineActivity, mock.Anything, in).Return(
		fmt.Errorf("INVALID_ROUTINE: routine not found"),
	)

	env.ExecuteWorkflow(RoutineRunWorkflow, in)

	if !env.IsWorkflowCompleted() {
		t.Fatal("workflow did not complete")
	}

	err := env.GetWorkflowError()
	if err == nil {
		t.Fatal("expected error for invalid routine, got nil")
	}
}
