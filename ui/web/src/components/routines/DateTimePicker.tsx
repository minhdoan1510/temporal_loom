import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateTimePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
}

export function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const timeValue = value ? format(value, "HH:mm") : "09:00";

  const handleDateSelect = (selected?: Date) => {
    if (!selected) return;
    const next = new Date(selected);
    next.setHours(value?.getHours() ?? 9, value?.getMinutes() ?? 0, 0, 0);
    onChange(next);
  };

  const handleTimeChange = (time: string) => {
    const [hr, min] = time.split(":");
    const next = value ? new Date(value) : new Date();
    next.setHours(parseInt(hr || "0", 10), parseInt(min || "0", 10), 0, 0);
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "w-auto justify-start gap-2 bg-card text-left text-sm font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="size-4" />
            {value ? format(value, "PPP 'at' HH:mm") : "Pick a date and time"}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="single" selected={value} onSelect={handleDateSelect} autoFocus />
        <div className="flex items-center gap-3 border-t border-border px-4 py-3">
          <span className="text-sm text-muted-foreground">At</span>
          <Input
            type="time"
            value={timeValue}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="bg-card text-sm w-auto"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
