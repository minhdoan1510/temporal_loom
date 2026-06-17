"use client";

import { cn } from "@/lib/utils";

export type SpinnerProfile =
  | "chat-loading"
  | "thinking"
  | "execute-tool"
  | "cobalt-breath"
  | "glitch-gold"
  | "digital-pulse"
  | "rebound"
  | "fluid-wave"
  | "mono-scanner";

interface PhysicsGridSpinnerProps {
  profile?: SpinnerProfile;
  size?: number;
  color?: string;
  className?: string;
}

interface ProfileConfig {
  physicsClass: string;
  speedClass: string;
  color: string;
  delays: number[];
}

const CONFIGS: Record<SpinnerProfile, ProfileConfig> = {
  "chat-loading": {
    physicsClass: "physics-fluid",
    speedClass: "speed-normal",
    color: "var(--primary)",
    delays: [400, 200, 400, 200, 0, 200, 400, 200, 400],
  },
  "cobalt-breath": {
    physicsClass: "physics-fluid",
    speedClass: "speed-normal",
    color: "var(--primary)",
    delays: [400, 200, 400, 200, 0, 200, 400, 200, 400],
  },
  "thinking": {
    physicsClass: "physics-snappy",
    speedClass: "speed-normal",
    color: "var(--primary)",
    delays: [0, 150, 300, 150, 300, 450, 300, 450, 600],
  },
  "glitch-gold": {
    physicsClass: "physics-snappy",
    speedClass: "speed-normal",
    color: "var(--primary)",
    delays: [0, 150, 300, 150, 300, 450, 300, 450, 600],
  },
  "execute-tool": {
    physicsClass: "physics-snappy",
    speedClass: "speed-turbo",
    color: "var(--primary)",
    delays: [0, 50, 100, 250, 200, 150, 300, 350, 400],
  },
  "digital-pulse": {
    physicsClass: "physics-snappy",
    speedClass: "speed-turbo",
    color: "var(--primary)",
    delays: [0, 50, 100, 250, 200, 150, 300, 350, 400],
  },
  "rebound": {
    physicsClass: "physics-bounce",
    speedClass: "speed-normal",
    color: "var(--primary)",
    delays: [100, 400, 0, 300, 500, 100, 600, 200, 400],
  },
  "fluid-wave": {
    physicsClass: "physics-fluid",
    speedClass: "speed-slow",
    color: "var(--primary)",
    delays: [0, 200, 400, 400, 600, 800, 800, 1000, 1200],
  },
  "mono-scanner": {
    physicsClass: "physics-linear",
    speedClass: "speed-normal",
    color: "var(--primary)",
    delays: [0, 100, 200, 100, 200, 300, 200, 300, 400],
  },
};

export default function PhysicsGridSpinner({
  profile = "thinking",
  size = 16,
  color,
  className,
}: PhysicsGridSpinnerProps) {
  const config = CONFIGS[profile] || CONFIGS["thinking"];
  const finalColor = color || config.color;

  return (
    <div
      role="progressbar"
      className={cn(
        "grid grid-cols-3 gap-0 bloom-filter shrink-0 select-none pointer-events-none",
        config.physicsClass,
        config.speedClass,
        className
      )}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {config.delays.map((delay, index) => (
        <div
          key={index}
          className="w-full h-full spinner-node"
          style={{
            backgroundColor: finalColor,
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  );
}

