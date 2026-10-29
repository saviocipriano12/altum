type VisualViewportMetrics = { height: number; offsetTop: number; scale: number };

/** Adapt only the full-screen thread, never desktop layout or pinch zoom. */
export function getInboxVisualViewport(width: number, layoutHeight: number, viewport: VisualViewportMetrics | null) {
  if (!viewport || !Number.isFinite(width) || width <= 0 || width >= 1280 || !Number.isFinite(layoutHeight) || layoutHeight <= 0) return null;
  if (![viewport.height, viewport.offsetTop, viewport.scale].every(Number.isFinite)
    || viewport.height <= 0 || Math.abs(viewport.scale - 1) > 0.02) return null;
  const top = Math.max(0, Math.floor(viewport.offsetTop));
  const height = Math.floor(Math.min(viewport.height, layoutHeight - top));
  return height > 0 ? { top, height } : null;
}

/** Event lifecycle is separate from React so scheduling and cleanup can be verified. */
export function observeInboxVisualViewport(element: { style: Pick<CSSStyleDeclaration,
  "getPropertyValue" | "getPropertyPriority" | "setProperty" | "removeProperty"> }, host: Window) {
  const viewport = host.visualViewport;
  if (!viewport) return () => {};
  let frame: number | null = null;
  const previous = ["--inbox-viewport-top", "--inbox-viewport-height"].map((property) => ({
    property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property),
  }));
  const clear = () => {
    for (const { property, value, priority } of previous) {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    }
  };
  const update = () => {
    frame = null;
    const geometry = getInboxVisualViewport(host.innerWidth, host.innerHeight, viewport);
    if (!geometry) { clear(); return; }
    element.style.setProperty("--inbox-viewport-top", `${geometry.top}px`);
    element.style.setProperty("--inbox-viewport-height", `${geometry.height}px`);
  };
  const schedule = () => { if (frame === null) frame = host.requestAnimationFrame(update); };
  update();
  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  host.addEventListener("resize", schedule);
  return () => {
    if (frame !== null) host.cancelAnimationFrame(frame);
    viewport.removeEventListener("resize", schedule);
    viewport.removeEventListener("scroll", schedule);
    host.removeEventListener("resize", schedule);
    clear();
  };
}
