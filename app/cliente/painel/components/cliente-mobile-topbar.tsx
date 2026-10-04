"use client";

import { Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";

const PAGE_TITLES: Array<[RegExp, string]> = [
  [/\/cliente\/painel\/crm(?:\/|$)/, "Clientes"],
  [/\/cliente\/painel\/pipeline(?:\/|$)/, "Funil"],
  [/\/cliente\/painel\/agenda(?:\/|$)/, "Agenda"],
  [/\/cliente\/painel\/campanhas(?:\/|$)/, "Campanhas"],
  [/\/cliente\/painel\/disparos(?:\/|$)/, "Campanhas"],
  [/\/cliente\/painel\/relatorios(?:\/|$)/, "Relatórios"],
  [/\/cliente\/painel\/perguntar-altum(?:\/|$)/, "Perguntar à Altum"],
  [/\/cliente\/painel\/(ia|automacoes|conhecimento)(?:\/|$)/, "Assistente Altum"],
  [/\/cliente\/painel\/configuracoes(?:\/|$)/, "Configurações"],
];

function getTitle(pathname: string) {
  return PAGE_TITLES.find(([pattern]) => pattern.test(pathname))?.[1] || "Altum";
}

type Props = { onOpenMenu: () => void };

/** Mobile chrome deliberately stays minimal: every route owns its task header. */
export function ClienteMobileTopbar({ onOpenMenu }: Props) {
  const pathname = usePathname() || "/cliente/painel";
  if (pathname.startsWith("/cliente/painel/inbox")) return null;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--cliente-border)] bg-[color-mix(in_srgb,var(--cliente-panel-solid)_96%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <button type="button" onClick={onOpenMenu} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--cliente-card-text-muted)] transition active:scale-95 active:bg-[var(--cliente-surface-muted)]" aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-[var(--cliente-card-text)]">{getTitle(pathname)}</p>
        <button type="button" onClick={() => window.dispatchEvent(new Event("altum:cliente-command-open"))} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--cliente-primary)] transition active:scale-95 active:bg-[var(--cliente-primary-soft)]" aria-label="Buscar">
          <Search className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
