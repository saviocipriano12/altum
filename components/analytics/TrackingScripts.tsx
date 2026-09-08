"use client";

import Link from "next/link";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

type AnalyticsConsent = "granted" | "denied";

const configuredGaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
const configuredMetaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
const GA_MEASUREMENT_ID = /^G-[A-Z0-9]+$/.test(configuredGaMeasurementId ?? "")
  ? configuredGaMeasurementId
  : undefined;
const META_PIXEL_ID = /^\d+$/.test(configuredMetaPixelId ?? "")
  ? configuredMetaPixelId
  : undefined;
const ENABLE_TRACKING = process.env.NODE_ENV === "production";
const CONSENT_STORAGE_KEY = "altum.analytics-consent.v1";
const TRACKING_BLOCKED_PREFIXES = ["/admin", "/cliente", "/api"];
const TRACKING_BLOCKED_PATHS = new Set(["/login", "/cadastro"]);

function isTrackingAllowedOnPath(pathname: string) {
  if (TRACKING_BLOCKED_PATHS.has(pathname)) return false;
  return !TRACKING_BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function readStoredConsent(): AnalyticsConsent | null {
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (value === "granted" || value === "denied") return value;
    if (!value) return null;
    const record = JSON.parse(value) as { decision?: unknown };
    return record.decision === "granted" || record.decision === "denied" ? record.decision : null;
  } catch {
    return null;
  }
}

function persistConsent(value: AnalyticsConsent) {
  try {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ decision: value, version: 1, updatedAt: new Date().toISOString() })
    );
  } catch {
    // O bloqueio de storage do navegador nao pode liberar tracking por engano.
  }
}

function setGoogleConsent(value: AnalyticsConsent) {
  if (!GA_MEASUREMENT_ID) return;
  const disabled = value !== "granted";
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = disabled;
  window.gtag?.("consent", "update", {
    analytics_storage: value,
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
  });
}

function setMetaConsent(value: AnalyticsConsent) {
  if (!META_PIXEL_ID || typeof window.fbq !== "function") return;
  window.fbq("consent", value === "granted" ? "grant" : "revoke");
}

export function TrackingScripts() {
  const pathname = usePathname() || "/";
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [consentLoaded, setConsentLoaded] = useState(false);
  const [gaReady, setGaReady] = useState(false);
  const [metaReady, setMetaReady] = useState(false);
  const pathAllowsTracking = isTrackingAllowedOnPath(pathname);
  const trackingGranted = ENABLE_TRACKING && pathAllowsTracking && consent === "granted";

  useEffect(() => {
    setConsent(readStoredConsent());
    setConsentLoaded(true);
  }, []);

  useEffect(() => {
    const effectiveConsent: AnalyticsConsent = trackingGranted ? "granted" : "denied";
    setGoogleConsent(effectiveConsent);
    setMetaConsent(effectiveConsent);
  }, [trackingGranted]);

  useEffect(() => {
    if (!trackingGranted || !gaReady || !GA_MEASUREMENT_ID) return;
    window.gtag?.("event", "page_view", {
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
      page_title: document.title,
    });
  }, [gaReady, pathname, trackingGranted]);

  useEffect(() => {
    if (!trackingGranted || !metaReady || !META_PIXEL_ID) return;
    window.fbq?.("track", "PageView");
  }, [metaReady, pathname, trackingGranted]);

  function chooseConsent(value: AnalyticsConsent) {
    persistConsent(value);
    setConsent(value);
  }

  if (!ENABLE_TRACKING) return null;

  return (
    <>
      {trackingGranted && GA_MEASUREMENT_ID ? (
        <>
          <Script
            id="ga4-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script
            id="ga4-init"
            strategy="afterInteractive"
            onReady={() => {
              setGoogleConsent("granted");
              setGaReady(true);
            }}
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                gtag('js', new Date());
                gtag('consent', 'default', {
                  analytics_storage: 'granted',
                  ad_storage: 'granted',
                  ad_user_data: 'granted',
                  ad_personalization: 'granted'
                });
                gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
              `,
            }}
          />
        </>
      ) : null}

      {trackingGranted && META_PIXEL_ID ? (
        <Script
          id="meta-pixel-init"
          strategy="afterInteractive"
          onReady={() => {
            setMetaConsent("granted");
            setMetaReady(true);
          }}
          dangerouslySetInnerHTML={{
            __html: `
              !(function(f,b,e,v,n,t,s){
                if(f.fbq) return;
                n=f.fbq=function(){n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments)};
                if(!f._fbq) f._fbq=n;
                n.push=n;
                n.loaded=true;
                n.version='2.0';
                n.queue=[];
                t=b.createElement(e);
                t.async=true;
                t.src=v;
                s=b.getElementsByTagName(e)[0];
                s.parentNode.insertBefore(t,s);
              })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
              fbq('consent', 'grant');
            `,
          }}
        />
      ) : null}

      {consentLoaded && pathAllowsTracking && consent === null ? (
        <section
          aria-label="Preferencias de cookies"
          className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl sm:flex sm:items-center sm:gap-5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Sua privacidade importa</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Usamos cookies opcionais para medir o site e melhorar campanhas. Você pode recusar sem perder funcionalidades. Leia a nossa{" "}
              <Link className="font-medium text-indigo-700 underline underline-offset-2" href="/politica-de-privacidade">
                Política de Privacidade
              </Link>
              .
            </p>
          </div>
          <div className="mt-4 flex shrink-0 gap-2 sm:mt-0">
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              onClick={() => chooseConsent("denied")}
            >
              Recusar opcionais
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              onClick={() => chooseConsent("granted")}
            >
              Aceitar opcionais
            </button>
          </div>
        </section>
      ) : null}

      {consentLoaded && pathAllowsTracking && consent !== null ? (
        <button
          type="button"
          className="fixed bottom-3 left-3 z-[90] rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          onClick={() => setConsent(null)}
        >
          Preferências de cookies
        </button>
      ) : null}
    </>
  );
}
