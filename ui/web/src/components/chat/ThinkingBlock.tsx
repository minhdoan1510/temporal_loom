import { useState, useEffect } from "react";
import {
  Wrench,
} from "lucide-react";
import type { ToolCall, ThinkingStep } from "@/stores/chat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ThinkingSteps,
  ThinkingStepsHeader,
  ThinkingStepsContent,
  ThinkingStep as FluidThinkingStep,
} from "@/components/chat/ThinkingSteps";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import PhysicsGridSpinner, { type SpinnerProfile } from "@/components/ui/PhysicsGridSpinner";

interface ThinkingBlockProps {
  steps: ThinkingStep[];
  toolCalls: ToolCall[];
  startTime: number;
  isActive: boolean;
  livePreview?: string;
}

function getStreamingProfile(toolCallsCount: number): SpinnerProfile {
  const cycle = toolCallsCount % 6;
  switch (cycle) {
    case 0:
      return "glitch-gold";
    case 1:
      return "cobalt-breath";
    case 2:
      return "digital-pulse";
    case 3:
      return "rebound";
    case 4:
      return "fluid-wave";
    case 5:
      return "mono-scanner";
    default:
      return "glitch-gold";
  }
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
  const [startIndex, setStartIndex] = useState(0);

  useEffect(() => {
    if (isActive) {
      setStartIndex(Math.floor(Math.random() * 6));
    }
  }, [isActive, startTime]);

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



  const hasAnyRunning = toolCalls.some((tc) => tc.status === "running");
  const hasSteps = steps.length > 0;

  const label = !isActive
    ? "Thought"
    : hasAnyRunning
      ? "Working"
      : "Thinking";

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
    if (previewText && previewText.length > 80) {
      previewText = previewText.slice(0, 80) + "...";
    }
  }

  const currentProfile = getStreamingProfile(startIndex + toolCalls.length);

  return (
    <div className="my-0 w-full">
      <ThinkingSteps open={expanded} onOpenChange={setExpanded} className="w-full max-w-none">
        <ThinkingStepsHeader className="cursor-pointer">
          <div className="flex items-center gap-2 text-sm text-muted-foreground select-none">
            {isActive ? (
              <ThinkingIndicator
                showIcon={true}
                className="p-0 gap-1.5"
                profile={currentProfile}
              />
            ) : (
              <span className="font-semibold text-foreground/80">{label}</span>
            )}
            {(isActive || elapsed > 0) && (
              <span className="text-xs text-muted-foreground/50">
                ({formatTime(elapsed)})
              </span>
            )}
            {!expanded && previewText && (
              <span className="hidden min-w-0 flex-1 truncate text-xs italic text-muted-foreground/60 sm:inline max-w-[400px]">
                &middot; {previewText}
              </span>
            )}
          </div>
        </ThinkingStepsHeader>

        <ThinkingStepsContent>
          <div className="mt-1 space-y-1 pl-1">
            {steps.map((step, i) => {
              const isStepLast = i === steps.length - 1 && !isActive;
              if (step.type === "text") {
                const isStepActive = isActive && i === steps.length - 1;
                return (
                  <FluidThinkingStep
                    key={i}
                    index={i}
                    label={`Step ${i + 1}`}
                    description={step.content}
                    status={isStepActive ? "active" : "complete"}
                    isLast={isStepLast}
                    profile={isStepActive ? currentProfile : undefined}
                  />
                );
              } else if (step.toolCall) {
                const isToolRunning = step.toolCall.status === "running";
                return (
                  <FluidThinkingStep
                    key={i}
                    index={i}
                    icon="settings"
                    label={formatToolName(step.toolCall.name, step.toolCall.status)}
                    status={isToolRunning ? "active" : "complete"}
                    isLast={isStepLast}
                    profile={isToolRunning ? currentProfile : undefined}
                  >
                    <ToolCallStepInner
                      toolCall={step.toolCall}
                      onSelect={setSelectedTool}
                    />
                  </FluidThinkingStep>
                );
              }
              return null;
            })}

            {isActive && !hasSteps && (
              <FluidThinkingStep
                index={0}
                label="Analyzing your request"
                status="active"
                isLast={true}
                profile={currentProfile}
              />
            )}
          </div>
        </ThinkingStepsContent>
      </ThinkingSteps>

      {/* Tool detail dialog */}
      <ToolDetailDialog
        toolCall={selectedTool}
        onClose={() => setSelectedTool(null)}
      />
    </div>
  );
}

// ─── Tool Call Step Inner ─────────────────────────────────────────────

function ToolCallStepInner({
  toolCall,
  onSelect,
}: {
  toolCall: ToolCall;
  onSelect: (tc: ToolCall) => void;
}) {
  const argSummary = getArgSummary(toolCall.arguments);
  const hasDetail = toolCall.arguments || toolCall.result;

  return (
    <div className="text-[11px] text-muted-foreground/70 pl-0.5">
      {argSummary && (
        <p className="truncate font-mono text-[10px] text-muted-foreground/50">
          {argSummary}
        </p>
      )}
      {hasDetail && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(toolCall);
          }}
          className="mt-1 cursor-pointer font-medium underline decoration-dashed decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/50 text-[11px] outline-none"
        >
          View details
        </button>
      )}
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
              <PhysicsGridSpinner profile="execute-tool" size={12} className="mr-0.5" />
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

function formatTime(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

