"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Loader2,
  Package,
  PencilLine,
  Save,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CardTitle,
  ClientActionButton,
  ClientTabs,
  EmptyState,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type CatalogKind = "produto" | "servico" | "plano" | "pacote";
type Availability = "active" | "seasonal" | "paused";

type CatalogDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  serviceKey?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  targetProfile?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  upsellKeys?: string[];
  crossSellKeys?: string[];
  priority?: number | null;
  availability?: Availability;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type FormState = {
  kind: CatalogKind;
  name: string;
  category: string;
  priceFrom: string;
  priceTo: string;
  targetProfile: string;
  shortDescription: string;
  benefits: string;
  commonQuestions: string;
  objections: string;
  whenRecommend: string;
  whenHuman: string;
  upsell: string;
  crossSell: string;
  availability: Availability;
  source: string;
  extraTags: string;
};

const EMPTY_FORM: FormState = {
  kind: "produto",
  name: "",
  category: "",
  priceFrom: "",
  priceTo: "",
  targetProfile: "",
  shortDescription: "",
  benefits: "",
  commonQuestions: "",
  objections: "",
  whenRecommend: "",
  whenHuman: "",
  upsell: "",
  crossSell: "",
  availability: "active",
  source: "manual",
  extraTags: "",
};

const KIND_OPTIONS: Array<{ value: CatalogKind | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "produto", label: "Produtos" },
  { value: "servico", label: "Servicos" },
  { value: "plano", label: "Planos" },
  { value: "pacote", label: "Pacotes" },
];

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function parseList(value: string) {
  return value
    .split(/,|\n|;|\|/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function numberOrNull(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value?: number | null) {
  if (typeof value !== "number") return "Sem preco";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function priceLabel(item: CatalogDoc) {
  if (typeof item.priceFrom !== "number" && typeof item.priceTo !== "number") return "Sem preco";
  if (typeof item.priceFrom === "number" && typeof item.priceTo === "number" && item.priceFrom !== item.priceTo) {
    return `${money(item.priceFrom)} a ${money(item.priceTo)}`;
  }
  return money(item.priceFrom ?? item.priceTo ?? null);
}

function tagValue(tags: string[], prefix: string) {
  const found = tags.find((tag) => tag.toLowerCase().startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : "";
}

function kindFromDoc(item: CatalogDoc): CatalogKind {
  const kind = tagValue(item.tags || [], "tipo:");
  if (kind === "servico" || kind === "plano" || kind === "pacote") return kind;
  return "produto";
}

function sourceFromDoc(item: CatalogDoc) {
  return tagValue(item.tags || [], "origem:") || "manual";
}

function statusLabel(value?: Availability) {
  if (value === "seasonal") return "sazonal";
  if (value === "paused") return "pausado";
  return "ativo";
}

function statusTone(value?: Availability) {
  if (value === "paused") return "warning" as const;
  if (value === "seasonal") return "info" as const;
  return "success" as const;
}

function kindTone(kind: CatalogKind) {
  if (kind === "servico") return "ai" as const;
  if (kind === "plano") return "info" as const;
  if (kind === "pacote") return "warning" as const;
  return "success" as const;
}

function buildContent(form: FormState) {
  const sections = [
    ["Descricao para cliente", form.shortDescription],
    ["Principais beneficios", form.benefits],
    ["Duvidas frequentes", form.commonQuestions],
    ["Objecoes comuns", form.objections],
    ["Quando recomendar", form.whenRecommend],
    ["Quando chamar humano", form.whenHuman],
  ];

  return [
    `Nome: ${form.name}`,
    `Tipo: ${form.kind}`,
    form.category ? `Categoria: ${form.category}` : "",
    form.targetProfile ? `Publico ideal: ${form.targetProfile}` : "",
    ...sections
      .filter(([, value]) => value.trim())
      .map(([label, value]) => `${label}: ${value.trim()}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function tagsFromForm(form: FormState) {
  return unique([
    "catalogo",
    `tipo:${form.kind}`,
    `origem:${form.source || "manual"}`,
    form.category ? `categoria:${form.category}` : "",
    ...parseList(form.extraTags),
  ]);
}

function formFromDoc(item: CatalogDoc): FormState {
  return {
    ...EMPTY_FORM,
    kind: kindFromDoc(item),
    name: item.productName || "",
    category: item.productCategory || tagValue(item.tags || [], "categoria:"),
    priceFrom: typeof item.priceFrom === "number" ? String(item.priceFrom) : "",
    priceTo: typeof item.priceTo === "number" ? String(item.priceTo) : "",
    targetProfile: item.targetProfile || "",
    shortDescription: item.content || "",
    upsell: (item.upsellKeys || []).join(", "),
    crossSell: (item.crossSellKeys || []).join(", "),
    availability: item.availability || "active",
    source: sourceFromDoc(item),
    extraTags: (item.tags || [])
      .filter((tag) => !["catalogo"].includes(tag) && !tag.startsWith("tipo:") && !tag.startsWith("origem:") && !tag.startsWith("categoria:"))
      .join(", "),
  };
}

function isThin(item: CatalogDoc) {
  return !item.productName || !item.content || item.content.length < 120 || !(item.tags || []).length;
}

export default function ClienteProdutosServicosPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [docs, setDocs] = useState<CatalogDoc[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<CatalogKind | "all">("all");

  const canManage = hasCapability("manage_ai");

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`);
      const payload = (await res.json()) as { items?: CatalogDoc[]; error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao carregar produtos e servicos.");
      setDocs((payload.items || []).filter((item) => item.type === "catalog"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar produtos e servicos.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const active = docs.filter((item) => item.availability !== "paused").length;
    const thin = docs.filter(isThin).length;
    const withoutUpsell = docs.filter((item) => item.availability !== "paused" && !(item.upsellKeys || []).length && !(item.crossSellKeys || []).length).length;
    const imported = docs.filter((item) => sourceFromDoc(item) !== "manual").length;
    return { total: docs.length, active, thin, withoutUpsell, imported };
  }, [docs]);

  const filteredDocs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return docs
      .filter((item) => {
        const kind = kindFromDoc(item);
        if (kindFilter !== "all" && kind !== kindFilter) return false;
        if (!term) return true;
        const haystack = `${item.productName || ""} ${item.productCategory || ""} ${item.targetProfile || ""} ${item.content || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => {
        if (a.availability === "paused" && b.availability !== "paused") return 1;
        if (a.availability !== "paused" && b.availability === "paused") return -1;
        return normalizeText(a.productName || a.content).localeCompare(normalizeText(b.productName || b.content), "pt-BR");
      });
  }, [docs, kindFilter, search]);

  async function submitCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage) return;
    if (!form.name.trim()) {
      setError("Informe o nome do produto ou servico.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setNotice(null);

      const endpoint = editingDocId
        ? `/api/tenant/${tenant.tenantId}/kb-docs/${editingDocId}`
        : `/api/tenant/${tenant.tenantId}/kb-docs`;
      const method = editingDocId ? "PATCH" : "POST";
      const content = buildContent(form);

      const res = await authedFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "catalog",
          content,
          tags: tagsFromForm(form),
          serviceKey: form.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 80),
          productName: form.name.trim(),
          productCategory: form.category.trim() || null,
          targetProfile: form.targetProfile.trim() || null,
          priceFrom: numberOrNull(form.priceFrom),
          priceTo: numberOrNull(form.priceTo),
          upsellKeys: parseList(form.upsell),
          crossSellKeys: parseList(form.crossSell),
          availability: form.availability,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao salvar item.");

      setForm(EMPTY_FORM);
      setEditingDocId(null);
      setNotice(editingDocId ? "Item atualizado." : "Item cadastrado para a IA usar nas conversas.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao salvar item.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDoc(docId: string) {
    if (!tenant?.tenantId || !canManage) return;

    try {
      setBusyDocId(docId);
      setError(null);
      setNotice(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs/${docId}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao remover item.");
      if (editingDocId === docId) {
        setEditingDocId(null);
        setForm(EMPTY_FORM);
      }
      setNotice("Item removido.");
      await loadData();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Falha ao remover item.");
    } finally {
      setBusyDocId(null);
    }
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEdit(item: CatalogDoc) {
    setEditingDocId(item.id);
    setForm(formFromDoc(item));
    setError(null);
    setNotice(null);
  }

  function resetForm() {
    setEditingDocId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setNotice(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-[var(--cliente-card-text-soft)]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="client-daily-page space-y-5">
      <SectionHeader
        title="Produtos & Servicos"
        subtitle="Cadastre o que a empresa vende para a Altum responder, recomendar e identificar oportunidades com mais precisao."
        action={
          <Link
            href="/cliente/painel/conhecimento"
            className="inline-flex items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-hover)]"
          >
            Base de conhecimento
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Ativos" value={String(stats.active)} icon={CheckCircle2} trend={`${stats.total} cadastrados`} tone="success" />
        <MetricCard label="Pedem melhoria" value={String(stats.thin)} icon={Sparkles} trend="faltam detalhes para a IA" tone={stats.thin ? "warning" : "success"} />
        <MetricCard label="Sem upsell" value={String(stats.withoutUpsell)} icon={Boxes} trend="oportunidade de venda adicional" tone={stats.withoutUpsell ? "brand" : "success"} />
        <MetricCard label="Importados" value={String(stats.imported)} icon={ShoppingBag} trend="preparado para ecommerce" tone="neutral" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <PanelCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Oferta comercial" subtitle="Itens que a IA pode explicar, comparar e sugerir durante o atendimento." />
            <ClientTabs
              value={kindFilter}
              onChange={(value) => setKindFilter(value as CatalogKind | "all")}
              items={KIND_OPTIONS}
            />
          </div>

          <label className="mt-4 flex items-center gap-2 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5 text-sm text-[var(--cliente-card-text-muted)]">
            <Search className="h-4 w-4 text-[var(--cliente-primary)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, categoria, publico ou argumento"
              className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text-soft)]"
            />
          </label>

          <div className="mt-4 space-y-3">
            {filteredDocs.length ? (
              filteredDocs.map((item) => {
                const kind = kindFromDoc(item);
                const source = sourceFromDoc(item);
                return (
                  <article key={item.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StateBadge label={kind} tone={kindTone(kind)} />
                          <StateBadge label={statusLabel(item.availability)} tone={statusTone(item.availability)} />
                          {source !== "manual" ? <StateBadge label={source} tone="info" /> : null}
                          {isThin(item) ? <StateBadge label="melhorar contexto" tone="warning" /> : null}
                        </div>
                        <h3 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-[var(--cliente-card-text)]">
                          {item.productName || "Item sem nome"}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                          {[item.productCategory, priceLabel(item), item.targetProfile].filter(Boolean).join(" | ")}
                        </p>
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--cliente-card-text-muted)]">
                          {item.content || "Adicione uma descricao comercial para a IA saber explicar este item."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(item.upsellKeys || []).slice(0, 3).map((upsell) => (
                            <StateBadge key={`${item.id}_up_${upsell}`} label={`upsell: ${upsell}`} tone="ai" />
                          ))}
                          {(item.crossSellKeys || []).slice(0, 3).map((crossSell) => (
                            <StateBadge key={`${item.id}_cross_${crossSell}`} label={`cross: ${crossSell}`} tone="info" />
                          ))}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-hover)]"
                          >
                            <PencilLine className="h-4 w-4" />
                            Editar
                          </button>
                        ) : null}
                        {canManage ? (
                          <button
                            type="button"
                            disabled={busyDocId === item.id}
                            onClick={() => void removeDoc(item.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-500/15 disabled:opacity-60 dark:text-rose-100"
                          >
                            {busyDocId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Remover
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState
                title="Nenhum item encontrado"
                description="Cadastre produtos, servicos, planos ou pacotes para a IA entender melhor a oferta da empresa."
              />
            )}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5 md:p-6">
            <SectionHeader
              title={editingDocId ? "Editar item" : "Novo item"}
              subtitle="Escreva como um vendedor explicaria para um cliente. A Altum usa isso nas conversas."
            />

            {error ? (
              <p className="mb-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-100">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-100">
                {notice}
              </p>
            ) : null}

            {canManage ? (
              <form className="space-y-4" onSubmit={submitCatalog}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome" value={form.name} onChange={(value) => updateForm("name", value)} placeholder="Ex: Plano Growth" />
                  <SelectField
                    label="Tipo"
                    value={form.kind}
                    onChange={(value) => updateForm("kind", value as CatalogKind)}
                    options={[
                      { value: "produto", label: "Produto" },
                      { value: "servico", label: "Servico" },
                      { value: "plano", label: "Plano" },
                      { value: "pacote", label: "Pacote" },
                    ]}
                  />
                  <Field label="Categoria" value={form.category} onChange={(value) => updateForm("category", value)} placeholder="Ex: Atendimento" />
                  <SelectField
                    label="Status"
                    value={form.availability}
                    onChange={(value) => updateForm("availability", value as Availability)}
                    options={[
                      { value: "active", label: "Ativo" },
                      { value: "seasonal", label: "Sazonal" },
                      { value: "paused", label: "Pausado" },
                    ]}
                  />
                  <Field label="Preco inicial" value={form.priceFrom} onChange={(value) => updateForm("priceFrom", value)} placeholder="Ex: 497" />
                  <Field label="Preco final" value={form.priceTo} onChange={(value) => updateForm("priceTo", value)} placeholder="Opcional" />
                </div>

                <Field label="Publico ideal" value={form.targetProfile} onChange={(value) => updateForm("targetProfile", value)} placeholder="Ex: lojas com alto volume no WhatsApp" />
                <TextArea label="Descricao comercial" value={form.shortDescription} onChange={(value) => updateForm("shortDescription", value)} rows={4} placeholder="Explique o que e, para quem serve e qual resultado entrega." />
                <TextArea label="Beneficios" value={form.benefits} onChange={(value) => updateForm("benefits", value)} rows={3} placeholder="Liste ganhos claros para o cliente." />
                <TextArea label="Duvidas frequentes" value={form.commonQuestions} onChange={(value) => updateForm("commonQuestions", value)} rows={3} placeholder="Perguntas que aparecem antes da compra." />
                <TextArea label="Objecoes comuns" value={form.objections} onChange={(value) => updateForm("objections", value)} rows={3} placeholder="Preco, prazo, garantia, comparacao, seguranca..." />
                <TextArea label="Quando recomendar" value={form.whenRecommend} onChange={(value) => updateForm("whenRecommend", value)} rows={3} placeholder="Sinais de conversa que indicam fit." />
                <TextArea label="Quando chamar humano" value={form.whenHuman} onChange={(value) => updateForm("whenHuman", value)} rows={3} placeholder="Situacoes sensiveis, negociacao, excecoes ou reclamacoes." />

                <div className="grid gap-3 sm:grid-cols-2">
                  <TextArea label="Upsell" value={form.upsell} onChange={(value) => updateForm("upsell", value)} rows={3} placeholder="Itens para oferecer acima deste." />
                  <TextArea label="Cross-sell" value={form.crossSell} onChange={(value) => updateForm("crossSell", value)} rows={3} placeholder="Itens complementares." />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Origem" value={form.source} onChange={(value) => updateForm("source", value)} placeholder="manual, shopify..." />
                  <Field label="Tags extras" value={form.extraTags} onChange={(value) => updateForm("extraTags", value)} placeholder="whatsapp, recorrencia" />
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {editingDocId ? (
                    <ClientActionButton type="button" tone="secondary" onClick={resetForm}>
                      Cancelar
                    </ClientActionButton>
                  ) : null}
                  <ClientActionButton type="submit" tone="primary" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editingDocId ? "Atualizar" : "Salvar"}
                  </ClientActionButton>
                </div>
              </form>
            ) : (
              <EmptyState title="Somente leitura" description="Sua conta pode consultar produtos e servicos, mas nao tem permissao para editar esta base." />
            )}
          </PanelCard>

          <PanelCard tone="ai" className="p-5">
            <CardTitle title="Como a Altum usa isso" subtitle="Esses itens alimentam respostas no WhatsApp, sugestoes de venda, upsell e futuras integracoes de ecommerce." />
            <div className="mt-4 grid gap-2">
              <UseRow icon={Package} title="Conversas" description="Responde duvidas e recomenda o item certo." />
              <UseRow icon={Sparkles} title="Campanhas" description="Ajuda a criar ofertas para publicos com mais chance de comprar." />
              <UseRow icon={ShoppingBag} title="Ecommerce" description="Produtos importados entram aqui como fonte da IA." />
            </div>
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="client-input mt-2 w-full rounded-xl border px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none placeholder:text-[var(--cliente-card-text-soft)]"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="client-input mt-2 w-full resize-y rounded-xl border px-3 py-2.5 text-sm font-normal normal-case leading-6 tracking-normal outline-none placeholder:text-[var(--cliente-card-text-soft)]"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="client-input mt-2 w-full rounded-xl border px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function UseRow({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Package;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
        <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{description}</p>
      </div>
    </div>
  );
}
