export const NEW_SESSION_TITLE = "Cuộc trò chuyện mới";

type SessionTitleSource = {
  title?: string | null;
  extra_meta?: Record<string, string> | null;
};

export function getSessionDisplayTitle(session: SessionTitleSource): string {
  const title = session.title?.trim() || session.extra_meta?.title?.trim();
  return title || NEW_SESSION_TITLE;
}
