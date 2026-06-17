"use client";

import { forwardRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { springs } from "@/lib/springs";
import { useShape } from "@/lib/shape-context";
import { FileThumbnail } from "@/components/ui/file-thumbnail";
import Prose from "@/components/markdown/Prose";
import ReportRenderer from "@/components/chat/ReportRenderer";
import { htmlToReportSpec } from "@/lib/html-report-spec";
import { parseHtmlMessageContent } from "@/lib/report-spec";

interface ChatMessageProps {
  /** Who sent the message. Drives alignment and bubble colour. */
  from?: "user" | "assistant";
  /** Fallback for existing API compatibility */
  role?: string;
  /** Fallback for existing API compatibility */
  content?: string;
  /** Optional attachments rendered as square thumbnails above the bubble. */
  files?: File[];
  /** Side length of each attachment thumbnail in pixels. Defaults to 64. */
  thumbnailSize?: number;
  /** Timestamp shown in the hover-revealed meta row. */
  time?: ReactNode;
  /** Icon-only action buttons shown in the hover-revealed meta row. */
  actions?: ReactNode;
  /** Message body. */
  children?: ReactNode;
  className?: string;
}

const ChatMessage = forwardRef<HTMLDivElement, ChatMessageProps>(
  (
    { from, role, content, files, thumbnailSize = 64, time, actions, children, className, ...props },
    ref
  ) => {
    const shape = useShape();
    
    // Resolve sender
    const isUser = from === "user" || role === "user";
    const showTime = isUser && time != null;

    // Resolve content body
    const body = children || (
      content ? <MessageBody content={content} renderReports={!isUser} isUser={isUser} /> : null
    );

    return (
      <motion.div
        ref={ref}
        layout="position"
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springs.moderate}
        style={{ transformOrigin: isUser ? "bottom right" : "bottom left" }}
        className={cn(
          "group flex max-w-full flex-col gap-1.5 py-2",
          isUser ? "items-end self-end ml-auto" : "items-start self-start mr-auto",
          className
        )}
        {...props}
      >
        {files && files.length > 0 && (
          <div
            className={cn(
              "flex flex-wrap gap-1.5",
              isUser ? "justify-end" : "justify-start"
            )}
          >
            {files.map((file, i) => (
              <FileThumbnail
                key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
                file={file}
                size={thumbnailSize}
              />
            ))}
          </div>
        )}
        {body != null && body !== "" && (
          <div
            className={cn(
              "text-[14px] leading-relaxed break-words text-pretty",
              isUser
                ? cn(
                    shape.bg,
                    "bg-primary text-primary-foreground shadow-sm [padding:10px_16px] [&_a]:!text-primary-foreground [&_a]:decoration-primary-foreground/70 [&_a:hover]:!text-primary-foreground [&_p]:m-0 [&_p]:p-0"
                  )
                : "py-2 text-foreground w-full"
            )}
          >
            {body}
          </div>
        )}
        {(showTime || actions != null) && (
          <div
            className={cn(
              "flex items-center gap-2 px-1 text-[12px] leading-none text-muted-foreground select-none",
              "opacity-0 pointer-events-none transition-opacity duration-150",
              "group-hover:opacity-100 group-hover:pointer-events-auto",
              "group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
            )}
          >
            {showTime && <span className="tabular-nums">{time}</span>}
            {actions != null && (
              <span className="flex items-center gap-0.5">{actions}</span>
            )}
          </div>
        )}
      </motion.div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;
export { ChatMessage };
export type { ChatMessageProps };

function MessageBody({
  content,
  renderReports,
  isUser,
}: {
  content: string;
  renderReports: boolean;
  isUser: boolean;
}) {
  const linkClassName = isUser
    ? "text-current underline decoration-current/70 underline-offset-2 hover:text-current"
    : "text-foreground underline decoration-primary/70 underline-offset-2 hover:decoration-primary";

  if (!renderReports) return <Prose content={content} linkClassName={linkClassName} />;

  const segments = parseHtmlMessageContent(content);
  if (segments.length === 1 && segments[0]?.kind === "markdown") {
    return <Prose content={content} linkClassName={linkClassName} />;
  }

  return (
    <div className="min-w-0 space-y-3">
      {segments.map((segment, index) =>
        segment.kind === "markdown" ? (
          segment.content.trim() ? (
            <Prose key={index} content={segment.content} linkClassName={linkClassName} />
          ) : null
        ) : (
          <RichHtmlSegment key={index} html={segment.content} />
        )
      )}
    </div>
  );
}

function RichHtmlSegment({ html }: { html: string }) {
  return <ReportRenderer spec={htmlToReportSpec(html)} />;
}
