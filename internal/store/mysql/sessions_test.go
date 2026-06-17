//go:build integration
// +build integration

package mysql

import (
	"testing"
)

// TestSessionListExcludesRoutineKind asserts that List only returns sessions
// with kind='user' and excludes kind='routine' sessions.
func TestSessionListExcludesRoutineKind(t *testing.T) {
	db := openDB(t)
	defer db.Close()

	wsID := "test-ws-session-kind"
	userKey := "user-session-list-test"
	routineKey := "routine:test-ws-session-kind:list-test"

	store := NewMySQLSessionStore(db)

	// Clean up before and after.
	db.Exec("DELETE FROM sessions WHERE workspace_id = ?", wsID)
	t.Cleanup(func() {
		db.Exec("DELETE FROM sessions WHERE workspace_id = ?", wsID)
	})

	store.GetOrCreate(wsID, userKey, "tester", "user")
	store.GetOrCreate(wsID, routineKey, "", "routine")

	list := store.List(wsID, "user")

	for _, s := range list {
		if s.Key == routineKey {
			t.Errorf("List returned routine session %q; expected it to be excluded", routineKey)
		}
	}

	found := false
	for _, s := range list {
		if s.Key == userKey {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("List did not return user session %q", userKey)
	}
}
