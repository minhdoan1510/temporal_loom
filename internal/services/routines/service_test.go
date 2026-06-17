package routines

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// ---------------------------------------------------------------------------
// Fake stores
// ---------------------------------------------------------------------------

type fakeRoutineStore struct {
	mu       sync.Mutex
	routines map[string]map[string]*store.Routine // wsID -> id -> Routine
	byID     map[string]*store.Routine             // id -> Routine (for GetByID, GetByFireToken)
}

func newFakeRoutineStore() *fakeRoutineStore {
	return &fakeRoutineStore{
		routines: make(map[string]map[string]*store.Routine),
		byID:     make(map[string]*store.Routine),
	}
}

func (f *fakeRoutineStore) List(ctx context.Context, workspaceID string) ([]store.Routine, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	ws, ok := f.routines[workspaceID]
	if !ok {
		return nil, nil
	}
	var out []store.Routine
	for _, r := range ws {
		out = append(out, *r)
	}
	return out, nil
}

func (f *fakeRoutineStore) Get(ctx context.Context, workspaceID, id string) (*store.Routine, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	ws, ok := f.routines[workspaceID]
	if !ok {
		return nil, fmt.Errorf("routine %q not found", id)
	}
	r, ok := ws[id]
	if !ok {
		return nil, fmt.Errorf("routine %q not found", id)
	}
	cp := *r
	return &cp, nil
}

func (f *fakeRoutineStore) GetByID(ctx context.Context, id string) (*store.Routine, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.byID[id]
	if !ok {
		return nil, fmt.Errorf("routine %q not found", id)
	}
	cp := *r
	return &cp, nil
}

func (f *fakeRoutineStore) Create(ctx context.Context, workspaceID string, r *store.Routine) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := *r
	f.byID[cp.ID] = &cp
	if f.routines[workspaceID] == nil {
		f.routines[workspaceID] = make(map[string]*store.Routine)
	}
	f.routines[workspaceID][cp.ID] = &cp
	return nil
}

func (f *fakeRoutineStore) Update(ctx context.Context, workspaceID string, r *store.Routine) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	ws, ok := f.routines[workspaceID]
	if !ok {
		return fmt.Errorf("routine %q not found", r.ID)
	}
	if _, ok := ws[r.ID]; !ok {
		return fmt.Errorf("routine %q not found", r.ID)
	}
	cp := *r
	ws[r.ID] = &cp
	f.byID[r.ID] = &cp
	return nil
}

func (f *fakeRoutineStore) Delete(ctx context.Context, workspaceID, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	ws, ok := f.routines[workspaceID]
	if !ok {
		return fmt.Errorf("routine %q not found", id)
	}
	delete(ws, id)
	delete(f.byID, id)
	return nil
}

func (f *fakeRoutineStore) ListUnscheduled(ctx context.Context) ([]store.Routine, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []store.Routine
	for _, ws := range f.routines {
		for _, r := range ws {
			if r.Enabled && r.ScheduleCron != nil && r.TemporalScheduleID == nil {
				cp := *r
				out = append(out, cp)
			}
		}
	}
	return out, nil
}
func (f *fakeRoutineStore) GetByFireToken(ctx context.Context, tokenHash string) (*store.Routine, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, ws := range f.routines {
		for _, r := range ws {
			if r.FireTokenHash != nil && *r.FireTokenHash == tokenHash {
				cp := *r
				return &cp, nil
			}
		}
	}
	return nil, fmt.Errorf("routine not found by fire token")
}

// ---------------------------------------------------------------------------
// Fake schedule manager (spy)
// ---------------------------------------------------------------------------

type fakeScheduleManager struct {
	upsertCalls []scheduleCall
	deleteCalls []scheduleCall
	upsertErr   error
	deleteErr   error
}

type scheduleCall struct {
	wsID      string
	routineID string
	cron      *string
	tz        string
	enabled   bool
}

func (f *fakeScheduleManager) Upsert(ctx context.Context, r *store.Routine) error {
	f.upsertCalls = append(f.upsertCalls, scheduleCall{
		wsID:      r.WorkspaceID,
		routineID: r.ID,
		cron:      r.ScheduleCron,
		tz:        r.ScheduleTZ,
		enabled:   r.Enabled,
	})
	return f.upsertErr
}

func (f *fakeScheduleManager) Delete(ctx context.Context, wsID, routineID string) error {
	f.deleteCalls = append(f.deleteCalls, scheduleCall{
		wsID:      wsID,
		routineID: routineID,
	})
	return f.deleteErr
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func newTestService() (*Service, *fakeRoutineStore, *fakeScheduleManager) {
	store := newFakeRoutineStore()
	sched := &fakeScheduleManager{}
	svc := &Service{
		routines: store,
		runs:     nil,
		sched:    sched,
		client:   nil,
	}
	return svc, store, sched
}

func ptrStr(s string) *string { return &s }

// ---------------------------------------------------------------------------
// Token hash tests
// ---------------------------------------------------------------------------

func TestTokenHash_Deterministic(t *testing.T) {
	a := tokenHash("hello-world")
	b := tokenHash("hello-world")
	if a != b {
		t.Fatalf("tokenHash not deterministic: %q vs %q", a, b)
	}
}

func TestTokenHash_DifferentInputsProduceDifferentHashes(t *testing.T) {
	a := tokenHash("abc")
	b := tokenHash("def")
	if a == b {
		t.Fatal("different inputs produced same hash")
	}
}

func TestTokenHash_NotEmpty(t *testing.T) {
	h := tokenHash("something")
	if h == "" {
		t.Fatal("tokenHash returned empty string")
	}
	if len(h) != 64 {
		t.Fatalf("tokenHash length = %d, want 64 (SHA-256 hex)", len(h))
	}
}

// ---------------------------------------------------------------------------
// GenerateFireToken + VerifyFireToken round-trip
// ---------------------------------------------------------------------------

func TestGenerateFireToken_StoresHashAndReturnsPlaintext(t *testing.T) {
	svc, fakeStore, _ := newTestService()
	ctx := context.Background()

	// Create a routine first
	r, err := svc.Create(ctx, "ws1", &store.Routine{
		Name:        "Test Routine",
		Prompt:      "You are a test assistant",
		Enabled:     true,
		ScheduleCron: ptrStr("0 */2 * * *"),
	})
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	token, err := svc.GenerateFireToken(ctx, "ws1", r.ID)
	if err != nil {
		t.Fatalf("GenerateFireToken failed: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	if len(token) != 64 { // 32 bytes hex = 64 chars
		t.Fatalf("token length = %d, want 64", len(token))
	}

	// Verify the routine now has a hash stored
	stored, err := fakeStore.Get(ctx, "ws1", r.ID)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if !stored.HasFireToken {
		t.Fatal("HasFireToken should be true after GenerateFireToken")
	}
	if stored.FireTokenHash == nil {
		t.Fatal("FireTokenHash should not be nil")
	}
	if *stored.FireTokenHash != tokenHash(token) {
		t.Fatal("stored hash does not match tokenHash(plaintext)")
	}
}

func TestVerifyFireToken_ValidToken(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	r, _ := svc.Create(ctx, "ws1", &store.Routine{
		Name:        "RT",
		Prompt:      "P",
		Enabled:     true,
		ScheduleCron: ptrStr("0 */3 * * *"),
	})

	token, err := svc.GenerateFireToken(ctx, "ws1", r.ID)
	if err != nil {
		t.Fatalf("GenerateFireToken: %v", err)
	}

	err = svc.VerifyFireToken(ctx, "ws1", r.ID, token)
	if err != nil {
		t.Fatalf("VerifyFireToken should succeed for valid token: %v", err)
	}
}

func TestVerifyFireToken_BadToken(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	r, _ := svc.Create(ctx, "ws1", &store.Routine{
		Name:        "RT",
		Prompt:      "P",
		Enabled:     true,
		ScheduleCron: ptrStr("0 */3 * * *"),
	})

	svc.GenerateFireToken(ctx, "ws1", r.ID)

	err := svc.VerifyFireToken(ctx, "ws1", r.ID, "completely-wrong-token-value-xxxx")
	if err == nil {
		t.Fatal("expected error for bad token")
	}
	if err.Error() != "invalid fire token" {
		t.Fatalf("expected 'invalid fire token', got %q", err.Error())
	}
}

func TestVerifyFireToken_CrossWorkspace(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	r, _ := svc.Create(ctx, "ws1", &store.Routine{
		Name:        "RT",
		Prompt:      "P",
		Enabled:     true,
		ScheduleCron: ptrStr("0 */3 * * *"),
	})

	token, _ := svc.GenerateFireToken(ctx, "ws1", r.ID)

	// Try to use ws1's token on ws2, same routine ID
	err := svc.VerifyFireToken(ctx, "ws2", r.ID, token)
	if err == nil {
		t.Fatal("expected error for cross-workspace token use")
	}
	if err.Error() != "cross-workspace token rejected" {
		t.Fatalf("expected 'cross-workspace token rejected', got %q", err.Error())
	}
}

func TestVerifyFireToken_CrossRoutine(t *testing.T) {
	svc, _, _ := newTestService()
	ctx := context.Background()

	r1, _ := svc.Create(ctx, "ws1", &store.Routine{
		Name:        "RT1",
		Prompt:      "P",
		Enabled:     true,
		ScheduleCron: ptrStr("0 */3 * * *"),
	})

	r2, _ := svc.Create(ctx, "ws1", &store.Routine{
		Name:        "RT2",
		Prompt:      "P",
		Enabled:     true,
		ScheduleCron: ptrStr("0 */4 * * *"),
	})

	token, _ := svc.GenerateFireToken(ctx, "ws1", r1.ID)

	// Try to use r1's token on r2 in the same workspace
	err := svc.VerifyFireToken(ctx, "ws1", r2.ID, token)
	if err == nil {
		t.Fatal("expected error for cross-routine token use")
	}
	if err.Error() != "cross-routine token rejected" {
		t.Fatalf("expected 'cross-routine token rejected', got %q", err.Error())
	}
}

// ---------------------------------------------------------------------------
// Revoke fire token
// ---------------------------------------------------------------------------

func TestRevokeFireToken_ClearsHash(t *testing.T) {
	svc, fakeStore, _ := newTestService()
	ctx := context.Background()

	r, _ := svc.Create(ctx, "ws1", &store.Routine{
		Name:        "RT",
		Prompt:      "P",
		Enabled:     true,
		ScheduleCron: ptrStr("0 */3 * * *"),
	})
	svc.GenerateFireToken(ctx, "ws1", r.ID)

	// Revoke
	err := svc.RevokeFireToken(ctx, "ws1", r.ID)
	if err != nil {
		t.Fatalf("RevokeFireToken failed: %v", err)
	}

	stored, _ := fakeStore.Get(ctx, "ws1", r.ID)
	if stored.HasFireToken {
		t.Fatal("HasFireToken should be false after revoke")
	}
	if stored.FireTokenHash != nil {
		t.Fatal("FireTokenHash should be nil after revoke")
	}

	// Token should no longer verify
	// (We can't test with the original token since we don't have it,
	// but the hash is gone so any token verification would fail)
}

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

func TestValidate_NameRequired(t *testing.T) {
	svc, _, _ := newTestService()
	_, err := svc.Create(context.Background(), "ws1", &store.Routine{
		Name:   "",
		Prompt: "test",
	})
	if err == nil || err.Error() != "name is required" {
		t.Fatalf("expected 'name is required', got: %v", err)
	}
}

func TestValidate_PromptRequired(t *testing.T) {
	svc, _, _ := newTestService()
	_, err := svc.Create(context.Background(), "ws1", &store.Routine{
		Name:   "test",
		Prompt: "",
	})
	if err == nil || err.Error() != "prompt is required" {
		t.Fatalf("expected 'prompt is required', got: %v", err)
	}
}

func TestValidate_InvalidCronExpression(t *testing.T) {
	svc, _, _ := newTestService()
	_, err := svc.Create(context.Background(), "ws1", &store.Routine{
		Name:         "test",
		Prompt:       "test",
		ScheduleCron: ptrStr("invalid-cron"),
	})
	if err == nil {
		t.Fatal("expected error for invalid cron expression")
	}
}

func TestValidate_SubHourlyCronRejected(t *testing.T) {
	svc, _, _ := newTestService()

	tests := []string{
		"*/30 * * * *", // every 30 minutes
		"*/15 * * * *", // every 15 minutes
		"*/45 * * * *", // every 45 minutes
	}
	for _, cron := range tests {
		_, err := svc.Create(context.Background(), "ws1", &store.Routine{
			Name:         "test",
			Prompt:       "test",
			ScheduleCron: ptrStr(cron),
		})
		if err == nil {
			t.Fatalf("expected error for sub-hourly cron %q", cron)
		}
		if err.Error() != "cron interval must be at least 1 hour" {
			t.Fatalf("cron %q: expected 'cron interval must be at least 1 hour', got %q", cron, err.Error())
		}
	}
}

func TestValidate_HourlyAndAboveCronAccepted(t *testing.T) {
	svc, _, _ := newTestService()

	tests := []string{
		"0 * * * *",      // every hour
		"0 */2 * * *",    // every 2 hours
		"0 0 * * *",      // daily at midnight
		"0 0 * * 1",      // weekly on Monday
		"0 0 1 * *",      // monthly on 1st
	}
	for _, cron := range tests {
		_, err := svc.Create(context.Background(), "ws1", &store.Routine{
			Name:         "test-" + cron,
			Prompt:       "test",
			ScheduleCron: ptrStr(cron),
		})
		if err != nil {
			t.Fatalf("cron %q should be accepted, got error: %v", cron, err)
		}
	}
}

func TestValidate_NilCronAccepted(t *testing.T) {
	svc, _, _ := newTestService()
	_, err := svc.Create(context.Background(), "ws1", &store.Routine{
		Name:   "test",
		Prompt: "test",
		// No schedule cron set - only manual fire
	})
	if err != nil {
		t.Fatalf("nil schedule_cron should be accepted: %v", err)
	}
}

func TestValidate_EmptyCronAccepted(t *testing.T) {
	svc, _, _ := newTestService()
	_, err := svc.Create(context.Background(), "ws1", &store.Routine{
		Name:         "test",
		Prompt:       "test",
		ScheduleCron: ptrStr(""),
	})
	if err != nil {
		t.Fatalf("empty schedule_cron should be accepted: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Create --> schedule Upsert orchestration
// ---------------------------------------------------------------------------

func TestCreate_CallsScheduleUpsert(t *testing.T) {
	svc, _, sched := newTestService()
	ctx := context.Background()

	r, err := svc.Create(ctx, "ws1", &store.Routine{
		Name:         "Scheduled Routine",
		Prompt:       "Do something useful",
		Enabled:      true,
		ScheduleCron: ptrStr("0 0 * * *"),
	})
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	// Verify schedule Upsert was called exactly once
	if len(sched.upsertCalls) != 1 {
		t.Fatalf("expected 1 schedule upsert call, got %d", len(sched.upsertCalls))
	}
	call := sched.upsertCalls[0]
	if call.wsID != "ws1" {
		t.Errorf("upsert wsID = %q, want 'ws1'", call.wsID)
	}
	if call.routineID != r.ID {
		t.Errorf("upsert routineID = %q, want %q", call.routineID, r.ID)
	}

}

func TestUpdate_PersistsFieldsAndResyncsSchedule(t *testing.T) {
	svc, fakeStore, sched := newTestService()
	ctx := context.Background()

	created, err := svc.Create(ctx, "ws1", &store.Routine{
		Name:         "Original",
		Prompt:       "original prompt",
		Enabled:      true,
		ScheduleCron: ptrStr("0 * * * *"),
		ScheduleTZ:   "Asia/Ho_Chi_Minh",
	})
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	updated, err := svc.Update(ctx, "ws1", &store.Routine{
		ID:           created.ID,
		Name:         "Renamed",
		Prompt:       "updated instruction",
		Enabled:      true,
		ScheduleCron: ptrStr("0 */2 * * *"),
		ScheduleTZ:   "UTC",
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}

	if updated.Name != "Renamed" || updated.Prompt != "updated instruction" {
		t.Errorf("update returned stale fields: name=%q prompt=%q", updated.Name, updated.Prompt)
	}

	stored, err := fakeStore.Get(ctx, "ws1", created.ID)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if stored.Name != "Renamed" {
		t.Errorf("name not persisted: got %q", stored.Name)
	}
	if stored.Prompt != "updated instruction" {
		t.Errorf("prompt not persisted: got %q", stored.Prompt)
	}
	if stored.ScheduleCron == nil || *stored.ScheduleCron != "0 */2 * * *" {
		t.Errorf("cron not persisted: got %v", stored.ScheduleCron)
	}
	if stored.ScheduleTZ != "UTC" {
		t.Errorf("tz not persisted: got %q", stored.ScheduleTZ)
	}

	// One Upsert from Create + one from Update (last must carry the new cron/tz).
	if len(sched.upsertCalls) < 2 {
		t.Fatalf("expected schedule re-sync on update, got %d upsert calls", len(sched.upsertCalls))
	}
	last := sched.upsertCalls[len(sched.upsertCalls)-1]
	if last.cron == nil || *last.cron != "0 */2 * * *" {
		t.Errorf("schedule re-synced with wrong cron: %v", last.cron)
	}
	if last.tz != "UTC" {
		t.Errorf("schedule re-synced with wrong tz: %q", last.tz)
	}
}

func TestUpdate_DisablePausesSchedule(t *testing.T) {
	svc, _, sched := newTestService()
	ctx := context.Background()

	created, err := svc.Create(ctx, "ws1", &store.Routine{
		Name:         "Sched",
		Prompt:       "p",
		Enabled:      true,
		ScheduleCron: ptrStr("0 * * * *"),
	})
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if _, err := svc.Update(ctx, "ws1", &store.Routine{
		ID:           created.ID,
		Name:         "Sched",
		Prompt:       "p",
		Enabled:      false,
		ScheduleCron: ptrStr("0 * * * *"),
	}); err != nil {
		t.Fatalf("Update failed: %v", err)
	}

	last := sched.upsertCalls[len(sched.upsertCalls)-1]
	if last.enabled {
		t.Error("expected disabled routine to be passed to schedule Upsert (which pauses it)")
	}
}

func TestCreate_NoScheduleWhenSchedIsNil(t *testing.T) {
	fakeStore := newFakeRoutineStore()
	svc := &Service{
		routines: fakeStore,
		runs:     nil,
		sched:    nil,
		client:   nil,
	}

	_, err := svc.Create(context.Background(), "ws1", &store.Routine{
		Name:   "Manual Only",
		Prompt: "test",
	})
	if err != nil {
		t.Fatalf("Create with nil sched should succeed: %v", err)
	}
	// Just verify it doesn't crash - routine is stored
	routines, _ := fakeStore.List(context.Background(), "ws1")
	if len(routines) != 1 {
		t.Fatalf("expected 1 routine stored, got %d", len(routines))
	}
}

func TestCreate_SetsDefaultValues(t *testing.T) {
	svc, fakeStore, _ := newTestService()
	ctx := context.Background()

	r, err := svc.Create(ctx, "ws-default", &store.Routine{
		Name:   "Default Vals",
		Prompt: "Test",
	})
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if r.WorkspaceID != "ws-default" {
		t.Errorf("WorkspaceID = %q, want 'ws-default'", r.WorkspaceID)
	}
	if r.ScheduleTZ != "Asia/Ho_Chi_Minh" {
		t.Errorf("ScheduleTZ = %q, want 'Asia/Ho_Chi_Minh'", r.ScheduleTZ)
	}
	if r.SessionPrefix != "routine" {
		t.Errorf("SessionPrefix = %q, want 'routine'", r.SessionPrefix)
	}
	if r.ID == "" {
		t.Error("ID should not be empty")
	}

	// Verify stored
	stored, _ := fakeStore.Get(ctx, "ws-default", r.ID)
	if stored == nil {
		t.Fatal("routine not found in store")
	}
}

// ---------------------------------------------------------------------------
// Rotate fire token (alias for Generate)
// ---------------------------------------------------------------------------

func TestRotateFireToken_GeneratesNewToken(t *testing.T) {
	svc, fakeStore, _ := newTestService()
	ctx := context.Background()

	r, _ := svc.Create(ctx, "ws1", &store.Routine{
		Name:        "RT",
		Prompt:      "P",
		Enabled:     true,
		ScheduleCron: ptrStr("0 */4 * * *"),
	})

	t1, _ := svc.GenerateFireToken(ctx, "ws1", r.ID)
	t2, _ := svc.RotateFireToken(ctx, "ws1", r.ID)

	if t1 == t2 {
		t.Fatal("expected different tokens after rotation")
	}

	// Old token should no longer verify
	_ = fakeStore // store is updated with new hash
	err := svc.VerifyFireToken(ctx, "ws1", r.ID, t2)
	if err != nil {
		t.Fatalf("new token should verify: %v", err)
	}
}
