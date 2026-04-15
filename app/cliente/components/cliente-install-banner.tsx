"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_STORAGE_KEY = "altum-client-install-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return true;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  const displayStandalone = window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || displayStandalone;
}

function isIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(ua);
  const safari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
  return ios && safari;
}

export function ClienteInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  const iosMode = useMemo(() => isIosSafari(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISS_STORAGE_KEY) === "true") return;

    if (iosMode) {
      setVisible(true);
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, [iosMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onInstalled = () => {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
    }
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        dismiss();
      }
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.3rem)] z-[70] rounded-2xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-panel-solid)] p-3 shadow-[var(--cliente-shadow-hard)] md:inset-x-auto md:bottom-5 md:right-5 md:w-[380px]">
      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Instale o app do cliente</p>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
        {iosMode
          ? "No iPhone: toque em Compartilhar e depois em Adicionar a Tela de Inicio."
          : "Abra o portal com atalho na tela inicial para acessar mais rapido."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {!iosMode ? (
          <button
            type="button"
            onClick={() => void install()}
            disabled={installing}
            className="inline-flex min-w-[120px] items-center justify-center rounded-xl bg-[var(--cliente-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {installing ? "Instalando..." : "Instalar"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex items-center justify-center rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
        >
          Agora nao
        </button>
      </div>
    </div>
  );
}
