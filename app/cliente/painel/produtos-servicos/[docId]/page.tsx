"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Edit3,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Package,
  Send,
  Video,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, ClientActionButton, EmptyState, PanelCard, StateBadge } from "@/app/cliente/painel/components/ui";

type CatalogKind = "produto" | "servico" | "plano" | "pacote";
type Availability = "active" | "seasonal" | "paused";
type MediaType = "image" | "video" | "document";
type MediaUsage = "auto" | "suggest" | "blocked";

type MediaItem = {
  mediaUrl: string;
  mediaType: MediaType;
  mediaTitle?: string | null;
  mediaStoragePath?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  usage?: MediaUsage;
};

type CatalogDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  mediaTitle?: string | null;
  mediaStoragePath?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  mediaItems?: MediaItem[];
  serviceKey?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  targetProfile?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  currency?: string | null;
  sku?: string | null;
  inventoryQuantity?: number | null;
  checkoutUrl?: string | null;
  upsellKeys?: string[];
  crossSellKeys?: string[];
  upsellOfferIds?: string[];
  crossSellOfferIds?: string[];
  priority?: number | null;
  availability?: Availability;
};

function tagValue(tags: string[], prefix: string) {
  const found = tags.find((tag) => tag.toLowerCase().startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : "";
}

function kindFromDoc(item: CatalogDoc): CatalogKind {
  const kind = tagValue(item.tags || [], "tipo:");
  if (kind === "servico" || kind === "plano" || kind === "pacote") return kind;
  return "produto";
}

function money(value?: number | null, currency = "BRL") {
  if (typeof value !== "number") return "Sem preco";
  return value.toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });
}

function priceLabel(item: CatalogDoc) {
  if (typeof item.priceFrom !== "number" && typeof item.priceTo !== "number") return "Sem preco";
  if (typeof item.priceFrom === "number" && typeof item.priceTo === "number" && item.priceFrom !== item.priceTo) {
    return `${money(item.priceFrom, item.currency || "BRL")} a ${money(item.priceTo, item.currency || "BRL")}`;
  }
  return money(item.priceFrom ?? item.priceTo ?? null, item.currency || "BRL");
}

function mediaLabel(type?: MediaType | null) {
  if (type === "image") return "Imagem";
  if (type === "video") return "Video";
  if (type === "document") return "Documento";
  return "Material";
}

function usageLabel(value?: MediaUsage) {
  if (value === "auto") return "pode enviar";
  if (value === "blocked") return "interno";
  return "sugerir";
}

function mediaItemsFromDoc(item: CatalogDoc): MediaItem[] {
  if (Array.isArray(item.mediaItems) && item.mediaItems.length) return item.mediaItems;
  if (item.mediaUrl && item.mediaType) {
    return [
      {
        mediaUrl: item.mediaUrl,
        mediaType: item.mediaType,
        mediaTitle: item.mediaTitle,
        mediaStoragePath: item.mediaStoragePath,
        mediaMimeType: item.mediaMimeType,
        mediaSize: item.mediaSize,
        usage: "suggest",
      },
    ];
  }
  return [];
}

function qualityChecks(item: CatalogDoc) {
  const materials = mediaItemsFromDoc(item);
  return [
    { label: "Nome claro", done: Boolean(item.productName) },
    { label: "Publico ideal", done: Boolean(item.targetProfile) },
    { label: "Descricao comercial", done: item.content.length > 160 },
    { label: "Material de apoio", done: materials.length > 0 },
    { label: "Pode enviar material", done: materials.some((media) => media.usage === "auto") },
    { label: "Estoque confirmado", done: kindFromDoc(item) !== "produto" || typeof item.inventoryQuantity === "number" },
    { label: "Venda adicional", done: Boolean((item.upsellOfferIds || []).length || (item.crossSellOfferIds || []).length || (item.upsellKeys || []).length || (item.crossSellKeys || []).length) },
  ];
}

export default function ProdutoServicoDetalhePage() {
  const params = useParams<{ docId: string }>();
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<CatalogDoc | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogDoc[]>([]);
  const [testPrompt, setTestPrompt] = useState("Cliente perguntou preco e pediu uma foto antes de decidir.");
  const [testAnswer, setTestAnswer] = useState("");
  const [runningTest, setRunningTest] = useState(false);

  const canManage = hasCapability("manage_ai");
  const docId = String(params?.docId || "");

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId || !docId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`);
      const payload = (await res.json()) as { items?: CatalogDoc[]; error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao carregar ficha.");
      const items = payload.items || [];
      setCatalogItems(items.filter((doc) => doc.type === "catalog"));
      const found = items.find((doc) => doc.id === docId && doc.type === "catalog");
      if (!found) throw new Error("Item nao encontrado no catalogo.");
      setItem(found);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar ficha.");
    } finally {
      setLoading(false);
    }
  }, [docId, tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const mediaItems = useMemo(() => (item ? mediaItemsFromDoc(item) : []), [item]);
  const checks = useMemo(() => (item ? qualityChecks(item) : []), [item]);
  const offerNameById = useMemo(() => new Map(catalogItems.map((offer) => [offer.id, offer.productName || "Oferta sem nome"])), [catalogItems]);
  const score = checks.length ? Math.round((checks.filter((check) => check.done).length / checks.length) * 100) : 0;

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-[var(--cliente-card-text-soft)]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="client-daily-page">
        <EmptyState title="Ficha nao encontrada" description={error || "Este item nao esta disponivel."} />
      </div>
    );
  }

  const kind = kindFromDoc(item);
  const upsellItems = (item.upsellOfferIds || []).map((id) => offerNameById.get(id)).filter((name): name is string => Boolean(name));
  const crossSellItems = (item.crossSellOfferIds || []).map((id) => offerNameById.get(id)).filter((name): name is string => Boolean(name));

  async function runRealPreview() {
    if (!tenant?.tenantId || !testPrompt.trim()) return;
    setRunningTest(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/ai-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testPrompt.trim() }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; preview?: { responseText?: string } };
      if (!res.ok || !payload.preview?.responseText) throw new Error(payload.error || "A IA nao gerou uma resposta para este teste.");
      setTestAnswer(payload.preview.responseText);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Falha ao testar a resposta da IA.");
    } finally {
      setRunningTest(false);
    }
  }

  return (
    <div className="produtos-refined client-daily-page space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/cliente/painel/produtos-servicos" className="inline-flex items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
          <ArrowLeft className="h-4 w-4" />
          Catalogo
        </Link>
        {canManage ? (
          <Link href={`/cliente/painel/produtos-servicos/novo?docId=${item.id}`} className="inline-flex items-center gap-2 rounded-[14px] bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--cliente-primary-hover)]">
            <Edit3 className="h-4 w-4" />
            Editar ficha
          </Link>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_20%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_12%,var(--cliente-card)),var(--cliente-card)_52%,color-mix(in_srgb,var(--cliente-success)_8%,var(--cliente-card)))] p-4 shadow-[var(--cliente-shadow-soft)] md:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="flex flex-wrap gap-2">
              <StateBadge label={kind} tone={kind === "servico" ? "ai" : "success"} />
              <StateBadge label={item.availability === "paused" ? "pausado" : "ativo"} tone={item.availability === "paused" ? "warning" : "success"} />
              <StateBadge label={`${score}% pronto`} tone={score > 75 ? "success" : "warning"} />
            </div>
            <h1 className="mt-4 text-2xl font-black leading-tight tracking-normal text-[var(--cliente-card-text)] md:text-3xl">
              {item.productName || "Item sem nome"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--cliente-card-text-muted)]">
              {[item.productCategory, priceLabel(item), item.targetProfile].filter(Boolean).join(" | ")}
            </p>
          </div>
          <PanelCard className="p-5">
            <CardTitle title="Saude da ficha" subtitle="O que falta para a Altum usar com mais seguranca." />
            <div className="mt-4 space-y-2">
              {checks.map((check) => (
                <QualityRow key={check.label} done={check.done} label={check.label} />
              ))}
            </div>
          </PanelCard>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <PanelCard className="p-5 md:p-6">
            <CardTitle title="Leitura comercial" subtitle="Resumo para atendente, gestor e Assistente Altum." />
            <div className="mt-4 whitespace-pre-line rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-sm leading-7 text-[var(--cliente-card-text-muted)]">
              {item.content || "Sem descricao comercial cadastrada."}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <FactBox label="Preco" value={priceLabel(item)} />
              <FactBox label="SKU" value={item.sku || "Nao informado"} />
              <FactBox
                label="Estoque"
                value={kind === "produto" ? (typeof item.inventoryQuantity === "number" ? `${item.inventoryQuantity} unidade(s)` : "Confirmar antes de vender") : "Nao se aplica"}
              />
              <FactBox label="Conclusao" value={item.checkoutUrl ? "Link de compra pronto" : "Conducao manual"} />
            </div>
            {item.checkoutUrl ? (
              <a href={item.checkoutUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-[14px] border border-[color:color-mix(in_srgb,var(--cliente-success)_24%,var(--cliente-border))] bg-[var(--cliente-success-soft)] px-3 py-2 text-sm font-bold text-[var(--cliente-success)]">
                Abrir link de compra ou contratacao
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </PanelCard>

          <PanelCard className="p-5 md:p-6">
            <CardTitle title="Materiais de apoio" subtitle="Arquivos que podem ser usados no atendimento e em propostas." />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {mediaItems.length ? (
                mediaItems.map((media, index) => (
                  <MaterialCard key={`${media.mediaUrl}_${index}`} media={media} main={index === 0} />
                ))
              ) : (
                <EmptyState title="Sem materiais" description="Adicione imagem, video ou documento na edicao da ficha." />
              )}
            </div>
          </PanelCard>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PanelCard tone="ai" className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
                <Bot className="h-5 w-5" />
              </span>
              <CardTitle title="Testar resposta da Altum" subtitle="Executa o mesmo motor da IA, sem enviar mensagem ao cliente." />
            </div>
            <textarea
              value={testPrompt}
              onChange={(event) => setTestPrompt(event.target.value)}
              rows={4}
              className="client-input mt-4 w-full resize-y rounded-[18px] border px-3 py-3 text-sm leading-6 outline-none"
              placeholder="Ex: cliente pediu preco, garantia e uma foto"
            />
            <ClientActionButton type="button" tone="ai" className="mt-3 w-full" disabled={runningTest || !testPrompt.trim()} onClick={() => void runRealPreview()}>
              {runningTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {runningTest ? "Testando motor real" : "Testar motor real"}
            </ClientActionButton>
            <div className="mt-4 whitespace-pre-line rounded-[22px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,var(--cliente-border))] bg-[var(--cliente-card)] p-4 text-sm leading-6 text-[var(--cliente-card-text-muted)]">
              {testAnswer || "Escreva uma pergunta e rode o teste. O resultado usa as configuracoes e a base real desta empresa."}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Venda adicional" subtitle="Caminhos para aumentar ticket sem forcar a conversa." />
            <div className="mt-4 space-y-3">
              <OfferBox label="Upsell" items={upsellItems.length ? upsellItems : item.upsellKeys || []} />
              <OfferBox label="Complementos" items={crossSellItems.length ? crossSellItems : item.crossSellKeys || []} />
            </div>
          </PanelCard>
        </aside>
      </section>
    </div>
  );
}

function QualityRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${done ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" : "border-amber-500/20 bg-amber-500/10 text-amber-700"}`}>
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm font-semibold text-[var(--cliente-card-text-muted)]">{label}</p>
    </div>
  );
}

function FactBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}

function MaterialCard({ media, main }: { media: MediaItem; main: boolean }) {
  return (
    <a href={media.mediaUrl} target="_blank" rel="noreferrer" className="group block rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,var(--cliente-primary)_28%,var(--cliente-border))] hover:bg-[var(--cliente-surface-hover)]">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,var(--cliente-border))] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]">
          <MaterialIcon type={media.mediaType} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-black text-[var(--cliente-card-text)]">{media.mediaTitle || mediaLabel(media.mediaType)}</p>
            {main ? <StateBadge label="principal" tone="info" /> : null}
          </div>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{mediaLabel(media.mediaType)} | {usageLabel(media.usage)}</p>
        </div>
      </div>
    </a>
  );
}

function MaterialIcon({ type }: { type?: MediaType | null }) {
  if (type === "image") return <ImageIcon className="h-5 w-5" />;
  if (type === "video") return <Video className="h-5 w-5" />;
  if (type === "document") return <FileText className="h-5 w-5" />;
  return <Package className="h-5 w-5" />;
}

function OfferBox({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length ? items.map((item) => <StateBadge key={item} label={item} tone="ai" />) : <span className="text-sm text-[var(--cliente-card-text-muted)]">Nao configurado</span>}
      </div>
    </div>
  );
}
