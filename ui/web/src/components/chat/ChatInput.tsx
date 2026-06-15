import { useState, useRef, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
}

export default function ChatInput({ onSend, onStop, streaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || streaming) return;
    onSend(trimmed);
    setValue("");
    textareaRef.current?.focus();
  };

  const handleClick = () => {
    if (streaming) {
      onStop?.();
      return;
    }
    handleSend();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasText = value.trim().length > 0;
  const buttonActive = streaming || (hasText && !disabled);

  return (
    <div
      className="bg-background px-3 pt-2 sm:px-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-border/50 bg-card p-2 shadow-lg shadow-black/20">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={streaming ? "Agent is processing..." : "Send a message..."}
            disabled={disabled || streaming}
            rows={1}
            className="min-h-[40px] max-h-[120px] resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
          />
          <button
            onClick={handleClick}
            disabled={!buttonActive}
            aria-label={streaming ? "Stop" : "Send"}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 cursor-pointer",
              streaming
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : buttonActive
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground/40"
            )}
          >
            {streaming ? (
              <Square className="size-3.5 fill-current" strokeWidth={0} />
            ) : (
              <ArrowUp className="size-4" strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
