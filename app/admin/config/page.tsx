"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import {
  Loader2,
  Save,
  Settings,
  Building2,
  Palette,
  MessageCircle,
  Link2,
  Globe2,
  Phone,
  Mail,
} from "lucide-react";

interface AltumConfigDoc {
  agencyName?: string;
  responsavel?: string;
  cnpj?: string;
  email?: string;
  whatsapp?: string;
  siteBase?: string;
  corPrimaria?: string;
  corSecundaria?: string;
  corDestaque?: string;
  mensagemBoasVindas?: string;
  scriptPrimeiroContato?: string;
  diasFollowUp?: number;
  webhookProspeccao?: string;
  hasMetaWabaToken?: boolean;
}

type IntegrationStatus = {
  key: string;
  label: string;
  status: "ok" | "missing";
  details: string;
  requiredEnvs: string[];
  missingEnvs: string[];
};

export default function ConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);

  // ===== CAMPOS BASICOS =====
  const [agencyName, setAgencyName] = useState("ALTUM");
  const [responsavel, setResponsavel] = useState("Savio Cipriano");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [siteBase, setSiteBase] = useState("https://altumia.com.br");

  // ===== BRANDING =====
  const [corPrimaria, setCorPrimaria] = useState("#2563eb"); // azul
  const [corSecundaria, setCorSecundaria] = useState("#f97316"); // laranja
  const [corDestaque, setCorDestaque] = useState("#22c55e"); // verde

  // ===== PROSPECCAO / SDR =====
  const [mensagemBoasVindas, setMensagemBoasVindas] = useState(
    "Oi, tudo bem? Aqui e da ALTUM. Vi que sua empresa tem potencial pra crescer ainda mais com trafego e estrutura profissional. Posso te mandar uma ideia rapida do que eu faria pra voce?"
  );
  const [scriptPrimeiroContato, setScriptPrimeiroContato] = useState(
    "1) Que tipo de negocio voce atende?\n2) Hoje voce ja anuncia em algum canal (Google / Meta / outros)?\n3) Qual e o ticket medio do seu cliente?\n4) Qual resultado voce gostaria de atingir nos proximos 3 meses?"
  );
  const [diasFollowUp, setDiasFollowUp] = useState(2);

  // ===== INTEGRACOES =====
  const [webhookProspeccao, setWebhookProspeccao] = useState("");
  const [metaWabaTokenPlaceholder, setMetaWabaTokenPlaceholder] =
    useState("***************");

  useEffect(() => {
    async function carregarConfig() {
      try {
        const res = await authedFetch("/api/config/altum");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Falha ao carregar configuracoes.");
        }

        const data = (await res.json()) as AltumConfigDoc;
        setAgencyName(data.agencyName ?? "ALTUM");
        setResponsavel(data.responsavel ?? "Sávio Cipriano");
        setCnpj(data.cnpj ?? "");
        setEmail(data.email ?? "");
        setWhatsapp(data.whatsapp ?? "");
        setSiteBase(data.siteBase ?? "https://altumia.com.br");

        setCorPrimaria(data.corPrimaria ?? "#2563eb");
        setCorSecundaria(data.corSecundaria ?? "#f97316");
        setCorDestaque(data.corDestaque ?? "#22c55e");

        setMensagemBoasVindas(
          data.mensagemBoasVindas ??
            "Oi, tudo bem? Aqui é da ALTUM. Vi que sua empresa tem potencial pra crescer ainda mais com tráfego e estrutura profissional. Posso te mandar uma ideia rápida do que eu faria pra você?"
        );
        setScriptPrimeiroContato(
          data.scriptPrimeiroContato ??
            "1) Que tipo de negócio você atende?\n2) Hoje você já anuncia em algum canal (Google / Meta / outros)?\n3) Qual é o ticket médio do seu cliente?\n4) Qual resultado você gostaria de atingir nos próximos 3 meses?"
        );
        setDiasFollowUp(data.diasFollowUp ?? 2);

        setWebhookProspeccao(data.webhookProspeccao ?? "");
        if (data.hasMetaWabaToken) {
          setMetaWabaTokenPlaceholder("***************");
        }
      } catch (err) {
        console.error("Erro ao carregar config ALTUM:", err);
      } finally {
        setLoading(false);
      }
    }

    void carregarConfig();
  }, []);

  useEffect(() => {
    async function carregarIntegracoes() {
      try {
        const res = await authedFetch("/api/admin/integrations/status");
        const data = (await res.json()) as {
          ok?: boolean;
          integrations?: IntegrationStatus[];
        };
        if (res.ok && Array.isArray(data.integrations)) {
          setIntegrations(data.integrations);
        }
      } catch (err) {
        console.error("Erro ao carregar status de integracoes:", err);
      }
    }

    void carregarIntegracoes();
  }, []);
  async function salvarConfig() {
    try {
      setSaving(true);
      const res = await authedFetch("/api/config/altum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyName,
          responsavel,
          cnpj,
          email,
          whatsapp,
          siteBase,
          corPrimaria,
          corSecundaria,
          corDestaque,
          mensagemBoasVindas,
          scriptPrimeiroContato,
          diasFollowUp: Number(diasFollowUp) || 0,
          webhookProspeccao,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao salvar configuracoes.");
      }
    } catch (err) {
      console.error("Erro ao salvar config ALTUM:", err);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-400" />
            Configuracoes da ALTUM
          </h1>
          <p className="text-sm text-white/60 max-w-xl">
            Central onde voce define identidade da agencia, mensagens padrao da
            SDR e integracoes da Maquina de Prospeccao.
          </p>
        </div>

        <button
          onClick={() => void salvarConfig()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 transition disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Salvar alteracoes
            </>
          )}
        </button>
      </div>

      {loading && (
        <p className="text-xs text-white/40">Carregando configuracoes...</p>
      )}

      {!loading && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void salvarConfig();
          }}
          className="space-y-6"
        >
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-white/70" />
              <div>
                <h2 className="text-sm font-semibold">Saude das integracoes</h2>
                <p className="text-xs text-white/60">
                  Verificacao em tempo real dos segredos obrigatorios no servidor.
                </p>
              </div>
            </div>

            {integrations.length === 0 ? (
              <p className="text-xs text-white/50">Sem dados de integracao no momento.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {integrations.map((item) => (
                  <div
                    key={item.key}
                    className={`rounded-xl border p-3 ${
                      item.status === "ok"
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-amber-500/30 bg-amber-500/10"
                    }`}
                  >
                    <p className="text-sm font-medium text-white/90">{item.label}</p>
                    <p className="text-[11px] text-white/65 mt-1">{item.details}</p>
                    <p
                      className={`text-[11px] mt-2 ${
                        item.status === "ok" ? "text-emerald-200" : "text-amber-200"
                      }`}
                    >
                      {item.status === "ok"
                        ? "Pronto para uso"
                        : `Faltando: ${item.missingEnvs.join(", ")}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* BLOCO: DADOS DA AGENCIA */}
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-white/70" />
              <div>
                <h2 className="text-sm font-semibold">Dados da agencia</h2>
                <p className="text-xs text-white/60">
                  Informacoes basicas da ALTUM, usadas em propostas, contratos
                  e comunicacoes.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-white/60">
                  Nome da agencia
                </label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60">
                  Responsavel principal
                </label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60">CNPJ (opcional)</label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60 flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  E-mail principal
                </label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60 flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  WhatsApp comercial
                </label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60 flex items-center gap-1">
                  <Globe2 className="h-3 w-3" />
                  Site / dominio principal
                </label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={siteBase}
                  onChange={(e) => setSiteBase(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* BLOCO: BRANDING */}
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-white/70" />
              <div>
                <h2 className="text-sm font-semibold">
                  Identidade visual basica
                </h2>
                <p className="text-xs text-white/60">
                  Paleta que pode ser usada nos proximos modulos (sites, LPs,
                  propostas).
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-white/60">Cor primaria</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-8 w-10 rounded-md border border-white/10 bg-transparent"
                    value={corPrimaria}
                    onChange={(e) => setCorPrimaria(e.target.value)}
                  />
                  <input
                    className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none"
                    value={corPrimaria}
                    onChange={(e) => setCorPrimaria(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60">Cor secundaria</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-8 w-10 rounded-md border border-white/10 bg-transparent"
                    value={corSecundaria}
                    onChange={(e) => setCorSecundaria(e.target.value)}
                  />
                  <input
                    className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none"
                    value={corSecundaria}
                    onChange={(e) => setCorSecundaria(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60">
                  Cor de destaque
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-8 w-10 rounded-md border border-white/10 bg-transparent"
                    value={corDestaque}
                    onChange={(e) => setCorDestaque(e.target.value)}
                  />
                  <input
                    className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none"
                    value={corDestaque}
                    onChange={(e) => setCorDestaque(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* BLOCO: PROSPECCAO / SDR */}
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-white/70" />
              <div>
                <h2 className="text-sm font-semibold">
                  Maquina de Prospeccao & SDR
                </h2>
                <p className="text-xs text-white/60">
                  Mensagens padrao que a IA / SDR pode usar para abordar os
                  leads.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-white/60">
                  Mensagem inicial de boas-vindas
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={mensagemBoasVindas}
                  onChange={(e) => setMensagemBoasVindas(e.target.value)}
                />
                <p className="text-[11px] text-white/40">
                  Essa e a mensagem base que o SDR (humano ou IA) usa no
                  primeiro contato.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60">
                  Roteiro de perguntas (diagnostico)
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={scriptPrimeiroContato}
                  onChange={(e) => setScriptPrimeiroContato(e.target.value)}
                />
                <p className="text-[11px] text-white/40">
                  Perguntas que ajudam a entender o cenario do cliente antes de
                  montar proposta.
                </p>
              </div>
            </div>

            <div className="space-y-1 max-w-xs">
              <label className="text-xs text-white/60">
                Dias padrao para primeiro follow-up
              </label>
              <input
                type="number"
                min={0}
                className="w-24 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none"
                value={diasFollowUp}
                onChange={(e) => setDiasFollowUp(Number(e.target.value))}
              />
              <p className="text-[11px] text-white/40">
                Esse valor pode ser usado nos fluxos automaticos de follow-up
                (n8n).
              </p>
            </div>
          </section>

          {/* BLOCO: INTEGRACOES */}
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-white/70" />
              <div>
                <h2 className="text-sm font-semibold">Integracoes</h2>
                <p className="text-xs text-white/60">
                  Endpoints e tokens usados pela maquina de prospeccao, n8n e
                  WhatsApp Business.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-white/60">
                  Webhook de entrada de leads (n8n / prospeccao)
                </label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={webhookProspeccao}
                  onChange={(e) => setWebhookProspeccao(e.target.value)}
                  placeholder="https://seu-n8n.com/webhook/altum-leads"
                />
                <p className="text-[11px] text-white/40">
                  URL que recebe os leads captados (Google Places, formularios,
                  etc).
                </p>
              </div>

              <div className="space-y-1 max-w-md">
                <label className="text-xs text-white/60">
                  Meta WhatsApp Business API - Token (armazenado apenas no
                  Firestore)
                </label>
                <input
                  disabled
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/40 outline-none"
                  value={metaWabaTokenPlaceholder}
                  onChange={(e) =>
                    setMetaWabaTokenPlaceholder(e.target.value)
                  }
                />
                <p className="text-[11px] text-white/40">
                  Por seguranca, o token real e melhor ser colado diretamente
                  no Firestore ou em variavel de ambiente. Aqui fica apenas o
                  registro conceitual.
                </p>
              </div>
            </div>
          </section>

          {/* BOTAO SALVAR NO FINAL TAMBEM */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 transition disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Salvar configuracoes
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}



