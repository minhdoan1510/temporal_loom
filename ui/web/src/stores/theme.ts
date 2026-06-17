import { create } from "zustand";
import type { CustomColor } from "@/lib/themeUtils";
import type { SpinnerProfile } from "@/components/ui/PhysicsGridSpinner";

export type Theme = "harbor" | "sage" | "dune" | "lilac" | "blossom" | "ink" | "custom";
export type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  customColor: CustomColor;
  setCustomColor: (color: CustomColor) => void;
  loadingIndicator: SpinnerProfile;
  setLoadingIndicator: (indicator: SpinnerProfile) => void;
}

// Read initial theme from localStorage or default to 'harbor'
const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "harbor";
  const stored = localStorage.getItem("theme") as Theme;
  if (["harbor", "sage", "dune", "lilac", "blossom", "ink", "custom"].includes(stored)) {
    return stored;
  }
  return "harbor";
};

// Read initial theme mode from localStorage or default to 'light'
const getInitialThemeMode = (): ThemeMode => {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme-mode") as ThemeMode;
  if (["light", "dark", "system"].includes(stored)) {
    return stored;
  }
  return "light";
};

// Read initial custom color from localStorage or default to blue
const getInitialCustomColor = (): CustomColor => {
  if (typeof window === "undefined") return { h: 210, s: 90, l: 58 };
  const stored = localStorage.getItem("custom-accent-color");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {}
  }
  return { h: 210, s: 90, l: 58 };
};

// Read initial loading indicator style from localStorage or default to 'glitch-gold'
const getInitialLoadingIndicator = (): SpinnerProfile => {
  if (typeof window === "undefined") return "glitch-gold";
  const stored = localStorage.getItem("loading-indicator") as SpinnerProfile;
  const validProfiles = [
    "chat-loading",
    "thinking",
    "execute-tool",
    "cobalt-breath",
    "glitch-gold",
    "digital-pulse",
    "rebound",
    "fluid-wave",
    "mono-scanner",
  ];
  if (validProfiles.includes(stored)) {
    return stored;
  }
  return "glitch-gold";
};

export const useThemeStore = create<ThemeState>((set) => {
  const initialTheme = getInitialTheme();
  const initialThemeMode = getInitialThemeMode();
  const initialCustomColor = getInitialCustomColor();
  const initialLoadingIndicator = getInitialLoadingIndicator();

  return {
    theme: initialTheme,
    themeMode: initialThemeMode,
    customColor: initialCustomColor,
    loadingIndicator: initialLoadingIndicator,
    setTheme: (theme: Theme) => {
      localStorage.setItem("theme", theme);
      set({ theme });
    },
    setThemeMode: (themeMode: ThemeMode) => {
      localStorage.setItem("theme-mode", themeMode);
      set({ themeMode });
    },
    setCustomColor: (customColor: CustomColor) => {
      localStorage.setItem("custom-accent-color", JSON.stringify(customColor));
      set({ customColor });
    },
    setLoadingIndicator: (loadingIndicator: SpinnerProfile) => {
      localStorage.setItem("loading-indicator", loadingIndicator);
      set({ loadingIndicator });
    },
  };
});

