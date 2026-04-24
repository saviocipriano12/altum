"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Building2, Clock3, Loader2, Save } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, PanelCard, SectionHeader } from "@/app/cliente/painel/components/ui";
import { BUSINESS_PROFILES, type BusinessProfileId } from "@/lib/business-profiles";

type TenantSettings = {
  name?: string;
  niche?: string;
  businessProfileId?: BusinessProfileId | "";
  responsibleName?: string;
  responsibleEmail?: string;
  phone?: string;
  website?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  timezone?: string;
  businessHours?: string;
};

export default function ClienteEmpresaPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<TenantSettings>({});
  const canManage = hasCapability("manage_settings");
  const selectedProfile = BUSINESS_PROFILES[form.businessProfileId || "generic"];

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/settings`);
        const payload = (await res.json()) as { settings?: TenantSettings; error?: string };
        if (!mounted) return;
        if (!res.ok) {
          setError(payload.error || "Falha ao carregar configuracoes.");
          return;
        }
        setForm(payload.settings || {});
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar configuracoes.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage) return;

    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar configuracoes.");
        return;
      }
      setNotice("Configuracoes da empresa atualizadas.");
    } catch {
      setError("Falha ao salvar configuracoes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Dados da empresa"
        subtitle="Governanca base do tenant: identidade operacional, horario e responsavel principal."
        action={
          <Link
            href="/cliente/painel/configuracoes"
            className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <PanelCard className="p-5">
          <form onSubmit={onSubmit} className="space-y-3">
            <CardTitle title="Identidade do tenant" subtitle="Esses dados organizam a operacao e o contexto do painel cliente." />

            {loading ? (
              <div className="py-10 text-center text-white/60">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <Field label="Nome da empresa" value={form.name || ""} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
                <Field label="Nicho" value={form.niche || ""} onChange={(value) => setForm((current) => ({ ...current, niche: value }))} />
                <SelectField
                  label="Modo do negocio"
                  value={form.businessProfileId || "generic"}
                  onChange={(value) => setForm((current) => ({ ...current, businessProfileId: value as BusinessProfileId }))}
                  options={Object.values(BUSINESS_PROFILES).map((profile) => ({
                    value: profile.id,
                    label: profile.label,
                  }))}
                />
                <Field label="Responsavel" value={form.responsibleName || ""} onChange={(value) => setForm((current) => ({ ...current, responsibleName: value }))} />
                <Field label="E-mail do responsavel" value={form.responsibleEmail || ""} onChange={(value) => setForm((current) => ({ ...current, responsibleEmail: value }))} />
                <Field label="Telefone principal" value={form.phone || ""} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
                <Field label="Website" value={form.website || ""} onChange={(value) => setForm((current) => ({ ...current, website: value }))} />
                <Field label="Endereco" value={form.addressLine || ""} onChange={(value) => setForm((current) => ({ ...current, addressLine: value }))} />
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Cidade" value={form.city || ""} onChange={(value) => setForm((current) => ({ ...current, city: value }))} />
                  <Field label="Estado" value={form.state || ""} onChange={(value) => setForm((current) => ({ ...current, state: value }))} />
                </div>
                <Field label="Timezone" value={form.timezone || "America/Sao_Paulo"} onChange={(value) => setForm((current) => ({ ...current, timezone: value }))} />
                <Field label="Horario comercial" value={form.businessHours || "Seg-Sex 09:00-18:00"} onChange={(value) => setForm((current) => ({ ...current, businessHours: value }))} />

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--cliente-accent-strong)] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {canManage ? "Salvar dados" : "Somente leitura"}
                </button>
              </>
            )}
          </form>

          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
          {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.05] p-2 text-white/85">
              <BriefcaseBusiness className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white/92">Modo de negocio</p>
            <p className="mt-1 text-sm text-white/58">{selectedProfile.description}</p>
            <p className="mt-3 text-xs text-white/50">{selectedProfile.commercialMotion}</p>
          </PanelCard>

          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.05] p-2 text-white/85">
              <Building2 className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white/92">Tenant identificado</p>
            <p className="mt-1 text-sm text-white/58">Nome e nicho alimentam contexto comercial, IA e governanca do painel.</p>
            {form.website ? <p className="mt-3 text-xs text-white/50">{form.website}</p> : null}
          </PanelCard>

          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-white/15 bg-white/[0.05] p-2 text-white/85">
              <Clock3 className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white/92">Horario operacional</p>
            <p className="mt-1 text-sm text-white/58">Esse campo prepara base para SLA, janela de handoff e automacoes por horario.</p>
            {(form.city || form.state || form.addressLine) ? (
              <p className="mt-3 text-xs text-white/50">
                {[form.addressLine, form.city, form.state].filter(Boolean).join(" • ")}
              </p>
            ) : null}
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[var(--cliente-border-strong)] focus:bg-black/45"
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
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[var(--cliente-border-strong)] focus:bg-black/45"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#111827] text-white">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

