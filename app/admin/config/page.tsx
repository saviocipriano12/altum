"use client";

import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
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

export default function ConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ===== CAMPOS BÁSICOS =====
  const [agencyName, setAgencyName] = useState("ALTUM");
  const [responsavel, setResponsavel] = useState("Sávio Cipriano");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [siteBase, setSiteBase] = useState("https://altumia.com.br");

  // ===== BRANDING =====
  const [corPrimaria, setCorPrimaria] = useState("#2563eb"); // azul
  const [corSecundaria, setCorSecundaria] = useState("#f97316"); // laranja
  const [corDestaque, setCorDestaque] = useState("#22c55e"); // verde

  // ===== PROSPECÇÃO / SDR =====
  const [mensagemBoasVindas, setMensagemBoasVindas] = useState(
    "Oi, tudo bem? Aqui é da ALTUM. Vi que sua empresa tem potencial pra crescer ainda mais com tráfego e estrutura profissional. Posso te mandar uma ideia rápida do que eu faria pra você?"
  );
  const [scriptPrimeiroContato, setScriptPrimeiroContato] = useState(
    "1) Que tipo de negócio você atende?\n2) Hoje você já anuncia em algum canal (Google / Meta / outros)?\n3) Qual é o ticket médio do seu cliente?\n4) Qual resultado você gostaria de atingir nos próximos 3 meses?"
  );
  const [diasFollowUp, setDiasFollowUp] = useState(2);

  // ===== INTEGRAÇÕES =====
  const [webhookProspeccao, setWebhookProspeccao] = useState("");
  const [metaWabaTokenPlaceholder, setMetaWabaTokenPlaceholder] =
    useState("***************");

  useEffect(() => {
    async function carregarConfig() {
      try {
        const ref = doc(db, "config", "altum");
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data: any = snap.data();

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
          // nunca mostramos o token real se existir
          if (data.metaWabaToken) {
            setMetaWabaTokenPlaceholder("***************");
          }
        }
      } catch (err) {
        console.error("Erro ao carregar config ALTUM:", err);
      } finally {
        setLoading(false);
      }
    }

    carregarConfig();
  }, []);

  async function salvarConfig(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);

      const ref = doc(db, "config", "altum");

      await setDoc(
        ref,
        {
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
          // metaWabaToken: aqui você preenche manualmente direto no Firestore se quiser,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
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
            Configurações da ALTUM
          </h1>
          <p className="text-sm text-white/60 max-w-xl">
            Central onde você define identidade da agência, mensagens padrão da
            SDR e integrações da Máquina de Prospecção.
          </p>
        </div>

        <button
          onClick={salvarConfig}
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
              Salvar alterações
            </>
          )}
        </button>
      </div>

      {loading && (
        <p className="text-xs text-white/40">Carregando configurações…</p>
      )}

      {!loading && (
        <form onSubmit={salvarConfig} className="space-y-6">
          {/* BLOCO: DADOS DA AGÊNCIA */}
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-white/70" />
              <div>
                <h2 className="text-sm font-semibold">Dados da agência</h2>
                <p className="text-xs text-white/60">
                  Informações básicas da ALTUM, usadas em propostas, contratos
                  e comunicações.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-white/60">
                  Nome da agência
                </label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60">
                  Responsável principal
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
                  Site / domínio principal
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
                  Identidade visual básica
                </h2>
                <p className="text-xs text-white/60">
                  Paleta que pode ser usada nos próximos módulos (sites, LPs,
                  propostas).
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-white/60">Cor primária</label>
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
                <label className="text-xs text-white/60">Cor secundária</label>
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

          {/* BLOCO: PROSPECÇÃO / SDR */}
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-white/70" />
              <div>
                <h2 className="text-sm font-semibold">
                  Máquina de Prospecção & SDR
                </h2>
                <p className="text-xs text-white/60">
                  Mensagens padrão que a IA / SDR pode usar para abordar os
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
                  Essa é a mensagem base que o SDR (humano ou IA) usa no
                  primeiro contato.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60">
                  Roteiro de perguntas (diagnóstico)
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={scriptPrimeiroContato}
                  onChange={(e) => setScriptPrimeiroContato(e.target.value)}
                />
                <p className="text-[11px] text-white/40">
                  Perguntas que ajudam a entender o cenário do cliente antes de
                  montar proposta.
                </p>
              </div>
            </div>

            <div className="space-y-1 max-w-xs">
              <label className="text-xs text-white/60">
                Dias padrão para primeiro follow-up
              </label>
              <input
                type="number"
                min={0}
                className="w-24 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none"
                value={diasFollowUp}
                onChange={(e) => setDiasFollowUp(Number(e.target.value))}
              />
              <p className="text-[11px] text-white/40">
                Esse valor pode ser usado nos fluxos automáticos de follow-up
                (n8n).
              </p>
            </div>
          </section>

          {/* BLOCO: INTEGRAÇÕES */}
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-white/70" />
              <div>
                <h2 className="text-sm font-semibold">Integrações</h2>
                <p className="text-xs text-white/60">
                  Endpoints e tokens usados pela máquina de prospecção, n8n e
                  WhatsApp Business.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-white/60">
                  Webhook de entrada de leads (n8n / prospecção)
                </label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
                  value={webhookProspeccao}
                  onChange={(e) => setWebhookProspeccao(e.target.value)}
                  placeholder="https://seu-n8n.com/webhook/altum-leads"
                />
                <p className="text-[11px] text-white/40">
                  URL que recebe os leads captados (Google Places, formulários,
                  etc).
                </p>
              </div>

              <div className="space-y-1 max-w-md">
                <label className="text-xs text-white/60">
                  Meta WhatsApp Business API – Token (armazenado apenas no
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
                  Por segurança, o token real é melhor ser colado diretamente
                  no Firestore ou em variável de ambiente. Aqui fica apenas o
                  registro conceitual.
                </p>
              </div>
            </div>
          </section>

          {/* BOTÃO SALVAR NO FINAL TAMBÉM */}
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
                  Salvar configurações
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
