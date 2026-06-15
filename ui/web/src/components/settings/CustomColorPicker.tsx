import React, { useRef, useState, useEffect } from "react";
import type { CustomColor } from "@/lib/themeUtils";

interface CustomColorPickerProps {
  color: CustomColor;
  onChange: (color: CustomColor) => void;
}

const OUTER_DOTS = [
  { h: 60, s: 90, l: 55 },  // Yellow (12:00)
  { h: 42, s: 92, l: 58 },  // Amber/Gold
  { h: 28, s: 95, l: 58 },  // Orange
  { h: 14, s: 95, l: 58 },  // Red-Orange
  { h: 355, s: 90, l: 55 }, // Red
  { h: 330, s: 90, l: 55 }, // Hot Pink
  { h: 300, s: 85, l: 58 }, // Magenta/Violet
  { h: 270, s: 85, l: 58 }, // Purple
  { h: 240, s: 85, l: 60 }, // Blue
  { h: 210, s: 90, l: 58 }, // Sky Blue
  { h: 190, s: 85, l: 55 }, // Cyan/Teal
  { h: 125, s: 75, l: 52 }, // Green
];

// Inner dots: pastel versions of the same hues
const INNER_DOTS = OUTER_DOTS.map((dot) => ({
  h: dot.h,
  s: 42,
  l: 78,
}));

export default function CustomColorPicker({ color, onChange }: CustomColorPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Constants for concentric arc calculations
  const cx = 110;
  const cy = 110;
  const r = 110;
  const minAngle = -35 * (Math.PI / 180); // Top (-35 degrees)
  const maxAngle = 35 * (Math.PI / 180);  // Bottom (35 degrees)

  // Calculate handle position based on current lightness color.l (0-100)
  const p = color.l / 100;
  const currentAngle = maxAngle - p * (maxAngle - minAngle);
  const handleX = cx + r * Math.cos(currentAngle);
  const handleY = cy + r * Math.sin(currentAngle);

  // SVG coordinates for drawing the track
  const startX = cx + r * Math.cos(minAngle);
  const startY = cy + r * Math.sin(minAngle);
  const endX = cx + r * Math.cos(maxAngle);
  const endY = cy + r * Math.sin(maxAngle);

  const trackPathD = `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`;

  const updateLightnessFromCoords = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + cx;
    const centerY = rect.top + cy;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const angle = Math.atan2(dy, dx);

    // Clamp angle to the slider arc range
    const clampedAngle = Math.max(minAngle, Math.min(maxAngle, angle));

    // Map angle to percentage (1 at minAngle/top, 0 at maxAngle/bottom)
    const pct = (maxAngle - clampedAngle) / (maxAngle - minAngle);
    const newL = Math.round(pct * 100);

    onChange({
      h: color.h,
      s: color.s,
      l: newL,
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateLightnessFromCoords(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    if (e.touches.length > 0) {
      updateLightnessFromCoords(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      updateLightnessFromCoords(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      if (e.touches.length > 0) {
        updateLightnessFromCoords(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging, color.h, color.s]);

  // Check if a specific HSL dot is selected
  const isSelected = (h: number, s: number) => {
    return color.s !== 0 && color.h === h && color.s === s;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-[300px] h-[220px] mx-auto select-none"
    >
      {/* Outer Dial Container */}
      <div className="absolute left-0 top-0 w-[220px] h-[220px] rounded-full bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] flex items-center justify-center">
        
        {/* Indented Inner Tray */}
        <div className="w-[190px] h-[190px] rounded-full bg-neutral-50/70 dark:bg-neutral-950/20 border border-neutral-100/50 dark:border-neutral-800/40 absolute shadow-inner" />

        {/* Outer Ring Swatches */}
        {OUTER_DOTS.map((dot, i) => {
          const theta = -Math.PI / 2 + i * (Math.PI / 6);
          const x = cx + 54 * Math.cos(theta);
          const y = cy + 54 * Math.sin(theta);
          const active = isSelected(dot.h, dot.s);
          return (
            <button
              key={`outer-${i}`}
              type="button"
              onClick={() => onChange({ h: dot.h, s: dot.s, l: dot.l })}
              className={`w-8.5 h-8.5 rounded-full border border-black/5 dark:border-white/10 shadow-[0_2px_4px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.12)] cursor-pointer absolute transition-all duration-200 hover:scale-110 active:scale-95 outline-none ${
                active ? "ring-2.5 ring-white dark:ring-neutral-900 scale-110 z-10" : ""
              }`}
              style={{
                left: `${x - 17}px`,
                top: `${y - 17}px`,
                backgroundColor: `hsl(${dot.h}, ${dot.s}%, ${dot.l}%)`,
              }}
            />
          );
        })}

        {/* Inner Ring Swatches */}
        {INNER_DOTS.map((dot, i) => {
          const theta = -Math.PI / 2 + i * (Math.PI / 6);
          const x = cx + 29 * Math.cos(theta);
          const y = cy + 29 * Math.sin(theta);
          const active = isSelected(dot.h, dot.s);
          return (
            <button
              key={`inner-${i}`}
              type="button"
              onClick={() => onChange({ h: dot.h, s: dot.s, l: dot.l })}
              className={`w-7 h-7 rounded-full border border-black/5 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_3px_6px_rgba(0,0,0,0.12)] cursor-pointer absolute transition-all duration-200 hover:scale-110 active:scale-95 outline-none ${
                active ? "ring-2 ring-white dark:ring-neutral-900 scale-110 z-10" : ""
              }`}
              style={{
                left: `${x - 14}px`,
                top: `${y - 14}px`,
                backgroundColor: `hsl(${dot.h}, ${dot.s}%, ${dot.l}%)`,
              }}
            />
          );
        })}

        {/* Center White Swatch (Monochrome / Ink Mode) */}
        <button
          type="button"
          onClick={() => onChange({ h: 0, s: 0, l: 100 })}
          className={`w-7.5 h-7.5 rounded-full border border-neutral-200/80 dark:border-neutral-800 shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_10px_rgba(0,0,0,0.15)] cursor-pointer absolute transition-all duration-200 hover:scale-110 active:scale-95 outline-none ${
            color.s === 0 ? "ring-2 ring-neutral-400 dark:ring-neutral-500 scale-115 z-10" : ""
          }`}
          style={{
            left: `${cx - 15}px`,
            top: `${cy - 15}px`,
            backgroundColor: "#ffffff",
          }}
        />
      </div>

      {/* SVG Arc Slider Overlay */}
      <svg
        className="absolute left-0 top-0 w-[300px] h-[220px] pointer-events-none"
      >
        <defs>
          {/* Vertical Linear Gradient for brightness slider */}
          <linearGradient id="arc-brightness-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#808080" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>

          {/* Glow Shadow filter for the slider handle */}
          <filter id="handle-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.2" />
          </filter>
        </defs>

        {/* Slider Track Path */}
        <path
          d={trackPathD}
          fill="none"
          stroke="url(#arc-brightness-grad)"
          strokeWidth="20"
          strokeLinecap="round"
          className="pointer-events-auto cursor-pointer"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        />

        {/* Slider Draggable Handle */}
        <circle
          cx={handleX}
          cy={handleY}
          r="10.5"
          fill="#ffffff"
          stroke="#dddddd"
          strokeWidth="1.5"
          filter="url(#handle-shadow)"
          className="pointer-events-auto cursor-grab active:cursor-grabbing hover:scale-110 transition-transform duration-150"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        />
      </svg>
    </div>
  );
}
