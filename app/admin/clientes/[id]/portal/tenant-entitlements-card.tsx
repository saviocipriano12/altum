"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Check, Gauge, Layers3, Loader2, Save, ShieldCheck, Sparkles } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import {
  applyTenantModuleDependencies,
  TENANT_LIMIT_IDS,
  TENANT_LIMIT_LABELS,
  TENANT_MODULE_CATALOG,
  type TenantEntitlementsSnapshot,
  type TenantLimitId,
  type TenantModuleId,
  type TenantModuleMap,
} from "@/lib/tenant-entitlements";
import type { TenantCommercialUsage } from "@/lib/server/tenant-usage";

type Props = {
  tenantId: string;
  tenantName?: string;
  monthlyValue?: number;
  whatsappCostMonthlyBrl?: number;
  telephonyCostMonthlyBrl?: number;
  otherVariableCostMonthlyBrl?: number;
  aiUsdBrlRate?: number;
};

type ApiResponse = {
  entitlements?: TenantEntitlementsSnapshot;
  usage?: TenantCommercialUsage;
  error?: string;
};

const CATEGORY_LABELS = {
  operation: "Operação comercial",
  channels: "Canais",
  intelligence: "Inteligência aplicada",
  growth: "Crescimento",
} as const;

function modulesAfterToggle(modules: TenantModuleMap, moduleId: TenantModuleId) {
  const enabling = !modules[moduleId];
  if (enabling) {
    return applyTenantModuleDependencies({ ...modules, [moduleId]: true });
  }

  const next = { ...modules, [moduleId]: false };
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of TENANT_MODULE_CATALOG) {
      if (!next[definition.id]) continue;
      if (definition.dependencies.some((dependency) => !next[dependency])) {
        next[definition.id] = false;
        changed = true;
      }
    }
  }
  return next;
}

function formatLimit(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function TenantEntitlementsCard({
  tenantId,
  tenantName,
  monthlyValue = 0,
  whatsappCostMonthlyBrl = 0,
  telephonyCostMonthlyBrl = 0,
  otherVariableCostMonthlyBrl = 0,
  aiUsdBrlRate = 5.5,
}: Props) {
  const [entitlements, setEntitlements] = useState<TenantEntitlementsSnapshot | null>(null);
  const [usage, setUsage] = useState<TenantCommercialUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(`/api/admin/tenants/${encodeURIComponent(tenantId)}/entitlements`);
      const data = (await res.json()) as ApiResponse;
      if (!res.ok || !data.entitlements) throw new Error(data.error || "Falha ao carregar módulos.");
      setEntitlements(data.entitlements);
      setUsage(data.usage || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar módulos.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeModules = useMemo(
    () => TENANT_MODULE_CATALOG.filter((definition) => entitlements?.modules[definition.id]).length,
    [entitlements]
  );
  const aiCostBrl = Number(usage?.aiEstimatedCostUsd || 0) * Math.max(0, aiUsdBrlRate);
  const knownMonthlyCost = aiCostBrl + Math.max(0, whatsappCostMonthlyBrl) + Math.max(0, telephonyCostMonthlyBrl) + Math.max(0, otherVariableCostMonthlyBrl);
  const knownMargin = Number(monthlyValue || 0) - knownMonthlyCost;

  const groupedModules = useMemo(
    () =>
      Object.entries(CATEGORY_LABELS).map(([category, label]) => ({
        category: category as keyof typeof CATEGORY_LABELS,
        label,
        items: TENANT_MODULE_CATALOG.filter((definition) => definition.category === category),
      })),
    []
  );

  function toggleModule(moduleId: TenantModuleId) {
    setNotice("");
    setEntitlements((current) =>
      current ? { ...current, modules: modulesAfterToggle(current.modules, moduleId), mode: "custom" } : current
    );
  }

  function updateLimit(limitId: TenantLimitId, value: string) {
    const parsed = Math.max(0, Math.round(Number(value || 0)));
    setNotice("");
    setEntitlements((current) =>
      current ? { ...current, limits: { ...current.limits, [limitId]: Number.isFinite(parsed) ? parsed : 0 } } : current
    );
  }

  async function save() {
    if (!entitlements) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await authedFetch(`/api/admin/tenants/${encodeURIComponent(tenantId)}/entitlements`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: entitlements.modules, limits: entitlements.limits }),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok || !data.entitlements) throw new Error(data.error || "Falha ao salvar módulos.");
      setEntitlements(data.entitlements);
      setNotice("Oferta atualizada. Navegação e APIs já podem usar este contrato.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar módulos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#F8FAFC] text-slate-950 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.45)]">
      <div className="border-b border-slate-200 bg-white px-5 py-5 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_14px_30px_-16px_rgba(37,99,235,0.9)]">
              <Layers3 className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-slate-950">Produto contratado</h2>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                  {activeModules} de {TENANT_MODULE_CATALOG.length} módulos
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Defina o que {tenantName || "esta empresa"} pode usar e os limites comerciais do contrato.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || !entitlements}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-[0_16px_34px_-20px_rgba(37,99,235,0.9)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar oferta
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-56 items-center justify-center gap-2 text-sm font-medium text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          Carregando produto contratado...
        </div>
      ) : entitlements ? (
        <div className="space-y-6 p-5 md:p-6">
          {entitlements.isLegacyFallback ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-bold">Compatibilidade com contrato antigo</p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Todos os módulos permanecem disponíveis até você salvar uma oferta personalizada.
                </p>
              </div>
            </div>
          ) : null}

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}
          {notice ? (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              <Check className="h-4 w-4" />
              {notice}
            </div>
          ) : null}

          {usage ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Receita mensal</p>
                <p className="mt-2 text-xl font-black text-slate-950">{formatMoney(monthlyValue)}</p>
                <p className="mt-1 text-xs text-slate-500">valor contratado</p>
              </div>
              <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-violet-700">Custo de IA</p>
                <p className="mt-2 text-xl font-black text-violet-950">US$ {usage.aiEstimatedCostUsd.toFixed(2)}</p>
                <p className="mt-1 text-xs text-violet-700">aprox. {formatMoney(aiCostBrl)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Custos conhecidos</p>
                <p className="mt-2 text-xl font-black text-slate-950">{formatMoney(knownMonthlyCost)}</p>
                <p className="mt-1 text-xs text-slate-500">IA + Meta + telefonia + extras</p>
              </div>
              <div className={`rounded-2xl border p-4 ${knownMargin >= 0 ? "border-emerald-200 bg-emerald-50/70" : "border-red-200 bg-red-50"}`}>
                <p className={`text-[11px] font-extrabold uppercase tracking-[0.12em] ${knownMargin >= 0 ? "text-emerald-700" : "text-red-700"}`}>Margem conhecida</p>
                <p className={`mt-2 text-xl font-black ${knownMargin >= 0 ? "text-emerald-950" : "text-red-950"}`}>{formatMoney(knownMargin)}</p>
                <p className={`mt-1 text-xs ${knownMargin >= 0 ? "text-emerald-700" : "text-red-700"}`}>complete custos externos para maior precisão</p>
              </div>
            </div>
          ) : null}

          <div className="space-y-5">
            {groupedModules.map((group) => (
              <div key={group.category}>
                <p className="mb-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">{group.label}</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((definition) => {
                    const enabled = entitlements.modules[definition.id];
                    return (
                      <button
                        key={definition.id}
                        type="button"
                        onClick={() => toggleModule(definition.id)}
                        aria-pressed={enabled}
                        className={`group min-h-32 rounded-2xl border p-4 text-left transition ${
                          enabled
                            ? "border-blue-200 bg-white shadow-[0_16px_34px_-28px_rgba(37,99,235,0.7)]"
                            : "border-slate-200 bg-slate-100/70 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${enabled ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                            {definition.category === "intelligence" ? <Sparkles className="h-4 w-4" /> : <Layers3 className="h-4 w-4" />}
                          </span>
                          <span className={`relative h-6 w-11 rounded-full transition ${enabled ? "bg-blue-600" : "bg-slate-300"}`}>
                            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`} />
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-900">{definition.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{definition.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 pt-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Gauge className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-950">Limites do contrato</h3>
                <p className="mt-1 text-sm text-slate-600">Use qualquer valor ou defina zero para liberar uso sem limite.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {TENANT_LIMIT_IDS.map((limitId) => {
                const meta = TENANT_LIMIT_LABELS[limitId];
                const used = usage?.[limitId] ?? 0;
                const contracted = entitlements.limits[limitId];
                const percentage = contracted > 0 ? Math.min(100, Math.round((used / contracted) * 100)) : 0;
                const nearLimit = contracted > 0 && used / contracted >= 0.8;
                return (
                  <label key={limitId} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="flex items-center justify-between gap-3 text-sm font-bold text-slate-900">
                      {meta.label}
                      <span className={`text-[11px] ${nearLimit ? "text-amber-700" : "text-slate-500"}`}>
                        {formatLimit(used)} usados
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{meta.description}</span>
                    <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className={`block h-full rounded-full transition-all ${nearLimit ? "bg-amber-500" : "bg-blue-600"}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </span>
                    <div className="mt-3 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={entitlements.limits[limitId]}
                        onChange={(event) => updateLimit(limitId, event.target.value)}
                        className="h-10 min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-950 outline-none"
                      />
                      <span className="text-[11px] font-semibold text-slate-500">{meta.suffix}</span>
                    </div>
                    <span className="mt-2 block text-[11px] font-medium text-slate-500">
                      {contracted > 0
                        ? `${formatLimit(used)} de ${formatLimit(contracted)} ${meta.suffix}`
                        : `${formatLimit(used)} usados · sem limite`}
                    </span>
                  </label>
                );
              })}
            </div>
            {usage ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-900">
                <Activity className="h-4 w-4 text-indigo-600" />
                <span className="font-bold">Uso operacional de {usage.monthRef}</span>
                <span>Mensagens, IA e automações reiniciam a cada mês.</span>
                <span>Atendimentos em andamento continuam; novos arquivos respeitam a franquia de armazenamento.</span>
                {usage.messagesCapped ? <span className="font-semibold text-amber-700">Volume de mensagens acima da janela de medição.</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="p-6 text-sm text-red-700">{error || "Não foi possível carregar o produto contratado."}</div>
      )}
    </section>
  );
}
