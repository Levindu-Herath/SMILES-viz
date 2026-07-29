"use client";

import { useEffect, useId, useRef, useState } from "react";

export type TooltipSide = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: React.ReactNode;
  side: TooltipSide;
  children: React.ReactNode;
}

// Centering uses the inset-0 + margin-auto trick (not translate-x/y) so the
// `transform` property is left free for the entry animation to control —
// combining a static centering transform with the animation's transform
// would have one silently clobber the other.
const SIDE_POSITION: Record<TooltipSide, string> = {
  top: "bottom-full inset-x-0 mx-auto w-max mb-2",
  bottom: "top-full inset-x-0 mx-auto w-max mt-2",
  left: "right-full inset-y-0 my-auto h-max mr-2",
  right: "left-full inset-y-0 my-auto h-max ml-2",
};

const SIDE_ARROW: Record<TooltipSide, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-t-[6px] border-t-text-primary border-x-[6px] border-x-transparent",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-[6px] border-b-text-primary border-x-[6px] border-x-transparent",
  left: "left-full top-1/2 -translate-y-1/2 border-l-[6px] border-l-text-primary border-y-[6px] border-y-transparent",
  right: "right-full top-1/2 -translate-y-1/2 border-r-[6px] border-r-text-primary border-y-[6px] border-y-transparent",
};

export function Tooltip({ content, side, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <span
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role="button"
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        className="cursor-help"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        {children}
      </span>

      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 w-max max-w-[220px] rounded-md bg-text-primary px-3 py-2 text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)] animate-tooltip-in ${SIDE_POSITION[side]}`}
        >
          {content}
          <span className={`absolute h-0 w-0 ${SIDE_ARROW[side]}`} />
        </div>
      )}
    </span>
  );
}
