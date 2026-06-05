"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  ImageIcon,
  Info,
  Loader2,
  Package,
  PlayCircle,
  Save,
  Sparkles,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CardTitle,
  ClientActionButton,
  EmptyState,
  PanelCard,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

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
  upsellKeys?: string[];
  crossSellKeys?: string[];
  priority?: number | null;
  availability?: Availability;
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
  productSpecs: string;
  stockDelivery: string;
  warranty: string;
  serviceScope: string;
  duration: string;
  schedulingRules: string;
  deliverables: string;
  upsell: string;
  crossSell: string;
  availability: Availability;
  source: string;
  extraTags: string;
  mediaUrl: string;
  mediaType: MediaType | "";
  mediaTitle: string;
  mediaStoragePath: string;
  mediaMimeType: string;
  mediaSize: number | null;
  mediaItems: MediaItem[];
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
  productSpecs: "",
  stockDelivery: "",
  warranty: "",
  serviceScope: "",
  duration: "",
  schedulingRules: "",
  deliverables: "",
  upsell: "",
  crossSell: "",
  availability: "active",
  source: "manual",
  extraTags: "",
  mediaUrl: "",
  mediaType: "",
  mediaTitle: "",
  mediaStoragePath: "",
  mediaMimeType: "",
  mediaSize: null,
  mediaItems: [],
};

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

function formFromDoc(item: CatalogDoc): FormState {
  const mediaItems = Array.isArray(item.mediaItems) && item.mediaItems.length
    ? item.mediaItems
    : item.mediaUrl && item.mediaType
      ? [
          {
            mediaUrl: item.mediaUrl,
            mediaType: item.mediaType,
            mediaTitle: item.mediaTitle,
            mediaStoragePath: item.mediaStoragePath,
            mediaMimeType: item.mediaMimeType,
            mediaSize: item.mediaSize,
            usage: "suggest" as const,
          },
        ]
      : [];
  const mainMedia = mediaItems[0];

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
    mediaUrl: mainMedia?.mediaUrl || item.mediaUrl || "",
    mediaType: mainMedia?.mediaType || item.mediaType || "",
    mediaTitle: mainMedia?.mediaTitle || item.mediaTitle || "",
    mediaStoragePath: mainMedia?.mediaStoragePath || item.mediaStoragePath || "",
    mediaMimeType: mainMedia?.mediaMimeType || item.mediaMimeType || "",
    mediaSize: typeof mainMedia?.mediaSize === "number" ? mainMedia.mediaSize : typeof item.mediaSize === "number" ? item.mediaSize : null,
    mediaItems,
  };
}

function tagsFromForm(form: FormState) {
  return unique([
    "catalogo",
    `tipo:${form.kind}`,
    `origem:${form.source || "manual"}`,
    form.category ? `categoria:${form.category}` : "",
    form.mediaType ? `midia:${form.mediaType}` : "",
    ...parseList(form.extraTags),
  ]);
}

function buildContent(form: FormState) {
  const kindLabel = form.kind === "produto" ? "produto" : "servico";
  const productSections =
    form.kind === "produto"
      ? [
          ["Especificacoes", form.productSpecs],
          ["Estoque, entrega e envio", form.stockDelivery],
          ["Garantia e troca", form.warranty],
        ]
      : [
          ["Escopo do servico", form.serviceScope],
          ["Duracao ou prazo", form.duration],
          ["Agenda e regras de atendimento", form.schedulingRules],
          ["Entregaveis", form.deliverables],
        ];

  const sections = [
    ["Descricao para cliente", form.shortDescription],
    ["Principais beneficios", form.benefits],
    ...productSections,
    ["Duvidas frequentes", form.commonQuestions],
    ["Objecoes comuns", form.objections],
    ["Quando recomendar", form.whenRecommend],
    ["Quando chamar humano", form.whenHuman],
    form.mediaItems.length
      ? ["Materiais para conversa", form.mediaItems.map((item) => `${item.mediaTitle || "Material"} (${mediaLabel(item.mediaType)} - ${usageLabel(item.usage || "suggest")})`).join("; ")]
      : form.mediaUrl
        ? ["Material para conversa", `${form.mediaTitle || "Midia cadastrada"} (${form.mediaType || "midia"})`]
        : ["Material para conversa", ""],
  ];

  return [
    `Nome: ${form.name}`,
    `Tipo: ${kindLabel}`,
    form.category ? `Categoria: ${form.category}` : "",
    form.targetProfile ? `Publico ideal: ${form.targetProfile}` : "",
    ...sections
      .filter(([, value]) => value.trim())
      .map(([label, value]) => `${label}: ${value.trim()}`),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1580);
}

function serviceKeyFromName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 80);
}

function mediaSizeLabel(value: number | null) {
  if (!value) return "";
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function mediaLabel(type: MediaType | "") {
  if (type === "image") return "Imagem";
  if (type === "video") return "Video";
  if (type === "document") return "Documento";
  return "Material";
}

function usageLabel(value: MediaUsage) {
  if (value === "auto") return "pode enviar";
  if (value === "blocked") return "somente interno";
  return "sugerir ao atendente";
}

function normalizeMediaItems(items: MediaItem[]) {
  return items
    .filter((item) => item.mediaUrl && item.mediaType)
    .slice(0, 12)
    .map((item) => ({
      mediaUrl: item.mediaUrl,
      mediaType: item.mediaType,
      mediaTitle: item.mediaTitle || null,
      mediaStoragePath: item.mediaStoragePath || null,
      mediaMimeType: item.mediaMimeType || null,
      mediaSize: typeof item.mediaSize === "number" ? item.mediaSize : null,
      usage: item.usage || "suggest",
    }));
}

export default function NovoProdutoServicoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenant, hasCapability } = useClienteTenant();
  const docId = searchParams.get("docId") || "";
  const initialKind = searchParams.get("tipo") === "servico" ? "servico" : "produto";

  const [loading, setLoading] = useState(Boolean(docId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({ ...EMPTY_FORM, kind: initialKind }));

  const canManage = hasCapability("manage_ai");
  const isServiceMode = form.kind === "servico" || form.kind === "plano" || form.kind === "pacote";

  const loadDoc = useCallback(async () => {
    if (!tenant?.tenantId || !docId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`);
      const payload = (await res.json()) as { items?: CatalogDoc[]; error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao carregar item.");
      const found = (payload.items || []).find((item) => item.id === docId && item.type === "catalog");
      if (!found) throw new Error("Item nao encontrado no catalogo.");
      setForm(formFromDoc(found));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar item.");
    } finally {
      setLoading(false);
    }
  }, [docId, tenant?.tenantId]);

  useEffect(() => {
    void loadDoc();
  }, [loadDoc]);

  useEffect(() => {
    if (!docId) setForm((current) => ({ ...current, kind: initialKind }));
  }, [docId, initialKind]);

  const completion = useMemo(() => {
    const checks = [
      Boolean(form.name.trim()),
      Boolean(form.category.trim()),
      Boolean(form.targetProfile.trim()),
      Boolean(form.shortDescription.trim()),
      Boolean(form.benefits.trim()),
      Boolean(form.whenRecommend.trim()),
      Boolean(form.mediaItems.length || form.mediaUrl),
      Boolean(parseList(form.upsell).length || parseList(form.crossSell).length),
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [form]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function removeMediaItem(mediaUrl: string) {
    setForm((current) => {
      const mediaItems = current.mediaItems.filter((item) => item.mediaUrl !== mediaUrl);
      const mainMedia = mediaItems[0];
      return {
        ...current,
        mediaItems,
        mediaUrl: mainMedia?.mediaUrl || "",
        mediaType: mainMedia?.mediaType || "",
        mediaTitle: mainMedia?.mediaTitle || "",
        mediaStoragePath: mainMedia?.mediaStoragePath || "",
        mediaMimeType: mainMedia?.mediaMimeType || "",
        mediaSize: typeof mainMedia?.mediaSize === "number" ? mainMedia.mediaSize : null,
      };
    });
  }

  function updateMediaUsage(mediaUrl: string, usage: MediaUsage) {
    setForm((current) => ({
      ...current,
      mediaItems: current.mediaItems.map((item) => (item.mediaUrl === mediaUrl ? { ...item, usage } : item)),
    }));
  }

  async function handleMediaUpload(file: File | null) {
    if (!tenant?.tenantId || !file || !canManage) return;

    setUploading(true);
    setError(null);
    setNotice(null);

    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      if (form.mediaTitle.trim()) uploadForm.append("title", form.mediaTitle.trim());

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs/media/upload`, {
        method: "POST",
        body: uploadForm,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        media?: {
          mediaUrl?: string;
          mediaStoragePath?: string;
          mediaType?: MediaType;
          mediaMimeType?: string;
          mediaSize?: number;
          mediaTitle?: string;
        };
      };

      if (!res.ok || !payload.media?.mediaUrl) {
        setError(payload.error || "Falha ao subir midia.");
        return;
      }

      setForm((current) => ({
        ...current,
        mediaUrl: current.mediaUrl || payload.media?.mediaUrl || "",
        mediaStoragePath: current.mediaStoragePath || payload.media?.mediaStoragePath || "",
        mediaType: current.mediaType || payload.media?.mediaType || "",
        mediaMimeType: current.mediaMimeType || payload.media?.mediaMimeType || "",
        mediaSize: current.mediaSize ?? (typeof payload.media?.mediaSize === "number" ? payload.media.mediaSize : null),
        mediaTitle: current.mediaTitle || payload.media?.mediaTitle || file.name,
        mediaItems: [
          ...current.mediaItems,
          {
            mediaUrl: payload.media?.mediaUrl || "",
            mediaStoragePath: payload.media?.mediaStoragePath || "",
            mediaType: payload.media?.mediaType || "document",
            mediaMimeType: payload.media?.mediaMimeType || "",
            mediaSize: typeof payload.media?.mediaSize === "number" ? payload.media.mediaSize : null,
            mediaTitle: payload.media?.mediaTitle || file.name,
            usage: "suggest" as const,
          },
        ].slice(0, 12),
      }));
      setNotice("Material enviado e vinculado ao cadastro.");
    } catch {
      setError("Falha ao subir midia.");
    } finally {
      setUploading(false);
    }
  }

  function parseBulkItems() {
    return bulkText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = "", category = "", price = "", targetProfile = "", description = ""] = line
          .split("|")
          .map((item) => item.trim());
        return {
          name,
          category,
          price,
          targetProfile,
          description,
        };
      })
      .filter((item) => item.name)
      .slice(0, 30);
  }

  async function submitBulkCatalog() {
    if (!tenant?.tenantId || !canManage) return;
    const items = parseBulkItems();
    if (!items.length) {
      setError("Cole pelo menos um produto no formato: Nome | Categoria | Preco | Publico | Descricao.");
      return;
    }

    try {
      setBulkCreating(true);
      setError(null);
      setNotice(null);

      for (const item of items) {
        const content = [
          `Nome: ${item.name}`,
          "Tipo: produto",
          item.category ? `Categoria: ${item.category}` : "",
          item.targetProfile ? `Publico ideal: ${item.targetProfile}` : "",
          `Descricao para cliente: ${item.description || `Produto ${item.name} cadastrado para a equipe comercial completar argumentos, materiais e criterios de recomendacao.`}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "catalog",
            content,
            tags: unique(["catalogo", "tipo:produto", "origem:manual", item.category ? `categoria:${item.category}` : ""]),
            serviceKey: serviceKeyFromName(item.name),
            productName: item.name,
            productCategory: item.category || null,
            targetProfile: item.targetProfile || null,
            priceFrom: numberOrNull(item.price),
            priceTo: null,
            upsellKeys: [],
            crossSellKeys: [],
            availability: "active",
          }),
        });

        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(payload.error || `Falha ao criar ${item.name}.`);
      }

      setNotice(`${items.length} produto(s) criados. Abra cada ficha para adicionar materiais e argumentos finos.`);
      setBulkText("");
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Falha ao criar produtos em lote.");
    } finally {
      setBulkCreating(false);
    }
  }

  async function submitCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage) return;
    if (!form.name.trim()) {
      setError("Informe o nome do produto ou servico.");
      return;
    }
    if (!form.shortDescription.trim()) {
      setError("Adicione uma descricao comercial curta.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setNotice(null);

      const endpoint = docId
        ? `/api/tenant/${tenant.tenantId}/kb-docs/${docId}`
        : `/api/tenant/${tenant.tenantId}/kb-docs`;
      const method = docId ? "PATCH" : "POST";

      const res = await authedFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "catalog",
          content: buildContent(form),
          tags: tagsFromForm(form),
          mediaUrl: form.mediaUrl.trim() || null,
          mediaType: form.mediaType || null,
          mediaTitle: form.mediaTitle.trim() || null,
          mediaStoragePath: form.mediaStoragePath.trim() || null,
          mediaMimeType: form.mediaMimeType.trim() || null,
          mediaSize: form.mediaSize,
          mediaItems: normalizeMediaItems(form.mediaItems),
          serviceKey: serviceKeyFromName(form.name),
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

      router.push("/cliente/painel/produtos-servicos");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao salvar item.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-[var(--cliente-card-text-soft)]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="client-daily-page">
        <EmptyState title="Somente leitura" description="Sua conta pode consultar produtos e servicos, mas nao tem permissao para editar esta base." />
      </div>
    );
  }

  return (
    <div className="produtos-refined client-daily-page space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/cliente/painel/produtos-servicos"
          className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text-muted)] transition hover:border-[color:color-mix(in_srgb,var(--cliente-primary)_28%,var(--cliente-border))] hover:bg-[var(--cliente-surface-hover)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao catalogo
        </Link>
        <StateBadge label={docId ? "edicao" : "novo cadastro"} tone="info" />
      </div>

      {!docId ? (
        <PanelCard className="overflow-hidden">
          <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_320px] md:p-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StateBadge label="Cadastro rapido" tone="info" />
                <StateBadge label="ate 30 itens" tone="neutral" />
              </div>
              <h2 className="mt-3 text-xl font-black tracking-normal text-[var(--cliente-card-text)]">
                Cole uma lista e crie varios produtos em segundos.
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text-muted)]">
                Use uma linha por produto no formato: nome, categoria, preco, publico e descricao separados por barra vertical.
              </p>
              <textarea
                value={bulkText}
                onChange={(event) => setBulkText(event.target.value)}
                rows={4}
                placeholder={"Plano Growth | Atendimento | 497 | lojas com WhatsApp intenso | IA para responder, vender e organizar oportunidades\nConsultoria de vendas | Servicos | 1200 | negocios B2B | Diagnostico e plano comercial"}
                className="client-input mt-4 w-full resize-y rounded-[18px] border px-4 py-3 text-sm leading-6 outline-none transition focus:border-[color:color-mix(in_srgb,var(--cliente-primary)_46%,var(--cliente-border))]"
              />
            </div>
            <div className="rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <p className="text-sm font-black text-[var(--cliente-card-text)]">Fluxo recomendado</p>
              <div className="mt-4 space-y-2">
                <BulkStep done={Boolean(parseBulkItems().length)} label={`${parseBulkItems().length || 0} item(ns) detectado(s)`} />
                <BulkStep done={false} label="Criar fichas base" />
                <BulkStep done={false} label="Completar materiais nos itens principais" />
              </div>
              <button
                type="button"
                onClick={() => void submitBulkCatalog()}
                disabled={bulkCreating || !bulkText.trim()}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--cliente-primary)] px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[var(--cliente-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Criar produtos em lote
              </button>
            </div>
          </div>
        </PanelCard>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form className="space-y-4" onSubmit={submitCatalog}>
          <PanelCard className="overflow-hidden">
            <div className="border-b border-[var(--cliente-border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_10%,var(--cliente-card)),var(--cliente-card)_58%,color-mix(in_srgb,var(--cliente-ai)_8%,var(--cliente-card)))] p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StateBadge label="Produtos & Servicos" tone="info" />
                    <StateBadge label={`${completion}% completo`} tone={completion > 70 ? "success" : "warning"} />
                  </div>
                  <h1 className="mt-3 text-2xl font-black leading-tight tracking-normal text-[var(--cliente-card-text)] md:text-3xl">
                    {docId ? "Editar oferta comercial" : "Cadastrar produto ou servico"}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-muted)]">
                    Monte uma ficha que um vendedor entenderia em segundos e que a IA consiga usar para responder, recomendar e enviar material no atendimento.
                  </p>
                </div>
                <ClientActionButton type="submit" tone="primary" disabled={saving} className="bg-[var(--cliente-primary)] hover:bg-[var(--cliente-primary-hover)]">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {docId ? "Atualizar" : "Salvar cadastro"}
                </ClientActionButton>
              </div>
            </div>

            <div className="space-y-5 p-4 md:p-5">
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

              <FormSection icon={Package} title="Tipo de oferta" description="Escolha o formato para abrir os campos certos.">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { value: "produto", label: "Produto", detail: "item fisico ou digital", icon: Package },
                    { value: "servico", label: "Servico", detail: "execucao ou atendimento", icon: BriefcaseBusiness },
                    { value: "plano", label: "Plano", detail: "recorrencia ou assinatura", icon: Sparkles },
                    { value: "pacote", label: "Pacote", detail: "combos e bundles", icon: CheckCircle2 },
                  ].map((item) => {
                    const active = form.kind === item.value;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => updateForm("kind", item.value as CatalogKind)}
                        className={`min-h-[116px] rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 ${
                          active
                            ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary-soft)] shadow-[var(--cliente-shadow-soft)]"
                            : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] hover:border-[color:color-mix(in_srgb,var(--cliente-primary)_24%,var(--cliente-border))]"
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${active ? "text-[var(--cliente-primary)]" : "text-[var(--cliente-card-text-soft)]"}`} />
                        <p className="mt-3 text-sm font-black text-[var(--cliente-card-text)]">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{item.detail}</p>
                      </button>
                    );
                  })}
                </div>
              </FormSection>

              <FormSection icon={Info} title="Ficha comercial" description="Nome, publico e preco para o time encontrar rapido e vender melhor.">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Nome" value={form.name} onChange={(value) => updateForm("name", value)} placeholder={isServiceMode ? "Ex: Consultoria de implantacao" : "Ex: Kit atendimento premium"} />
                  <Field label="Categoria" value={form.category} onChange={(value) => updateForm("category", value)} placeholder={isServiceMode ? "Ex: Atendimento" : "Ex: Acessorios"} />
                  <Field label="Preco inicial" value={form.priceFrom} onChange={(value) => updateForm("priceFrom", value)} placeholder="Ex: 497" />
                  <Field label="Preco final" value={form.priceTo} onChange={(value) => updateForm("priceTo", value)} placeholder="Opcional" />
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
                  <Field label="Publico ideal" value={form.targetProfile} onChange={(value) => updateForm("targetProfile", value)} placeholder="Ex: clientes que pedem resposta rapida no WhatsApp" />
                </div>
              </FormSection>

              <FormSection icon={Sparkles} title="Argumentos para venda" description="Conteudo que vira resposta, recomendacao e apoio para o atendente.">
                <TextArea label="Descricao comercial" value={form.shortDescription} onChange={(value) => updateForm("shortDescription", value)} rows={4} placeholder="Explique o que e, para quem serve e qual resultado entrega." />
                <div className="grid gap-3 md:grid-cols-2">
                  <TextArea label="Beneficios" value={form.benefits} onChange={(value) => updateForm("benefits", value)} rows={4} placeholder="Ganhos claros, transformacao, economia, prazo, seguranca." />
                  <TextArea label="Duvidas frequentes" value={form.commonQuestions} onChange={(value) => updateForm("commonQuestions", value)} rows={4} placeholder="Perguntas comuns antes da compra." />
                  <TextArea label="Objecoes comuns" value={form.objections} onChange={(value) => updateForm("objections", value)} rows={4} placeholder="Preco, prazo, garantia, comparacao, confianca." />
                  <TextArea label="Quando recomendar" value={form.whenRecommend} onChange={(value) => updateForm("whenRecommend", value)} rows={4} placeholder="Sinais da conversa que indicam fit." />
                </div>
                <TextArea label="Quando chamar humano" value={form.whenHuman} onChange={(value) => updateForm("whenHuman", value)} rows={3} placeholder="Negociacao sensivel, excecoes, reclamacoes ou pedido fora do padrao." />
              </FormSection>

              <FormSection icon={isServiceMode ? BriefcaseBusiness : Package} title={isServiceMode ? "Detalhes do servico" : "Detalhes do produto"} description={isServiceMode ? "Escopo, prazo e agenda deixam a promessa mais clara." : "Caracteristicas, entrega e garantia reduzem atrito no atendimento."}>
                {isServiceMode ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <TextArea label="Escopo do servico" value={form.serviceScope} onChange={(value) => updateForm("serviceScope", value)} rows={4} placeholder="O que esta incluso e o que nao esta." />
                    <TextArea label="Entregaveis" value={form.deliverables} onChange={(value) => updateForm("deliverables", value)} rows={4} placeholder="Itens entregues, etapas ou marcos." />
                    <Field label="Duracao ou prazo" value={form.duration} onChange={(value) => updateForm("duration", value)} placeholder="Ex: 7 dias, 3 sessoes, mensal" />
                    <Field label="Agenda e regras" value={form.schedulingRules} onChange={(value) => updateForm("schedulingRules", value)} placeholder="Ex: segunda a sexta, mediante disponibilidade" />
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <TextArea label="Especificacoes" value={form.productSpecs} onChange={(value) => updateForm("productSpecs", value)} rows={4} placeholder="Tamanho, modelo, cor, composicao, compatibilidade." />
                    <TextArea label="Estoque, entrega e envio" value={form.stockDelivery} onChange={(value) => updateForm("stockDelivery", value)} rows={4} placeholder="Disponibilidade, prazo, retirada, frete, rastreio." />
                    <TextArea label="Garantia e troca" value={form.warranty} onChange={(value) => updateForm("warranty", value)} rows={4} placeholder="Garantia, politica de troca, cuidados e restricoes." />
                    <TextArea label="Como demonstrar" value={form.deliverables} onChange={(value) => updateForm("deliverables", value)} rows={4} placeholder="Como a IA ou atendente pode apresentar este produto." />
                  </div>
                )}
              </FormSection>

              <FormSection icon={UploadCloud} title="Material para conversa" description="Suba imagem, video ou documento que a IA e o time podem usar como apoio comercial.">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-[22px] border border-dashed border-[color:color-mix(in_srgb,var(--cliente-primary)_28%,var(--cliente-border))] bg-[var(--cliente-primary-soft)] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-[var(--cliente-card-text)]">Arquivo principal do cadastro</p>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--cliente-card-text-muted)]">
                          Imagens ate 12 MB, videos ate 64 MB e documentos ate 24 MB. Use material que ajude a fechar a venda.
                        </p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-[16px] bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[var(--cliente-primary-hover)]">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                        {uploading ? "Enviando" : "Escolher arquivos"}
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                          className="hidden"
                          disabled={uploading}
                          onChange={(event) => {
                            const files = Array.from(event.target.files || []);
                            void files.reduce(
                              (promise, file) => promise.then(() => handleMediaUpload(file)),
                              Promise.resolve()
                            );
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>

                    {form.mediaItems.length ? (
                      <div className="mt-4 space-y-2">
                        {form.mediaItems.map((item, index) => (
                          <div key={`${item.mediaUrl}_${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <MediaThumb type={item.mediaType} />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{item.mediaTitle || "Material vinculado"}</p>
                                  {index === 0 ? <StateBadge label="principal" tone="info" /> : null}
                                </div>
                                <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                                  {mediaLabel(item.mediaType)} {mediaSizeLabel(item.mediaSize || null) ? `| ${mediaSizeLabel(item.mediaSize || null)}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                value={item.usage || "suggest"}
                                onChange={(event) => updateMediaUsage(item.mediaUrl, event.target.value as MediaUsage)}
                                className="client-input rounded-xl border px-2.5 py-2 text-xs font-bold outline-none"
                                aria-label="Uso do material pela IA"
                              >
                                <option value="suggest">Sugerir</option>
                                <option value="auto">Pode enviar</option>
                                <option value="blocked">Interno</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => removeMediaItem(item.mediaUrl)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-muted)] transition hover:border-rose-400/30 hover:text-rose-600"
                                aria-label="Remover material"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <Field label="Titulo do material" value={form.mediaTitle} onChange={(value) => updateForm("mediaTitle", value)} placeholder="Ex: catalogo 2026" />
                    <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                      <p className="text-xs font-bold text-[var(--cliente-card-text)]">Como sera usado</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-muted)]">
                        Marque Pode enviar para materiais comerciais seguros. Use Sugerir quando o atendente deve aprovar antes, e Interno para apoio que nao deve ir ao cliente.
                      </p>
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection icon={CheckCircle2} title="Venda adicional" description="Ajude a operacao a sugerir o proximo melhor item.">
                <div className="grid gap-3 md:grid-cols-2">
                  <TextArea label="Upsell" value={form.upsell} onChange={(value) => updateForm("upsell", value)} rows={3} placeholder="Itens ou planos acima deste." />
                  <TextArea label="Cross-sell" value={form.crossSell} onChange={(value) => updateForm("crossSell", value)} rows={3} placeholder="Itens complementares." />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Origem" value={form.source} onChange={(value) => updateForm("source", value)} placeholder="manual, shopify, vtex..." />
                  <Field label="Tags extras" value={form.extraTags} onChange={(value) => updateForm("extraTags", value)} placeholder="whatsapp, recorrencia, premium" />
                </div>
              </FormSection>

              <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--cliente-border)] pt-5">
                <Link
                  href="/cliente/painel/produtos-servicos"
                  className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                >
                  Cancelar
                </Link>
                <ClientActionButton type="submit" tone="primary" disabled={saving} className="bg-[var(--cliente-primary)] hover:bg-[var(--cliente-primary-hover)]">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {docId ? "Atualizar" : "Salvar cadastro"}
                </ClientActionButton>
              </div>
            </div>
          </PanelCard>
        </form>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PanelCard tone="ai" className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
                <Bot className="h-5 w-5" />
              </span>
              <CardTitle title="Previa da IA" subtitle="Quanto mais objetiva a ficha, melhor a recomendacao nas conversas." />
            </div>
            <div className="mt-5 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
              <div className="flex items-center gap-3">
                <MediaThumb type={form.mediaType} />
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-[var(--cliente-card-text)]">{form.name || "Nome do item"}</p>
                  <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">
                    {[form.category || "categoria", form.targetProfile || "publico ideal"].join(" | ")}
                  </p>
                </div>
              </div>
              <p className="mt-4 line-clamp-5 text-sm leading-6 text-[var(--cliente-card-text-muted)]">
                {form.shortDescription || "A descricao comercial aparece aqui. Ela deve deixar claro o que e, para quem serve e por que comprar."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StateBadge label={form.kind} tone={isServiceMode ? "ai" : "success"} />
                <StateBadge label={form.mediaItems.length ? `${form.mediaItems.length} material(is)` : "sem material"} tone={form.mediaItems.length ? "info" : "warning"} />
              </div>
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Checklist" subtitle="Priorize clareza de acao, nao texto demais." />
            <div className="mt-4 space-y-2">
              <ChecklistRow checked={Boolean(form.name.trim())} label="Nome facil de reconhecer" />
              <ChecklistRow checked={Boolean(form.targetProfile.trim())} label="Publico ideal definido" />
              <ChecklistRow checked={Boolean(form.shortDescription.trim())} label="Descricao comercial objetiva" />
              <ChecklistRow checked={Boolean(form.whenRecommend.trim())} label="Sinais para recomendar" />
              <ChecklistRow checked={Boolean(form.mediaItems.length || form.mediaUrl)} label="Material de apoio anexado" />
              <ChecklistRow checked={Boolean(parseList(form.upsell).length || parseList(form.crossSell).length)} label="Proxima oferta configurada" />
            </div>
          </PanelCard>
        </aside>
      </section>
    </div>
  );
}

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Package;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4 shadow-[0_16px_42px_-38px_rgba(15,23,42,0.36)] md:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_16%,var(--cliente-border))] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-base font-black tracking-normal text-[var(--cliente-card-text)]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{description}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
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
    <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="client-input mt-2 w-full rounded-[16px] border px-3 py-3 text-sm font-medium normal-case tracking-normal outline-none transition focus:border-[color:color-mix(in_srgb,var(--cliente-primary)_46%,var(--cliente-border))] placeholder:text-[var(--cliente-card-text-soft)]"
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
    <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="client-input mt-2 w-full resize-y rounded-[16px] border px-3 py-3 text-sm font-medium normal-case leading-6 tracking-normal outline-none transition focus:border-[color:color-mix(in_srgb,var(--cliente-primary)_46%,var(--cliente-border))] placeholder:text-[var(--cliente-card-text-soft)]"
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
    <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="client-input mt-2 w-full rounded-[16px] border px-3 py-3 text-sm font-medium normal-case tracking-normal outline-none transition focus:border-[color:color-mix(in_srgb,var(--cliente-primary)_46%,var(--cliente-border))]"
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

function MediaThumb({ type }: { type: MediaType | "" }) {
  const Icon = type === "image" ? ImageIcon : type === "video" ? Video : type === "document" ? FileText : PlayCircle;
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_16%,var(--cliente-border))] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]">
      <Icon className="h-5 w-5" />
    </span>
  );
}

function ChecklistRow({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          checked
            ? "border-[color:color-mix(in_srgb,var(--cliente-success)_28%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]"
            : "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text-soft)]"
        }`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm font-semibold text-[var(--cliente-card-text-muted)]">{label}</p>
    </div>
  );
}

function BulkStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          done
            ? "border-[color:color-mix(in_srgb,var(--cliente-success)_28%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]"
            : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-soft)]"
        }`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
      <p className="text-xs font-bold text-[var(--cliente-card-text-muted)]">{label}</p>
    </div>
  );
}
