import { RoutineCard } from "./RoutineCard";
import type { Routine, RoutineRun } from "@/types/api";

interface RoutinesListProps {
  items: Routine[];
  runsByRoutine: Record<string, RoutineRun[]>;
  runsLoading: Record<string, boolean>;
  expanded: Set<string>;
  canRun: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onToggleExpand: (id: string) => void;
  onRunNow: (routine: Routine) => void;
  onToggleEnabled: (routine: Routine) => void;
  onEdit: (routine: Routine) => void;
  onDelete: (id: string) => void;
  onRefreshRuns: (id: string) => void;
}

export function RoutinesList({
  items,
  runsByRoutine,
  runsLoading,
  expanded,
  canRun,
  canUpdate,
  canDelete,
  onToggleExpand,
  onRunNow,
  onToggleEnabled,
  onEdit,
  onDelete,
  onRefreshRuns,
}: RoutinesListProps) {
  return (
    <div className="space-y-3">
      {items.map((r) => (
        <RoutineCard
          key={r.id}
          routine={r}
          runs={runsByRoutine[r.id] || []}
          runsLoading={!!runsLoading[r.id]}
          isExpanded={expanded.has(r.id)}
          canRun={canRun}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onToggleExpand={() => onToggleExpand(r.id)}
          onRunNow={() => onRunNow(r)}
          onToggleEnabled={() => onToggleEnabled(r)}
          onEdit={() => onEdit(r)}
          onDelete={() => onDelete(r.id)}
          onRefreshRuns={() => onRefreshRuns(r.id)}
        />
      ))}
    </div>
  );
}
