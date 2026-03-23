"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import {
  isCaptureFieldVisible,
  type CaptureFieldDefinition,
} from "@/lib/capture-form";

type Props = {
  formId: string;
  title: string;
  description: string;
  greeting?: string;
  startLabel?: string;
  requirePhone?: boolean;
  requireEmail?: boolean;
  collectCompany?: boolean;
  collectMessage?: boolean;
  fields?: CaptureFieldDefinition[];
};

type MessageItem = {
  id: string;
  sender: string;
  text: string;
  createdAt?: string | null;
};

function storageKey(formId: string) {
  return `altum_widget_chat_${formId}`;
}

function formatDate(value?: string | null) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function WidgetChatClient({
  formId,
  title,
  description,
  greeting,
  startLabel,
  requirePhone,
  requireEmail,
  collectCompany,
  collectMessage,
  fields = [],
}: Props) {
  const [booting, setBooting] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatId, setChatId] = useState("");
  const [token, setToken] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [identity, setIdentity] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: "",
    mensagem: "",
  });
  const [customFields, setCustomFields] = useState<Record<string, string | number | boolean>>({});
  const [reply, setReply] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey(formId));
      if (!stored) {
        setBooting(false);
        return;
      }
      const parsed = JSON.parse(stored) as { chatId?: string; token?: string };
      if (parsed.chatId && parsed.token) {
        setChatId(parsed.chatId);
        setToken(parsed.token);
      }
    } catch {
      // ignore local parse failure
    } finally {
      setBooting(false);
    }
  }, [formId]);

  useEffect(() => {
    if (!chatId || !token) return;

    let active = true;

    async function load() {
      try {
        const res = await fetch(`/api/public/chats/${chatId}/messages?token=${encodeURIComponent(token)}`);
        const payload = (await res.json()) as { items?: MessageItem[] };
        if (!active) return;
        if (res.ok) setMessages(payload.items || []);
      } catch {
        if (!active) return;
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [chatId, token]);

  const hasConversation = useMemo(() => Boolean(chatId && token), [chatId, token]);
  const visibleFields = useMemo(
    () => fields.filter((field) => isCaptureFieldVisible(field, customFields)),
    [customFields, fields]
  );
  const missingRequiredField = useMemo(
    () =>
      visibleFields.find((field) => {
        if (!field.required) return false;
        const value = customFields[field.id];
        if (typeof value === "boolean") return value !== true;
        return String(value ?? "").trim().length === 0;
      }) || null,
    [customFields, visibleFields]
  );

  async function startChat(event: FormEvent) {
    event.preventDefault();
    setStarting(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/forms/${formId}/chat/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...identity, customFields }),
      });
      const payload = (await res.json()) as { error?: string; chatId?: string; token?: string };
      if (!res.ok || !payload.chatId || !payload.token) {
        setError(payload.error || "Falha ao iniciar conversa.");
        return;
      }

      setChatId(payload.chatId);
      setToken(payload.token);
      window.localStorage.setItem(storageKey(formId), JSON.stringify({ chatId: payload.chatId, token: payload.token }));
      setIdentity((current) => ({ ...current, mensagem: "" }));
    } catch {
      setError("Falha ao iniciar conversa.");
    } finally {
      setStarting(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!chatId || !token || !reply.trim()) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, text: reply.trim() }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao enviar mensagem.");
        return;
      }

      setReply("");
      const refresh = await fetch(`/api/public/chats/${chatId}/messages?token=${encodeURIComponent(token)}`);
      const refreshPayload = (await refresh.json()) as { items?: MessageItem[] };
      if (refresh.ok) setMessages(refreshPayload.items || []);
    } catch {
      setError("Falha ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  if (booting) {
    return (
      <div className="flex min-h-[640px] items-center justify-center rounded-[28px] border border-white/10 bg-[#101010]">
        <Loader2 className="h-6 w-6 animate-spin text-blue-300" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[640px] flex-col rounded-[28px] border border-white/10 bg-[#101010]">
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/44">Site chat</p>
        <h1 className="mt-2 text-lg font-semibold text-white">{title}</h1>
        <p className="mt-1 text-sm text-white/56">{description}</p>
        {greeting ? <p className="mt-2 text-xs text-white/42">{greeting}</p> : null}
      </div>

      {!hasConversation ? (
        <form onSubmit={startChat} className="space-y-3 p-5">
          <Field label="Nome" value={identity.nome} onChange={(value) => setIdentity((current) => ({ ...current, nome: value }))} placeholder="Seu nome" required />
          <Field label="Telefone" value={identity.telefone} onChange={(value) => setIdentity((current) => ({ ...current, telefone: value }))} placeholder="+55 11 99999-9999" required={Boolean(requirePhone)} />
          <Field label="Email" type="email" value={identity.email} onChange={(value) => setIdentity((current) => ({ ...current, email: value }))} placeholder="voce@empresa.com" required={Boolean(requireEmail)} />
          {collectCompany !== false ? (
            <Field label="Empresa" value={identity.empresa} onChange={(value) => setIdentity((current) => ({ ...current, empresa: value }))} placeholder="Empresa" />
          ) : null}
          {visibleFields.map((field) => (
            <DynamicWidgetField
              key={field.id}
              field={field}
              value={customFields[field.id]}
              onChange={(value) => setCustomFields((current) => ({ ...current, [field.id]: value }))}
            />
          ))}
          {collectMessage !== false ? (
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-[0.14em] text-white/55">Mensagem</span>
              <textarea
                value={identity.mensagem}
                onChange={(event) => setIdentity((current) => ({ ...current, mensagem: event.target.value }))}
                className="min-h-[120px] w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
                placeholder={greeting || "Digite sua mensagem para iniciar o atendimento."}
              />
            </label>
          ) : null}

          <button
            type="submit"
            disabled={
              starting ||
              !identity.nome.trim() ||
              (Boolean(requireEmail) && !identity.email.trim()) ||
              (Boolean(requirePhone) && !identity.telefone.trim()) ||
              Boolean(missingRequiredField)
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {startLabel || "Iniciar conversa"}
          </button>
          {missingRequiredField ? (
            <p className="text-xs text-amber-100">
              Preencha o campo obrigatorio &quot;{missingRequiredField.label}&quot; para iniciar a conversa.
            </p>
          ) : null}
        </form>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <p className="text-sm text-white/52">Conversa iniciada. Envie uma mensagem para continuar.</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm ${
                    message.sender === "agent"
                      ? "ml-auto border border-blue-300/35 bg-blue-500/12"
                      : message.sender === "system"
                        ? "border border-amber-300/35 bg-amber-500/12"
                        : "border border-white/12 bg-white/[0.04]"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-white/90">{message.text}</p>
                  <p className="mt-1 text-[10px] text-white/45">{formatDate(message.createdAt)}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={sendMessage} className="flex gap-2 border-t border-white/10 p-4">
            <input
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Digite sua mensagem"
              className="flex-1 rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
            />
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </>
      )}

      {error ? (
        <div className="mx-5 mb-5 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function DynamicWidgetField({
  field,
  value,
  onChange,
}: {
  field: CaptureFieldDefinition;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  if (field.type === "textarea") {
    return (
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-[0.14em] text-white/55">{field.label}</span>
        <textarea
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[120px] w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
          placeholder={field.placeholder}
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-[0.14em] text-white/55">{field.label}</span>
        <select
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none"
        >
          <option value="">Selecione</option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "checkbox") {
    return (
      <button
        type="button"
        onClick={() => onChange(!(value === true))}
        className={`rounded-2xl border p-4 text-left transition ${
          value === true ? "border-blue-300/30 bg-blue-400/[0.08]" : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">{field.label}</p>
          <ShieldCheck className={`h-4 w-4 ${value === true ? "text-emerald-200" : "text-white/30"}`} />
        </div>
      </button>
    );
  }

  return (
    <Field
      label={field.label}
      value={String(value ?? "")}
      onChange={(nextValue) => onChange(field.type === "number" ? Number(nextValue || 0) : nextValue)}
      placeholder={field.placeholder}
      type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
      required={field.required}
    />
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <input
        type={props.type || "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
      />
    </label>
  );
}
