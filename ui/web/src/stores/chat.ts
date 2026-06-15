import { create } from "zustand";
import type { Message, SSEEvent } from "@/types/api";
import { agent } from "@/lib/api";
import { streamSSE } from "@/lib/sse";

export interface ToolCall {
  id: string;
  name: string;
  status: "running" | "completed" | "failed";
  arguments?: Record<string, unknown>;
  result?: string;
}

// A single step in the agent's thinking process
export type ThinkingStep =
  | { type: "text"; content: string }
  | { type: "tool_call"; toolCall: ToolCall };

interface ChatState {
  messages: Message[];
  toolCalls: ToolCall[];
  thinkingSteps: ThinkingStep[];
  streaming: boolean;
  streamingContent: string;
  error: string | null;
  abortController: AbortController | null;

  setMessages: (msgs: Message[]) => void;
  sendMessage: (sessionKey: string, text: string) => Promise<void>;
  stopStreaming: () => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  toolCalls: [],
  thinkingSteps: [],
  streaming: false,
  streamingContent: "",
  error: null,
  abortController: null,

  setMessages: (msgs) => set({ messages: msgs, toolCalls: [], thinkingSteps: [], error: null }),

  sendMessage: async (sessionKey, text) => {
    const userMsg: Message = { role: "user", content: text };
    const controller = new AbortController();
    set((s) => ({
      messages: [...s.messages, userMsg],
      streaming: true,
      streamingContent: "",
      toolCalls: [],
      thinkingSteps: [],
      error: null,
      abortController: controller,
    }));

    let completed = false;
    let aborted = false;

    try {
      const response = await agent.runStream({
        session_key: sessionKey,
        message: text,
        stream: true,
      }, controller.signal);

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      await streamSSE(
        response,
        (event: SSEEvent) => {
          // Guard: ignore events after run has finished
          if (completed) return;

          switch (event.type) {
            case "chunk": {
              const content = (event.payload as { content: string }).content;
              set((s) => ({
                streamingContent: s.streamingContent + content,
              }));
              break;
            }
            case "tool.call": {
              const { name, id, arguments: args } = event.payload as {
                name: string;
                id: string;
                arguments?: Record<string, unknown>;
              };
              const tc: ToolCall = { id, name, status: "running", arguments: args };
              set((s) => {
                const steps = [...s.thinkingSteps];
                // Save intermediate thinking text before this tool call
                if (s.streamingContent.trim()) {
                  steps.push({ type: "text", content: s.streamingContent.trim() });
                }
                steps.push({ type: "tool_call", toolCall: tc });
                return {
                  streamingContent: "",
                  toolCalls: [...s.toolCalls, tc],
                  thinkingSteps: steps,
                };
              });
              break;
            }
            case "tool.result": {
              const { id, is_error, result: resultContent } = event.payload as {
                id: string;
                is_error: boolean;
                result?: string;
              };
              const newStatus = is_error ? "failed" : "completed";
              set((s) => ({
                toolCalls: s.toolCalls.map((tc) =>
                  tc.id === id
                    ? { ...tc, status: newStatus, result: resultContent }
                    : tc
                ),
                // Also update status + result in thinkingSteps
                thinkingSteps: s.thinkingSteps.map((step) =>
                  step.type === "tool_call" && step.toolCall.id === id
                    ? {
                        ...step,
                        toolCall: { ...step.toolCall, status: newStatus, result: resultContent },
                      }
                    : step
                ),
              }));
              break;
            }
            case "run.completed": {
              completed = true;
              const { content } = event.payload as { content: string };
              const streamed = get().streamingContent;
              // Prefer streamed content over "..." fallback from backend
              const finalContent = (streamed && content === "...") ? streamed : (content || streamed);
              // Keep thinkingSteps so the ThinkingBlock stays visible after completion.
              // They get cleared on reset() or next sendMessage().
              set((s) => ({
                messages: [
                  ...s.messages,
                  { role: "assistant" as const, content: finalContent },
                ],
                streaming: false,
                streamingContent: "",
              }));
              break;
            }
            case "run.failed": {
              completed = true;
              const { error } = event.payload as { error: string };
              set({
                streaming: false,
                streamingContent: "",
                error,
              });
              break;
            }
          }
        },
        (err) => {
          if (!completed) {
            set({ streaming: false, error: err.message });
          }
        }
      );

      // If stream ended without a run.completed event, finalize with whatever we have
      if (!completed) {
        const content = get().streamingContent;
        if (content) {
          const suffix = aborted ? "\n\n_[Stopped]_" : "";
          set((s) => ({
            messages: [
              ...s.messages,
              { role: "assistant" as const, content: content + suffix },
            ],
            streaming: false,
            streamingContent: "",
            abortController: null,
          }));
        } else {
          set({ streaming: false, abortController: null });
        }
      } else {
        set({ abortController: null });
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) aborted = true;
      if (!completed) {
        const content = get().streamingContent;
        if (isAbort && content) {
          set((s) => ({
            messages: [
              ...s.messages,
              { role: "assistant" as const, content: content + "\n\n_[Stopped]_" },
            ],
            streaming: false,
            streamingContent: "",
            abortController: null,
          }));
        } else {
          set({
            streaming: false,
            error: isAbort ? null : (err instanceof Error ? err.message : String(err)),
            abortController: null,
          });
        }
      }
    }
  },

  stopStreaming: () => {
    const { abortController } = get();
    abortController?.abort();
  },

  reset: () => {
    get().abortController?.abort();
    set({
      messages: [],
      toolCalls: [],
      thinkingSteps: [],
      streaming: false,
      streamingContent: "",
      error: null,
      abortController: null,
    });
  },
}));
