"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  FileText,
  GitBranchPlus,
  LayoutGrid,
  ListTodo,
  LogOut,
  Megaphone,
  MessageSquare,
  MoonStar,
  Package,
  Plug,
  Rocket,
  Search,
  Settings,
  Sparkles,
  SunMedium,
  Target,
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
  { key: "inicio", label: "Inicio", href: "/cliente/painel", icon: <LayoutGrid className="h-4 w-4" /> },
  { key: "conversas", label: "Conversas", href: "/cliente/painel/inbox", icon: <MessageSquare className="h-4 w-4" /> },
  { key: "clientes", label: "Clientes & Oportunidades", href: "/cliente/painel/crm", icon: <Target className="h-4 w-4" /> },
  { key: "pipeline", label: "Clientes & Oportunidades - Kanban", href: "/cliente/painel/pipeline", icon: <Target className="h-4 w-4" /> },
  {
    key: "comercial",
    label: "Clientes & Oportunidades - Propostas",
    href: "/cliente/painel/comercial",
    icon: <ListTodo className="h-4 w-4" />,
    capability: "manage_commercial",
  },
  { key: "agenda", label: "Agenda", href: "/cliente/painel/agenda", icon: <CalendarDays className="h-4 w-4" /> },
  { key: "tarefas", label: "Agenda - Tarefas", href: "/cliente/painel/follow-ups", icon: <ListTodo className="h-4 w-4" /> },
  {
    key: "produtos_servicos",
    label: "Produtos & Servicos",
    href: "/cliente/painel/produtos-servicos",
    icon: <Package className="h-4 w-4" />,
    capability: "manage_ai",
  },
  { key: "campanhas", label: "Campanhas", href: "/cliente/painel/campanhas", icon: <Sparkles className="h-4 w-4" /> },
  { key: "captacao", label: "Campanhas - Captacao", href: "/cliente/painel/captacao", icon: <Megaphone className="h-4 w-4" /> },
  { key: "relatorios", label: "Relatorios", href: "/cliente/painel/metricas", icon: <BarChart3 className="h-4 w-4" /> },
  {
    key: "perguntar_altum",
    label: "Perguntar a Altum",
    href: "/cliente/painel/perguntar-altum",
    icon: <Sparkles className="h-4 w-4" />,
    capability: "manage_ai",
  },
  { key: "assistente", label: "Assistente Altum", href: "/cliente/painel/ia", icon: <Bot className="h-4 w-4" />, capability: "manage_ai" },
  {
    key: "conhecimento",
    label: "Assistente Altum - Base de conhecimento",
    href: "/cliente/painel/conhecimento",
    icon: <BookOpen className="h-4 w-4" />,
    capability: "manage_ai",
  },
  {
    key: "escaladas",
    label: "Assistente Altum - Escaladas",
    href: "/cliente/painel/handoffs",
    icon: <GitBranchPlus className="h-4 w-4" />,
  },
  {
    key: "configuracoes",
    label: "Configuracoes",
    href: "/cliente/painel/configuracoes",
    icon: <Settings className="h-4 w-4" />,
    capability: "manage_settings",
  },
  {
    key: "integracoes",
    label: "Configuracoes - Integracoes",
    href: "/cliente/painel/configuracoes/integracoes",
    icon: <Plug className="h-4 w-4" />,
    capability: "manage_settings",
  },
  { key: "implantacao", label: "Configuracoes - Implantacao", href: "/cliente/painel/go-live", icon: <Rocket className="h-4 w-4" /> },
  { key: "logs", label: "Configuracoes - Logs tecnicos", href: "/cliente/painel/logs", icon: <FileText className="h-4 w-4" /> },
];

export function ClienteCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { hasCapability } = useClienteTenant();
  const { theme, toggleTheme, density, toggleDensity, experienceMode, toggleExperienceMode } = useClienteShell();

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

  const closePalette = () => {
    setOpen(false);
    setQuery("");
  };

  const performSignOut = async () => {
    await signOut(auth);
    closePalette();
    router.push("/cliente/login");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/40 backdrop-blur-sm">
      <div className="mx-auto mt-[14vh] w-full max-w-2xl px-4">
        <Command className="client-glass overflow-hidden rounded-[34px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)] shadow-[var(--cliente-shadow-hard)]">
          <div className="flex items-center gap-2 border-b border-[var(--cliente-border)] px-4 py-3">
            <Search className="h-4 w-4 text-[var(--cliente-primary)]" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar pagina ou acao..."
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
                onSelect={() => {
                  toggleTheme();
                  closePalette();
                }}
              />
              <PaletteItem
                icon={<Sparkles className="h-4 w-4" />}
                label={density === "compact" ? "Usar visual confortavel" : "Usar visual compacto"}
                hint="Layout"
                onSelect={() => {
                  toggleDensity();
                  closePalette();
                }}
              />
              <PaletteItem
                icon={<Settings className="h-4 w-4" />}
                label={experienceMode === "essencial" ? "Mostrar areas avancadas" : "Mostrar visao simplificada"}
                hint="Navegacao"
                onSelect={() => {
                  toggleExperienceMode();
                  closePalette();
                }}
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
      className="mb-1 flex cursor-pointer items-center justify-between rounded-2xl border border-transparent px-3 py-2.5 text-sm text-[var(--cliente-text-muted)] data-[selected=true]:border-[var(--cliente-border-strong)] data-[selected=true]:bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary-soft)_76%,white),var(--cliente-primary-soft))] data-[selected=true]:text-[var(--cliente-text)]"
    >
      <span className="inline-flex items-center gap-2">
        <span className="text-[var(--cliente-primary)]">{icon}</span>
        {label}
      </span>
      <span className="text-xs text-[var(--cliente-text-soft)]">{hint}</span>
    </Command.Item>
  );
}
