import { AlertCircle, Check, CheckCheck, Clock3 } from "lucide-react";

export function MessageDeliveryStatus({ channel = "whatsapp", status, latest = true }: { channel?: string; status?: string; latest?: boolean }) {
  const state = String(status || "").toLowerCase();
  if (channel !== "whatsapp") {
    const text = state === "failed" ? "Não enviada" : state === "confirmation_pending" ? "Confirmação pendente" :
      ["pending", "queued", "sending", "processing"].includes(state) ? "Enviando…" : state === "read" && latest ? "Visto" : null;
    return text ? <span role="status">{text}</span> : null;
  }
  if (state === "failed") return <AlertCircle aria-label="Falha no envio" className="h-3.5 w-3.5 text-[var(--cliente-danger)]" />;
  if (state === "read") return <CheckCheck aria-label="Lida" className="h-3.5 w-3.5 text-[#53bdeb]" />;
  if (state === "delivered") return <CheckCheck aria-label="Entregue" className="h-3.5 w-3.5" />;
  if (state === "sent") return <Check aria-label="Enviada" className="h-3.5 w-3.5" />;
  return <Clock3 aria-label="Aguardando envio" className="h-3.5 w-3.5" />;
}
