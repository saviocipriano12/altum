"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, Plus, Sparkles } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";

type Connection = { id: string; providerId: string; displayName: string; capabilities: string[]; status: string; healthStatus?: string | null; credentialConfigured: boolean; credential: string; chatModel?: string | null; modelCatalog?: string[] };
type Provider = { slug: string; name: string; capabilities: string[] };

const QUICK_CONNECT = [
  { providerId: "freellmapi", name: "Central de IAs gratuitas", title: "Use várias IAs com uma só conexão", detail: "Reúne NVIDIA, Groq, Gemini, Mistral e outros. A Altum escolhe e troca de IA automaticamente quando uma cota termina.", capabilities: ["GENERATE_TEXT", "CLASSIFY", "ANALYZE_RESULTS"], connectionType: "local" },
  { providerId: "nvidia-nim", name: "NVIDIA", title: "Modelos avançados", detail: "Texto, análise, visão e busca em documentos.", capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS", "GENERATE_EMBEDDINGS", "RERANK_DOCUMENTS"] },
  { providerId: "groq", name: "Groq", title: "Respostas muito rápidas", detail: "Ideal para conversa, classificação e agentes do dia a dia.", capabilities: ["GENERATE_TEXT", "CLASSIFY", "ANALYZE_RESULTS", "DECIDE_STRUCTURED"] },
  { providerId: "google", name: "Google Gemini", title: "Pesquisa e multimodal", detail: "Bom para documentos, visão e tarefas gerais.", capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS", "GENERATE_EMBEDDINGS", "CLASSIFY"] },
  { providerId: "alibaba-model-studio", name: "Alibaba Model Studio / Qwen", title: "Vários modelos em uma conexão", detail: "Conecte sua campanha ou plano do Alibaba. A Altum usa Qwen e os modelos liberados na sua chave para escrita, análise, imagens e vídeos Wan.", capabilities: ["GENERATE_TEXT", "GENERATE_IMAGE", "GENERATE_VIDEO", "READ_DOCUMENTS", "ANALYZE_RESULTS", "CLASSIFY", "DECIDE_STRUCTURED"], needsEndpoint: true, suggestedModel: "qwen-plus" },
  { providerId: "custom-openai-compatible", name: "Outra API compatível", title: "Conecte uma API fora da lista", detail: "Para serviços que informam ser compatíveis com a API da OpenAI. Uma única conexão pode usar o modelo que você escolher.", capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS", "CLASSIFY", "DECIDE_STRUCTURED"], needsEndpoint: true },
  { providerId: "mistral", name: "Mistral", title: "Alternativa de texto", detail: "Um fallback confiável para escrita e análise.", capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS"] },
  { providerId: "fal", name: "fal", title: "Vídeo e imagem de alta qualidade", detail: "Uma conexão para Seedance, Wan, Kling e outros. A Altum usa a melhor rota para cada criativo.", capabilities: ["GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AUDIO", "GENERATE_AVATAR_VIDEO"] },
  { providerId: "replicate", name: "Replicate", title: "Vídeos econômicos e backup", detail: "Alternativa para gerar muitas variações de vídeo sem depender de um único fornecedor.", capabilities: ["GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AUDIO"] },
  { providerId: "higgsfield", name: "Higgsfield", title: "Vídeo cinematográfico e personagem", detail: "Catálogo de vídeo e imagem para cenas com mais direção visual. A Altum usa quando elevar a qualidade fizer sentido.", capabilities: ["GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AUDIO", "GENERATE_AVATAR_VIDEO"] },
  { providerId: "ltx-cloud", name: "LTX Cloud", title: "Vídeos rápidos", detail: "Bom para testes, variações e cenas de apoio. Também pode ser usado localmente depois.", capabilities: ["GENERATE_VIDEO", "GENERATE_AUDIO", "GENERATE_CREATIVE"] },
  { providerId: "heygen", name: "HeyGen", title: "Seu avatar em vídeo", detail: "Para apresentador, clone autorizado e vídeos com fala. A Altum sempre pedirá confirmação antes de gerar.", capabilities: ["GENERATE_VIDEO", "GENERATE_AUDIO", "GENERATE_AVATAR_VIDEO"] },
];

const statusLabel: Record<string, string> = { configured_unapproved: "Aguardando primeira validação", healthy: "Funcionando", approved: "Ativa", degraded: "Indisponível agora", pending_config: "Falta concluir" };
const TESTABLE_CONNECTIONS = new Set(["freellmapi", "openjev", "replicate", "comfyui", "ltx", "openmontage", "nvidia-nim", "groq", "cerebras", "mistral", "openrouter", "huggingface", "alibaba-model-studio", "custom-openai-compatible"]);

export default function ConnectionsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selected, setSelected] = useState<typeof QUICK_CONNECT[number] | null>(null);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [openAdvanced, setOpenAdvanced] = useState(false);
  const [advanced, setAdvanced] = useState({ providerId: "", displayName: "", baseUrl: "", credential: "", connectionType: "api" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [providersResponse, connectionsResponse] = await Promise.all([authedFetch("/api/admin/agent-os/tool-providers"), authedFetch("/api/admin/agent-os/tool-connections")]);
      const providersData = await providersResponse.json().catch(() => ({})) as { catalog?: Provider[]; custom?: Provider[]; error?: string };
      const connectionsData = await connectionsResponse.json().catch(() => ({})) as { items?: Connection[]; error?: string };
      if (!providersResponse.ok || !connectionsResponse.ok) throw new Error(providersData.error || connectionsData.error || "Não foi possível carregar as conexões.");
      const nextProviders = [...(providersData.catalog || []), ...(providersData.custom || [])];
      setProviders(nextProviders); setConnections(connectionsData.items || []);
      setAdvanced((current) => ({ ...current, providerId: current.providerId || nextProviders[0]?.slug || "" }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as conexões."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function choose(item: typeof QUICK_CONNECT[number]) { setSelected(item); setName(`${item.name} — Altum`); setKey(""); setEndpoint(""); setChatModel("suggestedModel" in item ? item.suggestedModel || "" : ""); setError(""); setNotice(""); }
  async function saveQuick(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    await save({ providerId: selected.providerId, displayName: name.trim() || `${selected.name} — Altum`, connectionType: "connectionType" in selected ? selected.connectionType : "api", credential: key, baseUrl: endpoint, chatModel, capabilities: selected.capabilities });
  }
  async function saveAdvanced(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const provider = providers.find((item) => item.slug === advanced.providerId);
    await save({ providerId: advanced.providerId, displayName: advanced.displayName, connectionType: advanced.connectionType, baseUrl: advanced.baseUrl, credential: advanced.credential, capabilities: provider?.capabilities || ["GENERATE_TEXT"] });
  }
  async function save(payload: Record<string, unknown>) {
    try {
      setSaving(true); setError(""); setNotice("");
      const response = await authedFetch("/api/admin/agent-os/tool-connections", { method: "POST", body: JSON.stringify({ scope: "platform", ...payload }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível conectar esta IA.");
      setNotice("Conexão salva com segurança. A Altum vai validá-la antes de usá-la como rota confiável.");
      setSelected(null); setKey(""); setOpenAdvanced(false); setAdvanced((current) => ({ ...current, displayName: "", baseUrl: "", credential: "" })); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível conectar esta IA."); }
    finally { setSaving(false); }
  }
  async function testConnection(connection: Connection) {
    try {
      setSaving(true); setError(""); setNotice("");
      const response = await authedFetch(`/api/admin/agent-os/tool-connections/${connection.id}/health`, { method: "POST" });
      const data = await response.json().catch(() => ({})) as { error?: string; details?: { account?: string } };
      if (!response.ok) throw new Error(data.error || "Não foi possível testar esta conexão.");
      setNotice(data.details?.account ? `Conexão confirmada para ${data.details.account}.` : "Conexão confirmada. A Altum já pode usá-la."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível testar esta conexão."); }
    finally { setSaving(false); }
  }

    return <div className="mx-auto max-w-6xl space-y-7 pb-10">
    <header><p className="text-xs font-semibold uppercase tracking-[.18em] text-violet-600">Altum Agent OS</p><h1 className="mt-1 text-2xl font-semibold">Conectar inteligências</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Escolha as IAs que a Altum poderá usar. Você só precisa inserir a chave; a plataforma cuida da configuração técnica e escolhe a melhor opção para cada tarefa.</p></header>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice && <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={17} />{notice}</p>}

    <section><div className="mb-3"><h2 className="font-semibold">Texto, pesquisa e organização</h2><p className="mt-1 text-sm text-slate-500">A Central de IAs gratuitas é a base. As outras opções servem como reforço quando for necessário.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{QUICK_CONNECT.slice(0, 7).map((item) => <button key={item.providerId} onClick={() => choose(item)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-violet-400 hover:shadow"><Sparkles size={19} className="text-violet-600" /><p className="mt-4 font-semibold">{item.name}</p><p className="mt-1 text-sm font-medium text-slate-700">{item.title}</p><p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p><span className="mt-4 inline-block text-sm font-semibold text-violet-700">Conectar →</span></button>)}</div></section>

    <section><div className="mb-3"><h2 className="font-semibold">Criação de imagem, vídeo e avatar</h2><p className="mt-1 text-sm text-slate-500">Conecte aos poucos. A Altum escolhe a rota mais adequada e sempre mostra uma aprovação antes de consumir créditos.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{QUICK_CONNECT.slice(7).map((item) => <button key={item.providerId} onClick={() => choose(item)} className="rounded-2xl border border-violet-100 bg-white p-5 text-left shadow-sm transition hover:border-violet-400 hover:shadow"><Sparkles size={19} className="text-violet-600" /><p className="mt-4 font-semibold">{item.name}</p><p className="mt-1 text-sm font-medium text-slate-700">{item.title}</p><p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p><span className="mt-4 inline-block text-sm font-semibold text-violet-700">Conectar →</span></button>)}</div></section>

    {selected && <form onSubmit={saveQuick} className="rounded-2xl border border-violet-300 bg-violet-50/50 p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-700">Nova conexão</p><h2 className="mt-1 text-lg font-semibold">Conectar {selected.name}</h2><p className="mt-1 text-sm text-slate-600">{selected.providerId === "freellmapi" ? "Cole a chave unificada gerada pela sua Central de IAs gratuitas. Ela já sabe quais providers estão disponíveis e faz fallback automaticamente." : selected.providerId === "alibaba-model-studio" ? "Cole a chave e o endereço exibidos pelo Alibaba Model Studio ao criá-la. Esta é uma única conexão para os modelos que sua chave liberar." : selected.providerId === "custom-openai-compatible" ? "Use esta opção quando o fornecedor disser que sua API é compatível com OpenAI. Cole a chave, o endereço base e o identificador exato do modelo." : `Cole a chave criada no painel da ${selected.name}. O endereço da API e as permissões necessárias serão configurados automaticamente.`}</p></div><button type="button" onClick={() => setSelected(null)} className="text-sm font-medium text-slate-500">Cancelar</button></div><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="label">Nome para reconhecer depois<input required value={name} onChange={(event) => setName(event.target.value)} className="field" /></label><label className="label">{selected.providerId === "freellmapi" ? "Chave da Central" : "Chave da API"}<input required type="password" autoComplete="new-password" value={key} onChange={(event) => setKey(event.target.value)} className="field" placeholder="Cole a chave aqui" /></label>{(selected.providerId === "alibaba-model-studio" || selected.providerId === "custom-openai-compatible") && <><label className="label md:col-span-2">{selected.providerId === "alibaba-model-studio" ? "Endereço da API mostrado pelo Alibaba" : "Endereço base da API"}<input required type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} className="field" placeholder={selected.providerId === "alibaba-model-studio" ? "https://seu-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1" : "https://api.fornecedor.com/v1"} /></label><label className="label">Modelo principal<input required value={chatModel} onChange={(event) => setChatModel(event.target.value)} className="field" placeholder={selected.providerId === "alibaba-model-studio" ? "Ex.: qwen-plus" : "Ex.: modelo-exato-do-fornecedor"} /></label></>}</div><div className="mt-5 flex justify-end"><button disabled={saving || key.trim().length < 4 || ((selected.providerId === "alibaba-model-studio" || selected.providerId === "custom-openai-compatible") && (!endpoint.trim() || !chatModel.trim()))} className="primary disabled:opacity-60">{saving && <Loader2 size={16} className="animate-spin" />}{saving ? "Conectando..." : `Conectar ${selected.name}`}</button></div></form>}

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">IAs conectadas</h2><p className="mt-1 text-sm text-slate-500">A Altum escolhe automaticamente entre as rotas disponíveis conforme tarefa, qualidade, disponibilidade e custo.</p></div>{loading ? <div className="flex justify-center p-10"><Loader2 className="animate-spin text-violet-600" /></div> : connections.length ? <div className="divide-y divide-slate-100">{connections.map((connection) => <div key={connection.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div><p className="font-semibold">{connection.displayName}</p><p className="mt-1 text-sm text-slate-500">{connection.credentialConfigured ? connection.chatModel ? `Chave protegida · modelo principal: ${connection.chatModel}${connection.modelCatalog?.length ? ` · ${connection.modelCatalog.length} modelos encontrados` : ""}` : connection.status === "degraded" ? "A última validação falhou; revise a chave e teste novamente" : TESTABLE_CONNECTIONS.has(connection.providerId) ? "Chave protegida · teste rápido disponível" : "Chave protegida · será validada na primeira geração autorizada" : "A chave ainda não foi adicionada"}</p></div><div className="flex items-center gap-3">{TESTABLE_CONNECTIONS.has(connection.providerId) && connection.credentialConfigured && <button type="button" disabled={saving} onClick={() => void testConnection(connection)} className="text-sm font-semibold text-violet-700 disabled:opacity-50">Testar agora</button>}<span className={`rounded-full px-3 py-1 text-xs font-semibold ${connection.status === "healthy" || connection.status === "approved" ? "bg-emerald-100 text-emerald-800" : connection.status === "configured_unapproved" ? "bg-sky-100 text-sky-800" : connection.status === "degraded" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{statusLabel[connection.status] || connection.status}</span></div></div>)}</div> : <div className="p-10 text-center text-sm text-slate-500">Nenhuma IA conectada ainda. Comece pela Central de IAs gratuitas ou por FAL.</div>}</section>

    <section className="rounded-2xl border border-slate-200 bg-white"><button onClick={() => setOpenAdvanced((value) => !value)} className="flex w-full items-center justify-between px-5 py-4 text-left"><span><span className="block font-semibold">Opções avançadas</span><span className="mt-1 block text-sm text-slate-500">IA local, executores de imagem/vídeo e configurações especiais.</span></span><ChevronDown className={`transition ${openAdvanced ? "rotate-180" : ""}`} size={18} /></button>{openAdvanced && <form onSubmit={saveAdvanced} className="border-t border-slate-100 p-5"><p className="mb-4 text-sm text-slate-500">Use esta área apenas quando estiver conectando um servidor próprio, ComfyUI, LTX ou outra ferramenta que exija endereço específico.</p><div className="grid gap-4 md:grid-cols-2"><label className="label">Ferramenta<select value={advanced.providerId} onChange={(event) => setAdvanced({ ...advanced, providerId: event.target.value })} className="field">{providers.map((provider) => <option value={provider.slug} key={provider.slug}>{provider.name}</option>)}</select></label><label className="label">Nome<input required value={advanced.displayName} onChange={(event) => setAdvanced({ ...advanced, displayName: event.target.value })} className="field" placeholder="Ex.: Meu ComfyUI" /></label><label className="label">Endereço da ferramenta<input value={advanced.baseUrl} onChange={(event) => setAdvanced({ ...advanced, baseUrl: event.target.value })} className="field" placeholder="http://127.0.0.1:3011" /></label><label className="label">Chave, se houver<input type="password" autoComplete="new-password" value={advanced.credential} onChange={(event) => setAdvanced({ ...advanced, credential: event.target.value })} className="field" /></label></div><div className="mt-4 flex justify-end"><button disabled={saving} className="primary disabled:opacity-60"><Plus size={16} />Salvar opção avançada</button></div></form>}</section>
    <style jsx>{`.field{display:block;width:100%;margin-top:.45rem;border:1px solid rgb(226 232 240);border-radius:.75rem;background:white;padding:.7rem .8rem;font-size:.875rem;outline:none}.field:focus{border-color:rgb(139 92 246);box-shadow:0 0 0 3px rgb(237 233 254)}.label{font-size:.875rem;font-weight:600;color:rgb(51 65 85)}.primary{display:inline-flex;align-items:center;gap:.5rem;border-radius:.75rem;background:rgb(124 58 237);padding:.65rem 1rem;font-size:.875rem;font-weight:600;color:white}`}</style>
  </div>;
}
