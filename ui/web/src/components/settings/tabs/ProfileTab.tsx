import { useEffect, useMemo, useState } from "react";
import { UserCircle, Shield, Wrench, Plug, ChevronDown, LogOut, Palette, Sun, Moon, Monitor } from "lucide-react";
import type { UserProfile, AllowedTool } from "@/types/api";
import { rbacApi, auth } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme";
import { useWorkspacesStore } from "@/stores/workspaces";
import CustomColorPicker from "../CustomColorPicker";
import { getCustomThemeStyles } from "@/lib/themeUtils";
import { Dialog } from "@base-ui/react/dialog";

const THEMES = [
  { 
    id: "harbor" as const, 
    name: "Harbor", 
    light: { primary: "#0071E3", sidebar: "#EBF3FC", background: "#FCFDFE", contentBg: "#F4F8FC" }, 
    dark: { primary: "#0071E3", sidebar: "#0c0f13", background: "#090c10", contentBg: "#0f141b" } 
  },
  { 
    id: "sage" as const, 
    name: "Sage", 
    light: { primary: "#1E6F3E", sidebar: "#EDF4EC", background: "#FCFDFC", contentBg: "#F3F8F4" }, 
    dark: { primary: "#27a644", sidebar: "#0a110c", background: "#070a08", contentBg: "#0c120e" } 
  },
  { 
    id: "dune" as const, 
    name: "Dune", 
    light: { primary: "#B5651D", sidebar: "#F7F2EB", background: "#FDFDFB", contentBg: "#FAF5ED" }, 
    dark: { primary: "#d69e2e", sidebar: "#130f0a", background: "#0a0806", contentBg: "#110f0b" } 
  },
  { 
    id: "lilac" as const, 
    name: "Lilac", 
    light: { primary: "#6F30A0", sidebar: "#F2EDFA", background: "#FCFBFE", contentBg: "#F7F4FD" }, 
    dark: { primary: "#9f7aea", sidebar: "#100b18", background: "#08060b", contentBg: "#0e0a14" } 
  },
  { 
    id: "blossom" as const, 
    name: "Blossom", 
    light: { primary: "#D83A6F", sidebar: "#FCEDF2", background: "#FEFBFC", contentBg: "#FCF3F7" }, 
    dark: { primary: "#ed64a6", sidebar: "#160a11", background: "#0a0608", contentBg: "#110a0e" } 
  },
  { 
    id: "ink" as const, 
    name: "Ink", 
    light: { primary: "#1A1A1A", sidebar: "#EEEEEE", background: "#FFFFFF", contentBg: "#FAFAFA" }, 
    dark: { primary: "#f4f4f5", sidebar: "#09090b", background: "#09090b", contentBg: "#0c0c0e" } 
  }
];

export default function ProfileTab() {
  const { theme, setTheme, themeMode, setThemeMode, customColor, setCustomColor } = useThemeStore();
  const updateActiveWorkspaceTheme = useWorkspacesStore((s) => s.updateActiveWorkspaceTheme);

  const handleThemeChange = (newTheme: typeof theme) => {
    setTheme(newTheme);
    updateActiveWorkspaceTheme(newTheme);
  };

  const isDarkPreview =
    themeMode === "dark" ||
    (themeMode === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const customStyles = getCustomThemeStyles(customColor, isDarkPreview);

  const customThemeItem = {
    id: "custom" as const,
    name: "Custom",
    light: {
      primary: customStyles["--primary"] || "#0071E3",
      sidebar: customStyles["--sidebar"] || "#EBF3FC",
      background: customStyles["--background"] || "#FCFDFE",
      contentBg: customStyles["--background-secondary"] || "#F4F8FC",
    },
    dark: {
      primary: customStyles["--primary"] || "#0071E3",
      sidebar: customStyles["--sidebar"] || "#0c0f13",
      background: customStyles["--background"] || "#090c10",
      contentBg: customStyles["--background-secondary"] || "#0f141b",
    },
  };

  const allThemes = [...THEMES, customThemeItem];

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawOpen, setRawOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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
      <div className="p-4 text-sm text-muted-foreground">Loading…</div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Failed to load profile.
      </div>
    );
  }

  const isBootstrap = profile.permissions === null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 sm:gap-4">
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

      {/* Theme Section */}
      <Section title="Theme & Accent" icon={<Palette className="size-4" />}>
        <div className="rounded-2xl border bg-neutral-50/50 dark:bg-neutral-900/10 p-5 space-y-5 text-foreground">
          {/* Theme Mode Selector Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200/60 dark:border-neutral-800/80">
            <div>
              <h3 className="font-semibold text-sm">Theme Mode</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Use light, dark, or match your system</p>
            </div>
            <div className="flex items-center bg-neutral-100/80 dark:bg-neutral-900/80 p-0.5 rounded-full border border-neutral-200/80 dark:border-neutral-800/80 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setThemeMode("light")}
                className={`flex items-center gap-1.5 px-4.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all duration-200 outline-none ${
                  themeMode === "light"
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/40 dark:hover:bg-neutral-800/40"
                }`}
              >
                <Sun className="size-3.5" /> Light
              </button>
              <button
                type="button"
                onClick={() => setThemeMode("dark")}
                className={`flex items-center gap-1.5 px-4.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all duration-200 outline-none ${
                  themeMode === "dark"
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/40 dark:hover:bg-neutral-800/40"
                }`}
              >
                <Moon className="size-3.5" /> Dark
              </button>
              <button
                type="button"
                onClick={() => setThemeMode("system")}
                className={`flex items-center gap-1.5 px-4.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all duration-200 outline-none ${
                  themeMode === "system"
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/40 dark:hover:bg-neutral-800/40"
                }`}
              >
                <Monitor className="size-3.5" /> System
              </button>
            </div>
          </div>

          {/* Accent Color Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Accent Color</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-7">
              {allThemes.map((t) => {
                const isSelected = theme === t.id;
                const previewColors = isDarkPreview ? t.dark : t.light;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      handleThemeChange(t.id);
                      if (t.id === "custom") {
                        setPickerOpen(true);
                      }
                    }}
                    className="flex flex-col items-center gap-2 group cursor-pointer outline-none"
                  >
                    {/* Mockup window */}
                    <div
                      className={cn(
                        "relative w-full aspect-[4/3] rounded-xl border overflow-hidden transition-all duration-200 shadow-xs flex",
                        isSelected
                          ? "border-primary ring-2 ring-primary/45 scale-[1.02]"
                          : isDarkPreview
                            ? "border-neutral-800 hover:border-neutral-700 hover:scale-[1.01]"
                            : "border-neutral-200 hover:border-neutral-300 hover:scale-[1.01]"
                      )}
                      style={{ backgroundColor: previewColors.background }}
                    >
                      {/* Sidebar column */}
                      <div
                        className="w-1/4 h-full"
                        style={{ 
                          backgroundColor: previewColors.sidebar,
                          borderRight: isDarkPreview ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.08)"
                        }}
                      />
                      {/* Content area */}
                      <div 
                        className="flex-1 p-2 flex flex-col justify-between h-full relative"
                        style={{ backgroundColor: previewColors.contentBg }}
                      >
                        {/* Top Badge/Pill */}
                        <div className="flex justify-end">
                          <div
                            className="w-7 h-3 rounded-full"
                            style={{ backgroundColor: previewColors.primary }}
                          />
                        </div>
                        {/* Horizontal lines */}
                        <div className="space-y-1 mt-auto pb-1">
                          <div 
                            className="w-10/12 h-1 rounded-full" 
                            style={{ backgroundColor: isDarkPreview ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)" }}
                          />
                          <div 
                            className="w-7/12 h-1 rounded-full" 
                            style={{ backgroundColor: isDarkPreview ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)" }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Label */}
                    <span
                      className={cn(
                        "text-xs font-semibold tracking-tight transition-colors",
                        isSelected 
                          ? "text-foreground font-bold" 
                          : "text-neutral-500 dark:text-neutral-400 group-hover:text-foreground"
                      )}
                    >
                      {t.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

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

      {/* Logout */}
      <div className="border-t border-border pt-5 flex justify-end">
        <Button
          variant="destructive"
          onClick={() => auth.logout().then(() => window.location.reload())}
          className="cursor-pointer gap-2"
        >
          <LogOut className="size-4" />
          Logout
        </Button>
      </div>

      {/* Custom Theme Color Picker Modal Dialog */}
      <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="color-picker-dialog-backdrop fixed inset-0 z-[60] transition-all duration-200" />
          <Dialog.Popup
            aria-label="Custom theme color picker"
            className="fixed top-[50%] left-[50%] z-[70] flex w-[300px] max-w-[calc(100vw-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col items-center gap-4 bg-transparent text-foreground outline-none transition-all duration-300"
          >
            <div className="flex justify-center">
              <CustomColorPicker color={customColor} onChange={setCustomColor} />
            </div>

            <div className="flex w-[220px] justify-center self-start">
              <Dialog.Close className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm outline-none transition-all hover:bg-primary/90 cursor-pointer">
                Done
              </Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
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
