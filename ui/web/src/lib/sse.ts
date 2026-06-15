import type { SSEEvent } from "@/types/api";

export type SSECallback = (event: SSEEvent) => void;

export async function streamSSE(
  response: Response,
  onEvent: SSECallback,
  onError?: (err: Error) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    onError?.(new Error("No response body"));
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "") {
          if (currentEvent && currentData) {
            try {
              const parsed = JSON.parse(currentData) as SSEEvent;
              // Use the event type from the SSE field if available
              if (currentEvent && parsed.type !== currentEvent) {
                parsed.type = currentEvent as SSEEvent["type"];
              }
              onEvent(parsed);
            } catch {
              // skip malformed events
            }
          }
          currentEvent = "";
          currentData = "";
        }
      }
    }
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
  } finally {
    reader.releaseLock();
  }
}
