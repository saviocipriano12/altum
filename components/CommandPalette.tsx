"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  ADMIN_NAV_SECTIONS,
  filterAdminNavItems,
  type AdminNavItem,
} from "@/components/admin/admin-navigation";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const router = useRouter();
  const { isAdmin } = useAuth();

  const items = useMemo(() => filterAdminNavItems(isAdmin), [isAdmin]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }

      if (event.key === "Escape") {
        setOpen(false);
        setInputValue("");
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

  function go(path: string) {
    setOpen(false);
    setInputValue("");
    router.push(path);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 px-4 pt-[13vh] backdrop-blur-sm">
      <Command className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-950/20">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Search size={17} className="text-slate-400" />
          <Command.Input
            value={inputValue}
            onValueChange={setInputValue}
            placeholder="Buscar modulo, acao ou area da agencia..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
            Esc
          </span>
        </div>

        <Command.List className="max-h-[420px] overflow-y-auto p-2">
          <Command.Empty className="p-4 text-sm text-slate-500">
            Nenhum resultado encontrado.
          </Command.Empty>

          {ADMIN_NAV_SECTIONS.map((section) => {
            const sectionItems = items.filter((item) => item.section === section.key);
            if (sectionItems.length === 0) return null;

            return (
              <Command.Group key={section.key} heading={section.label}>
                {sectionItems.map((item) => (
                  <Item key={item.href} item={item} onSelect={() => go(item.href)} />
                ))}
              </Command.Group>
            );
          })}
        </Command.List>
      </Command>
    </div>
  );
}

function Item({
  item,
  onSelect,
}: {
  item: AdminNavItem;
  onSelect: () => void;
}) {
  const Icon = item.icon;

  return (
    <Command.Item
      value={`${item.label} ${item.description}`}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 data-[selected=true]:bg-blue-50 data-[selected=true]:text-blue-800"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{item.label}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{item.description}</span>
      </span>
    </Command.Item>
  );
}
