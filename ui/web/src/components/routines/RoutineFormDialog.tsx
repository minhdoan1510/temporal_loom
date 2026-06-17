import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TriggerSelector } from "./TriggerSelector";
import { getScheduleType } from "@/lib/cron";
import type { Routine } from "@/types/api";

const DEFAULT_CRON = "0 * * * *";

export interface RoutineFormValues {
  name: string;
  prompt: string;
  schedule_type: string;
  schedule_cron: string;
  schedule_tz: string;
  enabled: boolean;
  schedule_selected: boolean;
  api_selected: boolean;
}

const emptyForm: RoutineFormValues = {
  name: "",
  prompt: "",
  schedule_type: "hourly",
  schedule_cron: DEFAULT_CRON,
  schedule_tz: "Asia/Ho_Chi_Minh",
  enabled: true,
  schedule_selected: true,
  api_selected: false,
};

function routineToForm(r: Routine): RoutineFormValues {
  const cron = r.schedule_cron || DEFAULT_CRON;
  return {
    name: r.name,
    prompt: r.prompt,
    schedule_type: getScheduleType(cron),
    schedule_cron: cron,
    schedule_tz: r.schedule_tz,
    enabled: r.enabled,
    schedule_selected: !!r.schedule_cron,
    api_selected: r.has_fire_token,
  };
}

interface RoutineFormDialogProps {
  open: boolean;
  editingRoutine: Routine | null;
  onClose: () => void;
  onSave: (values: RoutineFormValues, editingId: string | null) => Promise<string | null>;
  onRotateToken: (id: string) => Promise<void>;
}

export function RoutineFormDialog({ open, editingRoutine, onClose, onSave, onRotateToken }: RoutineFormDialogProps) {
  const [form, setForm] = useState<RoutineFormValues>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editingRoutine ? routineToForm(editingRoutine) : emptyForm);
    }
  }, [open, editingRoutine]);

  const resetForm = () => {
    setForm(emptyForm);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
      onClose();
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt.trim()) {
      toast.error("Name and instructions are required");
      return;
    }
    if (!form.schedule_selected && !form.api_selected) {
      toast.error("Select at least one trigger");
      return;
    }
    setSaving(true);
    try {
      const token = await onSave(form, editingRoutine?.id ?? null);
      if (token) return; // parent will show token modal, keep dialog open
      resetForm();
      toast.success(editingRoutine ? "Routine updated" : "Routine created");
    } catch {
      /* toast shown by API layer */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg border-border/50 bg-sidebar">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {editingRoutine ? "Edit Routine" : "New Routine"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={250}
              placeholder="Daily summary"
              className="bg-card text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Instructions</label>
            <textarea
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              rows={4}
              maxLength={2000}
              required
              placeholder="What should the agent do on each run?"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-y"
            />
          </div>

          <TriggerSelector
            scheduleSelected={form.schedule_selected}
            apiSelected={form.api_selected}
            scheduleCron={form.schedule_cron}
            scheduleType={form.schedule_type}
            tokenActive={!!editingRoutine?.has_fire_token && form.api_selected}
            onToggleSchedule={(selected) => setForm((f) => ({ ...f, schedule_selected: selected }))}
            onToggleApi={(selected) => setForm((f) => ({ ...f, api_selected: selected }))}
            onScheduleChange={(cron, type) => setForm((f) => ({ ...f, schedule_cron: cron, schedule_type: type }))}
            onRotateToken={editingRoutine ? () => onRotateToken(editingRoutine.id) : undefined}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !form.prompt.trim()}
            className="cursor-pointer"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : editingRoutine ? "Save Changes" : "Create Routine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
