export interface CustomColor {
  h: number;
  s: number;
  l: number;
}

export function getCustomThemeStyles(color: CustomColor, isDark: boolean): Record<string, string> {
  const { h, s, l } = color;

  if (s === 0) {
    // Greyscale / Ink mode
    if (isDark) {
      return {
        "--primary": "#f4f4f5",
        "--primary-foreground": "#08090a",
        "--sidebar": "#09090b",
        "--sidebar-foreground": "#a1a1aa",
        "--sidebar-border": "#27272a",
        "--sidebar-accent": "#18181b",
        "--sidebar-accent-foreground": "#ffffff",
        "--background": "#09090b",
        "--background-secondary": "#0c0c0e",
        "--card": "#121214",
        "--popover": "#121214",
        "--border": "#27272a",
        "--accent": "#1d1d20",
        "--input": "#18181b",
        "--secondary": "#18181b",
        "--muted": "#121214",
      };
    } else {
      return {
        "--primary": "#18181b",
        "--primary-foreground": "#ffffff",
        "--sidebar": "#f4f4f5",
        "--sidebar-foreground": "#27272a",
        "--sidebar-border": "#e4e4e7",
        "--sidebar-accent": "#e4e4e7",
        "--sidebar-accent-foreground": "#18181b",
        "--background": "#ffffff",
        "--background-secondary": "#fafafa",
        "--card": "#ffffff",
        "--border": "#e4e4e7",
        "--accent": "#f4f4f5",
        "--input": "#fafafa",
        "--secondary": "#fafafa",
        "--muted": "#fafafa",
      };
    }
  }

  if (isDark) {
    const lClamped = Math.max(45, Math.min(75, l));
    const primFg = lClamped > 65 ? "#050505" : "#ffffff";
    const sidebarS = Math.min(s, 12);
    const bgS = Math.min(s, 8);
    const borderS = Math.min(s, 12);
    
    return {
      "--primary": `hsl(${h}, ${Math.min(s + 15, 100)}%, ${lClamped}%)`,
      "--primary-foreground": primFg,
      "--sidebar": `hsl(${h}, ${sidebarS}%, 8%)`,
      "--sidebar-foreground": `hsl(${h}, ${Math.min(s, 20)}%, 72%)`,
      "--sidebar-border": `hsl(${h}, ${Math.min(s, 18)}%, 14%)`,
      "--sidebar-accent": `hsl(${h}, ${Math.min(s, 18)}%, 12%)`,
      "--sidebar-accent-foreground": "#ffffff",
      "--background": `hsl(${h}, ${bgS}%, 5%)`,
      "--background-secondary": `hsl(${h}, ${Math.min(s, 10)}%, 9%)`,
      "--card": `hsl(${h}, ${Math.min(s, 10)}%, 11%)`,
      "--popover": `hsl(${h}, ${Math.min(s, 10)}%, 11%)`,
      "--border": `hsl(${h}, ${borderS}%, 15%)`,
      "--accent": `hsl(${h}, ${Math.min(s, 15)}%, 18%)`,
      "--input": `hsl(${h}, ${Math.min(s, 12)}%, 12%)`,
      "--secondary": `hsl(${h}, ${Math.min(s, 12)}%, 12%)`,
      "--muted": `hsl(${h}, ${Math.min(s, 10)}%, 11%)`,
    };
  } else {
    const lClamped = Math.max(35, Math.min(65, l));
    const primFg = lClamped > 70 ? "#000000" : "#ffffff";
    const sidebarS = Math.min(s, 20);
    const bgS = Math.min(s, 8);
    const borderS = Math.min(s, 15);
    
    return {
      "--primary": `hsl(${h}, ${s}%, ${lClamped}%)`,
      "--primary-foreground": primFg,
      "--sidebar": `hsl(${h}, ${sidebarS}%, 96%)`,
      "--sidebar-foreground": `hsl(${h}, ${Math.min(s, 40)}%, 22%)`,
      "--sidebar-border": `hsl(${h}, ${Math.min(s, 25)}%, 90%)`,
      "--sidebar-accent": `hsl(${h}, ${Math.min(s, 30)}%, 92%)`,
      "--sidebar-accent-foreground": `hsl(${h}, ${Math.min(s, 50)}%, 12%)`,
      "--background": `hsl(${h}, ${bgS}%, 99%)`,
      "--background-secondary": `hsl(${h}, ${Math.min(s, 12)}%, 97%)`,
      "--card": "#ffffff",
      "--border": `hsl(${h}, ${borderS}%, 92%)`,
      "--accent": `hsl(${h}, ${Math.min(s, 20)}%, 94%)`,
      "--input": `hsl(${h}, ${Math.min(s, 12)}%, 97%)`,
      "--secondary": `hsl(${h}, ${Math.min(s, 12)}%, 97%)`,
      "--muted": `hsl(${h}, ${Math.min(s, 12)}%, 97%)`,
    };
  }
}
