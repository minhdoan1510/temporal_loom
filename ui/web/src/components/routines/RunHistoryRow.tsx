import {
  Loader2,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";
import { useNavigate } from "react-router";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemMedia,
} from "@/components/ui/item";
import type { RoutineRun } from "@/types/api";

function StatusIcon({ status }: { status: string }) {
  if (status === "running")
    return <Loader2 className="size-4 animate-spin text-info" />;
  if (status === "failed") return <XCircle className="size-4 text-destructive" />;
  return <CheckCircle2 className="size-4 text-success" />;
}

function triggerTypeLabel(t: string) {
  switch (t) {
    case "schedule":
      return "Cron";
    case "api":
      return "API /fire";
    case "manual":
      return "Run Now";
    default:
      return t;
  }
}

function formatMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function RunRowContent({ run }: { run: RoutineRun }) {
  return (
    <>
      <ItemMedia className="shrink-0">
        <StatusIcon status={run.status} />
      </ItemMedia>

      <ItemContent className="flex-1 min-w-0">
        <ItemTitle className="text-sm font-medium truncate">
          {triggerTypeLabel(run.trigger_type)} run at{" "}
          {format(new Date(run.started_at), "dd/MM/yy HH:mm")}
        </ItemTitle>
      </ItemContent>

      <div className="shrink-0 flex items-center gap-3 ml-auto">
        {run.error ? (
          <span
            className="text-xs font-medium text-destructive max-w-[200px] truncate"
            title={run.error}
          >
            {run.error}
          </span>
        ) : (
          <Badge
            variant="secondary"
            className="px-1.5 py-0 text-muted-foreground bg-background/50 flex items-center gap-1 shadow-sm font-medium"
          >
            <Timer className="size-3" />
            {formatMs(run.duration_ms)}
          </Badge>
        )}
      </div>
    </>
  );
}

export function RunHistoryRow({ run }: { run: RoutineRun }) {
  const navigate = useNavigate();

  if (run.session_key) {
    const goToSession = () => navigate(`/sessions/${encodeURIComponent(run.session_key!)}`);
    return (
      <Item
        variant="muted"
        size="sm"
        role="link"
        tabIndex={0}
        onClick={goToSession}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            goToSession();
          }
        }}
        className="rounded-md px-3 py-2 flex items-center gap-3 bg-accent/60 border border-border cursor-pointer hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RunRowContent run={run} />
      </Item>
    );
  }

  return (
    <Item
      variant="muted"
      size="sm"
      className="rounded-md px-3 py-2 flex items-center gap-3 bg-accent/60 border border-border"
    >
      <RunRowContent run={run} />
    </Item>
  );
}
