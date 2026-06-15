import { useEffect, useMemo, useState } from "react";
import { UserCircle, Shield, Wrench, Plug, ChevronDown } from "lucide-react";
import type { UserProfile, AllowedTool } from "@/types/api";
import { rbacApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawOpen, setRawOpen] = useState(false);

  useEffect(() => {
    rbacApi
      .me()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  const tabPerms = useMemo(() => {
    if (!profile?.permissions) return new Map<string, string[]>();
    const grouped = new Map<string, string[]>();
    for (const p of profile.permissions) {
      if (!p.startsWith("tab:")) continue;
      const parts = p.split(":");
      if (parts.length < 3) continue;
      const tab = parts[1];
      const action = parts[2];
      if (!grouped.has(tab)) grouped.set(tab, []);
      grouped.get(tab)!.push(action);
    }
    for (const arr of grouped.values()) arr.sort();
    return grouped;
  }, [profile]);

  const allowed = profile?.allowed_tools ?? [];
  const platformTools = useMemo(
    () => allowed.filter((t) => t.source === "platform"),
    [allowed]
  );
  const mcpByServer = useMemo(() => {
    const m = new Map<string, AllowedTool[]>();
    for (const t of allowed) {
      if (!t.source.startsWith("mcp:")) continue;
      const server = t.source.slice(4);
      if (!m.has(server)) m.set(server, []);
      m.get(server)!.push(t);
    }
    return m;
  }, [allowed]);

  if (loading) {
    return (
      <div className="flex-1 p-4 text-sm text-muted-foreground sm:p-6">Loading…</div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 p-4 text-sm text-muted-foreground sm:p-6">
        Failed to load profile.
      </div>
    );
  }

  const isBootstrap = profile.permissions === null;

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:size-12">
          <UserCircle className="size-6 text-primary sm:size-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-xl font-semibold sm:text-2xl">
            {profile.user_id || "Anonymous"}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {isBootstrap && (
              <Badge variant="secondary">bootstrap mode (full access)</Badge>
            )}
            {(profile.roles ?? []).map((r) => (
              <Badge key={r} className="gap-1">
                <Shield className="size-3" /> {r}
              </Badge>
            ))}
            {!isBootstrap && (profile.roles ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground italic">
                No roles assigned
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab permissions */}
      <Section title="Tab access" icon={<Shield className="size-4" />}>
        {tabPerms.size === 0 && !isBootstrap ? (
          <EmptyHint text="No tab permissions." />
        ) : isBootstrap ? (
          <EmptyHint text="Full access (no roles assigned)." />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...tabPerms.entries()].sort().map(([tab, actions]) => (
              <div
                key={tab}
                className="rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="text-sm font-medium">{tab}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {actions.map((a) => (
                    <Badge key={a} variant="outline" className="text-xs">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Platform tools */}
      <Section title="Platform tools" icon={<Wrench className="size-4" />}>
        {platformTools.length === 0 ? (
          <EmptyHint text="No platform tools available." />
        ) : (
          <ToolList tools={platformTools} />
        )}
      </Section>

      {/* MCP tools */}
      <Section title="MCP tools" icon={<Plug className="size-4" />}>
        {mcpByServer.size === 0 ? (
          <EmptyHint text="No MCP tools available." />
        ) : (
          <div className="space-y-3">
            {[...mcpByServer.entries()].sort().map(([server, tools]) => (
              <div
                key={server}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Plug className="size-4 text-primary" />
                  <span className="font-medium">{server}</span>
                  <Badge variant="outline" className="text-xs">
                    {tools.length} tool{tools.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <ToolList tools={tools} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Raw permissions */}
      <Section
        title="Raw permissions"
        icon={<ChevronDown className={cn("size-4 transition-transform", rawOpen && "rotate-180")} />}
        onClick={() => setRawOpen((v) => !v)}
      >
        {rawOpen && (
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
            {JSON.stringify(profile.permissions, null, 2)}
          </pre>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  onClick,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "mb-2 flex items-center gap-2 text-sm font-semibold",
          onClick && "cursor-pointer hover:opacity-80"
        )}
      >
        {icon}
        {title}
      </button>
      {children}
    </div>
  );
}

function ToolList({ tools }: { tools: AllowedTool[] }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => (
        <div
          key={t.permission_key}
          className="rounded-md border border-border bg-background px-3 py-2"
        >
          <div className="text-sm font-medium">{t.name}</div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {t.permission_key}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="text-xs italic text-muted-foreground">{text}</p>
  );
}
