"use client";

import Link from "next/link";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  PackageCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import type { CatalogImportItem, CatalogImportKind } from "@/lib/catalog-import";

type Preview = {
  fileName: string;
  fileSize: number;
  summary: string;
  engine: "ai" | "local";
  model: string | null;
  items: CatalogImportItem[];
  warnings: string[];
};

type PublishResult = {
  createdCount: number;
  duplicateCount: number;
  duplicates: string[];
};

const KIND_OPTIONS: Array<{ value: CatalogImportKind; label: string }> = [
  { value: "produto", label: "Produto" },
  { value: "servico", label: "Serviço" },
  { value: "plano", label: "Plano" },
  { value: "pacote", label: "Pacote" },
];

function fileSizeLabel(value: number) {
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`;
}

function moneyInput(value: number | null) {
  return typeof value === "number" ? String(value) : "";
}

function parseMoneyInput(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function parseReviewLines(value: string) {
  return value.split(/\n|;/).map((item) => item.trim()).filter(Boolean).slice(0, 10);
}

export default function ImportarCatalogoPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const canManage = hasCapability("manage_ai");

  const selectedItems = useMemo(
    () => (preview?.items || []).filter((item) => selectedIds.has(item.tempId)),
    [preview?.items, selectedIds]
  );
  const warningCount = useMemo(
    () => selectedItems.reduce((total, item) => total + item.warnings.length, 0),
    [selectedItems]
  );

  function chooseFile(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setSelectedIds(new Set());
    setResult(null);
    setError(null);
  }

  async function analyzeFile() {
    if (!tenant?.tenantId || !file || !canManage) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/catalog-import/preview`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => ({}))) as { preview?: Preview; error?: string };
      if (!response.ok || !payload.preview) throw new Error(payload.error || "Não foi possível analisar o arquivo.");
      setPreview(payload.preview);
      setSelectedIds(new Set(payload.preview.items.map((item) => item.tempId)));
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Não foi possível analisar o arquivo.");
    } finally {
      setAnalyzing(false);
    }
  }

  function updateItem(tempId: string, patch: Partial<CatalogImportItem>) {
    setPreview((current) => current ? {
      ...current,
      items: current.items.map((item) => item.tempId === tempId ? { ...item, ...patch } : item),
    } : current);
  }

  function toggleItem(tempId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  }

  function toggleAll() {
    const allIds = preview?.items.map((item) => item.tempId) || [];
    setSelectedIds(selectedIds.size === allIds.length ? new Set() : new Set(allIds));
  }

  async function publishItems() {
    if (!tenant?.tenantId || !preview || !selectedItems.length || !canManage) return;
    setPublishing(true);
    setError(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/catalog-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: preview.fileName, items: selectedItems }),
      });
      const payload = (await response.json().catch(() => ({}))) as PublishResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível publicar o catálogo.");
      setResult(payload);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Não foi possível publicar o catálogo.");
    } finally {
      setPublishing(false);
    }
  }

  if (result) {
    return (
      <div className="client-daily-page mx-auto max-w-3xl space-y-4">
        <section className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--cliente-success)_28%,var(--cliente-border))] bg-[linear-gradient(145deg,var(--cliente-card),color-mix(in_srgb,var(--cliente-success)_8%,var(--cliente-card)))] p-7 text-center shadow-[var(--cliente-shadow-soft)] md:p-10">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]">
            <PackageCheck className="h-8 w-8" />
          </span>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-[var(--cliente-success)]">Catálogo publicado</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--cliente-card-text)]">{result.createdCount} oferta(s) pronta(s) para operar.</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--cliente-card-text-muted)]">
            Os itens já estão disponíveis em Produtos & Serviços e passam a compor o contexto comercial da Altum.
          </p>
          {result.duplicateCount ? (
            <p className="mx-auto mt-4 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {result.duplicateCount} item(ns) já existiam e não foram duplicados.
            </p>
          ) : null}
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Link href="/cliente/painel/produtos-servicos" className="inline-flex items-center gap-2 rounded-[14px] bg-[var(--cliente-primary)] px-5 py-3 text-sm font-bold text-white">
              Ver catálogo
            </Link>
            <button type="button" onClick={() => chooseFile(null)} className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-5 py-3 text-sm font-bold text-[var(--cliente-card-text)]">
              Importar outro arquivo
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="client-daily-page space-y-4">
      <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_20%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_11%,var(--cliente-card)),var(--cliente-card)_62%,color-mix(in_srgb,var(--cliente-ai)_8%,var(--cliente-card)))] p-5 shadow-[var(--cliente-shadow-soft)] md:p-7">
        <Link href="/cliente/painel/produtos-servicos" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--cliente-card-text-muted)] hover:text-[var(--cliente-primary)]">
          <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
        </Link>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--cliente-primary-soft)] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--cliente-primary)]">Importação inteligente</span>
              <span className="rounded-full bg-[var(--cliente-ai-soft)] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--cliente-ai)]">Revisão antes de publicar</span>
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-[var(--cliente-card-text)] md:text-3xl">Transforme seu arquivo em um catálogo comercial utilizável.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-muted)]">A Altum identifica ofertas, preços e argumentos. Você revisa tudo e decide o que entra na operação.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <FlowStep number="1" label="Enviar" active={!preview} />
            <FlowStep number="2" label="Revisar" active={Boolean(preview)} />
            <FlowStep number="3" label="Publicar" active={false} />
          </div>
        </div>
      </section>

      {error ? <p className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}

      {!preview ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-5 shadow-[var(--cliente-shadow-soft)] md:p-7">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex min-h-64 w-full flex-col items-center justify-center rounded-[20px] border border-dashed border-[color:color-mix(in_srgb,var(--cliente-primary)_38%,var(--cliente-border))] bg-[var(--cliente-primary-soft)]/40 px-5 text-center transition hover:border-[var(--cliente-primary)] hover:bg-[var(--cliente-primary-soft)]"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[var(--cliente-card)] text-[var(--cliente-primary)] shadow-sm"><UploadCloud className="h-7 w-7" /></span>
              <p className="mt-4 text-base font-black text-[var(--cliente-card-text)]">{file ? file.name : "Escolha seu catálogo ou planilha"}</p>
              <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{file ? fileSizeLabel(file.size) : "PDF, Excel, CSV, TSV ou TXT · até 4 MB"}</p>
              <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt,.md" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0] || null)} />
            </button>
            <button type="button" onClick={analyzeFile} disabled={!file || analyzing || !canManage} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--cliente-primary)] px-5 py-3.5 text-sm font-black text-white shadow-sm transition hover:bg-[var(--cliente-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50">
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {analyzing ? "Lendo e organizando o catálogo..." : "Analisar arquivo"}
            </button>
          </div>
          <aside className="rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-5 shadow-[var(--cliente-shadow-soft)]">
            <p className="text-sm font-black text-[var(--cliente-card-text)]">O que a Altum prepara</p>
            <div className="mt-4 space-y-3">
              {["Produtos, serviços, planos e pacotes", "Preço e categoria", "Descrição e principais benefícios", "FAQ, objeções e indicação comercial", "Alertas do que precisa ser revisado"].map((label) => (
                <div key={label} className="flex gap-3 text-sm text-[var(--cliente-card-text-muted)]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cliente-success)]" />{label}</div>
              ))}
            </div>
            <p className="mt-5 rounded-2xl bg-[var(--cliente-surface-muted)] px-4 py-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">Nenhum item é publicado automaticamente. Arquivos CSV funcionam mesmo sem IA; PDF e Excel usam a interpretação inteligente contratada.</p>
          </aside>
        </section>
      ) : (
        <>
          <section className="rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-5 shadow-[var(--cliente-shadow-soft)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]"><FileSpreadsheet className="h-5 w-5" /></span>
                <div className="min-w-0"><p className="truncate text-sm font-black text-[var(--cliente-card-text)]">{preview.fileName}</p><p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">{preview.summary}</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-[var(--cliente-ai-soft)] px-3 py-1.5 text-xs font-bold text-[var(--cliente-ai)]">{preview.engine === "ai" ? "Organizado com IA" : "Leitura da planilha"}</span>
                <span className="rounded-full bg-[var(--cliente-surface-muted)] px-3 py-1.5 text-xs font-bold text-[var(--cliente-card-text-muted)]">{preview.items.length} item(ns)</span>
                <button type="button" onClick={() => chooseFile(null)} className="inline-flex items-center gap-1 rounded-full border border-[var(--cliente-border)] px-3 py-1.5 text-xs font-bold text-[var(--cliente-card-text-muted)]"><X className="h-3.5 w-3.5" /> Trocar arquivo</button>
              </div>
            </div>
            {preview.warnings.map((warning) => <p key={warning} className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{warning}</p>)}
          </section>

          <section className="rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] shadow-[var(--cliente-shadow-soft)]">
            <div className="flex flex-col gap-3 border-b border-[var(--cliente-border)] p-4 md:flex-row md:items-center md:justify-between md:px-5">
              <div><h2 className="text-base font-black text-[var(--cliente-card-text)]">Revise antes de publicar</h2><p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">Corrija nome, tipo, preço e contexto comercial quando necessário.</p></div>
              <button type="button" onClick={toggleAll} className="inline-flex items-center gap-2 text-xs font-black text-[var(--cliente-primary)]"><Check className="h-4 w-4" />{selectedIds.size === preview.items.length ? "Desmarcar todos" : "Selecionar todos"}</button>
            </div>
            <div className="divide-y divide-[var(--cliente-border)]">
              {preview.items.map((item) => <CatalogReviewRow key={item.tempId} item={item} selected={selectedIds.has(item.tempId)} onToggle={() => toggleItem(item.tempId)} onChange={(patch) => updateItem(item.tempId, patch)} />)}
            </div>
          </section>

          <section className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-[20px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_24%,var(--cliente-border))] bg-[color:color-mix(in_srgb,var(--cliente-card)_94%,transparent)] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur md:flex-row md:items-center md:justify-between">
            <div><p className="text-sm font-black text-[var(--cliente-card-text)]">{selectedItems.length} de {preview.items.length} item(ns) selecionado(s)</p><p className="mt-0.5 text-xs text-[var(--cliente-card-text-muted)]">{warningCount ? `${warningCount} alerta(s) para revisar` : "Sem alertas pendentes nos itens selecionados"}</p></div>
            <button type="button" onClick={publishItems} disabled={!selectedItems.length || publishing} className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[var(--cliente-primary)] px-6 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}{publishing ? "Publicando..." : "Publicar no catálogo"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function FlowStep({ number, label, active }: { number: string; label: string; active: boolean }) {
  return <div className={`rounded-[14px] border px-3 py-2 ${active ? "border-[color:color-mix(in_srgb,var(--cliente-primary)_30%,var(--cliente-border))] bg-[var(--cliente-card)] text-[var(--cliente-primary)] shadow-sm" : "border-transparent bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-soft)]"}`}><p className="text-xs font-black">{number}</p><p className="text-[11px] font-bold">{label}</p></div>;
}

function CatalogReviewRow({ item, selected, onToggle, onChange }: { item: CatalogImportItem; selected: boolean; onToggle: () => void; onChange: (patch: Partial<CatalogImportItem>) => void }) {
  return (
    <article className={`p-4 transition md:p-5 ${selected ? "bg-transparent" : "bg-[var(--cliente-surface-muted)] opacity-65"}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onToggle} aria-label={selected ? `Desmarcar ${item.name}` : `Selecionar ${item.name}`} className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${selected ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary)] text-white" : "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-transparent"}`}><Check className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_160px_160px_160px]">
            <ReviewInput label="Nome da oferta" value={item.name} onChange={(value) => onChange({ name: value })} />
            <label className="text-[11px] font-black uppercase tracking-[0.1em] text-[var(--cliente-card-text-soft)]">Tipo<select value={item.kind} onChange={(event) => onChange({ kind: event.target.value as CatalogImportKind })} className="client-input mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm font-bold normal-case tracking-normal outline-none">{KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <ReviewInput label="Categoria" value={item.category} onChange={(value) => onChange({ category: value })} />
            <ReviewInput label="Preço a partir de" value={moneyInput(item.priceFrom)} onChange={(value) => onChange({ priceFrom: parseMoneyInput(value) })} placeholder="R$ 0,00" />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.4fr)]">
            <ReviewInput label="Público ideal" value={item.targetProfile} onChange={(value) => onChange({ targetProfile: value })} placeholder="Para quem faz sentido" />
            <label className="text-[11px] font-black uppercase tracking-[0.1em] text-[var(--cliente-card-text-soft)]">Descrição comercial<textarea value={item.description} onChange={(event) => onChange({ description: event.target.value })} rows={2} className="client-input mt-1.5 w-full resize-y rounded-xl border px-3 py-2.5 text-sm font-medium normal-case leading-5 tracking-normal outline-none" /></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${item.confidence === "high" ? "bg-emerald-50 text-emerald-700" : item.confidence === "low" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-700"}`}>{item.confidence === "high" ? "Alta confiança" : item.confidence === "low" ? "Revisar com atenção" : "Confiança média"}</span>
            {item.benefits.length ? <span className="rounded-full bg-[var(--cliente-ai-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--cliente-ai)]">{item.benefits.length} benefício(s)</span> : null}
            {item.commonQuestions.length ? <span className="rounded-full bg-[var(--cliente-primary-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--cliente-primary)]">{item.commonQuestions.length} FAQ(s)</span> : null}
            {item.warnings.map((warning) => <span key={warning} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800"><AlertTriangle className="h-3 w-3" />{warning}</span>)}
          </div>
          <details className="mt-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3">
            <summary className="cursor-pointer text-xs font-black text-[var(--cliente-primary)]">Revisar argumentos, dúvidas e recomendação</summary>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <ReviewTextarea label="Principais benefícios" value={item.benefits.join("\n")} onChange={(value) => onChange({ benefits: parseReviewLines(value) })} placeholder="Um benefício por linha" />
              <ReviewTextarea label="Dúvidas frequentes" value={item.commonQuestions.join("\n")} onChange={(value) => onChange({ commonQuestions: parseReviewLines(value) })} placeholder="Uma dúvida por linha" />
              <ReviewTextarea label="Objeções comuns" value={item.objections.join("\n")} onChange={(value) => onChange({ objections: parseReviewLines(value) })} placeholder="Uma objeção por linha" />
              <ReviewTextarea label="Quando recomendar" value={item.whenRecommend} onChange={(value) => onChange({ whenRecommend: value })} placeholder="Situação ou necessidade ideal" />
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

function ReviewInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="text-[11px] font-black uppercase tracking-[0.1em] text-[var(--cliente-card-text-soft)]">{label}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="client-input mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm font-bold normal-case tracking-normal outline-none" /></label>;
}

function ReviewTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="text-[11px] font-black uppercase tracking-[0.1em] text-[var(--cliente-card-text-soft)]">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="client-input mt-1.5 w-full resize-y rounded-xl border px-3 py-2.5 text-sm font-medium normal-case leading-5 tracking-normal outline-none" /></label>;
}
