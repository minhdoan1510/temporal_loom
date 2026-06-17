package temporal

import (
	"testing"
)

func TestScheduleID(t *testing.T) {
	tests := []struct {
		wsID, routineID string
		want            string
	}{
		{"wsA", "r1", "routine@wsA@r1"},
		{"ws-default", "routine-abc-123", "routine@ws-default@routine-abc-123"},
		{"a", "b", "routine@a@b"},
	}

	for _, tt := range tests {
		got := ScheduleID(tt.wsID, tt.routineID)
		if got != tt.want {
			t.Errorf("ScheduleID(%q, %q) = %q, want %q", tt.wsID, tt.routineID, got, tt.want)
		}
	}
}

func TestWorkflowID(t *testing.T) {
	tests := []struct {
		wsID, routineID, runID string
		want                   string
	}{
		{"wsA", "r1", "run1", "routine-run@wsA@r1@run1"},
		{"ws-default", "rt-123", "run-456", "routine-run@ws-default@rt-123@run-456"},
	}

	for _, tt := range tests {
		got := WorkflowID(tt.wsID, tt.routineID, tt.runID)
		if got != tt.want {
			t.Errorf("WorkflowID(%q, %q, %q) = %q, want %q", tt.wsID, tt.routineID, tt.runID, got, tt.want)
		}
	}
}

func TestScheduleID_NoCollisions(t *testing.T) {
	ids := map[string]bool{}
	pairs := []struct{ ws, routine string }{
		{"wsA", "r1"},
		{"wsA", "r2"},
		{"wsB", "r1"},
		{"wsB", "r2"},
		{"alpha", "beta"},
		{"gamma", "delta"},
	}

	for _, p := range pairs {
		id := ScheduleID(p.ws, p.routine)
		if ids[id] {
			t.Errorf("ScheduleID collision: %q already seen", id)
		}
		ids[id] = true
	}
}

func TestWorkflowID_NoCollisions(t *testing.T) {
	ids := map[string]bool{}
	triples := []struct{ ws, routine, run string }{
		{"wsA", "r1", "run1"},
		{"wsA", "r1", "run2"},
		{"wsA", "r2", "run1"},
		{"wsB", "r1", "run1"},
	}

	for _, tr := range triples {
		id := WorkflowID(tr.ws, tr.routine, tr.run)
		if ids[id] {
			t.Errorf("WorkflowID collision: %q already seen", id)
		}
		ids[id] = true
	}
}

func TestScheduleID_EmbedWorkspaceAndRoutine(t *testing.T) {
	// Verify that wsID and routineID are both embedded in the ScheduleID.
	id := ScheduleID("myworkspace", "myroutine")
	if id != "routine@myworkspace@myroutine" {
		t.Errorf("expected 'routine@myworkspace@myroutine', got %q", id)
	}
}
