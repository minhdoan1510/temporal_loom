"use client";

import { forwardRef, useState, useEffect, type HTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { fontWeights } from "@/lib/font-weight";
import PhysicsGridSpinner, { type SpinnerProfile } from "@/components/ui/PhysicsGridSpinner";
import { useThemeStore } from "@/stores/theme";

const words = ["Thinking", "Moonwalking", "Planning", "Refining"];

interface ThinkingIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  showIcon?: boolean;
  profile?: SpinnerProfile;
}

const ThinkingIndicator = forwardRef<HTMLDivElement, ThinkingIndicatorProps>(
  ({ className, showIcon = true, profile = "thinking", ...props }, ref) => {
  const [index, setIndex] = useState(0);
  const { loadingIndicator } = useThemeStore();

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % words.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const finalProfile = profile === "thinking" ? loadingIndicator : profile;

  return (
    <div
      ref={ref}
      role="status"
      className={cn("flex items-center gap-2 px-3 py-2", className)}
      {...props}
    >
      {showIcon && (
        <PhysicsGridSpinner profile={finalProfile} size={15} className="mr-0.5" />
      )}
      <span
        className="inline-grid text-[13px] overflow-hidden"
        style={{ fontVariationSettings: fontWeights.medium }}
      >
        <span
          className="col-start-1 row-start-1 invisible shimmer-text"
          aria-hidden="true"
        >
          {words.reduce((a, b) => (a.length >= b.length ? a : b))}
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={words[index]}
            className="col-start-1 row-start-1 shimmer-text"
            initial={{ y: "80%", opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] } }}
            exit={{ y: "-80%", opacity: 0, transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] } }}
          >
            {words[index]}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
});

ThinkingIndicator.displayName = "ThinkingIndicator";

export { ThinkingIndicator };
export type { ThinkingIndicatorProps };
export default ThinkingIndicator;

