import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useRoutinesStore } from "@/stores/routines";
import { Button } from "@/components/ui/button";
import { RoutinesList } from "@/components/routines/RoutinesList";
import { RoutinesEmptyState } from "@/components/routines/RoutinesEmptyState";
import { RoutineFormDialog } from "@/components/routines/RoutineFormDialog";
import { TokenRevealModal } from "@/components/routines/TokenRevealModal";
import type { RoutineFormValues } from "@/components/routines/RoutineFormDialog";
import type { Routine } from "@/types/api";

export default function RoutinesPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission("tab:routines:create");
  const canUpdate = hasPermission("tab:routines:update");
  const canDelete = hasPermission("tab:routines:delete");
  const canRun = hasPermission("tab:routines:run");

  const {
    items,
    loaded,
    loading,
    runsByRoutine,
    runsLoading,
    loadRoutines,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    loadRuns,
    fireRoutine,
    rotateToken,
    revokeToken,
  } = useRoutinesStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [shownToken, setShownToken] = useState("");

  useEffect(() => { loadRoutines(); }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); loadRuns(id); }
      return next;
    });
  };

  const expandRoutine = (id: string) => {
    setExpanded((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleSave = async (values: RoutineFormValues, editingId: string | null): Promise<string | null> => {
    const hadToken = editingRoutine?.has_fire_token ?? false;
    const payload = {
      name: values.name,
      prompt: values.prompt,
      schedule_cron: values.schedule_selected ? values.schedule_cron : "",
      schedule_tz: values.schedule_tz,
      enabled: values.enabled,
      generate_token: values.api_selected && !hadToken,
    };

    const resp = editingId
      ? await updateRoutine(editingId, payload)
      : await createRoutine(payload);

    // Revoke the fire token when the API trigger is turned off on an existing routine.
    if (editingId && hadToken && !values.api_selected) {
      try { await revokeToken(editingId); } catch { /* toast shown by API layer */ }
    }

    if (resp.fire_token) {
      setShownToken(resp.fire_token);
      setTokenModalOpen(true);
      setDialogOpen(false);
      return resp.fire_token;
    }

    setDialogOpen(false);
    setEditingRoutine(null);
    toast.success(editingId ? "Routine updated" : "Routine created");
    return null;
  };

  const handleRotateToken = async (id: string) => {
    try {
      const token = await rotateToken(id);
      setShownToken(token);
      setTokenModalOpen(true);
    } catch { /* toast shown by API layer */ }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this routine?")) return;
    try {
      await deleteRoutine(id);
      toast.success("Routine deleted");
    } catch { /* toast shown by API layer */ }
  };

  const handleToggleEnabled = async (r: Routine) => {
    try { await updateRoutine(r.id, { enabled: !r.enabled }); }
    catch { /* toast shown by API layer */ }
  };

  const handleRunNow = async (r: Routine) => {
    try {
      const resp = await fireRoutine(r.id);
      toast.success(`Run started: ${resp.run_id}`);
      expandRoutine(r.id);
      loadRuns(r.id);
    } catch { /* toast shown by API layer */ }
  };

  const openCreate = () => { setEditingRoutine(null); setDialogOpen(true); };
  const openEdit = (r: Routine) => { setEditingRoutine(r); setDialogOpen(true); };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Routines</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Scheduled agent runs powered by Temporal</p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} size="sm" className="cursor-pointer">
            <Plus className="size-4" />
            New Routine
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 [scrollbar-gutter:stable]">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading routines...
          </div>
        ) : !loaded && items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Unable to load routines</p>
        ) : items.length === 0 ? (
          <RoutinesEmptyState canCreate={canCreate} onCreate={openCreate} />
        ) : (
          <RoutinesList
            items={items}
            runsByRoutine={runsByRoutine}
            runsLoading={runsLoading}
            expanded={expanded}
            canRun={canRun}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onToggleExpand={toggleExpand}
            onRunNow={handleRunNow}
            onToggleEnabled={handleToggleEnabled}
            onEdit={openEdit}
            onDelete={handleDelete}
            onRefreshRuns={loadRuns}
          />
        )}
      </div>

      <RoutineFormDialog
        open={dialogOpen}
        editingRoutine={editingRoutine}
        onClose={() => { setDialogOpen(false); setEditingRoutine(null); }}
        onSave={handleSave}
        onRotateToken={handleRotateToken}
      />

      <TokenRevealModal
        open={tokenModalOpen}
        token={shownToken}
        onClose={() => setTokenModalOpen(false)}
      />
    </div>
  );
}
