import { useEffect, useState, type FormEvent } from "react";
import { Bot, KeyRound } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useWorkspacesStore } from "@/stores/workspaces";
import { auth, rbacApi, sso } from "@/lib/api";
import { casServiceUrl } from "@/lib/cas";
import WorkspaceOnboarding from "./WorkspaceOnboarding";
import CasLoading from "./CasLoading";

interface TokenGateProps {
  children: React.ReactNode;
}

type Status = "idle" | "verifying" | "cas" | "onboarding" | "ok";

// Prefilled into the token field on the login screen so users can connect with a
// single click during the demo. Override by clearing the field and pasting another.
const DEFAULT_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsIm5hbWUiOiJhZG1pbiIsInJvbGUiOiIiLCJleHAiOjk3ODE2MTMwODgsImlhdCI6MTc4MTUyNjY4OH0.72v51D869B5Gf1ATNJjGpvf7j_H0wkJpxKryxbkZEZs";

// Is this page load the CAS redirect callback (/sso/cas?ticket=...)? The app
// uses HashRouter, so this is a real path + query string handled here rather
// than via a React Router route.
function detectCasCallback(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.pathname.endsWith("/sso/cas") &&
    new URLSearchParams(window.location.search).has("ticket")
  );
}

export default function TokenGate({ children }: TokenGateProps) {
  const { sub, clearAuth, setPermissions } = useAuthStore();
  const loadWorkspaces = useWorkspacesStore((s) => s.loadWorkspaces);
  const [input, setInput] = useState(DEFAULT_TOKEN);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const isCasCallback = detectCasCallback();
  const [status, setStatus] = useState<Status>(
    isCasCallback ? "cas" : sub ? "verifying" : "idle",
  );

  // Handle the CAS redirect callback: exchange the ticket for auth cookies,
  // clean the URL, then reload so the normal verify flow runs.
  useEffect(() => {
    if (!isCasCallback) return;
    const ticket = new URLSearchParams(window.location.search).get("ticket");
    if (!ticket) return;
    let cancelled = false;
    sso
      .casLogin(ticket, casServiceUrl())
      .then(() => {
        window.history.replaceState({}, "", "/");
        window.location.reload();
      })
      .catch(() => {
        if (cancelled) return;
        clearAuth();
        window.history.replaceState({}, "", "/");
        setError("CAS login failed. Please try again.");
        setStatus("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [isCasCallback, clearAuth]);

  // Verify cookie on mount.
  useEffect(() => {
    if (isCasCallback) return; // handled by the CAS effect
    if (!sub) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("verifying");
    // Load workspaces first so rbac/me resolves under the active workspace.
    loadWorkspaces()
      .then(() => {
        if (cancelled) return null;
        // A brand-new user (e.g. fresh CAS login) has no workspaces yet — send
        // them to onboarding instead of calling the workspace-scoped rbac/me.
        if (useWorkspacesStore.getState().workspaces.length === 0) {
          setStatus("onboarding");
          return null;
        }
        return rbacApi.me();
      })
      .then((res) => {
        if (cancelled || !res) return;
        setPermissions(res.permissions);
        setStatus("ok");
      })
      .catch(() => {
        if (!cancelled) {
          clearAuth();
          setError("Token expired or invalid");
          setStatus("idle");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sub, isCasCallback, clearAuth, loadWorkspaces, setPermissions]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setChecking(true);
    setError("");

    try {
      await auth.setToken(trimmed);
      window.location.reload();
    } catch {
      clearAuth();
      setError("Invalid token. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  if (status === "ok") return <>{children}</>;
  if (status === "cas") return <CasLoading />;
  if (status === "onboarding") return <WorkspaceOnboarding />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-lg">
        {status === "verifying" ? (
          <p className="text-center text-sm text-muted-foreground">
            Verifying token...
          </p>
        ) : (
          <>
            {/* Header */}
            <div className="mb-5 flex flex-col items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="size-5 text-primary" />
              </div>
              <div className="text-center">
                <h2 className="font-heading text-base font-semibold text-foreground">
                  Lending Claw
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your JWT token to continue
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="JWT token"
                  autoFocus
                  className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={checking || !input.trim()}
                className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {checking ? "Verifying..." : "Connect"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
