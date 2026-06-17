"use client";

import type { ComponentType } from "react";
import * as LucideIcons from "lucide-react";

export interface IconComponentProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export type IconComponent = ComponentType<IconComponentProps>;

export type IconLibrary = "lucide" | "tabler" | "phosphor" | "hugeicons";

export type IconName =
  | "chevron-right" | "chevron-down" | "x" | "copy" | "menu" | "dot"
  | "monitor" | "sun" | "moon" | "rectangle-horizontal" | "circle"
  | "square-library" | "clock" | "star" | "settings"
  | "plus" | "arrow-left" | "arrow-right" | "arrow-up" | "search" | "loader"
  | "users" | "lock" | "mail" | "bell" | "shield" | "palette"
  | "lightbulb" | "rocket" | "heart" | "paintbrush" | "brain"
  | "globe" | "user"
  | "image" | "link" | "check" | "rotate-ccw"
  | "play" | "pause" | "pipette"
  | "home" | "message-circle" | "inbox"
  | "pencil" | "skip-forward" | "corner-down-right";

export const iconLibraryOrder: IconLibrary[] = ["lucide", "tabler", "phosphor", "hugeicons"];

export const iconLibraryLabels: Record<IconLibrary, string> = {
  lucide: "Lucide",
  tabler: "Tabler",
  phosphor: "Phosphor",
  hugeicons: "HugeIcons",
};

// Map all to Lucide icons
const nameToLucide: Record<IconName, ComponentType<any>> = {
  "chevron-right": LucideIcons.ChevronRight,
  "chevron-down": LucideIcons.ChevronDown,
  "pipette": LucideIcons.Pipette,
  "x": LucideIcons.X,
  "copy": LucideIcons.Copy,
  "menu": LucideIcons.Menu,
  "dot": LucideIcons.Dot,
  "monitor": LucideIcons.Monitor,
  "sun": LucideIcons.Sun,
  "moon": LucideIcons.Moon,
  "rectangle-horizontal": LucideIcons.RectangleHorizontal,
  "circle": LucideIcons.Circle,
  "square-library": LucideIcons.SquareLibrary,
  "clock": LucideIcons.Clock,
  "star": LucideIcons.Star,
  "settings": LucideIcons.Settings,
  "plus": LucideIcons.Plus,
  "arrow-left": LucideIcons.ArrowLeft,
  "arrow-right": LucideIcons.ArrowRight,
  "arrow-up": LucideIcons.ArrowUp,
  "search": LucideIcons.Search,
  "loader": LucideIcons.Loader2 || LucideIcons.Loader,
  "users": LucideIcons.Users,
  "lock": LucideIcons.Lock,
  "mail": LucideIcons.Mail,
  "bell": LucideIcons.Bell,
  "shield": LucideIcons.Shield,
  "palette": LucideIcons.Palette,
  "lightbulb": LucideIcons.Lightbulb,
  "rocket": LucideIcons.Rocket,
  "heart": LucideIcons.Heart,
  "paintbrush": LucideIcons.Paintbrush,
  "brain": LucideIcons.Brain,
  "globe": LucideIcons.Globe,
  "user": LucideIcons.User,
  "image": LucideIcons.ImageIcon || LucideIcons.Image,
  "link": LucideIcons.Link,
  "check": LucideIcons.Check,
  "rotate-ccw": LucideIcons.RotateCcw,
  "play": LucideIcons.Play,
  "pause": LucideIcons.Pause,
  "home": LucideIcons.Home,
  "message-circle": LucideIcons.MessageCircle,
  "inbox": LucideIcons.Inbox,
  "pencil": LucideIcons.Pencil,
  "skip-forward": LucideIcons.SkipForward,
  "corner-down-right": LucideIcons.CornerDownRight,
};

export const iconMap: Record<IconLibrary, Record<IconName, IconComponent>> = {
  lucide: nameToLucide,
  tabler: nameToLucide,
  phosphor: nameToLucide,
  hugeicons: nameToLucide,
};
