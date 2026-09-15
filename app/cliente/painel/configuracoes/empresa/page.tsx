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
  dailyReport?: {
    enabled?: boolean;
    ownerName?: string;
    ownerPhone?: string;
    sendHour?: string;
    templateName?: string;
    templateLanguage?: string;
  };
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
    if (!tenant?.tenantId) return;
    if (!canManage) {
      setError("Seu perfil pode consultar estes dados, mas nao pode alterar configuracoes da empresa.");
      return;
    }

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
        subtitle="Identidade do negocio, horario, responsavel e contexto que a Altum usa para operar melhor."
        action={
          <Link
            href="/cliente/painel/configuracoes"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-muted)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <PanelCard className="p-5">
          <form onSubmit={onSubmit} className="space-y-3">
            <CardTitle title="Identidade do negocio" subtitle="Esses dados organizam atendimento, relatorios, IA e rotina comercial." />
            {!canManage ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                Seu perfil pode consultar estes dados, mas apenas admins podem alterar configuracoes da empresa.
              </p>
            ) : null}

            {loading ? (
              <div className="py-10 text-center text-[var(--cliente-card-text-soft)]">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <Field disabled={!canManage} label="Nome da empresa" value={form.name || ""} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
                <Field disabled={!canManage} label="Nicho" value={form.niche || ""} onChange={(value) => setForm((current) => ({ ...current, niche: value }))} />
                <SelectField
                  label="Modo do negocio"
                  value={form.businessProfileId || "generic"}
                  onChange={(value) => setForm((current) => ({ ...current, businessProfileId: value as BusinessProfileId }))}
                  disabled={!canManage}
                  options={Object.values(BUSINESS_PROFILES).map((profile) => ({
                    value: profile.id,
                    label: profile.label,
                  }))}
                />
                <Field disabled={!canManage} label="Responsavel" value={form.responsibleName || ""} onChange={(value) => setForm((current) => ({ ...current, responsibleName: value }))} />
                <Field disabled={!canManage} type="email" label="E-mail do responsavel" value={form.responsibleEmail || ""} onChange={(value) => setForm((current) => ({ ...current, responsibleEmail: value }))} />
                <Field disabled={!canManage} label="Telefone principal" value={form.phone || ""} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
                <Field disabled={!canManage} label="Website" value={form.website || ""} onChange={(value) => setForm((current) => ({ ...current, website: value }))} />
                <Field disabled={!canManage} label="Endereco" value={form.addressLine || ""} onChange={(value) => setForm((current) => ({ ...current, addressLine: value }))} />
                <div className="grid gap-3 md:grid-cols-2">
                  <Field disabled={!canManage} label="Cidade" value={form.city || ""} onChange={(value) => setForm((current) => ({ ...current, city: value }))} />
                  <Field disabled={!canManage} label="Estado" value={form.state || ""} onChange={(value) => setForm((current) => ({ ...current, state: value }))} />
                </div>
                <Field disabled={!canManage} label="Fuso horario" value={form.timezone || "America/Sao_Paulo"} onChange={(value) => setForm((current) => ({ ...current, timezone: value }))} />
                <Field disabled={!canManage} label="Horario comercial" value={form.businessHours || "Seg-Sex 09:00-18:00"} onChange={(value) => setForm((current) => ({ ...current, businessHours: value }))} />

                <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Fechamento do Dia Altum</p>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                        Relatorio executivo enviado no WhatsApp do dono com resumo, alertas e plano para amanha.
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--cliente-card-text-muted)]">
                      <input
                        type="checkbox"
                        checked={form.dailyReport?.enabled !== false}
                        disabled={!canManage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            dailyReport: { ...(current.dailyReport || {}), enabled: event.target.checked },
                          }))
                        }
                      />
                      Ativo
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Field
                      disabled={!canManage}
                      label="Nome do dono"
                      value={form.dailyReport?.ownerName || form.responsibleName || ""}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          dailyReport: { ...(current.dailyReport || {}), ownerName: value },
                        }))
                      }
                    />
                    <Field
                      disabled={!canManage}
                      label="WhatsApp do dono"
                      value={form.dailyReport?.ownerPhone || form.phone || ""}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          dailyReport: { ...(current.dailyReport || {}), ownerPhone: value },
                        }))
                      }
                    />
                    <Field
                      disabled={!canManage}
                      type="time"
                      label="Horario de envio"
                      value={form.dailyReport?.sendHour || "18:30"}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          dailyReport: { ...(current.dailyReport || {}), sendHour: value },
                        }))
                      }
                    />
                    <Field
                      disabled={!canManage}
                      label="Modelo de mensagem"
                      value={form.dailyReport?.templateName || "fechamento_dia_altum"}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          dailyReport: { ...(current.dailyReport || {}), templateName: value },
                        }))
                      }
                    />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                    A mensagem precisa estar aprovada no WhatsApp Business para enviar o fechamento do dia com resumo, alertas, plano e link.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={saving || !canManage}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--cliente-accent-strong)] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {canManage ? "Salvar dados" : "Somente leitura"}
                </button>
              </>
            )}
          </form>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {notice ? <p className="mt-3 text-sm text-emerald-600">{notice}</p> : null}
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-2 text-[var(--cliente-primary)]">
              <BriefcaseBusiness className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">Modo de negocio</p>
            <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{selectedProfile.description}</p>
            <p className="mt-3 text-xs text-[var(--cliente-card-text-soft)]">{selectedProfile.commercialMotion}</p>
          </PanelCard>

          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-2 text-[var(--cliente-primary)]">
              <Building2 className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">Tenant identificado</p>
            <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Nome e nicho alimentam contexto comercial, IA e governanca do painel.</p>
            {form.website ? <p className="mt-3 text-xs text-[var(--cliente-card-text-soft)]">{form.website}</p> : null}
          </PanelCard>

          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-2 text-[var(--cliente-primary)]">
              <Clock3 className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">Horario operacional</p>
            <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Esse campo prepara base para SLA, janela de handoff e automacoes por horario.</p>
            {(form.city || form.state || form.addressLine) ? (
              <p className="mt-3 text-xs text-[var(--cliente-card-text-soft)]">
                {[form.addressLine, form.city, form.state].filter(Boolean).join(" • ")}
              </p>
            ) : null}
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, disabled = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; type?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2.5 text-sm text-[var(--cliente-card-text)] outline-none transition placeholder:text-[var(--cliente-card-text-soft)] focus:border-[var(--cliente-primary)] focus:bg-white disabled:cursor-not-allowed disabled:bg-[var(--cliente-surface-muted)] disabled:opacity-70"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2.5 text-sm text-[var(--cliente-card-text)] outline-none transition focus:border-[var(--cliente-primary)] focus:bg-white disabled:cursor-not-allowed disabled:bg-[var(--cliente-surface-muted)] disabled:opacity-70"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-white text-slate-900">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

