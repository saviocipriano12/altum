import { Bot, LayoutDashboard } from "lucide-react";
import { homePlatformModules } from "@/lib/public-site/home-content";

export function PlatformMockup() {
  return (
    <div className="relative">
      <div className="altum-pulse absolute -inset-6 rounded-[48px] bg-[#f56e0f]/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-[38px] border border-white/12 bg-[#111111] shadow-[0_40px_140px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#f8a25d]">
              Plataforma Altum
            </p>
            <p className="mt-1 text-sm text-white/42">Conversas, CRM, agenda e operacao</p>
          </div>
          <LayoutDashboard className="h-5 w-5 text-white/36" />
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[0.76fr_1.24fr]">
          <div className="space-y-3">
            {homePlatformModules.slice(0, 5).map((item, index) => (
              <div
                key={item.title}
                className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
                  index === 1
                    ? "border-[#f56e0f]/30 bg-[#f56e0f]/10 text-[#f8a25d]"
                    : "border-white/10 bg-white/[0.035] text-white/56"
                }`}
              >
                {item.title}
              </div>
            ))}
          </div>

          <div className="rounded-[30px] border border-white/10 bg-black/26 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <SmallKpi title="Leads" value="128" />
              <SmallKpi title="Pipeline" value="R$ 284k" />
              <SmallKpi title="Acao" value="IA" />
            </div>

            <div className="mt-5 grid gap-3">
              {[
                ["Novo lead", "Clinica premium", "Alta intencao"],
                ["Diagnostico", "Consultoria B2B", "Em analise"],
                ["Proposta", "Energia solar", "Follow-up"],
                ["Fechamento", "Servico local", "Proxima acao"],
              ].map(([stage, company, value]) => (
                <div
                  key={`${stage}-${company}`}
                  className="grid grid-cols-[1fr_auto] gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <div>
                    <p className="altum-display text-sm font-semibold text-white">{stage}</p>
                    <p className="mt-1 text-xs text-white/42">{company}</p>
                  </div>
                  <p className="text-xs font-semibold text-[#f8a25d]">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-[#f56e0f]/20 bg-[#f56e0f]/10 p-4">
              <div className="flex items-start gap-3">
                <Bot className="mt-0.5 h-5 w-5 text-[#f8a25d]" />
                <p className="text-sm leading-6 text-white/68">
                  A IA ajuda a priorizar oportunidades e indicar proximos passos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-8 left-8 right-8 hidden rounded-[28px] border border-white/10 bg-[#0b0b0b]/80 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:block">
        <div className="flex items-center justify-between gap-4">
          <p className="altum-display text-sm font-medium text-white/70">
            Uma visao unica para nao deixar oportunidades espalhadas.
          </p>
          <span className="rounded-full bg-[#f56e0f] px-4 py-2 text-xs font-bold text-white">
            centralizado
          </span>
        </div>
      </div>
    </div>
  );
}

function SmallKpi({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs text-white/42">{title}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">{value}</p>
    </div>
  );
}
