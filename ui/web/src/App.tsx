import { HashRouter, Routes, Route, Navigate } from "react-router";
import AppLayout from "@/components/layout/AppLayout";
import TokenGate from "@/components/auth/TokenGate";
import SessionDetailPage from "@/pages/SessionDetailPage";
import DashboardPage from "@/pages/DashboardPage";
import FilesPage from "@/pages/FilesPage";
import SkillsPage from "@/pages/SkillsPage";
import DocumentsPage from "@/pages/DocumentsPage";
import RoutinesPage from "@/pages/RoutinesPage";
import { Toaster } from "sonner";
import { Agentation } from "agentation";
import { useThemeStore } from "@/stores/theme";
import { useEffect } from "react";
import { getCustomThemeStyles } from "@/lib/themeUtils";

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
  "--muted",
];

const CHART_STYLE_KEYS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
  "--chart-7",
  "--chart-8",
  "--chart-9",
  "--chart-10",
  "--chart-11",
  "--chart-12",
  "--color-chart-1",
  "--color-chart-2",
  "--color-chart-3",
  "--color-chart-4",
  "--color-chart-5",
  "--color-chart-6",
  "--color-chart-7",
  "--color-chart-8",
  "--color-chart-9",
  "--color-chart-10",
  "--color-chart-11",
  "--color-chart-12",
  "--chart-line-primary",
  "--chart-line-secondary",
  "--chart-background",
  "--chart-foreground",
  "--chart-foreground-muted",
  "--chart-crosshair",
  "--chart-grid",
  "--chart-brush-border",
  "--chart-tooltip-background",
  "--chart-tooltip-foreground",
  "--chart-tooltip-muted",
  "--chart-marker-background",
  "--chart-marker-border",
  "--chart-marker-foreground",
  "--chart-ring-background",
  "--chart-label",
];

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
          resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)")
            .matches
            ? "dark"
            : "light";
        } else {
          resolvedTheme = mode;
        }
        if (resolvedTheme === "dark") {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }

        CHART_STYLE_KEYS.forEach((key) => {
          root.style.removeProperty(key);
        });

        if (theme === "custom") {
          const styles = getCustomThemeStyles(
            customColor,
            resolvedTheme === "dark",
          );
          Object.entries(styles).forEach(([key, val]) => {
            root.style.setProperty(key, val);
          });
        } else {
          CUSTOM_STYLE_KEYS.forEach((key) => {
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
      {/* High-Fidelity SVG Filter Definition for custom spinners */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="0"
        height="0"
        style={{ position: "absolute", pointerEvents: "none" }}
      >
        <defs>
          <filter
            id="compilation-spinner-bloom"
            width="400%"
            height="400%"
            x="-150%"
            y="-150%"
          >
            <feComponentTransfer result="amplified">
              <feFuncR type="linear" slope="3" intercept="0" />
              <feFuncG type="linear" slope="3" intercept="0" />
              <feFuncB type="linear" slope="3" intercept="0" />
            </feComponentTransfer>
            <feColorMatrix
              in="amplified"
              type="saturate"
              values="0"
              result="desaturated"
            />
            <feComponentTransfer in="desaturated" result="thresholded">
              <feFuncR type="table" tableValues="0,1" />
              <feFuncG type="table" tableValues="0,1" />
              <feFuncB type="table" tableValues="0,1" />
            </feComponentTransfer>
            <feColorMatrix
              in="thresholded"
              type="matrix"
              values="1 0 0 0 0
                                                                  0 1 0 0 0
                                                                  0 0 1 0 0
                                                                  1 0 0 0 0"
              result="alphaMask"
            />
            <feComposite
              in="SourceGraphic"
              in2="alphaMask"
              operator="arithmetic"
              k1="1"
              k2="0"
              k3="0"
              k4="0"
              result="maskedSource"
            />
            <feComponentTransfer in="maskedSource" result="brightened">
              <feFuncR type="linear" slope="0.4" />
              <feFuncG type="linear" slope="0.4" />
              <feFuncB type="linear" slope="0.4" />
            </feComponentTransfer>
            <feGaussianBlur
              in="brightened"
              stdDeviation="8"
              edgeMode="none"
              result="blurredBloom"
            />
            <feGaussianBlur
              in="brightened"
              stdDeviation="2"
              edgeMode="none"
              result="blurredBloom2"
            />
            <feComposite
              in="SourceGraphic"
              in2="blurredBloom"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3="2"
              k4="0"
              result="finalBloom"
            />
            <feComposite
              in="finalBloom"
              in2="blurredBloom2"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3="1"
              k4="0"
            />
          </filter>
        </defs>
      </svg>
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="routines" element={<RoutinesPage />} />
            <Route
              path="sessions"
              element={<Navigate to="/dashboard" replace />}
            />
            <Route path="sessions/:key" element={<SessionDetailPage />} />
            <Route path="skills" element={<SkillsPage />} />
            <Route
              path="context-files"
              element={
                <Navigate to="/dashboard?settings=context-files" replace />
              }
            />
            <Route
              path="roles"
              element={<Navigate to="/dashboard?settings=roles" replace />}
            />
            <Route
              path="knowledge"
              element={<Navigate to="/dashboard?settings=knowledge" replace />}
            />
            <Route
              path="mcp-servers"
              element={
                <Navigate to="/dashboard?settings=mcp-servers" replace />
              }
            />
            <Route
              path="profile"
              element={<Navigate to="/dashboard?settings=profile" replace />}
            />
          </Route>
        </Routes>
      </HashRouter>
      {import.meta.env.DEV && <Agentation />}
    </TokenGate>
  );
}
