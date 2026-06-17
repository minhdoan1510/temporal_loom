import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RunHistoryRow } from "./RunHistoryRow";
import type { RoutineRun } from "@/types/api";

interface RunHistoryListProps {
  runs: RoutineRun[];
  loading: boolean;
  onRefresh: () => void;
}

export function RunHistoryList({ runs, loading, onRefresh }: RunHistoryListProps) {
  return (
    <div className="pb-1 w-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-primary">Run History</span>
        <Button
          size="sm"
          variant="default"
          onClick={onRefresh}
          className="h-7 px-2.5 text-xs cursor-pointer"
          aria-label="Refresh history"
          disabled={loading}
          title="Refresh"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="size-3.5 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">No runs yet</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {runs.map((run) => (
            <RunHistoryRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
