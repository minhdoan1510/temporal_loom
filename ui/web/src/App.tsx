import { HashRouter, Routes, Route, Navigate } from "react-router";
import AppLayout from "@/components/layout/AppLayout";
import TokenGate from "@/components/auth/TokenGate";
import SessionDetailPage from "@/pages/SessionDetailPage";
import DashboardPage from "@/pages/DashboardPage";
import TodoPage from "@/pages/TodoPage";
import FilesPage from "@/pages/FilesPage";
import AiSdkPlaygroundPage from "@/pages/AiSdkPlaygroundPage";
import DocumentsPage from "@/pages/DocumentsPage";
import { Toaster } from "sonner";
import { Agentation } from "agentation";
import { useThemeStore } from "@/stores/theme";
import { useEffect } from "react";
import { getCustomThemeStyles } from "@/lib/themeUtils";

export default function App() {
  const theme = useThemeStore((state) => state.theme);
  const themeMode = useThemeStore((state) => state.themeMode);
  const customColor = useThemeStore((state) => state.customColor);

  // Apply theme class and theme mode class to document element reactively
  useEffect(() => {
    if (typeof window !== "undefined") {
      const root = document.documentElement;
      const themeClasses = [
        "theme-harbor",
        "theme-sage",
        "theme-dune",
        "theme-lilac",
        "theme-blossom",
        "theme-ink",
        "theme-custom",
      ];
      // Remove all other theme classes
      themeClasses.forEach((cls) => root.classList.remove(cls));
      // Add new theme class
      root.classList.add(`theme-${theme}`);

      // Theme mode class helper
      const applyThemeMode = (mode: typeof themeMode) => {
        let resolvedTheme: "light" | "dark" = "light";
        if (mode === "system") {
          resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        } else {
          resolvedTheme = mode;
        }
        if (resolvedTheme === "dark") {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }

        const CUSTOM_STYLE_KEYS = [
          "--primary",
          "--primary-foreground",
          "--sidebar",
          "--sidebar-foreground",
          "--sidebar-border",
          "--sidebar-accent",
          "--sidebar-accent-foreground",
          "--background",
          "--background-secondary",
          "--card",
          "--popover",
          "--border",
          "--accent",
          "--input",
          "--secondary",
          "--muted"
        ];

        if (theme === "custom") {
          const styles = getCustomThemeStyles(customColor, resolvedTheme === "dark");
          Object.entries(styles).forEach(([key, val]) => {
            root.style.setProperty(key, val);
          });
        } else {
          CUSTOM_STYLE_KEYS.forEach(key => {
            root.style.removeProperty(key);
          });
        }
      };

      applyThemeMode(themeMode);

      // Listener for system preference changes
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleSystemChange = () => {
        if (themeMode === "system") {
          applyThemeMode("system");
        }
      };
      mediaQuery.addEventListener("change", handleSystemChange);
      return () => mediaQuery.removeEventListener("change", handleSystemChange);
    }
  }, [theme, themeMode, customColor]);

  return (
    <TokenGate>
      <Toaster position="bottom-right" richColors closeButton />
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="todo" element={<TodoPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="ai-sdk" element={<AiSdkPlaygroundPage />} />
            <Route path="sessions" element={<Navigate to="/dashboard" replace />} />
            <Route path="sessions/:key" element={<SessionDetailPage />} />
            <Route path="skills" element={<Navigate to="/dashboard?settings=skills" replace />} />
            <Route path="context-files" element={<Navigate to="/dashboard?settings=context-files" replace />} />
            <Route path="roles" element={<Navigate to="/dashboard?settings=roles" replace />} />
            <Route path="knowledge" element={<Navigate to="/dashboard?settings=knowledge" replace />} />
            <Route path="mcp-servers" element={<Navigate to="/dashboard?settings=mcp-servers" replace />} />
            <Route path="profile" element={<Navigate to="/dashboard?settings=profile" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      {import.meta.env.DEV && <Agentation />}
    </TokenGate>
  );
}


