"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";

type Agent = {
  agentId: string;
  displayName: string;
  role: string;
  division: string;
  source: { repo: string; commit: string; license: string; path: string };
  reviewStatus: "review_required" | "not_configured";
  manifest: null | {
    version: string;
    executionMode: string;
    capabilities: string[];
    allowedConnectionKinds: string[];
    approvalCapabilities: string[];
    limits: { maxRunMinutes: number; maxAttempts: number; maxCostBrl: number };
    evaluationIds: string[];
  };
  activation: { ready: boolean; blockers: string[] };
};

type Payload = { items: Agent[]; error?: string };

const DIVISIONS: Record<string, string> = {
  research: "Pesquisa e estratégia",
  growth: "Crescimento",
  "paid-media": "Mídia paga",
  creative: "Criação",
  "project-management": "Operação",
};

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AgentsPage() {
  const [data, setData] = useState<Payload>({ items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [division, setDivision] = useState("all");
  const [expandedId, setExpandedId] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await authedFetch("/api/admin/agent-os/agents");
      const payload = (await response.json().catch(() => ({}))) as Payload;
      if (!response.ok)
        throw new Error(
          payload.error || "Não foi possível carregar os agentes.",
        );
      setData(payload);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os agentes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const divisions = useMemo(
    () => [...new Set(data.items.map((agent) => agent.division))],
    [data.items],
  );
  const agents = useMemo(
    () =>
      division === "all"
        ? data.items
        : data.items.filter((agent) => agent.division === division),
    [data.items, division],
  );
  const configured = data.items.filter((agent) => agent.manifest).length;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
            Altum Agent OS
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Força de trabalho de IA
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Agentes importados de fontes rastreáveis. Eles entram em missões
            somente após manifesto, avaliação, responsável e regras de
            aprovação.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800">
          <ShieldCheck size={16} /> Nenhum agente é ativado aqui
        </span>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary
          icon={Bot}
          label="Agentes mapeados"
          value={String(data.items.length)}
          tone="violet"
        />
        <Summary
          icon={ClipboardCheck}
          label="Manifestos em revisão"
          value={String(configured)}
          tone="blue"
        />
        <Summary
          icon={CircleAlert}
          label="Pendentes de configuração"
          value={String(data.items.length - configured)}
          tone="amber"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold">Catálogo de agentes</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Biblioteca de funções para pesquisa, crescimento, mídia, criação e
              operação.
            </p>
          </div>
          <select
            value={division}
            onChange={(event) => setDivision(event.target.value)}
            className="field w-auto min-w-48"
          >
            <option value="all">Todas as áreas</option>
            {divisions.map((value) => (
              <option key={value} value={value}>
                {DIVISIONS[value] || label(value)}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="animate-spin text-violet-600" />
          </div>
        ) : agents.length ? (
          <div className="divide-y divide-slate-100">
            {agents.map((agent) => (
              <AgentRow
                key={agent.agentId}
                agent={agent}
                expanded={expandedId === agent.agentId}
                onToggle={() =>
                  setExpandedId((current) =>
                    current === agent.agentId ? "" : agent.agentId,
                  )
                }
              />
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">
            Nenhum agente nesta área.
          </div>
        )}
      </section>
    </div>
  );
}

function AgentRow({
  agent,
  expanded,
  onToggle,
}: {
  agent: Agent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = agent.manifest
    ? "Manifesto em revisão"
    : "Aguardando manifesto";
  return (
    <article className="px-5 py-5">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full items-start gap-4 text-left md:grid-cols-[1.3fr_0.6fr_0.65fr_auto]"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">
              {agent.displayName}
            </h3>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${agent.manifest ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}
            >
              {status}
            </span>
          </div>
          <p className="mt-1 max-w-xl text-sm text-slate-500">{agent.role}</p>
        </div>
        <div className="text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Área
          </p>
          <p className="mt-1 font-medium text-slate-700">
            {DIVISIONS[agent.division] || label(agent.division)}
          </p>
        </div>
        <div className="text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Modo inicial
          </p>
          <p className="mt-1 font-medium text-slate-700">
            {agent.manifest
              ? label(agent.manifest.executionMode)
              : "Não configurado"}
          </p>
        </div>
        <ChevronDown
          className={`mt-1 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          size={18}
        />
      </button>
      {expanded && (
        <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <Detail title="Origem verificada">
              <p>
                {agent.source.repo} · licença {agent.source.license}
              </p>
              <p className="mt-1 break-all text-xs text-slate-400">
                {agent.source.path} · {agent.source.commit.slice(0, 12)}
              </p>
            </Detail>
            {agent.manifest && (
              <>
                <Detail title="Capacidades permitidas">
                  <Tags values={agent.manifest.capabilities} />
                </Detail>
                <Detail title="Limites iniciais">
                  <p>
                    Até {agent.manifest.limits.maxRunMinutes} min,{" "}
                    {agent.manifest.limits.maxAttempts} tentativas e R${" "}
                    {agent.manifest.limits.maxCostBrl.toLocaleString("pt-BR")}{" "}
                    por execução.
                  </p>
                </Detail>
              </>
            )}
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 font-medium text-amber-900">
              <CircleAlert size={17} /> Antes de ativar
            </div>
            <ul className="mt-2 space-y-1.5 text-sm text-amber-800">
              {agent.activation.blockers.map((blocker) => (
                <li key={blocker}>• {blocker}</li>
              ))}
            </ul>
            {agent.activation.ready && (
              <p className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-700">
                <CheckCircle2 size={16} /> Pronto para a próxima etapa de
                ativação.
              </p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Detail({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-sm text-slate-600">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
function Tags({ values }: { values: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
        >
          {label(value)}
        </span>
      ))}
    </div>
  );
}
function Summary({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  tone: "violet" | "blue" | "amber";
}) {
  const colors = {
    violet: "bg-violet-50 text-violet-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`inline-flex rounded-xl p-2 ${colors[tone]}`}>
        <Icon size={18} />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-sm text-slate-500">{label}</p>
    </div>
  );
}
