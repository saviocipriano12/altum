"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Users,
  FileText,
  CheckSquare,
  BrainCircuit,
  Target,
  DollarSign,
  MessageSquare,
  Settings,
  UserCog,
  LineChart,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type CommandItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
};

const NAV_ITEMS: CommandItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard", icon: <LayoutDashboard size={16} /> },
  { key: "prospeccao", label: "Prospeccao", href: "/admin/prospeccao", icon: <Target size={16} /> },
  { key: "chat", label: "Inbox WhatsApp", href: "/admin/chat", icon: <MessageSquare size={16} /> },
  { key: "campanhas", label: "Campanhas", href: "/admin/campanhas", icon: <LineChart size={16} />, adminOnly: true },
  { key: "clientes", label: "Clientes", href: "/admin/clientes", icon: <Users size={16} /> },
  { key: "orcamentos", label: "Orcamentos", href: "/admin/orcamentos", icon: <FileText size={16} /> },
  { key: "financeiro", label: "Financeiro", href: "/admin/financeiro", icon: <DollarSign size={16} /> },
  { key: "atividades", label: "Atividades", href: "/admin/atividades", icon: <CheckSquare size={16} /> },
  { key: "ia", label: "IA da Plataforma", href: "/admin/ia", icon: <BrainCircuit size={16} /> },
  { key: "config", label: "Configuracoes", href: "/admin/config", icon: <Settings size={16} />, adminOnly: true },
  { key: "equipe", label: "Equipe", href: "/admin/equipe", icon: <UserCog size={16} />, adminOnly: true },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const router = useRouter();
  const { isAdmin } = useAuth();

  const items = useMemo(
    () => NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };

    const openCommand = (event: Event) => {
      const custom = event as CustomEvent<{ query?: string }>;
      setInputValue(custom.detail?.query || "");
      setOpen(true);
    };

    document.addEventListener("keydown", down);
    window.addEventListener("altum:command-open", openCommand as EventListener);

    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("altum:command-open", openCommand as EventListener);
    };
  }, []);

  const go = (path: string) => {
    setOpen(false);
    setInputValue("");
    router.push(path);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]">
      <Command className="w-full max-w-xl rounded-xl border border-white/10 bg-[#0B0B0B] text-white shadow-2xl">
        <Command.Input
          value={inputValue}
          onValueChange={setInputValue}
          placeholder="Buscar acao ou navegar..."
          className="w-full px-4 py-3 bg-transparent outline-none text-sm border-b border-white/10 placeholder:text-white/40"
        />

        <Command.List className="max-h-[320px] overflow-y-auto p-2">
          <Command.Empty className="p-4 text-sm text-white/50">
            Nenhum resultado encontrado.
          </Command.Empty>

          <Command.Group heading="Navegacao">
            {items.map((item) => (
              <Item
                key={item.key}
                icon={item.icon}
                label={item.label}
                onSelect={() => go(item.href)}
              />
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function Item({
  icon,
  label,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer data-[selected=true]:bg-blue-600 data-[selected=true]:text-white"
    >
      {icon}
      <span>{label}</span>
    </Command.Item>
  );
}
