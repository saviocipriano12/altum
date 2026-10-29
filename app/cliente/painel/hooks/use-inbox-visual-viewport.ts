"use client";

import { useEffect, type RefObject } from "react";
import { observeInboxVisualViewport } from "@/lib/inbox-viewport";

/** Scope keyboard geometry to this workspace; do not resize the whole client shell. */
export function useInboxVisualViewport(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (element) return observeInboxVisualViewport(element, window);
  }, [ref]);
}
