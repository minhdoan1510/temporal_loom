import { useCallback, useEffect, useLayoutEffect, useRef, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import { ArrowLeft, ChevronUp } from "lucide-react";
import { sessions, ApiError } from "@/lib/api";
import { useChatStore } from "@/stores/chat";
import { useSessionsStore } from "@/stores/sessions";
import { takeQueuedChatPrompt } from "@/lib/chat-session";
import { getSessionDisplayTitle, NEW_SESSION_TITLE } from "@/lib/session-title";
import type { ThinkingStep } from "@/stores/chat";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatInput from "@/components/chat/ChatInput";
import ThinkingBlock from "@/components/chat/ThinkingBlock";
import type { Message } from "@/types/api";

// A display segment is either a visible message or a thinking block (grouped tool calls)
type DisplaySegment =
  | { kind: "message"; msg: Message }
  | { kind: "thinking"; steps: ThinkingStep[] };

/**
 * Group raw messages into display segments.
 * Consecutive assistant(tool_calls) + tool messages between user/final-assistant
 * get collapsed into a single "thinking" segment.
 */
function buildSegments(messages: Message[]): DisplaySegment[] {
  const segments: DisplaySegment[] = [];
  let pendingSteps: ThinkingStep[] = [];

  const flushThinking = () => {
    if (pendingSteps.length > 0) {
      segments.push({ kind: "thinking", steps: [...pendingSteps] });
      pendingSteps = [];
    }
  };

  for (const msg of messages) {
    if (msg.role === "user") {
      flushThinking();
      segments.push({ kind: "message", msg });
      continue;
    }

    if (msg.role === "assistant") {
      // Assistant with tool_calls = intermediate thinking step
      if (msg.tool_calls?.length) {
        // If there's intermediate thinking text, add it
        if (msg.content?.trim()) {
          pendingSteps.push({ type: "text", content: msg.content.trim() });
        }
        for (const tc of msg.tool_calls) {
          pendingSteps.push({
            type: "tool_call",
            toolCall: {
              id: tc.id,
              name: tc.name,
              status: "completed",
              arguments: tc.arguments,
            },
          });
        }
        continue;
      }

      // Assistant with content and no tool_calls = final answer
      if (msg.content) {
        flushThinking();
        segments.push({ kind: "message", msg });
        continue;
      }
    }

    if (msg.role === "tool") {
      // Match tool result to its tool_call step and attach the result content
      if (msg.tool_call_id && msg.content) {
        for (const step of pendingSteps) {
          if (step.type === "tool_call" && step.toolCall.id === msg.tool_call_id) {
            step.toolCall.result = msg.content;
            break;
          }
        }
      }
      continue;
    }

    // system messages — skip
  }

  flushThinking();
  return segments;
}

const PAGE_SIZE = 20;

export default function SessionDetailPage() {
  const { key } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const decodedKey = key ? decodeURIComponent(key) : "";
  const shouldFocusChatInput =
    (location.state as { focusChatInput?: boolean } | null)?.focusChatInput ===
    true;
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollWrapRef = useRef<HTMLDivElement>(null);
  const streamStartRef = useRef<number>(0);
  const initialPromptSentRef = useRef<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sessionTitle, setSessionTitle] = useState(NEW_SESSION_TITLE);
  const prevMessagesLenRef = useRef(0);
  const loadSessions = useSessionsStore((s) => s.loadSessions);

  const {
    messages,
    toolCalls,
    thinkingSteps,
    streaming,
    streamingContent,
    error,
    setMessages,
    sendMessage,
    stopStreaming,
    reset,
  } = useChatStore();

  const refreshSessionTitle = useCallback(async (sessionKey: string) => {
    try {
      const data = await sessions.get(sessionKey);
      setSessionTitle(getSessionDisplayTitle(data));
    } catch {
      // Keep the current title; message send/load errors are surfaced elsewhere.
    }
  }, []);

  const refreshAfterRun = useCallback(
    (sessionKey: string) => {
      void loadSessions();
      void refreshSessionTitle(sessionKey);
    },
    [loadSessions, refreshSessionTitle],
  );

  const applyGeneratedTitle = useCallback((title?: string) => {
    const nextTitle = title?.trim();
    if (nextTitle) {
      setSessionTitle(nextTitle);
    }
  }, []);

  // Build display segments from history messages.
  // If we have live thinkingSteps (from SSE), inject them before the last assistant message
  // so the thinking block stays visible after run.completed.
  const segments = useMemo(() => {
    const segs = buildSegments(messages);

    if (thinkingSteps.length > 0 && !streaming) {
      // Run just completed: last segment is the final assistant message,
      // but buildSegments doesn't know about the live thinking steps.
      // Insert a thinking segment before the last assistant message.
      const lastIdx = segs.length - 1;
      if (
        lastIdx >= 0 &&
        segs[lastIdx].kind === "message" &&
        segs[lastIdx].msg.role === "assistant"
      ) {
        // Check there isn't already a thinking segment right before it
        const prevIdx = lastIdx - 1;
        if (prevIdx < 0 || segs[prevIdx].kind !== "thinking") {
          segs.splice(lastIdx, 0, { kind: "thinking", steps: thinkingSteps });
        }
      }
    }

    return segs;
  }, [messages, thinkingSteps, streaming]);

  // Track when streaming starts
  useEffect(() => {
    if (streaming && streamStartRef.current === 0) {
      streamStartRef.current = Date.now();
    }
    if (!streaming) {
      streamStartRef.current = 0;
    }
  }, [streaming]);

  useEffect(() => {
    reset();
    setVisibleCount(PAGE_SIZE);
    setSpacerHeight(0);
    setSessionTitle(NEW_SESSION_TITLE);
    if (!decodedKey) return;
    let cancelled = false;
    sessions
      .get(decodedKey)
      .then((data) => {
        if (cancelled) return;
        const loadedMessages = data.messages ?? [];
        setMessages(loadedMessages);
        setSessionTitle(getSessionDisplayTitle(data));

        const queuedPrompt = takeQueuedChatPrompt(decodedKey);
        if (
          queuedPrompt &&
          loadedMessages.length === 0 &&
          initialPromptSentRef.current !== decodedKey
        ) {
          initialPromptSentRef.current = decodedKey;
          void sendMessage(decodedKey, queuedPrompt)
            .then(({ title }) => applyGeneratedTitle(title))
            .finally(() => refreshAfterRun(decodedKey));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          navigate("/sessions");
          return;
        }
        setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [decodedKey, setMessages, reset, navigate, sendMessage, applyGeneratedTitle, refreshAfterRun]);

  // When new messages are appended (user send, agent reply), grow visibleCount so the
  // newest entries stay visible. Initial session load (prev was 0) does NOT bump —
  // we want it to stay at PAGE_SIZE so the user starts with the latest page only.
  useEffect(() => {
    const prev = prevMessagesLenRef.current;
    const current = messages.length;
    prevMessagesLenRef.current = current;

    if (prev > 0 && current > prev) {
      setVisibleCount((c) => c + (current - prev));
      if (streaming) {
        setSmoothScrollActive(true);
        const timer = setTimeout(() => {
          setSmoothScrollActive(false);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [messages.length, streaming]);

  // Paginate segments: show only the most recent `visibleCount` entries.
  // Older entries are revealed via the "Load older" button at the top.
  const visibleSegments = useMemo(() => {
    if (segments.length <= visibleCount) return segments;
    return segments.slice(segments.length - visibleCount);
  }, [segments, visibleCount]);

  const hiddenCount = Math.max(0, segments.length - visibleCount);

  // Split visibleSegments during streaming to isolate the active user message
  const normalSegments = useMemo(() => {
    if (!streaming || visibleSegments.length === 0) return visibleSegments;
    return visibleSegments.slice(0, -1);
  }, [visibleSegments, streaming]);

  const activeUserSegment = useMemo(() => {
    if (!streaming || visibleSegments.length === 0) return null;
    return visibleSegments[visibleSegments.length - 1];
  }, [visibleSegments, streaming]);

  const [smoothScrollActive, setSmoothScrollActive] = useState(false);
  const [spacerHeight, setSpacerHeight] = useState(0);
  const activeInteractionRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!streaming) return;

    const viewport = scrollWrapRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLDivElement | null;
    const activeEl = activeInteractionRef.current;

    if (!viewport || !activeEl) {
      setSpacerHeight(0);
      return;
    }

    const updateHeights = () => {
      const vHeight = viewport.clientHeight;
      const aHeight = activeEl.offsetHeight;
      const neededSpacer = Math.max(0, vHeight - aHeight);
      setSpacerHeight(neededSpacer);
    };

    updateHeights();

    const observer = new ResizeObserver(() => {
      updateHeights();
    });

    observer.observe(activeEl);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, [streaming, normalSegments.length]);

  const handleLoadMore = () => {
    const viewport = scrollWrapRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLDivElement | null;
    const prevHeight = viewport?.scrollHeight ?? 0;
    const prevTop = viewport?.scrollTop ?? 0;
    setVisibleCount((c) => Math.min(c + PAGE_SIZE, segments.length));
    // Preserve relative scroll position after older entries are prepended.
    requestAnimationFrame(() => {
      if (viewport) {
        const newHeight = viewport.scrollHeight;
        viewport.scrollTop = prevTop + (newHeight - prevHeight);
      }
    });
  };

  // Scroll to bottom: smooth on initial user send, instant during live stream content growth
  useEffect(() => {
    const behavior = smoothScrollActive ? "smooth" : (streaming ? "instant" : "smooth");
    bottomRef.current?.scrollIntoView({ behavior });
  }, [messages, streamingContent, toolCalls, streaming, spacerHeight, smoothScrollActive]);

  const handleSend = (text: string) => {
    if (!decodedKey) return;
    void sendMessage(decodedKey, text)
      .then(({ title }) => applyGeneratedTitle(title))
      .finally(() => refreshAfterRun(decodedKey));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center p-2 gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer p-4 rounded-3xl bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate("/sessions")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-medium text-foreground" title={sessionTitle}>
            {sessionTitle}
          </h2>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollWrapRef} className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1 bg-background p-4">
        <div className="mx-auto max-w-4xl space-y-0">
          {hiddenCount > 0 && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                className="cursor-pointer gap-1.5 rounded-full border-border/50 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronUp className="size-3.5" />
                Load {Math.min(PAGE_SIZE, hiddenCount)} older
                {hiddenCount > PAGE_SIZE && ` (${hiddenCount} hidden)`}
              </Button>
            </div>
          )}
          {normalSegments.map((seg, i) =>
            seg.kind === "message" ? (
              <ChatMessage key={i} role={seg.msg.role} content={seg.msg.content} />
            ) : (
              <ThinkingBlock
                key={i}
                steps={seg.steps}
                toolCalls={[]}
                startTime={0}
                isActive={false}
              />
            )
          )}

          {/* Active interaction wrapper */}
          {streaming && activeUserSegment ? (
            <div ref={activeInteractionRef} className="space-y-0 flex flex-col">
              {activeUserSegment.kind === "message" ? (
                <ChatMessage role={activeUserSegment.msg.role} content={activeUserSegment.msg.content} />
              ) : (
                <ThinkingBlock
                  steps={activeUserSegment.steps}
                  toolCalls={[]}
                  startTime={0}
                  isActive={false}
                />
              )}

              {/* Live streaming: ThinkingBlock */}
              <ThinkingBlock
                steps={thinkingSteps}
                toolCalls={toolCalls}
                startTime={streamStartRef.current || Date.now()}
                isActive={!streamingContent}
                livePreview={streamingContent}
              />

              {/* Streaming content */}
              {streamingContent && (
                <ChatMessage from="assistant" content={streamingContent} />
              )}
            </div>
          ) : null}

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Bottom Spacer for Vercel v0 UX */}
          {spacerHeight > 0 && (
            <div 
              style={{ 
                height: `${spacerHeight}px`,
                transition: streaming ? "none" : "height 300ms cubic-bezier(0.16, 1, 0.3, 1)"
              }} 
              className="w-full animate-none"
            />
          )}

          <div ref={bottomRef} />
        </div>
        </ScrollArea>
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onStop={stopStreaming}
        streaming={streaming}
        autoFocus={shouldFocusChatInput}
        focusKey={location.key}
      />
    </div>
  );
}
