import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, CalendarDays, Check, Clock, CloudSun, GripVertical, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth";
import { useRoutinesStore } from "@/stores/routines";
import { createChatSessionKey, queueChatPrompt } from "@/lib/chat-session";
import type { Routine, RoutineRun } from "@/types/api";

const WIDGET_STORAGE_KEY = "dashboard_widgets";
const ROUTINE_LATEST_WIDGET = "routineLatest";
const CALENDAR_WIDGET = "calendar";
const WEATHER_WIDGET = "weather";

type DashboardWidgetType = typeof ROUTINE_LATEST_WIDGET | typeof CALENDAR_WIDGET | typeof WEATHER_WIDGET;

const chatRecommendations: Array<{
  label: string;
  prompt: string;
  muted?: boolean;
}> = [
  {
    label: "Hỏi Cashloan bất kỳ",
    prompt: "",
    muted: true,
  },
  {
    label: "Query funnel Cashloan",
    prompt: "Query funnel Cashloan hiện tại, nêu conversion rate theo từng bước và điểm rơi lớn nhất.",
  },
  {
    label: "Tỉ lệ lỗi partner",
    prompt: "Kiểm tra tỉ lệ lỗi partner Cashloan hiện tại, nhóm lỗi chính và partner ảnh hưởng nhiều nhất.",
  },
  {
    label: "Tỉ lệ nợ xấu",
    prompt: "Kiểm tra tỉ lệ nợ xấu Cashloan hiện tại, xu hướng gần đây và segment bất thường.",
  },
  {
    label: "Giải ngân 7 ngày",
    prompt: "Kiểm tra tỉ lệ giải ngân Cashloan trong 7 ngày gần nhất, so sánh xu hướng theo ngày.",
  },
  {
    label: "Giải ngân 1 tuần",
    prompt: "Kiểm tra tỉ lệ giải ngân Cashloan trong 1 tuần gần nhất, so sánh với tuần trước.",
  },
  {
    label: "Giải ngân 1 tháng",
    prompt: "Kiểm tra tỉ lệ giải ngân Cashloan trong 1 tháng gần nhất, so sánh với tháng trước.",
  },
  {
    label: "Giải ngân 1 quý",
    prompt: "Kiểm tra tỉ lệ giải ngân Cashloan trong 1 quý gần nhất, so sánh với quý trước.",
  },
] as const;

const widgetTypeOptions = [
  {
    type: ROUTINE_LATEST_WIDGET,
    label: "Latest routine data",
    description: "Latest output from one routine",
    icon: Clock,
  },
  {
    type: CALENDAR_WIDGET,
    label: "Calendar",
    description: "Today at a glance",
    icon: CalendarDays,
  },
  {
    type: WEATHER_WIDGET,
    label: "Weather",
    description: "Local weather snapshot",
    icon: CloudSun,
  },
] as const;

interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  routineId?: string;
}

function isDashboardWidget(value: unknown): value is DashboardWidget {
  if (!value || typeof value !== "object") return false;
  const widget = value as Partial<DashboardWidget>;
  if (typeof widget.id !== "string") return false;
  if (widget.type === ROUTINE_LATEST_WIDGET) return typeof widget.routineId === "string";
  return widget.type === CALENDAR_WIDGET || widget.type === WEATHER_WIDGET;
}

function loadDashboardWidgets() {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(WIDGET_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isDashboardWidget) : [];
  } catch {
    return [];
  }
}

function saveDashboardWidgets(widgets: DashboardWidget[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(widgets));
}

function createWidgetId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getRunTime(run: RoutineRun) {
  return Date.parse(run.finished_at || run.started_at) || 0;
}

function getLatestRoutineRun(runs: RoutineRun[]) {
  return runs.reduce<RoutineRun | null>((current, run) => {
    if (!current) return run;
    return getRunTime(run) > getRunTime(current) ? run : current;
  }, null);
}

function formatRoutineRunTime(run: RoutineRun) {
  const timestamp = run.finished_at || run.started_at;
  const time = Date.parse(timestamp);
  return Number.isNaN(time) ? "" : new Date(time).toLocaleString();
}

function runStatusClass(status: RoutineRun["status"]) {
  if (status === "success") return "bg-success/10 text-success";
  if (status === "failed") return "bg-destructive/10 text-destructive";
  return "bg-info/10 text-info";
}

interface DraggableWidgetFrameProps {
  children: ReactNode;
  variant?: "square" | "wide";
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onRemove: () => void;
}

function DraggableWidgetFrame({
  children,
  variant = "square",
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRemove,
}: DraggableWidgetFrameProps) {
  const sizeClass =
    variant === "wide"
      ? "min-h-[180px] sm:col-span-2 lg:col-span-3 lg:h-[180px]"
      : "aspect-square min-h-[180px]";

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group relative ${sizeClass} rounded-2xl transition ${
        isDragging ? "opacity-60" : ""
      } ${
        isDragOver ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-neutral-50" : ""
      }`}
    >
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-neutral-200 bg-white/95 p-1 text-neutral-400 opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label="Drag to reorder widget"
          title="Drag to reorder widget"
          className="flex size-7 cursor-grab items-center justify-center rounded-full transition hover:bg-neutral-100 hover:text-neutral-700 focus-visible:text-neutral-700 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Widget actions"
              title="Widget actions"
              className="size-7 cursor-pointer rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:text-neutral-700"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-36">
            <DropdownMenuItem
              onClick={onRemove}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}
    </div>
  );
}

interface RoutineLatestWidgetProps {
  routine?: Routine;
  latestRun: RoutineRun | null;
  loading: boolean;
  canViewRoutines: boolean;
  onOpenConversation: () => void;
}

function RoutineLatestWidget({
  routine,
  latestRun,
  loading,
  canViewRoutines,
  onOpenConversation,
}: RoutineLatestWidgetProps) {
  return (
    <section className="relative flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-2xl border border-neutral-100 bg-white p-6 pb-14 shadow-xs">
      <div className="min-h-0">
        {!canViewRoutines ? (
          <p className="text-sm leading-relaxed text-neutral-500">
            Routine output is unavailable for this workspace.
          </p>
        ) : !routine ? (
          <p className="text-sm leading-relaxed text-neutral-500">
            The selected routine is no longer available.
          </p>
        ) : loading && !latestRun ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Loader2 className="size-4 animate-spin text-primary" />
            Loading latest output...
          </div>
        ) : latestRun ? (
          <div className="min-h-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-heading text-base font-bold leading-tight text-neutral-900">
                  {routine.name}
                </h3>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {formatRoutineRunTime(latestRun)}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${runStatusClass(latestRun.status)}`}>
                {latestRun.status}
              </span>
            </div>
            <div className="mt-3 max-h-28 overflow-hidden rounded-2xl border border-neutral-100/50 bg-neutral-50/80 p-4">
              {latestRun.status === "running" ? (
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 className="size-4 animate-spin text-info" />
                  Run in progress...
                </div>
              ) : latestRun.error ? (
                <p className="text-sm leading-relaxed text-destructive">
                  {latestRun.error}
                </p>
              ) : latestRun.output_preview ? (
                <p className="line-clamp-4 text-sm leading-relaxed text-neutral-700">
                  {latestRun.output_preview}
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-neutral-500">
                  No output preview for this run.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-neutral-500">
            No outputs yet. Run {routine.name} to fill this widget.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenConversation}
        aria-label="Open conversation"
        title="Open conversation"
        className="absolute bottom-4 right-4 flex size-9 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground opacity-100 shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100"
      >
        <ArrowRight className="size-4" />
      </button>
    </section>
  );
}

interface CalendarWidgetProps {
  date: Date;
}

function CalendarWidget({ date }: CalendarWidgetProps) {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date).toUpperCase();
  const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(date);
  const day = new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date);
  const year = new Intl.DateTimeFormat(undefined, { year: "numeric" }).format(date);

  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-neutral-100 bg-white p-6 shadow-xs">
      <div>
        <div>
          <span className="text-sm font-bold uppercase tracking-tight text-[#FF3B30]">
            {weekday}
          </span>
          <div className="mt-2 flex items-end gap-3">
            <span className="text-5xl font-bold leading-none tracking-tighter text-neutral-900">
              {day}
            </span>
            <div className="pb-1">
              <p className="text-sm font-bold leading-tight text-neutral-700">
                {month}
              </p>
              <p className="text-xs font-medium text-neutral-400">
                {year}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 pt-3 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        Today
      </p>
    </section>
  );
}

function WeatherWidget() {
  return (
    <section className="flex h-full min-h-0 flex-col justify-between rounded-2xl border border-neutral-100 bg-white p-6 shadow-xs">
      <div>
        <div>
          <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-neutral-400">
            Tan Thuan, Ho Chi Minh City
          </span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-5xl font-bold leading-none tracking-tighter text-neutral-900">
              32
            </span>
            <span className="text-lg font-bold text-neutral-500">C</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-neutral-500">
            Clear
          </p>
        </div>
      </div>

    </section>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const canViewRoutines = useAuthStore((s) => s.hasTabAccess("routines"));
  const routines = useRoutinesStore((s) => s.items);
  const routinesLoaded = useRoutinesStore((s) => s.loaded);
  const routinesLoading = useRoutinesStore((s) => s.loading);
  const runsByRoutine = useRoutinesStore((s) => s.runsByRoutine);
  const runsLoading = useRoutinesStore((s) => s.runsLoading);
  const loadRoutines = useRoutinesStore((s) => s.loadRoutines);
  const loadRuns = useRoutinesStore((s) => s.loadRuns);
  const requestedRoutinesRef = useRef(false);
  const requestedRunsForRef = useRef<Set<string>>(new Set());

  const [date, setDate] = useState(() => new Date());
  const [widgets, setWidgets] = useState<DashboardWidget[]>(loadDashboardWidgets);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedWidgetType, setSelectedWidgetType] = useState<DashboardWidgetType>(ROUTINE_LATEST_WIDGET);
  const [selectedRoutineId, setSelectedRoutineId] = useState("");
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);
  const canAddSelectedWidget =
    selectedWidgetType !== ROUTINE_LATEST_WIDGET ||
    (canViewRoutines && !!selectedRoutineId && routines.length > 0);

  const widgetRoutineIds = widgets.reduce<string[]>((ids, widget) => {
    if (widget.type === ROUTINE_LATEST_WIDGET && widget.routineId && !ids.includes(widget.routineId)) {
      ids.push(widget.routineId);
    }
    return ids;
  }, []);
  const widgetRoutineIdsKey = widgetRoutineIds.join("|");

  useEffect(() => {
    const timer = window.setInterval(() => setDate(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!canViewRoutines || requestedRoutinesRef.current || routinesLoaded || routinesLoading) return;
    requestedRoutinesRef.current = true;
    void loadRoutines();
  }, [canViewRoutines, routinesLoaded, routinesLoading, loadRoutines]);

  useEffect(() => {
    if (!canViewRoutines || !widgetRoutineIdsKey) return;
    for (const routineId of widgetRoutineIdsKey.split("|")) {
      if (requestedRunsForRef.current.has(routineId)) continue;
      requestedRunsForRef.current.add(routineId);
      void loadRuns(routineId);
    }
  }, [canViewRoutines, widgetRoutineIdsKey, loadRuns]);

  const updateWidgets = (nextWidgets: DashboardWidget[]) => {
    setWidgets(nextWidgets);
    saveDashboardWidgets(nextWidgets);
  };

  const openAddDialog = () => {
    setSelectedWidgetType(canViewRoutines ? ROUTINE_LATEST_WIDGET : CALENDAR_WIDGET);
    setSelectedRoutineId(routines[0]?.id ?? "");
    setAddDialogOpen(true);
  };

  const addWidget = () => {
    if (!canAddSelectedWidget) return;
    const nextWidget: DashboardWidget =
      selectedWidgetType === ROUTINE_LATEST_WIDGET
        ? {
            id: createWidgetId(),
            type: selectedWidgetType,
            routineId: selectedRoutineId,
          }
        : {
            id: createWidgetId(),
            type: selectedWidgetType,
          };
    updateWidgets([...widgets, nextWidget]);
    setAddDialogOpen(false);
  };

  const removeWidget = (widgetId: string) => {
    setDraggingWidgetId(null);
    setDragOverWidgetId(null);
    updateWidgets(widgets.filter((widget) => widget.id !== widgetId));
  };

  const reorderWidgets = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = widgets.findIndex((widget) => widget.id === sourceId);
    const targetIndex = widgets.findIndex((widget) => widget.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextWidgets = [...widgets];
    const [movedWidget] = nextWidgets.splice(sourceIndex, 1);
    nextWidgets.splice(targetIndex, 0, movedWidget);
    updateWidgets(nextWidgets);
  };

  const handleWidgetDragStart = (event: DragEvent<HTMLButtonElement>, widgetId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", widgetId);
    setDraggingWidgetId(widgetId);
  };

  const handleWidgetDragOver = (event: DragEvent<HTMLDivElement>, widgetId: string) => {
    const sourceId = draggingWidgetId || event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === widgetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverWidgetId(widgetId);
  };

  const handleWidgetDrop = (event: DragEvent<HTMLDivElement>, widgetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingWidgetId;
    setDraggingWidgetId(null);
    setDragOverWidgetId(null);
    if (!sourceId) return;
    reorderWidgets(sourceId, widgetId);
  };

  const handleWidgetDragEnd = () => {
    setDraggingWidgetId(null);
    setDragOverWidgetId(null);
  };

  const startChatWithPrompt = (prompt: string) => {
    const sessionKey = createChatSessionKey();
    queueChatPrompt(sessionKey, prompt);
    navigate(`/sessions/${encodeURIComponent(sessionKey)}`, {
      state: { focusChatInput: true },
    });
  };

  const startBlankChat = () => {
    const sessionKey = createChatSessionKey();
    navigate(`/sessions/${encodeURIComponent(sessionKey)}`, {
      state: { focusChatInput: true },
    });
  };

  const startRoutineConversation = (routine?: Routine, latestRun?: RoutineRun | null) => {
    if (latestRun?.session_key) {
      navigate(`/sessions/${encodeURIComponent(latestRun.session_key)}`);
      return;
    }
    const subject = routine ? `routine "${routine.name}"` : "routine dashboard";
    startChatWithPrompt(`Kiểm tra ${subject} và đề xuất các bước tiếp theo.`);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="mx-auto flex w-full items-center gap-3 px-5 pb-6 pt-8 md:px-6 md:pt-10">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden">
            {chatRecommendations.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => (item.prompt ? startChatWithPrompt(item.prompt) : startBlankChat())}
                className={`flex h-12 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border border-neutral-200 bg-white px-5 text-left text-base font-normal leading-none shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_20px_rgba(0,0,0,0.03)] transition hover:border-neutral-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  item.muted ? "text-neutral-500" : "text-neutral-950"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {widgets.length > 0 && (
          <Button
            type="button"
            size="sm"
            onClick={openAddDialog}
            className="h-10 shrink-0 cursor-pointer rounded-3xl"
          >
            <Plus className="size-5" />
            Add Widget
          </Button>
        )}
      </div>

      <div className="mx-auto w-full max-w-[960px] space-y-4 px-5 pb-5 md:px-6 md:pb-6">
        {widgets.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white p-8 text-center">
            <Clock className="size-8 text-neutral-300" />
            <h3 className="mt-4 font-heading text-base font-bold text-neutral-900">
              No widgets yet
            </h3>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              Add a calendar, weather, or latest routine data widget.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={openAddDialog}
              className="mt-4 cursor-pointer"
            >
              <Plus className="size-4" />
              Add Widget
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
            {widgets.map((widget) => {
              const frameProps = {
                isDragging: draggingWidgetId === widget.id,
                isDragOver: dragOverWidgetId === widget.id,
                onDragStart: (event: DragEvent<HTMLButtonElement>) => handleWidgetDragStart(event, widget.id),
                onDragOver: (event: DragEvent<HTMLDivElement>) => handleWidgetDragOver(event, widget.id),
                onDrop: (event: DragEvent<HTMLDivElement>) => handleWidgetDrop(event, widget.id),
                onDragEnd: handleWidgetDragEnd,
                onRemove: () => removeWidget(widget.id),
              };

              if (widget.type === CALENDAR_WIDGET) {
                return (
                  <DraggableWidgetFrame key={widget.id} {...frameProps}>
                    <CalendarWidget date={date} />
                  </DraggableWidgetFrame>
                );
              }

              if (widget.type === WEATHER_WIDGET) {
                return (
                  <DraggableWidgetFrame key={widget.id} {...frameProps}>
                    <WeatherWidget />
                  </DraggableWidgetFrame>
                );
              }

              const routineId = widget.routineId ?? "";
              const routine = routines.find((item) => item.id === routineId);
              const runs = runsByRoutine[routineId] ?? [];
              const latestRun = getLatestRoutineRun(runs);
              const loading = runsLoading[routineId] ?? false;

              return (
                <DraggableWidgetFrame key={widget.id} variant="wide" {...frameProps}>
                  <RoutineLatestWidget
                    routine={routine}
                    latestRun={latestRun}
                    loading={loading}
                    canViewRoutines={canViewRoutines}
                    onOpenConversation={() => startRoutineConversation(routine, latestRun)}
                  />
                </DraggableWidgetFrame>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col border-border/50 bg-sidebar">
          <DialogHeader>
            <DialogTitle className="font-heading">Add Widget</DialogTitle>
            <DialogDescription>
              Choose a dashboard widget to add.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div>
              <span className="mb-1 block text-sm font-medium text-muted-foreground">
                Widget type
              </span>
              <div className="space-y-2">
                {widgetTypeOptions.map((option) => {
                  const Icon = option.icon;
                  const selected = selectedWidgetType === option.type;

                  return (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => setSelectedWidgetType(option.type)}
                      aria-pressed={selected}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input bg-card text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {option.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedWidgetType === ROUTINE_LATEST_WIDGET && (
              <div>
                <span className="mb-1 block text-sm font-medium text-muted-foreground">
                  Routines
                </span>
                {!canViewRoutines ? (
                  <div className="rounded-xl border border-input bg-card px-3 py-3 text-sm text-muted-foreground">
                    Routine widgets are unavailable for this workspace.
                  </div>
                ) : routinesLoading && routines.length === 0 ? (
                  <div className="flex h-24 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    Loading routines...
                  </div>
                ) : routines.length === 0 ? (
                  <div className="rounded-xl border border-input bg-card px-3 py-3 text-sm text-muted-foreground">
                    No routines are available yet.
                  </div>
                ) : (
                  <div
                    role="radiogroup"
                    aria-label="Routine"
                    className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-input bg-card p-1"
                  >
                    {routines.map((routine) => {
                      const selected = selectedRoutineId === routine.id;

                      return (
                        <button
                          key={routine.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setSelectedRoutineId(routine.id)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            selected
                              ? "bg-primary/10 text-primary"
                              : "text-foreground hover:bg-muted/60"
                          }`}
                        >
                          <span
                            className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                              selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                            }`}
                          >
                            {selected && <Check className="size-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {routine.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {routine.enabled ? "Enabled" : "Paused"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={addWidget}
              disabled={!canAddSelectedWidget}
              className="cursor-pointer"
            >
              Add Widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
