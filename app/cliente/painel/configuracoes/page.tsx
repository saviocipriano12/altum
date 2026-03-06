"use client";

import Link from "next/link";
import { Bot, MessageSquare, Settings2 } from "lucide-react";
import { PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

export default function ClienteConfiguracoesPage() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Configuracoes"
        subtitle="Ajustes de canais, politicas e governanca do tenant."
        action={<StateBadge label="Tenant configuravel" tone="info" />}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Link
          href="/cliente/painel/configuracoes/canais"
          className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-4 transition hover:bg-cyan-400/16"
        >
          <div className="inline-flex rounded-lg border border-cyan-200/40 bg-cyan-200/10 p-2 text-cyan-100">
            <MessageSquare className="h-4 w-4" />
          </div>
          <h3 className="mt-3 text-base font-semibold text-cyan-50">Canais WhatsApp</h3>
          <p className="mt-1 text-sm text-cyan-100/80">phoneNumberId, accessToken, verifyToken e appSecret por tenant.</p>
        </Link>

        <Link
          href="/cliente/painel/ia"
          className="rounded-2xl border border-white/12 bg-[#0f1522]/88 p-4 transition hover:bg-white/[0.06]"
        >
          <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.05] p-2 text-white/85">
            <Bot className="h-4 w-4" />
          </div>
          <h3 className="mt-3 text-base font-semibold">Politicas da IA</h3>
          <p className="mt-1 text-sm text-white/65">Tom, guardrails e handoff para responsavel comercial.</p>
        </Link>

        <PanelCard className="p-4">
          <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.05] p-2 text-white/85">
            <Settings2 className="h-4 w-4" />
          </div>
          <h3 className="mt-3 text-base font-semibold">Governanca</h3>
          <p className="mt-1 text-sm text-white/65">Permissoes, horarios, SLA e padroes operacionais por unidade.</p>
        </PanelCard>
      </section>
    </div>
  );
}
