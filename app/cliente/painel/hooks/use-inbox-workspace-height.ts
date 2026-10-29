"use client";

import { useEffect, useState, type RefObject } from "react";

/** The shell/header can change height; a fixed viewport subtraction cannot fit every layout. */
export function useInboxWorkspaceHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      // Mobile uses the existing full-screen thread; do not apply desktop sizing.
      if (window.innerWidth < 1280) { setHeight(null); return; }
      const top = element.getBoundingClientRect().top;
      const available = Math.max(0, Math.floor(window.innerHeight - top - 16));
      setHeight((current) => current === available ? current : available);
    };
    update();
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (element.parentElement) observer?.observe(element.parentElement);
    // Headers can change independently of workspace content (filters/queue summary).
    for (const sibling of Array.from(element.parentElement?.children || [])) {
      if (sibling !== element) observer?.observe(sibling);
    }
    return () => { window.removeEventListener("resize", update); observer?.disconnect(); };
  }, [ref]);
  return height;
}
