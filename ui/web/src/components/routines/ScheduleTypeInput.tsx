import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { generateCron, parseMinute, parseOnceDate, parseTime } from "@/lib/cron";
import { DateTimePicker } from "./DateTimePicker";
import { TimeField } from "./TimeField";

interface ScheduleTypeInputProps {
  scheduleType: string;
  scheduleCron: string;
  cronError: string;
  onChange: (cron: string, type: string) => void;
}

function handleOnceChange(dt: Date, onChange: ScheduleTypeInputProps["onChange"]) {
  if (isNaN(dt.getTime())) return;
  const cron = `${dt.getMinutes()} ${dt.getHours()} ${dt.getDate()} ${dt.getMonth() + 1} *`;
  onChange(cron, "once");
}

export function ScheduleTypeInput({
  scheduleType,
  scheduleCron,
  cronError,
  onChange,
}: ScheduleTypeInputProps) {
  if (scheduleType === "once") {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">On</span>
        <DateTimePicker
          value={parseOnceDate(scheduleCron)}
          onChange={(dt) => handleOnceChange(dt, onChange)}
        />
      </div>
    );
  }

  if (scheduleType === "hourly") {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">At minute</span>
        <Input
          type="number"
          min="0"
          max="59"
          value={parseMinute(scheduleCron)}
          onChange={(e) => onChange(generateCron("hourly", e.target.value || "0"), "hourly")}
          className="bg-card text-sm w-20"
        />
      </div>
    );
  }

  if (scheduleType === "daily" || scheduleType === "weekdays" || scheduleType === "weekly") {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">At</span>
        <TimeField
          value={parseTime(scheduleCron)}
          onChange={(time) => onChange(generateCron(scheduleType, time || "00:00"), scheduleType)}
        />
      </div>
    );
  }

  if (scheduleType === "custom") {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-muted-foreground">Cron Schedule</label>
        <Input
          value={scheduleCron}
          onChange={(e) => onChange(e.target.value, "custom")}
          placeholder="0 * * * *"
          className={cn("bg-card text-sm font-mono", cronError && "border-destructive focus-visible:ring-destructive")}
        />
        {cronError ? (
          <p className="mt-1 text-xs text-destructive">{cronError}</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Min interval: 1 hour</p>
        )}
      </div>
    );
  }

  return null;
}
