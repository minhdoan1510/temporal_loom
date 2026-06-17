const PENDING_CHAT_PROMPT_PREFIX = "lending_claw_pending_chat_prompt:";

export function createChatSessionKey() {
  const timestamp = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `chat-${timestamp}-${suffix}`;
}

export function queueChatPrompt(sessionKey: string, prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed || typeof window === "undefined") return;
  sessionStorage.setItem(`${PENDING_CHAT_PROMPT_PREFIX}${sessionKey}`, trimmed);
}

export function takeQueuedChatPrompt(sessionKey: string) {
  if (typeof window === "undefined") return null;
  const storageKey = `${PENDING_CHAT_PROMPT_PREFIX}${sessionKey}`;
  const prompt = sessionStorage.getItem(storageKey);
  sessionStorage.removeItem(storageKey);
  return prompt;
}
