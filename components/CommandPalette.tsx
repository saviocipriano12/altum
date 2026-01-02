"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Users,
  FileText,
  PlusCircle,
  CheckSquare,
} from "lucide-react";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]">
      <Command className="w-full max-w-xl rounded-xl border border-white/10 bg-[#0B0B0B] text-white shadow-2xl">
        <Command.Input
          placeholder="Buscar ação ou navegar..."
          className="w-full px-4 py-3 bg-transparent outline-none text-sm border-b border-white/10 placeholder:text-white/40"
        />

        <Command.List className="max-h-[320px] overflow-y-auto p-2">
          <Command.Empty className="p-4 text-sm text-white/50">
            Nenhum resultado encontrado.
          </Command.Empty>

          <Command.Group heading="Navegação">
            <Item icon={<LayoutDashboard size={16} />} label="Dashboard" onSelect={() => go("/admin/dashboard")} />
            <Item icon={<Users size={16} />} label="Clientes" onSelect={() => go("/admin/clientes")} />
            <Item icon={<FileText size={16} />} label="Orçamentos" onSelect={() => go("/admin/orcamentos")} />
          </Command.Group>

          <Command.Group heading="Ações rápidas">
            <Item icon={<PlusCircle size={16} />} label="Criar orçamento" onSelect={() => go("/admin/orcamentos/novo")} />
            <Item icon={<CheckSquare size={16} />} label="Criar atividade" onSelect={() => go("/admin/atividades")} />
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
      className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer
                 data-[selected=true]:bg-blue-600 data-[selected=true]:text-white"
    >
      {icon}
      <span>{label}</span>
    </Command.Item>
  );
}
