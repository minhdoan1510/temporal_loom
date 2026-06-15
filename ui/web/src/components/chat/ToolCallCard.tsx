import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, Loader2, Check, X } from "lucide-react";
import type { ToolCall } from "@/stores/chat";
import { cn } from "@/lib/utils";

interface ToolCallCardProps {
  toolCall: ToolCall;
}

export default function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    running: <Loader2 className="size-3.5 animate-spin text-primary/60" />,
    completed: <Check className="size-3.5 text-primary/60" />,
    failed: <X className="size-3.5 text-destructive/60" />,
  }[toolCall.status];

  const displayName = formatToolName(toolCall.name, toolCall.status);
  const argSummary = getArgSummary(toolCall.arguments);

  return (
    <div
      className={cn(
        "my-1 rounded-lg border bg-card/30 transition-colors",
        toolCall.status === "running"
          ? "border-border/50 animate-pulse"
          : "border-border/30"
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/20 cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
        )}
        <Wrench className="size-3.5 shrink-0 text-chart-3/70" />
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-muted-foreground">{displayName}</span>
          {argSummary && (
            <p className="truncate font-mono text-[11px] text-muted-foreground/50">
              {argSummary}
            </p>
          )}
        </div>
        <span className="shrink-0">{statusIcon}</span>
      </button>

      {expanded && toolCall.arguments && (
        <div className="border-t border-border/20 px-3 py-2 text-xs">
          {Object.entries(toolCall.arguments).map(([k, v]) => (
            <div key={k} className="flex gap-2 py-0.5">
              <span className="shrink-0 font-mono text-muted-foreground/50">{k}:</span>
              <span className="break-all font-mono text-muted-foreground">
                {typeof v === "string" ? v : JSON.stringify(v)}
              </span>
            </div>
          ))}
          <div className="mt-1 flex gap-2 border-t border-border/10 pt-1">
            <span className="font-mono text-muted-foreground/40">id:</span>
            <span className="font-mono text-muted-foreground/40">{toolCall.id}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatToolName(name: string, status: string): string {
  const label = name.replace(/_/g, " ");
  // Capitalize first letter
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);

  // Use past tense for completed search-like tools
  if (status === "completed") {
    if (name.startsWith("search_")) return capitalized.replace(/^Search/, "Searched");
    if (name.startsWith("get_")) return capitalized.replace(/^Get/, "Retrieved");
    if (name.startsWith("read_")) return capitalized.replace(/^Read/, "Read");
    if (name.startsWith("query_")) return capitalized.replace(/^Query/, "Queried");
  }
  if (status === "running") {
    if (name.startsWith("search_")) return capitalized.replace(/^Search/, "Searching");
    if (name.startsWith("get_")) return capitalized.replace(/^Get/, "Retrieving");
    if (name.startsWith("read_")) return capitalized.replace(/^Read/, "Reading");
    if (name.startsWith("query_")) return capitalized.replace(/^Query/, "Querying");
  }

  return capitalized;
}

function getArgSummary(args?: Record<string, unknown>): string | null {
  if (!args) return null;

  // Prioritize common argument names for display
  const priority = ["query", "ticket_key", "trace_id", "session_key", "keyword", "search", "message", "name", "url", "path"];
  for (const key of priority) {
    if (args[key] && typeof args[key] === "string") {
      const val = args[key] as string;
      return val.length > 80 ? val.slice(0, 80) + "..." : val;
    }
  }

  // Fallback: first string argument
  for (const val of Object.values(args)) {
    if (typeof val === "string" && val.length > 0) {
      return val.length > 80 ? val.slice(0, 80) + "..." : val;
    }
  }

  return null;
}
