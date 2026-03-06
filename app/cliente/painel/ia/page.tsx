"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

type AiSettings = {
  enabled: boolean;
  toneOfVoice: string;
  businessSummary: string;
  responsiblePhone: string;
  guardrails: string[];
};

type KbDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
};

const EMPTY_SETTINGS: AiSettings = {
  enabled: true,
  toneOfVoice: "consultivo e objetivo",
  businessSummary: "",
  responsiblePhone: "",
  guardrails: [],
};

export default function ClienteIaPage() {
  const { tenant } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<AiSettings>(EMPTY_SETTINGS);
  const [guardrailsText, setGuardrailsText] = useState("");
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([]);
  const [docType, setDocType] = useState<KbDoc["type"]>("faq");
  const [docContent, setDocContent] = useState("");
  const [docTags, setDocTags] = useState("");

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [settingsRes, kbRes] = await Promise.all([
          authedFetch(`/api/tenant/${tenant.tenantId}/settings/ai`),
          authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`),
        ]);

        const settingsPayload = (await settingsRes.json()) as {
          ai?: AiSettings;
          error?: string;
        };

        const kbPayload = (await kbRes.json()) as {
          items?: KbDoc[];
          error?: string;
        };

        if (!mounted) return;

        if (!settingsRes.ok) {
          setError(settingsPayload.error || "Falha ao carregar configuracoes da IA.");
        } else {
          const nextSettings = {
            ...EMPTY_SETTINGS,
            ...(settingsPayload.ai || {}),
          };

          setSettings(nextSettings);
          setGuardrailsText((nextSettings.guardrails || []).join("\n"));
        }

        if (!kbRes.ok) {
          setError(kbPayload.error || "Falha ao carregar base de conhecimento.");
        } else {
          setKbDocs(kbPayload.items || []);
        }
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar modulo IA.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

  const docsByType = useMemo(() => {
    return {
      faq: kbDocs.filter((doc) => doc.type === "faq"),
      catalog: kbDocs.filter((doc) => doc.type === "catalog"),
      policy: kbDocs.filter((doc) => doc.type === "policy"),
    };
  }, [kbDocs]);

  async function handleSaveSettings(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId) return;

    setSavingSettings(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/settings/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          guardrails: guardrailsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar configuracoes da IA.");
        return;
      }

      setSuccess("Configuracoes da IA salvas com sucesso.");
    } catch {
      setError("Falha ao salvar configuracoes da IA.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddKbDoc(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !docContent.trim()) return;

    setSavingDoc(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: docType,
          content: docContent.trim(),
          tags: docTags,
        }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar documento.");
        return;
      }

      const kbRes = await authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`);
      const kbPayload = (await kbRes.json()) as { items?: KbDoc[] };
      if (kbRes.ok) setKbDocs(kbPayload.items || []);

      setDocContent("");
      setDocTags("");
      setSuccess("Documento da base de conhecimento adicionado.");
    } catch {
      setError("Falha ao salvar documento da base de conhecimento.");
    } finally {
      setSavingDoc(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[45vh] flex items-center justify-center text-white">
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-[#101010] p-6">
        <h2 className="text-lg font-semibold">AI Sales Agent</h2>
        <p className="text-sm text-white/60 mt-1">
          Configure tom de voz, limites de atendimento, numero do responsavel e base de conhecimento por tenant.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={handleSaveSettings} className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-3">
          <h3 className="text-sm uppercase tracking-wide text-white/60">Configuracoes da IA</h3>

          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
            />
            IA habilitada para respostas automaticas
          </label>

          <Field
            label="Tom de voz"
            value={settings.toneOfVoice}
            onChange={(value) => setSettings((prev) => ({ ...prev, toneOfVoice: value }))}
            placeholder="consultivo e objetivo"
          />

          <Field
            label="Resumo do negocio"
            value={settings.businessSummary}
            onChange={(value) => setSettings((prev) => ({ ...prev, businessSummary: value }))}
            placeholder="o que a empresa vende e para quem"
          />

          <Field
            label="WhatsApp responsavel (handoff)"
            value={settings.responsiblePhone}
            onChange={(value) => setSettings((prev) => ({ ...prev, responsiblePhone: value }))}
            placeholder="5511999999999"
          />

          <label className="block text-xs text-white/70">
            Guardrails (uma regra por linha)
            <textarea
              value={guardrailsText}
              onChange={(event) => setGuardrailsText(event.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
              placeholder="Nao conceder desconto sem aprovacao\nNao prometer prazo sem validar operacao"
            />
          </label>

          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar configuracoes
          </button>
        </form>

        <form onSubmit={handleAddKbDoc} className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-3">
          <h3 className="text-sm uppercase tracking-wide text-white/60">Base de conhecimento</h3>

          <label className="block text-xs text-white/70">
            Tipo
            <select
              value={docType}
              onChange={(event) => setDocType(event.target.value as KbDoc["type"])}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
            >
              <option value="faq">FAQ</option>
              <option value="catalog">Catalogo</option>
              <option value="policy">Politica</option>
            </select>
          </label>

          <label className="block text-xs text-white/70">
            Conteudo
            <textarea
              value={docContent}
              onChange={(event) => setDocContent(event.target.value)}
              rows={6}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
              placeholder="Descreva produto, resposta pronta, politica ou informacoes comerciais"
            />
          </label>

          <Field
            label="Tags (separadas por virgula)"
            value={docTags}
            onChange={setDocTags}
            placeholder="preco, prazo, onboarding"
          />

          <button
            type="submit"
            disabled={savingDoc || !docContent.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {savingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Adicionar documento
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#101010] p-5">
        <h3 className="text-sm uppercase tracking-wide text-white/60">Documentos cadastrados</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <DocColumn title="FAQ" docs={docsByType.faq} />
          <DocColumn title="Catalogo" docs={docsByType.catalog} />
          <DocColumn title="Politicas" docs={docsByType.policy} />
        </div>
      </section>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {success && <p className="text-sm text-emerald-300">{success}</p>}
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
    <label className="block text-xs text-white/70">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}

function DocColumn({ title, docs }: { title: string; docs: KbDoc[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <h4 className="text-xs uppercase tracking-wide text-white/60">{title}</h4>
      <div className="mt-2 space-y-2">
        {docs.map((doc) => (
          <article key={doc.id} className="rounded-lg border border-white/10 bg-black/30 p-2">
            <p className="text-xs text-white/85 line-clamp-4">{doc.content}</p>
            <p className="text-[10px] text-white/45 mt-1">{doc.tags.join(", ") || "sem tags"}</p>
          </article>
        ))}
        {docs.length === 0 && <p className="text-xs text-white/45">Nenhum documento.</p>}
      </div>
    </div>
  );
}