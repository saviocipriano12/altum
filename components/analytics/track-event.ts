"use client";

export type AnalyticsEventParams = Record<string, string | number | boolean | undefined>;

export function trackAnalyticsEvent(name: string, params: AnalyticsEventParams = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  const cleanedParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  );

  window.gtag("event", name, cleanedParams);
}

export function trackLeadGenerated(params: AnalyticsEventParams = {}) {
  trackAnalyticsEvent("generate_lead", params);

  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", "Lead");
  }
}
