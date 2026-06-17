import type { OpenAIChatCompletionChunk, SSEEvent } from "@/types/api";

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

export async function streamOpenAIChatCompletion(
  response: Response,
  onDelta: (content: string) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) return false;
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data) return false;
    if (data === "[DONE]") return true;

    const chunk = JSON.parse(data) as OpenAIChatCompletionChunk;
    if (chunk.error?.message) {
      throw new Error(chunk.error.message);
    }
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) onDelta(delta);
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          dataLines.push(line.slice(6));
        } else if (line === "" && flush()) {
          return;
        }
      }
    }

    if (buffer.startsWith("data: ")) {
      dataLines.push(buffer.slice(6));
    }
    flush();
  } finally {
    reader.releaseLock();
  }
}
