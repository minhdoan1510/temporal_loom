import Prose from "@/components/markdown/Prose";

interface ChatMessageProps {
  role: string;
  content: string;
}

export default function ChatMessage({ role, content }: ChatMessageProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm leading-relaxed">
          <Prose content={content} />
        </div>
      </div>
    );
  }

  // Assistant — full width, no bubble
  return (
    <div className="text-sm leading-relaxed text-foreground">
      <Prose content={content} />
    </div>
  );
}
