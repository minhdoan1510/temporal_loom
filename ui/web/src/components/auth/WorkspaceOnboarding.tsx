import { useState, type FormEvent } from "react";
import { Briefcase } from "lucide-react";
import { useWorkspacesStore } from "@/stores/workspaces";
import { auth } from "@/lib/api";

// WorkspaceOnboarding is the empty first-run screen shown to an authenticated
// user who belongs to no workspace yet (e.g. a brand-new CAS SSO user). On
// success the page reloads to enter the normal app under the new workspace.
export default function WorkspaceOnboarding() {
  const createWorkspace = useWorkspacesStore((s) => s.createWorkspace);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    setError("");
    try {
      await createWorkspace(trimmed);
      window.location.reload();
    } catch {
      setError("Could not create workspace. Please try again.");
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-lg">
        {/* Header */}
        <div className="mb-5 flex flex-col items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="size-5 text-primary" />
          </div>
          <div className="text-center">
            <h2 className="font-heading text-base font-semibold text-foreground">
              Create your first workspace
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Workspaces keep your sessions, skills and settings organized.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            autoFocus
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Workspace"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => auth.logout().then(() => window.location.reload())}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
