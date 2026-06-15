import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

interface MultiSelectProps {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * MultiSelect is a dropdown multi-select: the control shows the chosen values
 * as removable chips and only reveals the option list on click. Each option is
 * a checkbox item that toggles selection without closing the menu. The list is
 * portaled, so it never clips inside a scrollable Dialog.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  className,
  disabled,
}: MultiSelectProps) {
  const selected = new Set(value);

  // Toggle while preserving the canonical option order.
  const toggle = (opt: string) => {
    const next = new Set(value);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(options.filter((o) => next.has(o)));
  };
  const remove = (opt: string) => onChange(value.filter((v) => v !== opt));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-border/60 bg-card px-2 py-1.5 text-left text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 data-[popup-open]:border-primary data-[popup-open]:ring-2 data-[popup-open]:ring-primary/30 disabled:pointer-events-none disabled:opacity-50",
          className
        )}
      >
        {value.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          value.map((v) => (
            <span
              key={v}
              className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
            >
              {v}
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Remove ${v}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  remove(v);
                }}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </span>
            </span>
          ))
        )}
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-60 w-[var(--anchor-width)] min-w-[12rem] overflow-y-auto"
      >
        {options.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt}
            checked={selected.has(opt)}
            onCheckedChange={() => toggle(opt)}
            closeOnClick={false}
          >
            {opt}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
