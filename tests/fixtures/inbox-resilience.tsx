import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useInboxDraft } from "../../app/cliente/painel/hooks/use-inbox-draft";
import { useInboxMediaDraft } from "../../app/cliente/painel/hooks/use-inbox-media-draft";
import { useInboxReadingPosition } from "../../app/cliente/painel/hooks/use-inbox-reading-position";
import { useAdaptivePolling } from "../../app/cliente/painel/hooks/use-adaptive-polling";

// A local-only component laboratory. No Firebase, auth bypass or provider requests.
function Laboratory() {
  const [chat, setChat] = useState("A");
  const [tenant, setTenant] = useState("qa-alpha");
  const [user, setUser] = useState("operator-1");
  const [history, setHistory] = useState({ chat: "A", start: 181 });
  const [total, setTotal] = useState(240);
  const [expanded, setExpanded] = useState(false);
  const [ticks, setTicks] = useState(0);
  const [nearBottom, setNearBottom] = useState(true);
  const [attempt, setAttempt] = useState<ReturnType<ReturnType<typeof useInboxDraft>["beginAttempt"]> | null>(null);
  const [receipt, setReceipt] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const draft = useInboxDraft(tenant, user, `chat:${chat}`);
  const media = useInboxMediaDraft(tenant, user, chat);
  useEffect(() => { setHistory({ chat, start: 181 }); }, [chat]);
  const loadOlder = useCallback(async () => {
    setHistory((current) => ({ ...current, start: Math.max(1, current.start - 60) }));
  }, []);
  const onScroll = useCallback((value: boolean) => setNearBottom(value), []);
  const reading = useInboxReadingPosition({ tenantId: tenant, userId: user, chatId: chat,
    containerRef: container, loading: history.chat !== chat, messageCount: total - history.start + 1,
    hasOlder: history.start > 1, loadingOlder: false, loadOlder, onUserScroll: onScroll });
  useAdaptivePolling({ enabled: true, onTick: () => setTicks((value) => value + 1),
    fastIntervalMs: 600000, slowIntervalMs: 600000, runOnMount: false, refreshOnResume: true,
    source: "qa-inbox-hooks" });
  return <main>
    <h1>Laboratorio local — Conversas</h1>
    <p>Componentes reais, dados ficticios; nenhum envio externo.</p>
    <nav>
      <button onClick={() => setChat("A")}>Conversa A</button>
      <button onClick={() => setChat("B")}>Conversa B</button>
      <button onClick={() => setTenant((value) => value === "qa-alpha" ? "qa-beta" : "qa-alpha")}>Trocar empresa</button>
      <button onClick={() => setUser((value) => value === "operator-1" ? "operator-2" : "operator-1")}>Trocar operador</button>
    </nav>
    <p role="status">Empresa {tenant} · Operador {user} · Conversa {chat} · Atualizacoes {ticks} · {nearBottom ? "Fim" : "Historico"}</p>
    <div><button onClick={() => void loadOlder()}>Carregar anteriores</button>
      <button onClick={() => setTotal((value) => value + 1)}>Receber mensagem</button>
      <button onClick={() => setExpanded((value) => !value)}>Alterar altura da midia</button>
      <button onClick={() => window.dispatchEvent(new Event("online"))}>Simular aviso de rede recuperada</button></div>
    {reading.restoring ? <button onClick={reading.cancelRestore}>Cancelar retomada</button> : null}
    <div ref={container} role="log" aria-label="Historico" tabIndex={0} onScroll={reading.onScroll}
      onWheel={reading.cancelRestore} onTouchStart={reading.cancelRestore} style={{ height: 310, overflowY: "auto", overflowAnchor: "none", border: "1px solid #aaa" }}>
      {Array.from({ length: total - history.start + 1 }, (_, index) => history.start + index).map((id) =>
        <article key={`${chat}-${id}`} data-message-id={`${chat}-${id}`} style={{ padding: 12, minHeight: id === 190 && expanded ? 280 : 32, borderBottom: "1px solid #ddd" }}>
          Mensagem {chat}-{id}{id === 190 ? " — midia" : ""}
        </article>)}
    </div>
    <label>Mensagem<textarea value={draft.text} onChange={(event) => draft.setText(event.target.value)} /></label>
    {draft.persistenceFailed ? <p>Rascunho nao persistido</p> : null}
    <button onClick={() => { const next = draft.beginAttempt(draft.text.trim(), null); setAttempt(next); setReceipt(`Pendente ${next.id}`); }}>Simular envio pendente</button>
    <button onClick={() => { if (attempt) { draft.acknowledge(attempt.draftKey, attempt.id); setReceipt(`Confirmado ${attempt.id}`); } }}>Confirmar envio anterior</button>
    <p aria-label="Recibo">{receipt}</p>
    <button onClick={() => media.setFiles((files) => [...files, { id: crypto.randomUUID(), file: new File(["ficticio"], "qa.txt"), previewUrl: "" }])}>Selecionar arquivo ficticio</button>
    <button onClick={() => media.setFiles([])}>Limpar arquivos ficticios</button>
    <p>Arquivos desta conversa: {media.files.length}</p>
  </main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><Laboratory /></React.StrictMode>);
