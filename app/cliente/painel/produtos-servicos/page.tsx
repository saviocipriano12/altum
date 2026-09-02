"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Boxes,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  ImageIcon,
  Layers3,
  Loader2,
  Package,
  PencilLine,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CardTitle,
  ClientTabs,
  EmptyState,
  MetricCard,
  PanelCard,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type CatalogKind = "produto" | "servico" | "plano" | "pacote";
type Availability = "active" | "seasonal" | "paused";
type MediaType = "image" | "video" | "document";
type MediaItem = {
  mediaUrl: string;
  mediaType: MediaType;
  mediaTitle?: string | null;
  mediaStoragePath?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  usage?: "auto" | "suggest" | "blocked";
};

type CatalogDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  mediaTitle?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  mediaItems?: MediaItem[];
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

function compactContent(value: string) {
  return value
    .replace(/^Nome:.*$/gim, "")
    .replace(/^Tipo:.*$/gim, "")
    .replace(/^Categoria:.*$/gim, "")
    .replace(/^Publico ideal:.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isThin(item: CatalogDoc) {
  return !item.productName || !item.content || item.content.length < 160 || !(item.tags || []).length || !item.targetProfile;
}

function mediaIcon(type?: MediaType | null) {
  if (type === "image") return ImageIcon;
  if (type === "video") return Video;
  if (type === "document") return FileText;
  return Package;
}

function mediaCount(item: CatalogDoc) {
  return Array.isArray(item.mediaItems) && item.mediaItems.length ? item.mediaItems.length : item.mediaUrl ? 1 : 0;
}

export default function ClienteProdutosServicosPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [docs, setDocs] = useState<CatalogDoc[]>([]);
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
    const withMedia = docs.filter((item) => mediaCount(item) > 0).length;
    const imported = docs.filter((item) => sourceFromDoc(item) !== "manual").length;
    const withoutOfferPath = docs.filter((item) => item.availability !== "paused" && !(item.upsellKeys || []).length && !(item.crossSellKeys || []).length).length;
    const withPrice = docs.filter((item) => typeof item.priceFrom === "number" || typeof item.priceTo === "number").length;
    const aiReady = docs.filter((item) => item.availability !== "paused" && !isThin(item) && mediaCount(item) > 0 && (typeof item.priceFrom === "number" || typeof item.priceTo === "number")).length;
    const readinessScore = active ? Math.round((aiReady / active) * 100) : 0;
    return { total: docs.length, active, thin, withMedia, imported, withoutOfferPath, withPrice, aiReady, readinessScore };
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
        if (isThin(a) && !isThin(b)) return -1;
        if (!isThin(a) && isThin(b)) return 1;
        return normalizeText(a.productName || a.content).localeCompare(normalizeText(b.productName || b.content), "pt-BR");
      });
  }, [docs, kindFilter, search]);

  const strongestItems = useMemo(
    () => docs.filter((item) => item.availability !== "paused" && mediaCount(item) > 0 && !isThin(item)).slice(0, 3),
    [docs]
  );

  async function removeDoc(docId: string) {
    if (!tenant?.tenantId || !canManage) return;

    try {
      setBusyDocId(docId);
      setError(null);
      setNotice(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs/${docId}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao remover item.");
      setNotice("Item removido do catalogo.");
      await loadData();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Falha ao remover item.");
    } finally {
      setBusyDocId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-[var(--cliente-card-text-soft)]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="produtos-refined client-daily-page space-y-4">
      <section className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_20%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_12%,var(--cliente-card)),var(--cliente-card)_52%,color-mix(in_srgb,var(--cliente-success)_8%,var(--cliente-card)))] p-4 shadow-[var(--cliente-shadow-soft)] md:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge label="Oferta comercial" tone="info" />
              <StateBadge label="IA pronta para vender" tone="ai" />
            </div>
            <h1 className="mt-4 max-w-3xl text-2xl font-black leading-tight tracking-normal text-[var(--cliente-card-text)] md:text-3xl">
              Produtos, servicos e ofertas que a IA consegue vender.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-muted)]">
              Nome, preco, publico, materiais e proximas ofertas em uma base comercial simples.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {canManage ? (
                <>
                  <Link
                    href="/cliente/painel/produtos-servicos/novo"
                    className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white shadow-[var(--cliente-shadow-soft)] transition hover:-translate-y-0.5 hover:bg-[var(--cliente-primary-hover)]"
                  >
                    <Plus className="h-4 w-4" />
                    Cadastrar oferta
                  </Link>
                  <Link
                    href="/cliente/painel/produtos-servicos/importar"
                    className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_28%,var(--cliente-border))] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-primary)] transition hover:-translate-y-0.5 hover:bg-[var(--cliente-primary-soft)]"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Importar catálogo
                  </Link>
                </>
              ) : null}
              <Link
                href="/cliente/painel/conhecimento"
                className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,var(--cliente-primary)_28%,var(--cliente-border))]"
              >
                Ensinar a IA
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <HeroSignal label="Itens ativos" value={String(stats.active)} detail={`${stats.total} no catalogo`} icon={CheckCircle2} tone="success" />
            <HeroSignal label="Com material" value={String(stats.withMedia)} detail="imagem, video ou doc" icon={ImageIcon} tone="info" />
            <HeroSignal label="A melhorar" value={String(stats.thin)} detail="falta contexto comercial" icon={Sparkles} tone={stats.thin ? "warning" : "success"} />
            <HeroSignal label="Importados" value={String(stats.imported)} detail="arquivos e integrações" icon={ShoppingBag} tone="neutral" />
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
          {notice}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="IA venderia" value={`${stats.readinessScore}%`} icon={Bot} trend={`${stats.aiReady} oferta(s) prontas`} tone={stats.readinessScore >= 70 ? "success" : "warning"} />
        <MetricCard label="Materiais" value={String(stats.withMedia)} icon={FileText} trend="podem apoiar a conversa" tone="brand" />
        <MetricCard label="Sem trilha" value={String(stats.withoutOfferPath)} icon={Boxes} trend="sem upsell ou complemento" tone={stats.withoutOfferPath ? "warning" : "success"} />
        <MetricCard label="Precisam contexto" value={String(stats.thin)} icon={Sparkles} trend="melhore a recomendacao da IA" tone={stats.thin ? "warning" : "success"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <PanelCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Oferta comercial" subtitle="Produtos, servicos, planos e pacotes que sustentam atendimento, campanhas e venda." />
            <ClientTabs value={kindFilter} onChange={(value) => setKindFilter(value as CatalogKind | "all")} items={KIND_OPTIONS} />
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5 text-sm text-[var(--cliente-card-text-muted)] transition focus-within:border-[color:color-mix(in_srgb,var(--cliente-primary)_40%,var(--cliente-border))]">
              <Search className="h-4 w-4 text-[var(--cliente-primary)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, categoria, publico ou argumento"
                className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text-soft)]"
              />
            </label>
            {canManage ? (
              <Link
                href="/cliente/painel/produtos-servicos/novo?tipo=servico"
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,var(--cliente-border))] bg-[var(--cliente-ai-soft)] px-4 py-3 text-sm font-bold text-[var(--cliente-ai)] transition hover:-translate-y-0.5 hover:border-[var(--cliente-ai)]"
              >
                <Plus className="h-4 w-4" />
                Cadastrar servico
              </Link>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 2xl:grid-cols-2">
            {filteredDocs.length ? (
              filteredDocs.map((item) => {
                const kind = kindFromDoc(item);
                const source = sourceFromDoc(item);
                const primaryMedia = item.mediaItems?.[0];
                const totalMedia = mediaCount(item);
                const MediaIcon = mediaIcon(primaryMedia?.mediaType || item.mediaType);
                return (
                  <article
                    key={item.id}
                    className="group overflow-hidden rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-soft)] transition hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,var(--cliente-primary)_26%,var(--cliente-border))]"
                  >
                    <div className="border-b border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StateBadge label={kind} tone={kindTone(kind)} />
                        <StateBadge label={statusLabel(item.availability)} tone={statusTone(item.availability)} />
                        {source !== "manual" ? <StateBadge label={source} tone="info" /> : null}
                        {isThin(item) ? <StateBadge label="melhorar" tone="warning" /> : null}
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_16%,var(--cliente-border))] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]">
                          <MediaIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link href={`/cliente/painel/produtos-servicos/${item.id}`} className="block truncate text-base font-black tracking-normal text-[var(--cliente-card-text)] hover:text-[var(--cliente-primary)]">
                            {item.productName || "Item sem nome"}
                          </Link>
                          <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--cliente-card-text-muted)]">
                            {[item.productCategory, priceLabel(item), item.targetProfile].filter(Boolean).join(" | ")}
                          </p>
                        </div>
                      </div>

                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-[var(--cliente-card-text-muted)]">
                        {compactContent(item.content) || "Adicione descricao, beneficios e criterios de recomendacao para este item ficar utilizavel pela IA."}
                      </p>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <MiniInfo label="Material" value={totalMedia ? `${totalMedia} arquivo(s)` : "Nao vinculado"} tone={totalMedia ? "info" : "neutral"} />
                        <MiniInfo label="Venda adicional" value={[...(item.upsellKeys || []), ...(item.crossSellKeys || [])].length ? "Configurada" : "Pendente"} tone={[...(item.upsellKeys || []), ...(item.crossSellKeys || [])].length ? "success" : "warning"} />
                      </div>

                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/cliente/painel/produtos-servicos/${item.id}`}
                          className="inline-flex items-center gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--cliente-primary)_22%,var(--cliente-border))] bg-[var(--cliente-primary-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-primary)] transition hover:border-[var(--cliente-primary)]"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                          Ver ficha
                        </Link>
                        {canManage ? (
                          <Link
                            href={`/cliente/painel/produtos-servicos/novo?docId=${item.id}`}
                            className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:border-[color:color-mix(in_srgb,var(--cliente-primary)_28%,var(--cliente-border))] hover:bg-[var(--cliente-surface-hover)]"
                          >
                            <PencilLine className="h-4 w-4" />
                            Editar
                          </Link>
                        ) : null}
                        {canManage ? (
                          <button
                            type="button"
                            disabled={busyDocId === item.id}
                            onClick={() => void removeDoc(item.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-500/15 disabled:opacity-60 dark:text-rose-100"
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
                action={
                  canManage ? (
                    <Link href="/cliente/painel/produtos-servicos/novo" className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white">
                      <Plus className="h-4 w-4" />
                      Cadastrar primeiro item
                    </Link>
                  ) : null
                }
              />
            )}
          </div>
        </PanelCard>

        <aside className="space-y-4">
          <PanelCard tone={stats.readinessScore >= 70 ? "success" : "warning"} className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
                <Bot className="h-5 w-5" />
              </span>
              <CardTitle title="Prontidao da IA" subtitle={`${stats.aiReady} de ${stats.active} oferta(s) ativas estao prontas para venda assistida.`} />
            </div>
            <div className="mt-4 space-y-2">
              <ReadinessRow label="Descricao e publico" done={stats.thin === 0 && stats.active > 0} detail={stats.thin ? `${stats.thin} item(ns) precisam contexto.` : "Contexto suficiente para recomendar."} />
              <ReadinessRow label="Preco ou faixa" done={stats.withPrice >= stats.active && stats.active > 0} detail={`${stats.withPrice} item(ns) com preco informado.`} />
              <ReadinessRow label="Material de apoio" done={stats.withMedia >= stats.active && stats.active > 0} detail={`${stats.withMedia} item(ns) com imagem, video ou documento.`} />
              <ReadinessRow label="Trilha de venda" done={stats.withoutOfferPath === 0 && stats.active > 0} detail={stats.withoutOfferPath ? `${stats.withoutOfferPath} sem upsell ou complemento.` : "Proximas ofertas configuradas."} />
            </div>
          </PanelCard>

          <PanelCard tone="ai" className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
                <Bot className="h-5 w-5" />
              </span>
              <CardTitle title="Como a Altum vende melhor" subtitle="A IA usa este catalogo para responder duvidas, sugerir ofertas e anexar material quando fizer sentido." />
            </div>
            <div className="mt-4 space-y-2">
              <UseRow icon={Sparkles} title="Recomendacao" description="Indica produto ou servico pelo contexto do cliente." />
              <UseRow icon={ImageIcon} title="Materiais" description="Imagens, videos e documentos viram apoio de venda." />
              <UseRow icon={Layers3} title="Oferta" description="Upsell e cross-sell deixam a proxima acao clara." />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Prontos para venda" subtitle="Itens com contexto e material para a IA usar com seguranca." />
            <div className="mt-4 space-y-3">
              {strongestItems.length ? (
                strongestItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/cliente/painel/produtos-servicos/novo?docId=${item.id}`}
                    className="block rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 transition hover:border-[color:color-mix(in_srgb,var(--cliente-primary)_28%,var(--cliente-border))] hover:bg-[var(--cliente-surface-hover)]"
                  >
                    <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{item.productName || "Item sem nome"}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{mediaCount(item)} material(is) pronto(s) para conversa</p>
                  </Link>
                ))
              ) : (
                <p className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-sm text-[var(--cliente-card-text-muted)]">
                  Adicione contexto e um material principal nos itens ativos.
                </p>
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Proxima melhoria" subtitle="Comece pelos itens que mais vendem ou geram duvidas no WhatsApp." />
            <div className="mt-4 flex flex-wrap gap-2">
              <StateBadge label={`${stats.thin} precisam contexto`} tone={stats.thin ? "warning" : "success"} />
              <StateBadge label={`${stats.withoutOfferPath} sem trilha`} tone={stats.withoutOfferPath ? "warning" : "success"} />
              <StateBadge label={`${stats.withMedia} com midia`} tone="info" />
            </div>
          </PanelCard>
        </aside>
      </section>
    </div>
  );
}

function HeroSignal({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Package;
  tone: "success" | "info" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200"
      : tone === "warning"
        ? "border-amber-500/24 bg-amber-500/12 text-amber-700 dark:text-amber-200"
        : tone === "info"
          ? "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-200"
          : "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text)]";

  return (
    <div className={`rounded-[18px] border p-3 shadow-[var(--cliente-shadow-soft)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-normal opacity-75">{label}</p>
          <p className="mt-2 text-2xl font-black leading-none tracking-normal">{value}</p>
          <p className="mt-2 text-xs opacity-75">{detail}</p>
        </div>
        <Icon className="h-5 w-5 opacity-80" />
      </div>
    </div>
  );
}

function MiniInfo({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "info" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "border-[color:color-mix(in_srgb,var(--cliente-success)_20%,transparent)] bg-[var(--cliente-success-soft)]"
      : tone === "warning"
        ? "border-[color:color-mix(in_srgb,var(--cliente-warning)_20%,transparent)] bg-[var(--cliente-warning-soft)]"
        : tone === "info"
          ? "border-[color:color-mix(in_srgb,var(--cliente-primary)_20%,transparent)] bg-[var(--cliente-primary-soft)]"
          : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]";

  return (
    <div className={`rounded-[16px] border px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-1 truncate text-xs font-bold text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}

function ReadinessRow({ label, done, detail }: { label: string; done: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
          done
            ? "border-[color:color-mix(in_srgb,var(--cliente-success)_20%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]"
            : "border-[color:color-mix(in_srgb,var(--cliente-warning)_20%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]"
        }`}
      >
        <CheckCircle2 className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--cliente-card-text)]">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-muted)]">{detail}</p>
      </div>
    </div>
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
    <div className="flex items-start gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-bold text-[var(--cliente-card-text)]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-muted)]">{description}</p>
      </div>
    </div>
  );
}
