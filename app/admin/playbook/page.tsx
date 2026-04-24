"use client";

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useAuth } from "@/context/AuthContext";
import {
  BUSINESS_PROFILES,
  getBusinessProfile,
  getBusinessProfilePlaybookPreset,
  type BusinessProfileId,
} from "@/lib/business-profiles";
import {
  BookOpen,
  Bot,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";

type ProductItem = {
  id: string;
  title: string;
  category: string;
  targetProfile: string;
  whenToOffer: string;
  priceFrom: number;
  priceTo: number;
};

type ScriptItem = {
  id: string;
  situation: string;
  goal: string;
  script: string;
};

type TipItem = {
  id: string;
  situation?: string;
  script?: string;
  result?: string;
  authorName?: string;
  authorRole?: string;
  createdAt?: { toDate?: () => Date } | number | null;
};

type TabKey = "products" | "scripts" | "tips";

const emptyProduct = (): ProductItem => ({
  id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title: "",
  category: "",
  targetProfile: "",
  whenToOffer: "",
  priceFrom: 0,
  priceTo: 0,
});

const emptyScript = (): ScriptItem => ({
  id: `scr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  situation: "",
  goal: "",
  script: "",
});

function toDate(value?: TipItem["createdAt"]) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

export default function PlaybookComercialPage() {
  const { isAdmin, profile } = useAuth();
  const [tab, setTab] = useState<TabKey>("products");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [postingTip, setPostingTip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [tips, setTips] = useState<TipItem[]>([]);

  const [tipForm, setTipForm] = useState({
    situation: "",
    script: "",
    result: "",
  });
  const [presetProfileId, setPresetProfileId] = useState<BusinessProfileId>("generic");

  const canSave = isAdmin && !saving;
  const selectedProfile = getBusinessProfile(presetProfileId);
  const selectedPreset = getBusinessProfilePlaybookPreset(presetProfileId);

  async function loadPlaybook() {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/sales/playbook");
      const data = (await res.json()) as {
        ok?: boolean;
        products?: ProductItem[];
        scripts?: ScriptItem[];
        tips?: TipItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Falha ao carregar playbook.");

      setProducts(Array.isArray(data.products) ? data.products : []);
      setScripts(Array.isArray(data.scripts) ? data.scripts : []);
      setTips(Array.isArray(data.tips) ? data.tips : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar playbook.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlaybook();
  }, []);

  async function savePlaybook() {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        products: products
          .map((item) => ({
            ...item,
            title: item.title.trim(),
            category: item.category.trim(),
            targetProfile: item.targetProfile.trim(),
            whenToOffer: item.whenToOffer.trim(),
          }))
          .filter((item) => item.title),
        scripts: scripts
          .map((item) => ({
            ...item,
            situation: item.situation.trim(),
            goal: item.goal.trim(),
            script: item.script.trim(),
          }))
          .filter((item) => item.situation && item.script),
      };

      const res = await authedFetch("/api/sales/playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao salvar playbook.");

      setSuccess("Playbook atualizado com sucesso.");
      await loadPlaybook();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar playbook.");
    } finally {
      setSaving(false);
    }
  }

  async function createTip() {
    setPostingTip(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authedFetch("/api/sales/playbook/tips/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tipForm),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao publicar dica.");
      setTipForm({ situation: "", script: "", result: "" });
      setSuccess("Dica publicada no playbook.");
      await loadPlaybook();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar dica.");
    } finally {
      setPostingTip(false);
    }
  }

  async function deleteTip(id: string) {
    if (!isAdmin) return;
    if (!confirm("Remover esta dica do playbook?")) return;

    setError(null);
    try {
      const res = await authedFetch("/api/sales/playbook/tips/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao remover dica.");
      await loadPlaybook();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover dica.");
    }
  }

  const sortedTips = useMemo(
    () =>
      [...tips].sort((a, b) => {
        const da = toDate(a.createdAt)?.getTime() || 0;
        const db = toDate(b.createdAt)?.getTime() || 0;
        return db - da;
      }),
    [tips]
  );

  function applyPreset(target: "products" | "scripts" | "both") {
    if (!isAdmin) return;

    if (target === "products" || target === "both") {
      setProducts((prev) => [
        ...selectedPreset.offers.map((item) => ({
          id: `preset-prod-${presetProfileId}-${Math.random().toString(36).slice(2, 8)}`,
          title: item.title,
          category: item.category,
          targetProfile: item.targetProfile,
          whenToOffer: item.whenToOffer,
          priceFrom: item.priceFrom,
          priceTo: item.priceTo,
        })),
        ...prev,
      ]);
    }

    if (target === "scripts" || target === "both") {
      setScripts((prev) => [
        ...selectedPreset.scripts.map((item) => ({
          id: `preset-script-${presetProfileId}-${Math.random().toString(36).slice(2, 8)}`,
          situation: item.situation,
          goal: item.goal,
          script: item.script,
        })),
        ...prev,
      ]);
    }

    setSuccess(`Preset do modo ${selectedProfile.label} aplicado no playbook.`);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#101010] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/45">Sales Enablement</p>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-blue-400" />
              Playbook Comercial
            </h1>
            <p className="text-sm text-white/60 mt-1">
              Catalogo oficial de ofertas da agencia, scripts por situacao e dicas praticas do time.
            </p>
          </div>
          <div className="text-xs rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/70">
            Perfil: <span className="text-white">{profile?.role || "sdr"}</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">{success}</div>
      )}

      <section className="flex flex-wrap gap-2">
        <TabButton active={tab === "products"} onClick={() => setTab("products")} icon={<Sparkles className="h-4 w-4" />} label="Produtos e Servicos" />
        <TabButton active={tab === "scripts"} onClick={() => setTab("scripts")} icon={<Bot className="h-4 w-4" />} label="Scripts Oficiais" />
        <TabButton active={tab === "tips"} onClick={() => setTab("tips")} icon={<Trophy className="h-4 w-4" />} label="Dicas do Time" />
      </section>

      <section className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-100/70">Preset por vertical</p>
            <h2 className="mt-1 text-sm font-semibold text-white">Playbook base por tipo de negocio</h2>
            <p className="mt-2 max-w-3xl text-sm text-white/65">
              Use esse bloco para acelerar provisionamento da ALTUM. O preset injeta ofertas e scripts alinhados ao modo operacional do cliente.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={presetProfileId}
              onChange={(event) => setPresetProfileId(event.target.value as BusinessProfileId)}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none"
            >
              {Object.values(BUSINESS_PROFILES).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            {isAdmin ? (
              <>
                <button
                  onClick={() => applyPreset("products")}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 transition hover:bg-white/10"
                >
                  Aplicar ofertas
                </button>
                <button
                  onClick={() => applyPreset("scripts")}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 transition hover:bg-white/10"
                >
                  Aplicar scripts
                </button>
                <button
                  onClick={() => applyPreset("both")}
                  className="rounded-xl border border-blue-400/25 bg-blue-500/15 px-3 py-2 text-xs text-blue-100 transition hover:bg-blue-500/20"
                >
                  Aplicar pacote completo
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <p className="text-sm font-semibold text-white">{selectedProfile.label}</p>
            <p className="mt-2 text-sm text-white/60">{selectedProfile.description}</p>
            <p className="mt-3 text-xs text-white/55">Foco comercial: {selectedProfile.commercialMotion}</p>
            <p className="mt-2 text-xs text-white/55">Perguntas obrigatorias: {selectedProfile.ai.mandatoryQuestions.slice(0, 3).join(" - ")}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <p className="text-[11px] uppercase tracking-wide text-white/45">Ofertas sugeridas</p>
              <div className="mt-3 space-y-2">
                {selectedPreset.offers.map((item) => (
                  <div key={item.title} className="rounded-lg border border-white/10 bg-black/30 p-2">
                    <p className="text-xs font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-[11px] text-white/55">{item.category} - {item.targetProfile}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <p className="text-[11px] uppercase tracking-wide text-white/45">Cenas de conversa</p>
              <div className="mt-3 space-y-2">
                {selectedPreset.scripts.map((item) => (
                  <div key={item.situation} className="rounded-lg border border-white/10 bg-black/30 p-2">
                    <p className="text-xs font-medium text-white">{item.situation}</p>
                    <p className="mt-1 text-[11px] text-white/55">{item.goal}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="inline-flex items-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando playbook...
        </div>
      ) : (
        <>
          {tab === "products" && (
            <section className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">Produtos e Servicos</h2>
                {isAdmin && (
                  <button
                    onClick={() => setProducts((prev) => [emptyProduct(), ...prev])}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                  >
                    <Plus className="h-4 w-4" />
                    Novo item
                  </button>
                )}
              </div>

              {products.length === 0 ? (
                <p className="text-sm text-white/55">Nenhum produto/servico cadastrado ainda.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {products.map((item, idx) => (
                    <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
                      <input
                        disabled={!isAdmin}
                        value={item.title}
                        onChange={(e) =>
                          setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, title: e.target.value } : p)))
                        }
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                        placeholder="Nome da oferta"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          disabled={!isAdmin}
                          value={item.category}
                          onChange={(e) =>
                            setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, category: e.target.value } : p)))
                          }
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none"
                          placeholder="Categoria"
                        />
                        <input
                          disabled={!isAdmin}
                          value={item.targetProfile}
                          onChange={(e) =>
                            setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, targetProfile: e.target.value } : p)))
                          }
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none"
                          placeholder="Cliente ideal"
                        />
                      </div>
                      <textarea
                        disabled={!isAdmin}
                        value={item.whenToOffer}
                        onChange={(e) =>
                          setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, whenToOffer: e.target.value } : p)))
                        }
                        className="min-h-[80px] w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none"
                        placeholder="Quando ofertar"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          disabled={!isAdmin}
                          value={item.priceFrom || 0}
                          onChange={(e) =>
                            setProducts((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, priceFrom: Number(e.target.value || 0) } : p))
                            )
                          }
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none"
                          placeholder="Preco inicial"
                        />
                        <input
                          type="number"
                          disabled={!isAdmin}
                          value={item.priceTo || 0}
                          onChange={(e) =>
                            setProducts((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, priceTo: Number(e.target.value || 0) } : p))
                            )
                          }
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none"
                          placeholder="Preco final"
                        />
                      </div>
                      {isAdmin && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => setProducts((prev) => prev.filter((_, i) => i !== idx))}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-[11px] text-red-100 hover:bg-red-500/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remover
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "scripts" && (
            <section className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">Scripts Oficiais</h2>
                {isAdmin && (
                  <button
                    onClick={() => setScripts((prev) => [emptyScript(), ...prev])}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                  >
                    <Plus className="h-4 w-4" />
                    Novo script
                  </button>
                )}
              </div>

              {scripts.length === 0 ? (
                <p className="text-sm text-white/55">Nenhum script oficial cadastrado ainda.</p>
              ) : (
                <div className="space-y-3">
                  {scripts.map((item, idx) => (
                    <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          disabled={!isAdmin}
                          value={item.situation}
                          onChange={(e) =>
                            setScripts((prev) => prev.map((s, i) => (i === idx ? { ...s, situation: e.target.value } : s)))
                          }
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none"
                          placeholder="Situacao (ex: lead frio, objecao de preco...)"
                        />
                        <input
                          disabled={!isAdmin}
                          value={item.goal}
                          onChange={(e) =>
                            setScripts((prev) => prev.map((s, i) => (i === idx ? { ...s, goal: e.target.value } : s)))
                          }
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none"
                          placeholder="Objetivo do script"
                        />
                      </div>
                      <textarea
                        disabled={!isAdmin}
                        value={item.script}
                        onChange={(e) =>
                          setScripts((prev) => prev.map((s, i) => (i === idx ? { ...s, script: e.target.value } : s)))
                        }
                        className="min-h-[120px] w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                        placeholder="Script completo"
                      />
                      {isAdmin && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => setScripts((prev) => prev.filter((_, i) => i !== idx))}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-[11px] text-red-100 hover:bg-red-500/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remover
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "tips" && (
            <section className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-4">
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 space-y-2">
                <h3 className="text-xs uppercase tracking-wide text-blue-100">Contribuir com dica do time</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    value={tipForm.situation}
                    onChange={(e) => setTipForm((prev) => ({ ...prev, situation: e.target.value }))}
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none"
                    placeholder="Situacao onde o script funcionou"
                  />
                  <input
                    value={tipForm.result}
                    onChange={(e) => setTipForm((prev) => ({ ...prev, result: e.target.value }))}
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none"
                    placeholder="Resultado alcancado"
                  />
                </div>
                <textarea
                  value={tipForm.script}
                  onChange={(e) => setTipForm((prev) => ({ ...prev, script: e.target.value }))}
                  className="min-h-[100px] w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                  placeholder="Script que funcionou"
                />
                <button
                  disabled={postingTip}
                  onClick={() => void createTip()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold hover:bg-blue-500 disabled:opacity-60"
                >
                  {postingTip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Publicar dica
                </button>
              </div>

              {sortedTips.length === 0 ? (
                <p className="text-sm text-white/55">Sem dicas publicadas ainda.</p>
              ) : (
                <div className="space-y-3">
                  {sortedTips.map((tip) => (
                    <div key={tip.id} className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-wide text-white/60">{tip.situation || "Situacao nao informada"}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-white/45">
                            {tip.authorName || "Time"} ({tip.authorRole || "sdr"})
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => void deleteTip(tip.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-[11px] text-red-100 hover:bg-red-500/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remover
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="whitespace-pre-line rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/85">
                        {tip.script || "-"}
                      </p>
                      <p className="text-xs text-emerald-200/90">Resultado: {tip.result || "nao informado"}</p>
                      <p className="text-[11px] text-white/35">
                        Publicado em: {toDate(tip.createdAt)?.toLocaleDateString("pt-BR") || "-"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {isAdmin && tab !== "tips" && (
            <div className="flex justify-end">
              <button
                onClick={() => void savePlaybook()}
                disabled={!canSave}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar playbook
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
        active
          ? "border-blue-500/50 bg-blue-500/15 text-blue-100"
          : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
