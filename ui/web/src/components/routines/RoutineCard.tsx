import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRight, KeyRound, Play, Trash2, Edit2, MoreHorizontal } from "lucide-react";
import { RunHistoryList } from "./RunHistoryList";
import { Item, ItemContent, ItemTitle, ItemDescription, ItemActions, ItemFooter } from "@/components/ui/item";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { scheduleDescription, scheduleRuleLabel } from "@/lib/cron";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Routine, RoutineRun } from "@/types/api";

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    running: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
    failed: "bg-destructive/10 text-destructive",
    active: "bg-primary/10 text-primary",
    paused: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    active: "Đang bật",
    paused: "Tạm dừng",
    running: "Đang chạy",
    success: "Thành công",
    failed: "Thất bại",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", colors[status] || "bg-muted text-muted-foreground")}>
      {labels[status] || status}
    </span>
  );
}

interface RoutineCardProps {
  routine: Routine;
  runs: RoutineRun[];
  runsLoading: boolean;
  isExpanded: boolean;
  canRun: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onToggleExpand: () => void;
  onRunNow: () => void;
  onToggleEnabled: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRefreshRuns: () => void;
}

export function RoutineCard({
  routine: r,
  runs,
  runsLoading,
  isExpanded,
  canRun,
  canUpdate,
  canDelete,
  onToggleExpand,
  onRunNow,
  onToggleEnabled,
  onEdit,
  onDelete,
  onRefreshRuns,
}: RoutineCardProps) {
  const scheduleRule = r.schedule_cron
    ? scheduleDescription(r.schedule_cron, r.schedule_tz)
    : r.has_fire_token
      ? "API trigger"
      : "Manual run only";

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={onToggleExpand}
      className="w-full"
    >
      <Item variant="outline" size="sm" className={cn("w-full bg-card rounded-xl shadow-none", r.enabled ? "border-primary/40" : "border-border")}>
        <ItemContent className="min-w-0">
          <ItemTitle className="flex items-center gap-2 max-w-full">
            <span className="truncate">{r.name}</span>
            {statusBadge(r.enabled ? "active" : "paused")}
          </ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs">
            {r.schedule_cron && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                Schedule · {scheduleRuleLabel(r.schedule_cron)}
              </span>
            )}
            <span
              className="font-medium text-foreground/80"
              title={r.schedule_cron ? `Cron: ${r.schedule_cron}${r.schedule_tz ? ` (${r.schedule_tz})` : ""}` : undefined}
            >
              {scheduleRule}
            </span>
            {r.has_fire_token && (
              <span className="flex items-center gap-1 text-warning">
                <KeyRound className="size-3" />
                API token set
              </span>
            )}
          </ItemDescription>
        </ItemContent>

        <ItemActions className="shrink-0 ml-auto flex items-center gap-1">
          <TooltipProvider delayDuration={200}>
            {canUpdate && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className="flex items-center mr-2">
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={onToggleEnabled}
                        aria-label={r.enabled ? "Tạm dừng" : "Bật"}
                      />
                    </div>
                  }
                />
                <TooltipContent>{r.enabled ? "Tạm dừng" : "Bật"}</TooltipContent>
              </Tooltip>
            )}

            {canRun && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button size="icon" variant="ghost" onClick={onRunNow} className="size-8 cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Chạy ngay">
                      <Play className="size-4" />
                    </Button>
                  }
                />
                <TooltipContent>Chạy ngay</TooltipContent>
              </Tooltip>
            )}

            {(canUpdate || canDelete) && (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <DropdownMenuTrigger
                        render={
                          <Button size="icon" variant="ghost" className="size-8 cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Tùy chọn">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                    }
                  />
                  <TooltipContent>Tùy chọn</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-40">
                  {canUpdate && (
                    <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
                      <Edit2 className="mr-2 size-4" />
                      Chỉnh sửa
                    </DropdownMenuItem>
                  )}
                  {canUpdate && canDelete && <DropdownMenuSeparator />}
                  {canDelete && (
                    <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 size-4" />
                      Xóa
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <div className="w-px h-4 bg-border mx-1" />

            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={isExpanded ? "Ẩn lịch sử" : "Xem lịch sử"}
                className="h-8 px-2.5 gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className={cn("size-4 transition-transform duration-200", isExpanded && "rotate-90")} />
                <span className="text-xs font-medium">Lịch sử</span>
              </Button>
            </CollapsibleTrigger>
          </TooltipProvider>
        </ItemActions>

        <CollapsibleContent className="basis-full overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <ItemFooter className="block justify-normal w-full px-0 pb-0 pt-2 mt-2">
            <RunHistoryList runs={runs} loading={runsLoading} onRefresh={onRefreshRuns} />
          </ItemFooter>
        </CollapsibleContent>
      </Item>
    </Collapsible>
  );
}
