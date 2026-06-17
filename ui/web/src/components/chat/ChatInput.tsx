import { useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { InputMessage } from "@/components/chat/InputMessage";
import { Button } from "@/components/ui/fluid-button";

interface ChatInputProps {
  value?: string;
  onValueChange?: (val: string) => void;
  onSend: (message: string) => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  focusKey?: string;
}

export default function ChatInput({
  value: extValue,
  onValueChange: extOnValueChange,
  onSend,
  onStop,
  streaming,
  disabled,
  autoFocus,
  focusKey,
}: ChatInputProps) {
  const [internalValue, setInternalValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLDivElement>(null);

  const value = extValue !== undefined ? extValue : internalValue;
  const setValue = extOnValueChange !== undefined ? extOnValueChange : setInternalValue;

  const handleSend = (text: string, _attachedFiles: File[]) => {
    onSend(text);
    setValue("");
    setFiles([]);
  };

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current
        ?.querySelector<HTMLTextAreaElement>("textarea")
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, disabled, focusKey]);

  return (
    <div
      className="bg-background px-3 pt-2 sm:px-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-3xl">
        <InputMessage
          ref={inputRef}
          value={value}
          onValueChange={setValue}
          onSend={handleSend}
          status={streaming ? "streaming" : "idle"}
          onStop={onStop}
          disabled={disabled}
          placeholder={streaming ? "Agent is processing..." : "Send a message..."}
          files={files}
          onFilesChange={setFiles}
          leftSlot={({ openFilePicker }) => (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => openFilePicker()}
              aria-label="Attach files"
            >
              <Paperclip className="size-4" />
            </Button>
          )}
        />
      </div>
    </div>
  );
}
