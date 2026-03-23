// ============================================================
//  utils.ts — Pure helpers for the ALTUM Chat System
// ============================================================
import { TimestampLike } from "@/app/types/types";

// ── Date helpers ─────────────────────────────────────────────
export function toDate(v?: TimestampLike): Date | null {
  if (!v) return null;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "object") {
    if ("toDate" in v && typeof v.toDate === "function") return v.toDate();
    if ("seconds" in v && typeof v.seconds === "number") return new Date(v.seconds * 1000);
  }
  return null;
}

export function shortTime(v?: TimestampLike): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function relativeDate(v?: TimestampLike): string {
  const d = toDate(v);
  if (!d) return "";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msgStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((todayStart - msgStart) / 86400000);
  if (diffDays === 0) return shortTime(v);
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function dayLabel(v?: TimestampLike): string {
  const d = toDate(v);
  if (!d) return "";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msgStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((todayStart - msgStart) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff < 7) return d.toLocaleDateString("pt-BR", { weekday: "long" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function timeAgo(v?: TimestampLike): string {
  const d = toDate(v);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return relativeDate(v);
}

// ── String helpers ────────────────────────────────────────────
export function normalize(t: string): string {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function initials(name?: string): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

// ── Color helpers ─────────────────────────────────────────────
const AVATAR_PALETTE = [
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#f97316", // orange
  "#10b981", // emerald
  "#ec4899", // pink
  "#f59e0b", // amber
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#ef4444", // red
  "#6366f1", // indigo
];

export function avatarColor(seed?: string): string {
  if (!seed) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// ── Phone helpers ─────────────────────────────────────────────
export function normalizePhone(phone?: string): string {
  return (phone || "").replace(/\D/g, "");
}

export function formatPhone(phone?: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return phone || "";
}

// ── Audio helpers ─────────────────────────────────────────────
export async function computeWaveform(buffer: ArrayBuffer, samples = 80): Promise<number[]> {
  try {
    const browserWindow = window as Window & typeof globalThis & {
      webkitAudioContext?: new () => AudioContext;
    };
    const AudioContextCtor = browserWindow.AudioContext || browserWindow.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("AudioContext indisponivel.");
    }
    const ac = new AudioContextCtor();
    const ab = await ac.decodeAudioData(buffer.slice(0));
    const data = ab.getChannelData(0);
    const block = Math.floor(data.length / samples);
    const peaks: number[] = [];
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      for (let j = 0; j < block; j++) sum += Math.abs(data[i * block + j] || 0);
      peaks.push(sum / block);
    }
    const max = Math.max(...peaks, 0.001);
    await ac.close?.();
    return peaks.map((p) => Math.max(0.05, p / max));
  } catch {
    return Array.from({ length: samples }, () => 0.2 + Math.random() * 0.3);
  }
}

// ── Priority helpers ──────────────────────────────────────────
export const PRIORITY_CONFIG = {
  urgent: { label: "Urgente", color: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/30" },
  high:   { label: "Alta",    color: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/30" },
  normal: { label: "Normal",  color: "text-blue-400",  bg: "bg-blue-500/15",   border: "border-blue-500/30" },
  low:    { label: "Baixa",   color: "text-zinc-400",  bg: "bg-zinc-500/15",   border: "border-zinc-700" },
} as const;

export const STATUS_CONFIG = {
  open:     { label: "Aberto",    color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  pending:  { label: "Pendente",  color: "text-amber-400",   bg: "bg-amber-500/15",   border: "border-amber-500/30",  dot: "bg-amber-400" },
  snoozed:  { label: "Adiado",    color: "text-violet-400",  bg: "bg-violet-500/15",  border: "border-violet-500/30", dot: "bg-violet-400" },
  resolved: { label: "Resolvido", color: "text-blue-400",    bg: "bg-blue-500/15",    border: "border-blue-500/30",   dot: "bg-blue-400" },
  spam:     { label: "Spam",      color: "text-red-400",     bg: "bg-red-500/15",     border: "border-red-500/30",    dot: "bg-red-400" },
} as const;

export const CHANNEL_CONFIG = {
  whatsapp:  { label: "WhatsApp", icon: "💬", color: "text-green-400" },
  instagram: { label: "Instagram", icon: "📸", color: "text-pink-400" },
  email:     { label: "Email",    icon: "📧", color: "text-blue-400" },
  webchat:   { label: "Chat",     icon: "💻", color: "text-violet-400" },
} as const;

// ── Clipboard ────────────────────────────────────────────────
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

// ── Keyboard shortcut map ─────────────────────────────────────
export const SHORTCUTS = {
  SEARCH:  { key: "k", meta: true, label: "⌘K Buscar" },
  RESOLVE: { key: "e", meta: true, label: "⌘E Resolver" },
  ASSIGN:  { key: "a", meta: true, label: "⌘A Atribuir" },
  NOTE:    { key: "n", meta: true, label: "⌘N Nota" },
} as const;

// ── Canned response search ────────────────────────────────────
export const DEFAULT_CANNED: Array<{ shortCode: string; content: string; label: string }> = [
  { shortCode: "/oi",        label: "Boas-vindas",   content: "Olá! 😊 Seja bem-vindo(a). Como posso ajudar você hoje?" },
  { shortCode: "/aguardar",  label: "Aguardar",      content: "Recebi sua mensagem! Estou verificando e retorno em instantes. 🙏" },
  { shortCode: "/obrigado",  label: "Agradecimento", content: "Muito obrigado(a) pelo contato! Qualquer dúvida, estou sempre à disposição. ✅" },
  { shortCode: "/agendar",   label: "Agendamento",   content: "Posso agendar uma reunião? Qual horário e dia seria mais conveniente para você?" },
  { shortCode: "/link",      label: "Link",          content: "Segue o link com as informações completas: " },
  { shortCode: "/pagamento", label: "Pagamento",     content: "Para efetuar o pagamento, utilize o link abaixo ou entre em contato com nossa equipe financeira: " },
  { shortCode: "/proposta",  label: "Proposta",      content: "Prepararei uma proposta personalizada para você. Posso enviar até o final do dia de hoje. ✍️" },
  { shortCode: "/encerrar",  label: "Encerrar",      content: "Foi um prazer atendê-lo(a)! Encerrando nossa conversa por ora. Qualquer dúvida é só nos chamar novamente! 👋" },
];
