import { useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TimeFieldProps {
  value: string;
  onChange: (time: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

function TimeColumn({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <ScrollArea className="h-48 w-14">
      <div className="flex flex-col gap-1 pr-2">
        {options.map((opt) => (
          <Button
            key={opt}
            type="button"
            variant={opt === selected ? "default" : "ghost"}
            size="sm"
            className="h-8 shrink-0 justify-center"
            onClick={() => onSelect(opt)}
          >
            {opt}
          </Button>
        ))}
      </div>
    </ScrollArea>
  );
}

export function TimeField({ value, onChange }: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [hr = "09", min = "00"] = value.split(":");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className={cn("w-auto justify-start gap-2 bg-card text-sm font-normal tabular-nums")}>
            <Clock className="size-4" />
            {hr}:{min}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex gap-1">
          <TimeColumn options={HOURS} selected={hr} onSelect={(h) => onChange(`${h}:${min}`)} />
          <span className="self-center text-sm font-medium text-muted-foreground">:</span>
          <TimeColumn options={MINUTES} selected={min} onSelect={(m) => onChange(`${hr}:${m}`)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
