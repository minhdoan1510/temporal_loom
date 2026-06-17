import cronstrue from "cronstrue";
import { Clock, Code2, Check, X, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cronDescription } from "@/lib/cron";
import { ScheduleTypeInput } from "./ScheduleTypeInput";

const SCHEDULE_PRESET_CRON: Record<string, string> = {
  hourly: "0 * * * *",
  daily: "0 9 * * *",
  weekdays: "0 9 * * 1-5",
  weekly: "0 9 * * 0",
  once: "0 9 * * *",
};

const SCHEDULE_TABS = ["once", "hourly", "daily", "weekdays", "weekly", "custom"];

function validateCron(cron: string): string {
  try {
    cronstrue.toString(cron);
    return "";
  } catch (e) {
    return String(e);
  }
}

interface TriggerCardProps {
  selected: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  onSelect: () => void;
  onDeselect: () => void;
  children?: React.ReactNode;
}

function TriggerCard({ selected, title, description, icon, onSelect, onDeselect, children }: TriggerCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50 cursor-pointer"
      )}
      onClick={() => !selected && onSelect()}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={cn("mt-0.5 shrink-0", selected ? "text-primary" : "text-muted-foreground")}>{icon}</span>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {selected ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDeselect(); }}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
            aria-label={`Remove ${title} trigger`}
          >
            <X className="size-4" />
          </button>
        ) : (
          <Check className="invisible size-4 shrink-0" />
        )}
      </div>
      {selected && children ? (
        <div className="border-t border-border px-4 py-3" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface TriggerSelectorProps {
  scheduleSelected: boolean;
  apiSelected: boolean;
  scheduleCron: string;
  scheduleType: string;
  /** True when editing a routine that already has an active fire token. */
  tokenActive: boolean;
  onToggleSchedule: (selected: boolean) => void;
  onToggleApi: (selected: boolean) => void;
  onScheduleChange: (cron: string, type: string) => void;
  onRotateToken?: () => void;
}

export function TriggerSelector({
  scheduleSelected,
  apiSelected,
  scheduleCron,
  scheduleType,
  tokenActive,
  onToggleSchedule,
  onToggleApi,
  onScheduleChange,
  onRotateToken,
}: TriggerSelectorProps) {
  const handleTabChange = (type: string) => {
    onScheduleChange(SCHEDULE_PRESET_CRON[type] ?? scheduleCron, type);
  };

  const cronError = validateCron(scheduleCron);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-muted-foreground">Select a trigger</label>

      <TriggerCard
        selected={scheduleSelected}
        title="Schedule"
        description={scheduleSelected ? cronDescription(scheduleCron) : "Run on a recurring cron schedule or once at a future time"}
        icon={<Clock className="size-4" />}
        onSelect={() => onToggleSchedule(true)}
        onDeselect={() => onToggleSchedule(false)}
      >
        <div className="space-y-3">
          <Tabs value={scheduleType} onValueChange={handleTabChange}>
            <TabsList className="w-full flex-wrap h-auto gap-y-1">
              {SCHEDULE_TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="flex-1 capitalize">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <ScheduleTypeInput
            scheduleType={scheduleType}
            scheduleCron={scheduleCron}
            cronError={cronError}
            onChange={onScheduleChange}
          />
        </div>
      </TriggerCard>

      <TriggerCard
        selected={apiSelected}
        title="API"
        description="Trigger from your own code by sending a POST request"
        icon={<Code2 className="size-4" />}
        onSelect={() => onToggleApi(true)}
        onDeselect={() => onToggleApi(false)}
      >
        {tokenActive ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Check className="size-4 text-primary" />
              API token active
            </div>
            {onRotateToken ? (
              <button
                type="button"
                onClick={onRotateToken}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <RotateCw className="size-3.5" />
                Rotate
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            A fire token will be generated when you save. You will see it only once.
          </p>
        )}
      </TriggerCard>
    </div>
  );
}
