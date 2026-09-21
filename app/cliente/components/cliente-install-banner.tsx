"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Download, Smartphone, X } from "lucide-react";
import { readClientPreference, writeClientPreference } from "@/lib/client-storage";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const DISMISS_KEY = "altum-client-install-dismissed-at";
const WEEK = 7 * 24 * 60 * 60 * 1000;

export function ClienteInstallBanner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [manual, setManual] = useState(false);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const standalone = () => display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const sync = () => { setInstalled(standalone()); if (standalone()) setVisible(false); };
    sync();
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIos(isIos);
    const dismissed = Number(readClientPreference(DISMISS_KEY) || 0);
    const canSuggest = () => !standalone() && Date.now() - dismissed > WEEK;
    if (isIos && canSuggest()) setVisible(true);
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); if (canSuggest()) setVisible(true); };
    const open = () => { if (!standalone()) { setManual(true); setVisible(true); setError(""); } };
    const onInstalled = () => { setInstalled(true); setVisible(false); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("altum:cliente-install-open", open);
    display.addEventListener("change", sync);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("altum:cliente-install-open", open);
      display.removeEventListener("change", sync);
    };
  }, []);

  function dismiss() { writeClientPreference(DISMISS_KEY, String(Date.now())); setVisible(false); setManual(false); }
  async function install() {
    if (!prompt) return;
    setInstalling(true); setError("");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setVisible(false);
      else dismiss();
    } catch { setError("Não foi possível abrir a instalação. Use a opção Instalar app no menu do navegador."); }
    finally { setInstalling(false); setPrompt(null); }
  }

  const inPanel = pathname.startsWith("/cliente/painel");
  const chatOpen = pathname.includes("/inbox") && Boolean(searchParams.get("chatId"));
  if (!visible || installed || !inPanel || (chatOpen && !manual)) return null;
  return <aside data-client-install-prompt aria-label="Instalar Altum" className="client-install-prompt fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[70] rounded-2xl border border-slate-200 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.18)] md:inset-x-auto md:bottom-5 md:right-5 md:w-[380px]">
    <button type="button" onClick={dismiss} disabled={installing} aria-label="Fechar convite de instalação" className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
    <div className="flex items-center gap-3 pr-9"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Smartphone className="h-6 w-6" /></span><div><h2 className="text-sm font-bold">Altum na sua tela inicial</h2><p className="mt-1 text-xs leading-5 text-slate-600">Abra suas conversas e clientes direto pelo app.</p></div></div>
    {ios ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>. Se estiver em outro navegador, abra esta página no Safari.</p> : !prompt ? <p className="mt-3 text-sm leading-6 text-slate-600">No menu do navegador, escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>. A opção depende do navegador e do dispositivo.</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    <div className="mt-3 flex gap-2">{prompt ? <button type="button" onClick={() => void install()} disabled={installing} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60"><Download className="h-4 w-4" />{installing ? "Instalando…" : "Instalar Altum"}</button> : null}<button type="button" onClick={dismiss} disabled={installing} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">{manual ? "Entendi" : "Agora não"}</button></div>
  </aside>;
}
