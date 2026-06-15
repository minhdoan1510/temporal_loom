import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  Check,
  X,
  Loader2,
} from "lucide-react";
import type { ToolCall, ThinkingStep } from "@/stores/chat";
import { cn } from "@/lib/utils";
import Prose from "@/components/markdown/Prose";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface ThinkingBlockProps {
  steps: ThinkingStep[];
  toolCalls: ToolCall[];
  startTime: number;
  isActive: boolean;
  livePreview?: string;
}

export default function ThinkingBlock({
  steps,
  toolCalls,
  startTime,
  isActive,
  livePreview,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selectedTool, setSelectedTool] = useState<ToolCall | null>(null);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, isActive]);

  useEffect(() => {
    if (!isActive && startTime > 0) {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }
  }, [isActive, startTime]);

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  };

  const hasAnyRunning = toolCalls.some((tc) => tc.status === "running");
  const hasSteps = steps.length > 0;

  const label = !isActive
    ? "Thought"
    : hasAnyRunning
      ? "Working"
      : "Thinking";

  // Compute a one-line live preview (only while active and collapsed).
  // Priority: currently running tool > latest text step > truncated livePreview > default hint.
  let previewText: string | null = null;
  if (isActive) {
    const runningTool = toolCalls.find((tc) => tc.status === "running");
    if (runningTool) {
      previewText = formatToolName(runningTool.name, "running") + "...";
    } else if (livePreview && livePreview.trim()) {
      previewText = livePreview.trim();
    } else {
      const lastTextStep = [...steps].reverse().find((s) => s.type === "text") as
        | { type: "text"; content: string }
        | undefined;
      if (lastTextStep) {
        previewText = lastTextStep.content;
      } else {
        previewText = "Analyzing your request...";
      }
    }
    if (previewText && previewText.length > 120) {
      previewText = previewText.slice(0, 120) + "...";
    }
  }

  return (
    <div className="my-2">
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground">
        <span
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setExpanded(!expanded);
          }}
          className="flex cursor-pointer items-center gap-2.5 underline decoration-dashed decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/50"
        >
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground/60" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground/60" />
          )}

          <span className="relative flex size-2">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75",
                isActive ? "bg-primary animate-ping" : "bg-primary"
              )}
            />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>

          <span className="font-medium text-foreground/80">{label}</span>
        </span>
        {(isActive || elapsed > 0) && (
          <>
            <span className="text-muted-foreground/50">&middot;</span>
            <span className="text-xs text-muted-foreground/60">
              {formatTime(elapsed)}
            </span>
          </>
        )}
        {!expanded && previewText && (
          <>
            <span className="hidden text-muted-foreground/50 sm:inline">&middot;</span>
            <span className="hidden min-w-0 flex-1 truncate text-xs italic text-muted-foreground/60 sm:inline">
              {previewText}
            </span>
          </>
        )}
      </div>

      {expanded && (
        <div className="ml-6 mt-1 space-y-2 border-l-2 border-border/30 pl-4">
          {steps.map((step, i) =>
            step.type === "text" ? (
              <div
                key={i}
                className="text-xs leading-relaxed text-muted-foreground/70"
              >
                <Prose content={step.content} />
              </div>
            ) : (
              <ToolCallStep
                key={i}
                toolCall={step.toolCall}
                onSelect={setSelectedTool}
              />
            )
          )}

          {isActive && !hasSteps && (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground/60">
              <Loader2 className="size-3 animate-spin" />
              <span>Analyzing your request...</span>
            </div>
          )}
        </div>
      )}

      {/* Tool detail dialog */}
      <ToolDetailDialog
        toolCall={selectedTool}
        onClose={() => setSelectedTool(null)}
      />
    </div>
  );
}

// ─── Tool Call Step ───────────────────────────────────────────────────

function ToolCallStep({
  toolCall,
  onSelect,
}: {
  toolCall: ToolCall;
  onSelect: (tc: ToolCall) => void;
}) {
  const displayName = formatToolName(toolCall.name, toolCall.status);
  const argSummary = getArgSummary(toolCall.arguments);
  const hasDetail = toolCall.arguments || toolCall.result;

  return (
    <div className="flex items-start gap-2 py-1 text-xs text-muted-foreground">
      <Wrench className="mt-0.5 size-3 shrink-0 text-chart-3/70" />
      <div className="min-w-0 flex-1">
        {hasDetail ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(toolCall);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onSelect(toolCall);
              }
            }}
            className="cursor-pointer font-medium underline decoration-dashed decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/50"
          >
            {displayName}
          </span>
        ) : (
          <span className="font-medium">{displayName}</span>
        )}
        {argSummary && (
          <p className="truncate font-mono text-[11px] text-muted-foreground/50">
            {argSummary}
          </p>
        )}
      </div>
      <span className="mt-0.5 shrink-0">
        {toolCall.status === "running" && (
          <Loader2 className="size-3 animate-spin text-primary/60" />
        )}
        {toolCall.status === "completed" && (
          <Check className="size-3 text-primary/60" />
        )}
        {toolCall.status === "failed" && (
          <X className="size-3 text-destructive/60" />
        )}
      </span>
    </div>
  );
}

// ─── Tool Detail Dialog ───────────────────────────────────────────────

function ToolDetailDialog({
  toolCall,
  onClose,
}: {
  toolCall: ToolCall | null;
  onClose: () => void;
}) {
  if (!toolCall) return null;

  const displayName = formatToolName(toolCall.name, toolCall.status);

  return (
    <Dialog open={!!toolCall} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wrench className="size-4 text-chart-3" />
            {displayName}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {toolCall.name} &middot; {toolCall.id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1" style={{ maxHeight: "calc(80vh - 120px)" }}>
          {/* Request */}
          {toolCall.arguments &&
            Object.keys(toolCall.arguments).length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Request
                </div>
                <div className="space-y-1.5 rounded-lg border border-border/30 bg-card/50 p-3">
                  {Object.entries(toolCall.arguments).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="shrink-0 font-mono font-medium text-muted-foreground/60">
                        {k}:
                      </span>
                      <span className="break-all font-mono text-foreground/80">
                        {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Response */}
          {toolCall.result && (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Response
              </div>
              <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap rounded-lg border border-border/30 bg-[#0a0f1d] p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                {toolCall.result}
              </pre>
            </div>
          )}

          {/* No result yet */}
          {!toolCall.result && toolCall.status === "running" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
              <Loader2 className="size-3 animate-spin" />
              <span>Waiting for result...</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatToolName(name: string, status: string): string {
  const label = name.replace(/_/g, " ");
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  if (status === "completed") {
    if (name.startsWith("search_"))
      return capitalized.replace(/^Search/, "Searched");
    if (name.startsWith("get_"))
      return capitalized.replace(/^Get/, "Retrieved");
    if (name.startsWith("query_"))
      return capitalized.replace(/^Query/, "Queried");
  }
  if (status === "running") {
    if (name.startsWith("search_"))
      return capitalized.replace(/^Search/, "Searching");
    if (name.startsWith("get_"))
      return capitalized.replace(/^Get/, "Retrieving");
    if (name.startsWith("read_"))
      return capitalized.replace(/^Read/, "Reading");
    if (name.startsWith("query_"))
      return capitalized.replace(/^Query/, "Querying");
  }
  return capitalized;
}

function getArgSummary(args?: Record<string, unknown>): string | null {
  if (!args) return null;
  const priority = [
    "query",
    "ticket_key",
    "trace_id",
    "keyword",
    "search",
    "message",
    "name",
  ];
  for (const key of priority) {
    if (args[key] && typeof args[key] === "string") {
      const val = args[key] as string;
      return val.length > 80 ? val.slice(0, 80) + "..." : val;
    }
  }
  for (const val of Object.values(args)) {
    if (typeof val === "string" && val.length > 0) {
      return (val as string).length > 80
        ? (val as string).slice(0, 80) + "..."
        : (val as string);
    }
  }
  return null;
}
