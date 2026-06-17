import { Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RoutinesEmptyStateProps {
  canCreate: boolean;
  onCreate: () => void;
}

export function RoutinesEmptyState({ canCreate, onCreate }: RoutinesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Clock className="size-12 text-muted-foreground/40" />
      <h3 className="mt-4 text-lg font-medium text-foreground">No routines yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">Create a routine to schedule agent runs</p>
      {canCreate && (
        <Button onClick={onCreate} className="mt-4 cursor-pointer">
          <Plus className="size-4" />
          New Routine
        </Button>
      )}
    </div>
  );
}
