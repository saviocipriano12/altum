"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
/** Progressive enhancement: server-rendered content stays visible without JS. */
export function PublicMotion({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (
      !root.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const animations: Animation[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          animations.push(
            entry.target.animate(
              [
                {
                  opacity: 0.6,
                  transform: "translateY(28px)",
                },
                { opacity: 1, transform: "translateY(0)" },
              ],
              { duration: 650, easing: "cubic-bezier(.2,.65,.3,1)" },
            ),
          );
        }
      },
      { threshold: 0.12 },
    );
    root.current
      .querySelectorAll("[data-reveal]")
      .forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
    };
  }, [pathname]);
  return (
    <main id="conteudo" ref={root} className={className}>
      {children}
    </main>
  );
}
