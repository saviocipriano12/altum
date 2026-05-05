"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  BookOpen,
  Bot,
  Cable,
  CalendarDays,
  DollarSign,
  FileText,
  Funnel,
  GitBranchPlus,
  Instagram,
  LayoutGrid,
  ListTodo,
  LogOut,
  Megaphone,
  MessageSquare,
  MoonStar,
  Rocket,
  Search,
  Settings,
  Sparkles,
  SunMedium,
  Target,
  Users,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/firebaseConfig";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";

type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  capability?: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "visao_geral", label: "Visao geral", href: "/cliente/painel", icon: <LayoutGrid className="h-4 w-4" /> },
  { key: "inbox", label: "Conversas", href: "/cliente/painel/inbox", icon: <MessageSquare className="h-4 w-4" /> },
  { key: "crm", label: "CRM", href: "/cliente/painel/crm", icon: <Users className="h-4 w-4" /> },
  { key: "follow_ups", label: "Retornos", href: "/cliente/painel/follow-ups", icon: <ListTodo className="h-4 w-4" /> },
  { key: "agenda", label: "Agenda", href: "/cliente/painel/agenda", icon: <CalendarDays className="h-4 w-4" /> },
  { key: "pipeline", label: "Funil", href: "/cliente/painel/pipeline", icon: <Funnel className="h-4 w-4" /> },
  { key: "comercial", label: "Comercial", href: "/cliente/painel/comercial", icon: <DollarSign className="h-4 w-4" />, capability: "manage_commercial" },
  { key: "captacao", label: "Captacao", href: "/cliente/painel/captacao", icon: <Megaphone className="h-4 w-4" /> },
  { key: "campanhas", label: "Campanhas", href: "/cliente/painel/campanhas", icon: <Sparkles className="h-4 w-4" />, capability: "manage_automations" },
  { key: "ia", label: "IA", href: "/cliente/painel/ia", icon: <Bot className="h-4 w-4" />, capability: "manage_ai" },
  { key: "conhecimento", label: "Conhecimento", href: "/cliente/painel/conhecimento", icon: <BookOpen className="h-4 w-4" />, capability: "manage_ai" },
  { key: "handoffs", label: "Transferencias", href: "/cliente/painel/handoffs", icon: <GitBranchPlus className="h-4 w-4" /> },
  { key: "automacoes", label: "Automacoes", href: "/cliente/painel/automacoes", icon: <Cable className="h-4 w-4" />, capability: "manage_automations" },
  { key: "instagram_ops", label: "Operacao Instagram", href: "/cliente/painel/automacoes/instagram", icon: <Instagram className="h-4 w-4" />, capability: "manage_automations" },
  { key: "metricas", label: "Metricas", href: "/cliente/painel/metricas", icon: <Target className="h-4 w-4" /> },
  { key: "go_live", label: "Lancamento", href: "/cliente/painel/go-live", icon: <Rocket className="h-4 w-4" /> },
  { key: "logs", label: "Logs", href: "/cliente/painel/logs", icon: <FileText className="h-4 w-4" /> },
  { key: "configuracoes", label: "Configuracoes", href: "/cliente/painel/configuracoes", icon: <Settings className="h-4 w-4" />, capability: "manage_settings" },
];

export function ClienteCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { hasCapability } = useClienteTenant();
  const { theme, toggleTheme, density, toggleDensity } = useClienteShell();

  const items = useMemo(() => NAV_ITEMS.filter((item) => !item.capability || hasCapability(item.capability)), [hasCapability]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }

      if (event.key === "Escape") setOpen(false);
    };

    const onOpenCommand = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("altum:cliente-command-open", onOpenCommand);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("altum:cliente-command-open", onOpenCommand);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const performThemeToggle = () => {
    toggleTheme();
    setOpen(false);
    setQuery("");
  };

  const performDensityToggle = () => {
    toggleDensity();
    setOpen(false);
    setQuery("");
  };

  const performSignOut = async () => {
    await signOut(auth);
    setOpen(false);
    setQuery("");
    router.push("/cliente/login");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm">
      <div className="mx-auto mt-[14vh] w-full max-w-2xl px-4">
        <Command className="client-glass overflow-hidden rounded-[34px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] shadow-[var(--cliente-shadow-hard)]">
          <div className="flex items-center gap-2 border-b border-[var(--cliente-border)] px-4 py-3">
            <Search className="h-4 w-4 text-[var(--cliente-accent)]" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar modulo ou acao..."
              className="w-full bg-transparent text-sm text-[var(--cliente-text)] outline-none placeholder:text-[var(--cliente-text-soft)]"
            />
            <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2 py-1 text-[10px] text-[var(--cliente-text-soft)]">
              ESC
            </span>
          </div>

          <Command.List className="max-h-[56vh] overflow-y-auto p-3">
            <Command.Empty className="px-3 py-4 text-sm text-[var(--cliente-text-soft)]">Nenhum resultado.</Command.Empty>

            <Command.Group heading="Navegacao">
              {items.map((item) => (
                <PaletteItem key={item.key} icon={item.icon} label={item.label} hint={item.href.replace("/cliente/painel", "Painel")} onSelect={() => go(item.href)} />
              ))}
            </Command.Group>

            <Command.Separator className="my-2 h-px bg-[var(--cliente-border)]" />

            <Command.Group heading="Acoes rapidas">
              <PaletteItem
                icon={theme === "dark" ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
                hint="Tema"
                onSelect={performThemeToggle}
              />
              <PaletteItem
                icon={<Sparkles className="h-4 w-4" />}
                label={density === "compact" ? "Usar densidade confortavel" : "Usar densidade compacta"}
                hint="Layout"
                onSelect={performDensityToggle}
              />
              <PaletteItem
                icon={<LogOut className="h-4 w-4" />}
                label="Sair da conta"
                hint="Sessao"
                onSelect={() => {
                  void performSignOut();
                }}
              />
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function PaletteItem({
  icon,
  label,
  hint,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="mb-1 flex cursor-pointer items-center justify-between rounded-2xl border border-transparent px-3 py-2.5 text-sm text-[var(--cliente-text-muted)] data-[selected=true]:border-[var(--cliente-border-strong)] data-[selected=true]:bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-accent-soft)_76%,white),var(--cliente-accent-soft))] data-[selected=true]:text-[var(--cliente-text)]"
    >
      <span className="inline-flex items-center gap-2">
        <span className="text-[var(--cliente-accent)]">{icon}</span>
        {label}
      </span>
      <span className="text-xs text-[var(--cliente-text-soft)]">{hint}</span>
    </Command.Item>
  );
}
