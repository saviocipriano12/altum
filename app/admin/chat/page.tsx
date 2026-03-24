/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @next/next/no-img-element, jsx-a11y/alt-text, react/no-unescaped-entities, react-hooks/exhaustive-deps */
// ============================================================
//  app/admin/chat/page.tsx
//  ALTUM Chat — Enterprise WhatsApp Platform
//  Inspired by Intercom + Chatwoot + Zendesk, surpassing all.
// ============================================================
"use client";

import React, {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection, doc, getDoc, getDocs, limit, onSnapshot,
  orderBy, query, where, updateDoc, arrayUnion,
  arrayRemove, serverTimestamp,
  writeBatch, increment,
} from "firebase/firestore";
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL,
} from "firebase/storage";

// ── Lucide icons (explicit imports for tree-shaking) ──────────
import {
  AlertCircle, AlertTriangle, Archive, ArrowLeft, ArrowRight,
  AtSign, Bell, BellOff, Bookmark, BookmarkCheck, Building2,
  Calendar, Check, CheckCheck, CheckCircle2, ChevronDown,
  ChevronRight, ChevronUp, Circle, Clock, Copy, CornerUpLeft,
  Download, Edit2, Edit3, ExternalLink, Eye, FileText, Filter,
  Flag, Globe, Hash, Heart, Inbox, Info, Layers, Loader2,
  Lock, LogOut, Mail, MapPin, Menu, MessageSquare, Mic,
  MoreHorizontal, MoreVertical, Paperclip, Phone, PhoneCall,
  PhoneOff, PhoneMissed, Pin, PinOff, Plus, RefreshCw,
  Reply, Search, Send, Settings, Shield, Smile, SmilePlus,
  Sparkles, Star, StarOff, Tag, Trash2, TrendingUp, User,
  UserCheck, UserMinus, UserPlus, UserRound, Users, Video,
  Zap, ZapOff, X, XCircle, Image as ImageIcon, Volume2, VolumeX,
} from "lucide-react";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/app/lib/authed-fetch";

import {
  ChatDoc, ChatStatus, ChatPriority, MessageDoc, MessageType,
  TeamUser, LeadContext, ContactDoc, AuditEvent, WaTemplate,
  CannedResponse, Notification, DashboardMetrics, TimestampLike,
} from "@/app/types/types";

import {
  toDate, shortTime, relativeDate, dayLabel, formatDuration,
  formatFileSize, timeAgo, normalize, initials, truncate,
  avatarColor, normalizePhone, formatPhone, computeWaveform,
  copyToClipboard, PRIORITY_CONFIG, STATUS_CONFIG, CHANNEL_CONFIG,
  DEFAULT_CANNED,
} from "@/app/utils/utils";

// ============================================================
//  GLOBAL CONTEXT
// ============================================================
type ToastItem = { id: string; type: "ok" | "err" | "warn" | "info"; msg: string };

type GlobalCtx = {
  showToast: (type: ToastItem["type"], msg: string) => void;
  profile: any;
  user: any;
  isAdmin: boolean;
};
const GlobalContext = createContext<GlobalCtx>({} as GlobalCtx);
const useGlobal = () => useContext(GlobalContext);

function sortByCreatedAtAsc<T extends { createdAt?: TimestampLike }>(items: T[]) {
  return [...items].sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0));
}

function sortByCreatedAtDesc<T extends { createdAt?: TimestampLike }>(items: T[]) {
  return [...items].sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
}

// ============================================================
//  HOOKS
// ============================================================

function useDebounced<T>(value: T, delay = 300): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return initial; }
  });
  const set = useCallback((v: T) => {
    setVal(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key]);
  return [val, set];
}

function useKeyboardShortcut(key: string, meta: boolean, cb: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === key && (meta ? (e.metaKey || e.ctrlKey) : true) && !e.shiftKey) {
        e.preventDefault();
        cb();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, meta, cb]);
}

// ============================================================
//  PRIMITIVE UI COMPONENTS
// ============================================================

// ── Toast Stack ──────────────────────────────────────────────
function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  const icons = { ok: <CheckCircle2 className="h-4 w-4" />, err: <XCircle className="h-4 w-4" />, warn: <AlertTriangle className="h-4 w-4" />, info: <Info className="h-4 w-4" /> };
  const colors = { ok: "bg-emerald-950 border-emerald-500/40 text-emerald-200", err: "bg-red-950 border-red-500/40 text-red-200", warn: "bg-amber-950 border-amber-500/40 text-amber-200", info: "bg-sky-950 border-sky-500/40 text-sky-200" };
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm shadow-2xl pointer-events-auto animate-in slide-in-from-right-4 ${colors[t.type]}`}>
          {icons[t.type]}
          <span>{t.msg}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

// ── Avatar ───────────────────────────────────────────────────
function Avatar({
  src, name, size = 36, online, status, ring = false,
}: {
  src?: string; name?: string; size?: number; online?: boolean;
  status?: "online" | "busy" | "away" | "offline"; ring?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const color = avatarColor(name);
  const init = initials(name);
  const statusColor = { online: "bg-emerald-400", busy: "bg-red-400", away: "bg-amber-400", offline: "bg-zinc-600" };
  const dotSize = Math.max(8, size * 0.26);
  const cleanedSrc = typeof src === "string" ? src.trim() : "";
  const canRenderImage = cleanedSrc.length > 0 && !imgFailed;

  useEffect(() => {
    setImgFailed(false);
  }, [cleanedSrc]);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {canRenderImage ? (
        <img
          src={cleanedSrc}
          alt={name || "avatar"}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`rounded-full object-cover w-full h-full bg-[#131b2a] ${ring ? "ring-2 ring-sky-500 ring-offset-2 ring-offset-[#0d1117]" : ""}`}
        />
      ) : (
        <div
          className={`rounded-full flex items-center justify-center text-white font-semibold select-none ${ring ? "ring-2 ring-sky-500 ring-offset-2 ring-offset-[#0d1117]" : ""}`}
          style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}cc, ${color})`, fontSize: Math.max(10, size * 0.36) }}
        >
          {init}
        </div>
      )}
      {(online !== undefined || status) && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-[#0d1117] ${statusColor[status || (online ? "online" : "offline")]}`}
          style={{ width: dotSize, height: dotSize }}
        />
      )}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────
function Badge({ label, color = "zinc" }: { label: string; color?: string }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border tracking-wide ${color}`}>
      {label}
    </span>
  );
}

// ── Priority dot ──────────────────────────────────────────────
function PriorityDot({ priority }: { priority?: ChatPriority }) {
  if (!priority || priority === "normal") return null;
  const c = PRIORITY_CONFIG[priority];
  return <span className={`h-1.5 w-1.5 rounded-full ${c.bg.replace("bg-", "bg-").replace("/15", "")} inline-block`} title={c.label} />;
}

// ── Channel Icon ─────────────────────────────────────────────
function ChannelIcon({ channel, size = 14 }: { channel?: string; size?: number }) {
  if (channel === "whatsapp") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-green-400 flex-shrink-0">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
    );
  }
  const cfg = CHANNEL_CONFIG[channel as keyof typeof CHANNEL_CONFIG];
  if (!cfg) return null;
  return <span style={{ fontSize: size }} className="leading-none">{cfg.icon}</span>;
}

// ── Kbd shortcut pill ─────────────────────────────────────────
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 text-[10px] bg-white/8 border border-white/15 rounded font-mono text-zinc-400">{children}</kbd>
  );
}

// ── Divider with label ────────────────────────────────────────
function DividerLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-white/6" />
      <span className="text-[11px] text-zinc-500 bg-[#111827]/60 px-3 py-1 rounded-full font-medium tracking-wide border border-white/6">
        {label}
      </span>
      <div className="flex-1 h-px bg-white/6" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
      <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center">
        <Icon className="h-6 w-6 text-zinc-600" />
      </div>
      <div>
        <div className="text-sm font-medium text-zinc-400">{title}</div>
        {body && <div className="text-xs text-zinc-600 mt-1">{body}</div>}
      </div>
    </div>
  );
}

// ── Tooltip wrapper ───────────────────────────────────────────
function Tip({ children, label, side = "top" }: { children: React.ReactNode; label: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className={`absolute z-50 pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity delay-300 whitespace-nowrap text-[11px] bg-zinc-900 border border-white/10 text-zinc-200 px-2 py-1 rounded-md shadow-lg ${
        side === "top" ? "bottom-full mb-2 left-1/2 -translate-x-1/2" :
        side === "bottom" ? "top-full mt-2 left-1/2 -translate-x-1/2" :
        side === "left" ? "right-full mr-2 top-1/2 -translate-y-1/2" :
        "left-full ml-2 top-1/2 -translate-y-1/2"
      }`}>
        {label}
      </div>
    </div>
  );
}

// ── Icon button ───────────────────────────────────────────────
function IconBtn({
  icon: Icon, onClick, tooltip, active, danger, size = "md", disabled,
}: {
  icon: React.ElementType; onClick?: () => void; tooltip?: string;
  active?: boolean; danger?: boolean; size?: "sm" | "md" | "lg"; disabled?: boolean;
}) {
  const sizes = { sm: "p-1.5 h-7 w-7", md: "p-2 h-8 w-8", lg: "p-2.5 h-10 w-10" };
  const iconSizes = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-5 w-5" };
  const btn = (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl flex items-center justify-center transition-all ${sizes[size]} ${
        active ? "bg-sky-500/20 text-sky-400" :
        danger ? "hover:bg-red-500/15 hover:text-red-400 text-zinc-500" :
        "hover:bg-white/8 text-zinc-400 hover:text-zinc-100"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <Icon className={iconSizes[size]} />
    </button>
  );
  if (tooltip) return <Tip label={tooltip}>{btn}</Tip>;
  return btn;
}

// ── Segmented control ─────────────────────────────────────────
function SegmentedControl<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-xl bg-black/30 border border-white/6">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
            value === o.value
              ? "bg-sky-500/20 text-sky-300 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${value === o.value ? "bg-sky-500/30 text-sky-300" : "bg-white/8 text-zinc-400"}`}>
              {o.count > 99 ? "99+" : o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────
function ProgressBar({ value, max, color = "sky" }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="h-1 rounded-full bg-white/8 overflow-hidden">
      <div className={`h-full rounded-full bg-${color}-500 transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ============================================================
//  AUDIO COMPONENTS
// ============================================================

function WaveformVisualizer({ peaks, progress = 0, onSeek }: {
  peaks: number[]; progress?: number; onSeek?: (pct: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const filled = Math.floor(peaks.length * progress);

  function handleClick(e: React.MouseEvent) {
    if (!onSeek || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    onSeek((e.clientX - rect.left) / rect.width);
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-[2px] h-9 flex-1 cursor-pointer"
      onClick={handleClick}
    >
      {peaks.map((p, i) => (
        <div
          key={i}
          className="rounded-full transition-colors flex-shrink-0"
          style={{
            width: 2,
            height: Math.max(3, p * 34),
            background: i <= filled ? "rgb(56 189 248)" : "rgba(255,255,255,0.18)",
          }}
        />
      ))}
    </div>
  );
}

function AudioPlayer({ message }: { message: MessageDoc }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(message.mediaDuration || 0);
  const [peaks, setPeaks] = useState<number[]>(Array.from({ length: 60 }, (_, i) => 0.15 + 0.7 * Math.sin((i / 60) * Math.PI)));
  const [speed, setSpeed] = useState(1);
  const [resolved, setResolved] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function resolve() {
    if (resolved) return resolved;
    const url = message.mediaUrl || "";
    setLoading(true);
    let finalUrl = url;
    try {
      if (url.startsWith("gs://") || url.includes("firebase") || !url.startsWith("http")) {
        finalUrl = await getDownloadURL(storageRef(getStorage(), url));
      }
      setResolved(finalUrl);
      const resp = await fetch(finalUrl);
      const buf = await resp.arrayBuffer();
      const p = await computeWaveform(buf, 60);
      setPeaks(p);
    } catch { setResolved(finalUrl); }
    finally { setLoading(false); }
    return finalUrl;
  }

  async function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (!el.src) {
      const url = await resolve();
      el.src = url || "";
      el.playbackRate = speed;
    }
    if (playing) { el.pause(); setPlaying(false); }
    else { await el.play(); setPlaying(true); }
  }

  function seek(pct: number) {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    el.currentTime = pct * el.duration;
    setProgress(pct);
  }

  const cycleSpeed = () => {
    const speeds = [1, 1.5, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onMeta = () => setDuration(el.duration);
    const onTime = () => setProgress(el.currentTime / (el.duration || 1));
    const onEnd = () => { setPlaying(false); setProgress(0); };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => { el.removeEventListener("loadedmetadata", onMeta); el.removeEventListener("timeupdate", onTime); el.removeEventListener("ended", onEnd); };
  }, []);

  return (
    <div className="flex items-center gap-3 min-w-[240px] max-w-[340px] py-1">
      <button
        onClick={toggle}
        disabled={loading}
        className="flex-shrink-0 h-9 w-9 rounded-full bg-sky-500/90 hover:bg-sky-400 flex items-center justify-center transition-colors"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" /> :
         playing ? <span className="text-white text-xs font-bold">⏸</span> :
                   <span className="text-white text-xs pl-0.5">▶</span>}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <WaveformVisualizer peaks={peaks} progress={progress} onSeek={seek} />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/40">{formatDuration(playing ? progress * duration : duration)}</span>
          <button onClick={cycleSpeed} className="text-[10px] text-white/40 hover:text-white/70 transition-colors w-6 text-right">{speed}×</button>
        </div>
      </div>
      <audio ref={audioRef} preload="none" />
    </div>
  );
}

// ── Live Audio Recorder ────────────────────────────────────────
function AudioRecorder({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { showToast } = useGlobal();
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [peaks, setPeaks] = useState<number[]>(Array(40).fill(0.1));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => { startRecording(); return () => cleanup(); }, []);

  function cleanup() {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animFrameRef.current);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AudioContext();
      const source = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => { ac.close(); upload(); };
      mr.start(200);
      recorderRef.current = mr;
      setRecording(true);
      timerRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
      animate(analyser);
    } catch { showToast("err", "Não foi possível acessar o microfone"); onClose(); }
  }

  function animate(analyser: AnalyserNode) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const frame = () => {
      analyser.getByteTimeDomainData(data);
      const p = Array.from({ length: 40 }, (_, i) => {
        const idx = Math.floor((i / 40) * data.length);
        return Math.abs((data[idx] - 128) / 128);
      });
      setPeaks(p);
      animFrameRef.current = requestAnimationFrame(frame);
    };
    animFrameRef.current = requestAnimationFrame(frame);
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animFrameRef.current);
    recorderRef.current?.stop();
    setRecording(false);
  }

  function discard() { cleanup(); onClose(); }

  async function upload() {
    setUploading(true);
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const path = `chats/${chatId}/voice_${Date.now()}.webm`;
      const ref = storageRef(getStorage(), path);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(ref, blob);
        task.on("state_changed", undefined, reject, resolve);
      });
      await authedFetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, type: "audio", mediaUrl: path, mediaDuration: duration }),
      });
      showToast("ok", "Áudio enviado");
    } catch { showToast("err", "Falha ao enviar áudio"); }
    finally { setUploading(false); onClose(); }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-red-950/30 border border-red-500/20 rounded-xl">
      {recording && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
      <span className="text-sm text-red-300 font-mono min-w-[36px]">{formatDuration(duration)}</span>
      <div className="flex items-center gap-[2px] h-8 flex-1">
        {peaks.map((p, i) => (
          <div key={i} className="rounded-full bg-red-400/70 flex-shrink-0" style={{ width: 2, height: Math.max(3, p * 32) }} />
        ))}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : (
          <>
            <button onClick={discard} className="p-1.5 rounded-lg hover:bg-white/8 text-zinc-400"><Trash2 className="h-4 w-4" /></button>
            {recording
              ? <button onClick={stop} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium">Parar</button>
              : <button onClick={() => upload()} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1"><Send className="h-3.5 w-3.5" /> Enviar</button>
            }
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  MESSAGE BUBBLE
// ============================================================

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function ReplyPreview({ msg }: { msg: MessageDoc }) {
  return (
    <div className="rounded-lg px-3 py-2 mb-2 border-l-[3px] border-sky-400 bg-black/20">
      <div className="text-[11px] text-sky-400 font-semibold mb-0.5">
        {msg.sender === "agent" ? (msg.agentName || "Agente") : "Contato"}
      </div>
      <div className="text-xs text-white/55 truncate">
        {msg.deleted ? "Mensagem apagada" :
         msg.type === "image" ? "📷 Foto" :
         msg.type === "audio" ? "🎤 Áudio" :
         msg.type === "video" ? "🎬 Vídeo" :
         msg.type === "document" ? `📄 ${msg.mediaName || "Documento"}` :
         truncate(msg.text || "", 80)}
      </div>
    </div>
  );
}

type BubbleAction = { icon: React.ElementType; label: string; onClick: () => void; danger?: boolean };

function MessageBubble({
  message, isAgent, replied, meUid, showAvatar, avatarSrc, avatarName,
  onReply, onCopy, onDelete, onPin, onStar, onOpenMedia, onReact, onEdit,
}: {
  message: MessageDoc;
  isAgent: boolean;
  replied?: MessageDoc | null;
  meUid?: string;
  showAvatar?: boolean;
  avatarSrc?: string;
  avatarName?: string;
  onReply?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  onStar?: () => void;
  onOpenMedia?: (url: string, type?: string) => void;
  onReact?: (emoji: string) => void;
  onEdit?: () => void;
}) {
  const [emojiPicker, setEmojiPicker] = useState(false);

  if (message.type === "system" || message.type === "activity") {
    return (
      <div className="flex justify-center py-1.5">
        <span className="text-[11px] text-zinc-500 bg-zinc-800/40 border border-white/5 px-3 py-1 rounded-full">
          {message.text}
        </span>
      </div>
    );
  }

  const isNote = message.type === "internal_note" || message.internal;
  const isTemplate = message.type === "template";
  const deleted = message.deleted;
  const reactions = message.reactions || {};
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);
  const myReactions = new Set(Object.entries(reactions).filter(([, u]) => u.includes(meUid || "")).map(([e]) => e));

  const bgClass = isNote
    ? "bg-amber-950/60 border border-amber-500/25"
    : isAgent
    ? "bg-gradient-to-br from-[#1e4976] to-[#163d62] border border-sky-500/15"
    : "bg-[#1c2536] border border-white/6";

  const actions: BubbleAction[] = [
    { icon: Reply, label: "Responder", onClick: onReply || (() => {}) },
    { icon: Star, label: message.starred ? "Desmarcar" : "Marcar", onClick: onStar || (() => {}) },
    { icon: Pin, label: message.pinned ? "Desfixar" : "Fixar", onClick: onPin || (() => {}) },
    { icon: Copy, label: "Copiar texto", onClick: onCopy || (() => {}), },
    ...(isAgent && !deleted ? [{ icon: Edit2, label: "Editar", onClick: onEdit || (() => {}) }] : []),
    { icon: Trash2, label: "Excluir", onClick: onDelete || (() => {}), danger: true },
  ];

  return (
    <div className={`group flex gap-2 ${isAgent ? "flex-row-reverse" : "flex-row"} items-end relative`}>
      {/* Avatar slot */}
      <div style={{ width: 28, flexShrink: 0 }}>
        {showAvatar && !isAgent && (
          <Avatar src={avatarSrc} name={avatarName} size={28} />
        )}
      </div>

      <div className={`flex flex-col ${isAgent ? "items-end" : "items-start"} max-w-[72%]`}>
        {/* Sender name (for notes) */}
        {isNote && message.agentName && (
          <div className="text-[10px] text-amber-400/70 mb-1 px-1 font-medium">
            📝 {message.agentName} · Nota interna
          </div>
        )}

        <div className="relative">
          {/* Bubble */}
          <div className={`relative rounded-2xl px-4 py-2.5 shadow-sm ${bgClass} ${
            isAgent ? "rounded-br-sm" : "rounded-bl-sm"
          } ${message._temp ? "opacity-60" : ""} ${message._failed ? "ring-1 ring-red-500/50" : ""}`}>

            {replied && !deleted && <ReplyPreview msg={replied} />}

            {/* Image */}
            {message.type === "image" && message.mediaUrl && !deleted && (
              <div
                className="-mx-4 -mt-2.5 mb-2 cursor-pointer overflow-hidden rounded-t-2xl relative"
                onClick={() => onOpenMedia?.(message.mediaUrl!, "image")}
              >
                {message.mediaThumbnail ? (
                  <img src={message.mediaThumbnail} alt="" className="max-w-full max-h-60 object-cover w-full blur-sm absolute inset-0" />
                ) : null}
                <img src={message.mediaUrl} alt="" className="max-w-full max-h-60 object-cover w-full relative z-10" />
                {message.mediaWidth && message.mediaHeight && (
                  <div className="absolute bottom-2 right-2 text-[10px] text-white/60 bg-black/40 px-1.5 py-0.5 rounded z-20">
                    {message.mediaWidth}×{message.mediaHeight}
                  </div>
                )}
              </div>
            )}

            {/* Video */}
            {message.type === "video" && message.mediaUrl && !deleted && (
              <div className="-mx-4 -mt-2.5 mb-2 cursor-pointer overflow-hidden rounded-t-2xl relative group/vid"
                onClick={() => onOpenMedia?.(message.mediaUrl!, "video")}>
                {message.mediaThumbnail && <img src={message.mediaThumbnail} alt="" className="max-w-full max-h-60 object-cover w-full" />}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover/vid:bg-black/50 transition-colors">
                  <div className="h-14 w-14 rounded-full bg-black/60 flex items-center justify-center">
                    <span className="text-white text-2xl pl-1">▶</span>
                  </div>
                </div>
                {message.mediaDuration && (
                  <div className="absolute bottom-2 right-2 text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded">
                    {formatDuration(message.mediaDuration)}
                  </div>
                )}
              </div>
            )}

            {/* Audio */}
            {message.type === "audio" && !deleted && <AudioPlayer message={message} />}

            {/* Document */}
            {message.type === "document" && !deleted && (
              <a href={message.mediaUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 p-2 rounded-xl bg-black/20 hover:bg-black/30 transition-colors">
                <div className="h-10 w-10 rounded-xl bg-sky-500/20 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-sky-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate max-w-[180px]">{message.mediaName || message.text || "Documento"}</div>
                  {message.mediaSize && <div className="text-[10px] text-white/40">{formatFileSize(message.mediaSize)}</div>}
                </div>
                <Download className="h-4 w-4 text-white/40 flex-shrink-0" />
              </a>
            )}

            {/* Location */}
            {message.type === "location" && !deleted && (
              <a href={`https://maps.google.com/?q=${message.latitude},${message.longitude}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-sky-400 hover:underline">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                {message.locationName || `${message.latitude?.toFixed(4)}, ${message.longitude?.toFixed(4)}`}
              </a>
            )}

            {/* Sticker */}
            {message.type === "sticker" && message.mediaUrl && !deleted && (
              <img src={message.mediaUrl} alt="sticker" className="h-24 w-24" />
            )}

            {/* Template */}
            {message.type === "template" && !deleted && (
              <div className="space-y-2">
                <div className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Template: {message.templateName}</div>
                <div className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{message.text}</div>
              </div>
            )}

            {/* Text / Note */}
            {(message.type === "text" || message.type === "internal_note" || !message.type) && (
              deleted ? (
                <span className="text-white/30 italic text-sm flex items-center gap-1.5">
                  <Lock className="h-3 w-3" /> Mensagem apagada
                </span>
              ) : (
                <div className="text-[14.5px] leading-relaxed text-white/92 whitespace-pre-wrap break-words">
                  {message.text}
                  {message.edited && <span className="text-[10px] text-white/30 ml-2 italic">editado</span>}
                </div>
              )
            )}

            {/* Meta row */}
            {!deleted && (
              <div className={`flex items-center gap-1.5 mt-1.5 ${isAgent ? "justify-end" : "justify-start"}`}>
                <span className="text-[10px] text-white/30 leading-none">{shortTime(message.createdAt)}</span>
                {isAgent && (
                  <span className="flex-shrink-0">
                    {message._temp
                      ? <Clock className="h-3 w-3 text-white/30" />
                      : message._failed || message.status === "failed"
                      ? <AlertCircle className="h-3 w-3 text-red-400" />
                      : message.status === "read"
                      ? <CheckCheck className="h-3.5 w-3.5 text-sky-400" />
                      : message.status === "delivered"
                      ? <CheckCheck className="h-3.5 w-3.5 text-white/40" />
                      : <Check className="h-3 w-3 text-white/40" />
                    }
                  </span>
                )}
                {message.pinned && <Pin className="h-3 w-3 text-amber-400" />}
                {message.starred && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
              </div>
            )}
          </div>

          {/* Hover actions */}
          <div className={`absolute top-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all z-20 ${isAgent ? "right-full mr-2" : "left-full ml-2"}`}>
            {/* Quick emoji */}
            <div className="relative">
              <button
                onClick={() => setEmojiPicker((v) => !v)}
                className="p-1.5 rounded-xl bg-[#1c2536] border border-white/8 hover:border-white/15 transition-colors"
              >
                <SmilePlus className="h-3.5 w-3.5 text-zinc-400" />
              </button>
              {emojiPicker && (
                <div className={`absolute top-8 flex gap-1 bg-[#1c2536] border border-white/10 rounded-2xl p-2 shadow-2xl z-30 ${isAgent ? "right-0" : "left-0"}`}>
                  {QUICK_REACTIONS.map((e) => (
                    <button key={e} onClick={() => { onReact?.(e); setEmojiPicker(false); }}
                      className={`h-8 w-8 rounded-lg flex items-center justify-center text-lg hover:bg-white/10 transition-colors ${myReactions.has(e) ? "bg-sky-500/20" : ""}`}>
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {actions.slice(0, 3).map((a) => (
              <button key={a.label} onClick={a.onClick} title={a.label}
                className={`p-1.5 rounded-xl bg-[#1c2536] border border-white/8 hover:border-white/15 transition-colors ${a.danger ? "hover:border-red-500/30 hover:bg-red-950/30" : ""}`}>
                <a.icon className={`h-3.5 w-3.5 ${a.danger ? "text-zinc-400 hover:text-red-400" : "text-zinc-400"}`} />
              </button>
            ))}

            {/* More */}
            <div className="relative group/more">
              <button className="p-1.5 rounded-xl bg-[#1c2536] border border-white/8 hover:border-white/15 transition-colors">
                <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400" />
              </button>
              <div className={`absolute top-8 w-40 bg-[#1c2536] border border-white/10 rounded-xl shadow-2xl overflow-hidden hidden group-hover/more:block z-30 ${isAgent ? "right-0" : "left-0"}`}>
                {actions.slice(3).map((a) => (
                  <button key={a.label} onClick={a.onClick}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-white/5 transition-colors ${a.danger ? "text-red-400 hover:bg-red-950/30" : "text-zinc-300"}`}>
                    <a.icon className="h-3.5 w-3.5" />{a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Reactions bar */}
        {reactionEntries.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isAgent ? "justify-end" : "justify-start"}`}>
            {reactionEntries.map(([emoji, users]) => (
              <button key={emoji} onClick={() => onReact?.(emoji)}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all ${
                  myReactions.has(emoji) ? "bg-sky-500/20 border-sky-400/30 text-sky-200" : "bg-white/5 border-white/8 text-zinc-300 hover:bg-white/10"
                }`}>
                <span>{emoji}</span><span className="text-[10px] text-white/50">{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Failed state */}
        {message._failed && (
          <div className="flex items-center gap-1.5 mt-1 text-red-400 text-[11px]">
            <AlertCircle className="h-3 w-3" /> Falha ao enviar · <button className="underline">Tentar novamente</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  COMPOSER
// ============================================================

function CannedPicker({ query: q, onPick }: { query: string; onPick: (text: string) => void }) {
  const results = DEFAULT_CANNED.filter((c) =>
    normalize(c.shortCode).includes(normalize(q)) || normalize(c.label).includes(normalize(q))
  ).slice(0, 6);
  if (!results.length) return null;
  return (
    <div className="absolute bottom-full mb-1 left-0 right-0 bg-[#131b2a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
      <div className="px-3 py-2 border-b border-white/6 flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-[11px] text-zinc-400 font-medium">Respostas rápidas</span>
      </div>
      {results.map((c) => (
        <button key={c.shortCode} onClick={() => onPick(c.content)}
          className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left group">
          <span className="text-[11px] text-sky-400 font-mono font-medium mt-0.5 flex-shrink-0">{c.shortCode}</span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-zinc-200">{c.label}</div>
            <div className="text-[11px] text-zinc-500 truncate">{c.content}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

type ComposerProps = {
  chatId: string | null;
  disabled?: boolean;
  replyTo?: MessageDoc | null;
  onClearReply?: () => void;
  onSend: (text: string, type?: MessageType, replyToId?: string | null) => Promise<void>;
};

function Composer({ chatId, disabled, replyTo, onClearReply, onSend }: ComposerProps) {
  const { showToast } = useGlobal();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const showCanned = text.startsWith("/") && text.length > 0;

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 130) + "px";
  }, [text]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!chatId || !text.trim() || sending || disabled) return;
    const t = text.trim();
    setText("");
    setSending(true);
    await onSend(t, "text", replyTo?.id || null);
    onClearReply?.();
    setSending(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === "Escape") { onClearReply?.(); }
  }

  function handleAttach() {
    if (!chatId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*,application/pdf,audio/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      for (const file of files) {
        const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
        await onSend("", type as MessageType, null);
      }
    };
    input.click();
  }

  return (
    <div className="border-t border-white/6 bg-[#0d1117]">
      {/* Reply strip */}
      {replyTo && (
        <div className="flex items-center gap-3 px-4 pt-3 pb-0">
          <div className="flex-1 flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl px-3 py-2">
            <CornerUpLeft className="h-4 w-4 text-sky-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-sky-400 font-medium mb-0.5">
                Respondendo a {replyTo.sender === "agent" ? (replyTo.agentName || "Agente") : "Contato"}
              </div>
              <div className="text-xs text-zinc-400 truncate">
                {replyTo.text || (replyTo.type === "image" ? "📷 Foto" : replyTo.type === "audio" ? "🎤 Áudio" : "Arquivo")}
              </div>
            </div>
            <button onClick={onClearReply} className="flex-shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Recorder */}
      {showRecorder && chatId && (
        <div className="px-4 pt-3 pb-0">
          <AudioRecorder chatId={chatId} onClose={() => setShowRecorder(false)} />
        </div>
      )}

      {/* Main form */}
      {!showRecorder && (
        <form onSubmit={submit} className="flex items-end gap-2.5 p-4">
          <Tip label="Anexar arquivo" side="top">
            <button type="button" onClick={handleAttach} disabled={disabled}
              className="flex-shrink-0 h-10 w-10 rounded-xl hover:bg-white/8 text-zinc-500 hover:text-zinc-200 flex items-center justify-center transition-colors disabled:opacity-40">
              <Paperclip className="h-5 w-5" />
            </button>
          </Tip>

          <div className="flex-1 relative">
            {showCanned && <CannedPicker query={text.slice(1)} onPick={(c) => { setText(c); textareaRef.current?.focus(); }} />}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled || !chatId}
              placeholder={chatId ? "Mensagem… (/ para respostas rápidas)" : "Selecione uma conversa"}
              rows={1}
              className="w-full bg-white/5 hover:bg-white/7 focus:bg-white/7 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 border border-white/8 focus:border-sky-500/40 focus:outline-none resize-none transition-colors leading-relaxed"
              style={{ minHeight: 42, maxHeight: 130 }}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!text.trim() && (
              <Tip label="Gravar áudio">
                <button type="button" onClick={() => setShowRecorder(true)} disabled={disabled || !chatId}
                  className="h-10 w-10 rounded-xl hover:bg-white/8 text-zinc-500 hover:text-zinc-200 flex items-center justify-center transition-colors disabled:opacity-40">
                  <Mic className="h-5 w-5" />
                </button>
              </Tip>
            )}
            <button
              type="submit"
              disabled={!text.trim() || sending || disabled || !chatId}
              className="h-10 w-10 rounded-xl bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-sky-900/30"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-3 px-4 pb-2.5 text-[10px] text-zinc-700">
        <span>Enter para enviar</span>
        <span>·</span>
        <span>Shift+Enter para nova linha</span>
        <span>·</span>
        <span>/ para atalhos</span>
      </div>
    </div>
  );
}

// ============================================================
//  CHAT LIST ITEM
// ============================================================

function ChatItem({
  chat, selected, onClick,
}: {
  chat: ChatDoc; selected: boolean; onClick: () => void;
}) {
  const unread = (chat.unreadCount || 0) > 0;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left group relative ${
        selected ? "bg-sky-500/10 border border-sky-500/20 shadow-sm" : "hover:bg-white/4 border border-transparent"
      }`}
    >
      {/* Priority stripe */}
      {chat.priority && chat.priority !== "normal" && (
        <span className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full ${PRIORITY_CONFIG[chat.priority].bg.replace("/15","")}`} />
      )}

      <div className="relative flex-shrink-0">
        <Avatar src={chat.contactPhotoUrl} name={chat.contactName} size={44} online={chat.isOnline} />
        {chat.channel && (
          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-[#131b2a] border border-white/10 flex items-center justify-center">
            <ChannelIcon channel={chat.channel} size={11} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`text-sm truncate ${unread ? "font-semibold text-white" : "font-medium text-zinc-200"}`}>
            {chat.contactName || "Contato"}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {chat.pinned && <Pin className="h-3 w-3 text-zinc-500" />}
            <span className="text-[11px] text-zinc-600">{relativeDate(chat.lastMessageTime)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            {chat.lastMessageSender === "agent" && <CheckCheck className="h-3 w-3 text-zinc-600 flex-shrink-0" />}
            <span className={`text-xs truncate ${unread ? "text-zinc-300" : "text-zinc-500"}`}>
              {truncate(chat.lastMessage || "Sem mensagens", 45)}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {unread && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center">
                {chat.unreadCount! > 99 ? "99+" : chat.unreadCount}
              </span>
            )}
          </div>
        </div>

        {chat.tags && chat.tags.length > 0 && (
          <div className="flex gap-1 mt-1 overflow-hidden">
            {chat.tags.slice(0, 3).map((t) => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-md bg-zinc-800/80 text-zinc-500 border border-white/4 whitespace-nowrap">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ============================================================
//  RIGHT PANEL TABS
// ============================================================

type RightPanel = "contact" | "notes" | "pinned" | "transfer" | "gallery" | "activity";

function RightPanelTab({ icon: Icon, label, active, count, onClick }: {
  icon: React.ElementType; label: string; active: boolean; count?: number; onClick: () => void;
}) {
  return (
    <Tip label={label} side="bottom">
      <button onClick={onClick}
        className={`relative flex flex-col items-center gap-1 px-3 py-2 text-[10px] rounded-lg transition-all ${
          active ? "text-sky-400 bg-sky-500/10" : "text-zinc-600 hover:text-zinc-300"
        }`}>
        <Icon className="h-4 w-4" />
        {count !== undefined && count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center font-bold">{count > 9 ? "9+" : count}</span>
        )}
      </button>
    </Tip>
  );
}

// ============================================================
//  MAIN PAGE
// ============================================================

export default function ChatPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatIdFromUrl = searchParams?.get("chatId") || null;

  const isAdmin = ["admin", "agency_owner", "agency_admin"].includes(profile?.role || "");

  // ── Toast system ────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const showToast = useCallback((type: ToastItem["type"], msg: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p.slice(-3), { id, type, msg }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  // ── Data state ──────────────────────────────────────────────
  const [allChats, setAllChats] = useState<ChatDoc[]>([]);
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [leadContext, setLeadContext] = useState<LeadContext | null>(null);
  const [contactProfile, setContactProfile] = useState<ContactDoc | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<MessageDoc[]>([]);
  const [profileGallery, setProfileGallery] = useState<string[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [presence, setPresence] = useState<{ online?: boolean; lastSeen?: any; typing?: boolean } | null>(null);

  // ── UI state ────────────────────────────────────────────────
  const [selectedChatId, setSelectedChatId] = useState<string | null>(chatIdFromUrl);
  const [tab, setTab] = useState<"all" | "mine" | "queue" | "snoozed" | "resolved">("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [rightPanel, setRightPanel] = useState<RightPanel>("contact");
  const [replyTo, setReplyTo] = useState<MessageDoc | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; type?: string } | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [notes, setNotes] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<ChatPriority | "">("");
  const [labelFilter, setLabelFilter] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingLead, setLoadingLead] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const callTimerRef = useRef<number>(0);

  const selectedChat = useMemo(() => allChats.find((c) => c.id === selectedChatId) || null, [allChats, selectedChatId]);
  const selectedChatTenantId = useMemo(() => String(selectedChat?.tenantId || "").trim(), [selectedChat?.tenantId]);
  const selectedContactPhone = useMemo(() => normalizePhone(selectedChat?.contactPhone), [selectedChat?.contactPhone]);

  // ── Keyboard shortcuts ───────────────────────────────────────
  useKeyboardShortcut("k", true, () => { document.querySelector<HTMLInputElement>("[data-search]")?.focus(); });
  useKeyboardShortcut("e", true, () => { if (selectedChatId) handleChangeStatus("resolved"); });

  // ── Sync URL ─────────────────────────────────────────────────
  useEffect(() => { setSelectedChatId(chatIdFromUrl); }, [chatIdFromUrl]);

  // ── Chats subscription ───────────────────────────────────────
  useEffect(() => {
    if (authLoading || !profile) return;
    setLoadingChats(true);
    const ref = collection(db, "chats");
    const q = isAdmin
      ? query(ref, orderBy("lastMessageTime", "desc"), limit(300))
      : query(ref, where("ownerId", "==", profile.uid), orderBy("lastMessageTime", "desc"), limit(200));
    return onSnapshot(q, (snap) => {
      setAllChats(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatDoc)));
      setLoadingChats(false);
    }, () => setLoadingChats(false));
  }, [authLoading, profile, isAdmin]);

  // ── Team users ────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      query(collection(db, "users"), where("status", "==", "active")),
      (snap) => setTeamUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamUser)))
    );
  }, [isAdmin]);

  // ── Auto-select ───────────────────────────────────────────────
  useEffect(() => {
    if (!allChats.length || selectedChatId) return;
    const first = allChats[0].id;
    setSelectedChatId(first);
    router.replace(`/admin/chat?chatId=${first}`);
  }, [allChats, selectedChatId, router]);

  // ── Messages subscription ─────────────────────────────────────
  useEffect(() => {
    if (!selectedChatId) { setMessages([]); return; }
    setLoadingMessages(true);
    setMessages([]);
    setHasMoreMessages(false);
    const q = query(
      collection(db, "messages"),
      where("chatId", "==", selectedChatId)
    );
    return onSnapshot(q, (snap) => {
      const nextMessages = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MessageDoc));
      setMessages(sortByCreatedAtAsc(nextMessages));
      setLoadingMessages(false);
    }, () => setLoadingMessages(false));
  }, [selectedChatId]);

  // ── Auto-scroll ───────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  // ── Lead ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedChat?.leadId) { setLeadContext(null); return; }
    setLoadingLead(true);
    getDoc(doc(db, "leads", selectedChat.leadId))
      .then((s) => setLeadContext(s.exists() ? { id: s.id, ...s.data() } as LeadContext : null))
      .catch(() => setLeadContext(null))
      .finally(() => setLoadingLead(false));
  }, [selectedChat?.leadId]);

  // ── Presence ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadContactProfile() {
      if (!selectedContactPhone) {
        setContactProfile(null);
        return;
      }

      try {
        const byPhone = await getDocs(
          selectedChatTenantId
            ? query(
                collection(db, "contacts"),
                where("tenantId", "==", selectedChatTenantId),
                where("phone", "==", selectedContactPhone),
                limit(1)
              )
            : query(collection(db, "contacts"), where("phone", "==", selectedContactPhone), limit(1))
        );

        if (!cancelled) {
          setContactProfile(
            byPhone.empty ? null : ({ id: byPhone.docs[0].id, ...byPhone.docs[0].data() } as ContactDoc)
          );
        }
      } catch {
        if (!cancelled) {
          setContactProfile(null);
        }
      }
    }

    void loadContactProfile();

    return () => {
      cancelled = true;
    };
  }, [selectedContactPhone, selectedChatTenantId]);

  useEffect(() => {
    const phone = normalizePhone(selectedChat?.contactPhone);
    if (!phone) { setPresence(null); return; }
    return onSnapshot(doc(db, "presence", phone), (snap) => {
      if (!snap.exists()) { setPresence(null); return; }
      const d = snap.data() as any;
      setPresence({ online: d.online, lastSeen: d.lastSeen, typing: d.typingInChatId === selectedChatId });
    });
  }, [selectedChat?.contactPhone, selectedChatId]);

  // ── Gallery ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedChatId) { setProfileGallery([]); return; }
    setProfileGallery(
      sortByCreatedAtDesc(messages)
        .filter((message) => message.type === "image" || message.type === "video")
        .map((message) => message.mediaUrl)
        .filter(Boolean) as string[]
    );
  }, [messages, selectedChatId]);

  // ── Pinned ────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedChatId) { setPinnedMessages([]); return; }
    setPinnedMessages(sortByCreatedAtDesc(messages.filter((message) => message.pinned)));
  }, [messages, selectedChatId]);

  // ── Audit log ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedChatId) { setAuditLog([]); return; }
    const q = query(collection(db, "audit_events"), where("chatId", "==", selectedChatId), limit(60));
    return onSnapshot(q, (snap) => {
      const nextItems = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditEvent));
      setAuditLog(sortByCreatedAtDesc(nextItems).slice(0, 30));
    });
  }, [selectedChatId]);

  // ── Call timer ────────────────────────────────────────────────
  useEffect(() => {
    if (callActive) {
      setCallDuration(0);
      callTimerRef.current = window.setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      clearInterval(callTimerRef.current);
    }
    return () => clearInterval(callTimerRef.current);
  }, [callActive]);

  // ── Send message ──────────────────────────────────────────────
  async function handleSend(text: string, type: MessageType = "text", replyToId?: string | null) {
    if (!selectedChatId || !profile) return;
    const tmpId = `tmp-${Date.now()}-${Math.random()}`;
    const optimistic: MessageDoc = {
      id: tmpId, chatId: selectedChatId, text, sender: "agent",
      agentId: profile.uid, agentName: profile.name,
      createdAt: Date.now(), type, status: "sending",
      replyToId: replyToId || null, _temp: true,
    };
    setMessages((p) => [...p, optimistic]);
    try {
      const res = await authedFetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedChatId, text, type, replyToId }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Erro");
    } catch (err: any) {
      setMessages((p) => p.map((m) => m.id === tmpId ? { ...m, _failed: true, status: "failed" } : m));
      showToast("err", err?.message || "Falha ao enviar");
    }
  }

  // ── Actions ───────────────────────────────────────────────────
  async function toggleReaction(msgId: string, emoji: string) {
    if (!profile) return;
    const msg = messages.find((m) => m.id === msgId);
    const has = !!msg?.reactions?.[emoji]?.includes(profile.uid);
    await updateDoc(doc(db, "messages", msgId), {
      [`reactions.${emoji}`]: has ? arrayRemove(profile.uid) : arrayUnion(profile.uid),
    });
  }

  async function pinMessage(id: string) {
    const msg = messages.find((m) => m.id === id);
    const pin = !msg?.pinned;
    await updateDoc(doc(db, "messages", id), { pinned: pin });
    showToast("ok", pin ? "Mensagem fixada" : "Desfixada");
    // refresh pinned list
    if (selectedChatId) {
      getDocs(query(collection(db, "messages"), where("chatId", "==", selectedChatId), where("pinned", "==", true), orderBy("createdAt", "desc"), limit(20)))
        .then((snap) => setPinnedMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MessageDoc))));
    }
  }

  async function starMessage(id: string) {
    const msg = messages.find((m) => m.id === id);
    await updateDoc(doc(db, "messages", id), { starred: !msg?.starred });
  }

  async function deleteMessage(id: string) {
    try {
      await updateDoc(doc(db, "messages", id), { deleted: true, deletedAt: serverTimestamp() });
      showToast("ok", "Mensagem apagada");
    } catch { showToast("err", "Erro ao apagar mensagem"); }
  }

  async function handleChangeStatus(status: ChatStatus) {
    if (!selectedChatId) return;
    try {
      await updateDoc(doc(db, "chats", selectedChatId), {
        status,
        ...(status === "resolved" ? { resolvedAt: serverTimestamp() } : {}),
      });
      showToast("ok", `Conversa ${STATUS_CONFIG[status].label.toLowerCase()}`);
    } catch { showToast("err", "Erro ao atualizar status"); }
  }

  async function handleChangePriority(priority: ChatPriority) {
    if (!selectedChatId) return;
    await updateDoc(doc(db, "chats", selectedChatId), { priority });
    showToast("ok", `Prioridade: ${PRIORITY_CONFIG[priority].label}`);
  }

  async function handleTransfer() {
    if (!selectedChatId || !transferTo || !transferReason.trim()) {
      showToast("warn", "Preencha todos os campos"); return;
    }
    setTransferring(true);
    try {
      const res = await authedFetch("/api/chats/transfer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedChatId, toUid: transferTo, reason: transferReason }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Erro");
      showToast("ok", "Conversa transferida");
      setTransferTo(""); setTransferReason("");
    } catch (e: any) { showToast("err", e?.message || "Erro ao transferir"); }
    finally { setTransferring(false); }
  }

  async function handleSaveNote() {
    if (!selectedChatId || !notes.trim()) return;
    setSavingNote(true);
    try {
      await authedFetch("/api/whatsapp/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedChatId, type: "internal_note", text: notes, internal: true }),
      });
      setNotes("");
      showToast("ok", "Nota salva");
    } catch { showToast("err", "Erro ao salvar nota"); }
    finally { setSavingNote(false); }
  }

  async function handleInitiateCall() {
    if (!selectedChat?.contactPhone) { showToast("warn", "Número não disponível"); return; }
    try {
      const telHref = `tel:${selectedChat.contactPhone.replace(/[^\d+]/g, "")}`;
      window.open(telHref, "_self");
      setCallActive(true);
      showToast("ok", "Chamada iniciada");
    } catch (e: any) { showToast("err", e?.message || "Erro"); }
  }

  // ── Grouped messages ─────────────────────────────────────────
  function handleCopyContactPhone() {
    if (!selectedChat?.contactPhone) {
      showToast("warn", "Numero nao disponivel");
      return;
    }
    copyToClipboard(selectedChat.contactPhone);
    showToast("ok", "Telefone copiado");
  }

  function handleOpenWhatsappProfile() {
    if (!selectedContactPhone) {
      showToast("warn", "Numero nao disponivel");
      return;
    }
    window.open(`https://wa.me/${selectedContactPhone}`, "_blank", "noopener,noreferrer");
  }

  function handleComposeEmail() {
    const email = (selectedChat?.contactEmail || contactProfile?.email || leadContext?.email || "").trim();
    if (!email) {
      showToast("warn", "Email nao disponivel");
      return;
    }
    window.location.href = `mailto:${email}`;
  }

  const contactAvatarSrc = selectedChat?.contactPhotoUrl || contactProfile?.photoUrl || undefined;
  const contactDisplayName = selectedChat?.contactName || contactProfile?.name || leadContext?.nome || "Contato";
  const contactEmail = selectedChat?.contactEmail || contactProfile?.email || leadContext?.email || "";
  const contactCompany = contactProfile?.company || leadContext?.empresa || "";
  const relatedChats = useMemo(() => {
    if (!selectedContactPhone) return [] as ChatDoc[];
    return allChats.filter((chat) => {
      if (normalizePhone(chat.contactPhone) !== selectedContactPhone) return false;
      if (selectedChatTenantId && String(chat.tenantId || "").trim() !== selectedChatTenantId) return false;
      return true;
    });
  }, [allChats, selectedContactPhone, selectedChatTenantId]);

  const contactStats = useMemo(() => {
    if (!relatedChats.length) {
      return {
        totalConversations: 0,
        resolvedConversations: 0,
        activeConversations: 0,
        unreadMessages: 0,
        channelCount: 0,
        firstSeenAt: null as TimestampLike,
        lastSeenAt: null as TimestampLike,
      };
    }

    const firstSeenAt = relatedChats.reduce<TimestampLike>((earliest, chat) => {
      if (!earliest) return chat.lastMessageTime;
      const current = toDate(chat.lastMessageTime)?.getTime() || 0;
      const baseline = toDate(earliest)?.getTime() || 0;
      return current > 0 && (baseline === 0 || current < baseline) ? chat.lastMessageTime : earliest;
    }, null);

    const lastSeenAt = relatedChats.reduce<TimestampLike>((latest, chat) => {
      if (!latest) return chat.lastMessageTime;
      const current = toDate(chat.lastMessageTime)?.getTime() || 0;
      const baseline = toDate(latest)?.getTime() || 0;
      return current > baseline ? chat.lastMessageTime : latest;
    }, null);

    return {
      totalConversations: relatedChats.length,
      resolvedConversations: relatedChats.filter((chat) => chat.status === "resolved").length,
      activeConversations: relatedChats.filter((chat) => chat.status !== "resolved" && chat.status !== "spam").length,
      unreadMessages: relatedChats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0),
      channelCount: new Set(relatedChats.map((chat) => chat.channel).filter(Boolean)).size,
      firstSeenAt,
      lastSeenAt,
    };
  }, [relatedChats]);

  const grouped = useMemo(() => {
    const groups: { day: string; msgs: MessageDoc[] }[] = [];
    for (const m of messages) {
      const day = dayLabel(m.createdAt);
      if (!groups.length || groups[groups.length - 1].day !== day) groups.push({ day, msgs: [] });
      groups[groups.length - 1].msgs.push(m);
    }
    return groups;
  }, [messages]);

  // ── Filtered chats ────────────────────────────────────────────
  const visibleChats = useMemo(() => {
    const s = normalize(debouncedSearch);
    return allChats.filter((c) => {
      if (tab === "mine" && c.ownerId !== profile?.uid) return false;
      if (tab === "queue" && c.ownerId) return false;
      if (tab === "snoozed" && c.status !== "snoozed") return false;
      if (tab === "resolved" && c.status !== "resolved") return false;
      if (tab === "all" && c.status === "resolved") return false;
      if (priorityFilter && c.priority !== priorityFilter) return false;
      if (labelFilter && !c.labels?.includes(labelFilter)) return false;
      if (!s) return true;
      return normalize([c.contactName, c.contactPhone, c.lastMessage, c.ownerName, ...(c.tags || [])].join(" ")).includes(s);
    });
  }, [allChats, tab, debouncedSearch, profile?.uid, priorityFilter, labelFilter]);

  // ── Chat stats ────────────────────────────────────────────────
  const tabCounts = useMemo(() => ({
    all: allChats.filter((c) => c.status !== "resolved" && c.status !== "snoozed").length,
    mine: allChats.filter((c) => c.ownerId === profile?.uid && c.status !== "resolved").length,
    queue: allChats.filter((c) => !c.ownerId && c.status !== "resolved").length,
    snoozed: allChats.filter((c) => c.status === "snoozed").length,
    resolved: allChats.filter((c) => c.status === "resolved").length,
  }), [allChats, profile?.uid]);

  // ── Auth guard ────────────────────────────────────────────────
  if (authLoading || !profile) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0f14]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-2xl bg-sky-500/20 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-sky-400 animate-pulse" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      </div>
    );
  }

  // ============================================================
  //  RENDER
  // ============================================================
  return (
    <GlobalContext.Provider value={{ showToast, profile, user, isAdmin }}>
      <div className="h-[calc(100vh-72px)] flex overflow-hidden bg-[#080c12] font-sans">
        <ToastStack toasts={toasts} onDismiss={dismissToast} />

        {/* ======= SIDEBAR ======= */}
        <aside className={`flex flex-col border-r border-white/6 bg-[#0d1117] transition-all duration-300 ${sidebarCollapsed ? "w-16" : "w-[320px]"} flex-shrink-0`}>
          {/* Logo + collapse */}
          <div className={`flex items-center gap-3 px-4 py-4 border-b border-white/6 ${sidebarCollapsed ? "justify-center" : ""}`}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-sky-900/40">
                  <MessageSquare className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white tracking-tight">ALTUM Chat</div>
                  <div className="text-[10px] text-zinc-600">WhatsApp Business</div>
                </div>
              </div>
            )}
            <button onClick={() => setSidebarCollapsed((v) => !v)} className="p-1.5 rounded-lg hover:bg-white/8 text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0">
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4 rotate-90" />}
            </button>
          </div>

          {!sidebarCollapsed && (
            <>
              {/* Search */}
              <div className="px-3 py-3 border-b border-white/6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                  <input
                    data-search
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Buscar… (⌘K)"
                    className={`w-full bg-white/5 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 border transition-colors focus:outline-none ${searchFocused ? "border-sky-500/40 bg-white/7" : "border-white/6"}`}
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick filters row */}
                <div className="flex items-center gap-1 mt-2">
                  <button onClick={() => setShowQuickFilters((v) => !v)}
                    className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors ${showQuickFilters ? "bg-sky-500/15 text-sky-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"}`}>
                    <Filter className="h-3 w-3" /> Filtros
                  </button>
                  {priorityFilter && (
                    <button onClick={() => setPriorityFilter("")}
                      className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border ${PRIORITY_CONFIG[priorityFilter].bg} ${PRIORITY_CONFIG[priorityFilter].border} ${PRIORITY_CONFIG[priorityFilter].color}`}>
                      {PRIORITY_CONFIG[priorityFilter].label} <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {showQuickFilters && (
                  <div className="mt-2 p-2 bg-black/20 rounded-xl border border-white/6 space-y-2">
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider px-1">Prioridade</div>
                    <div className="flex gap-1 flex-wrap">
                      {(["urgent", "high", "normal", "low"] as ChatPriority[]).map((p) => (
                        <button key={p} onClick={() => setPriorityFilter((v) => v === p ? "" : p)}
                          className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${priorityFilter === p ? `${PRIORITY_CONFIG[p].bg} ${PRIORITY_CONFIG[p].border} ${PRIORITY_CONFIG[p].color}` : "text-zinc-500 border-white/6 hover:border-white/15"}`}>
                          {PRIORITY_CONFIG[p].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="px-3 py-2 border-b border-white/6">
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { value: "all", label: "Todos", count: tabCounts.all },
                    { value: "mine", label: "Meus", count: tabCounts.mine },
                    { value: "queue", label: "Fila", count: tabCounts.queue },
                  ] as { value: typeof tab; label: string; count: number }[]).map((t) => (
                    <button key={t.value} onClick={() => setTab(t.value)}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                        tab === t.value ? "bg-sky-500/15 text-sky-300 border border-sky-500/20" : "text-zinc-500 hover:text-zinc-300"
                      }`}>
                      {t.label}
                      {t.count > 0 && <span className={`text-[10px] px-1.5 rounded-full ${tab === t.value ? "bg-sky-500/25 text-sky-300" : "bg-white/8 text-zinc-400"}`}>{t.count}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {loadingChats ? (
                  <div className="flex flex-col gap-2 p-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl animate-pulse">
                        <div className="h-11 w-11 rounded-full bg-white/5 flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-2/3 bg-white/5 rounded" />
                          <div className="h-2.5 w-full bg-white/4 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : visibleChats.length === 0 ? (
                  <EmptyState icon={Inbox} title="Nenhuma conversa" body={search ? `Nenhum resultado para "${search}"` : "Não há conversas neste filtro"} />
                ) : (
                  visibleChats.map((c) => (
                    <ChatItem key={c.id} chat={c} selected={c.id === selectedChatId}
                      onClick={() => { setSelectedChatId(c.id); router.push(`/admin/chat?chatId=${c.id}`); }} />
                  ))
                )}
              </div>

              {/* Agent footer */}
              <div className="px-3 py-3 border-t border-white/6 flex items-center gap-2.5">
                <div className="relative">
                  <Avatar src={user?.photoURL || undefined} name={profile.name} size={34} status="online" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-zinc-200 truncate">{profile.name}</div>
                  <div className="text-[10px] text-zinc-600 truncate capitalize">{profile.role}</div>
                </div>
                <div className="flex gap-1">
                  <IconBtn icon={Bell} size="sm" tooltip="Notificações" />
                  <IconBtn icon={Settings} size="sm" tooltip="Configurações" />
                </div>
              </div>
            </>
          )}

          {/* Collapsed: icon nav */}
          {sidebarCollapsed && (
            <div className="flex flex-col items-center gap-2 py-4 flex-1">
              <Tip label="Conversas" side="right">
                <button className="h-9 w-9 rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-400">
                  <Inbox className="h-4.5 w-4.5" />
                </button>
              </Tip>
              <Tip label="Contatos" side="right">
                <button className="h-9 w-9 rounded-xl hover:bg-white/8 flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors">
                  <Users className="h-4.5 w-4.5" />
                </button>
              </Tip>
              <Tip label="Relatórios" side="right">
                <button className="h-9 w-9 rounded-xl hover:bg-white/8 flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors">
                  <TrendingUp className="h-4.5 w-4.5" />
                </button>
              </Tip>
              <div className="flex-1" />
              <Avatar src={user?.photoURL || undefined} name={profile.name} size={32} status="online" />
            </div>
          )}
        </aside>

        {/* ======= MAIN CONVERSATION ======= */}
        <main className="flex flex-col flex-1 min-w-0 bg-[#080c12]">
          {!selectedChatId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="h-20 w-20 rounded-3xl bg-white/4 flex items-center justify-center">
                <MessageSquare className="h-10 w-10 text-zinc-700" />
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-zinc-500">Selecione uma conversa</div>
                <div className="text-sm text-zinc-700 mt-1">Escolha um chat na lista para começar</div>
              </div>
              <Kbd>⌘K</Kbd>
            </div>
          ) : (
            <>
              {/* ── Chat header ── */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/6 bg-[#0d1117]/90 backdrop-blur-md">
                <button onClick={() => contactAvatarSrc && setLightbox({ url: contactAvatarSrc })} className="rounded-full transition-transform hover:scale-[1.02] disabled:cursor-default" disabled={!contactAvatarSrc}><Avatar src={contactAvatarSrc} name={contactDisplayName} size={38} online={presence?.online} /></button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-[15px] leading-tight">
                      {contactDisplayName}
                    </span>
                    {selectedChat?.channel && <ChannelIcon channel={selectedChat.channel} size={13} />}
                    {selectedChat?.priority && selectedChat.priority !== "normal" && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${PRIORITY_CONFIG[selectedChat.priority].bg} ${PRIORITY_CONFIG[selectedChat.priority].border} ${PRIORITY_CONFIG[selectedChat.priority].color}`}>
                        {PRIORITY_CONFIG[selectedChat.priority].label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                    {presence?.typing ? (
                      <span className="text-emerald-400 animate-pulse">digitando…</span>
                    ) : presence?.online ? (
                      <span className="text-emerald-400">online agora</span>
                    ) : presence?.lastSeen ? (
                      <span>visto {timeAgo(presence.lastSeen)}</span>
                    ) : (
                      <span>{formatPhone(selectedChat?.contactPhone)}</span>
                    )}
                    {selectedChat?.ownerName && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />{selectedChat.ownerName}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Header actions */}
                <div className="flex items-center gap-1">
                  <Tip label="Ligar (VOIP)">
                    <button onClick={handleInitiateCall} className="h-8 w-8 rounded-xl hover:bg-emerald-500/10 flex items-center justify-center text-zinc-500 hover:text-emerald-400 transition-all">
                      <Phone className="h-4 w-4" />
                    </button>
                  </Tip>

                  {/* Status quick-change */}
                  <div className="relative group/status">
                    <button className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${STATUS_CONFIG[selectedChat?.status || "open"].bg} ${STATUS_CONFIG[selectedChat?.status || "open"].border} ${STATUS_CONFIG[selectedChat?.status || "open"].color}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[selectedChat?.status || "open"].dot}`} />
                      {STATUS_CONFIG[selectedChat?.status || "open"].label}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <div className="absolute right-0 top-10 w-40 bg-[#131b2a] border border-white/10 rounded-xl shadow-2xl overflow-hidden hidden group-hover/status:block z-30">
                      {(["open", "pending", "snoozed", "resolved", "spam"] as ChatStatus[]).map((s) => (
                        <button key={s} onClick={() => handleChangeStatus(s)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors hover:bg-white/5 ${STATUS_CONFIG[s].color}`}>
                          <span className={`h-2 w-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
                          {STATUS_CONFIG[s].label}
                          {selectedChat?.status === s && <Check className="h-3 w-3 ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Priority quick-change */}
                  <div className="relative group/prio">
                    <Tip label="Prioridade">
                      <button className="h-8 w-8 rounded-xl hover:bg-white/8 flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors">
                        <Flag className="h-4 w-4" />
                      </button>
                    </Tip>
                    <div className="absolute right-0 top-10 w-36 bg-[#131b2a] border border-white/10 rounded-xl shadow-2xl overflow-hidden hidden group-hover/prio:block z-30">
                      {(["urgent", "high", "normal", "low"] as ChatPriority[]).map((p) => (
                        <button key={p} onClick={() => handleChangePriority(p)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors hover:bg-white/5 ${PRIORITY_CONFIG[p].color}`}>
                          {PRIORITY_CONFIG[p].label}
                          {selectedChat?.priority === p && <Check className="h-3 w-3 ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <IconBtn icon={MoreVertical} tooltip="Mais opções" />
                </div>
              </div>

              {/* ── Pinned banner ── */}
              {pinnedMessages.length > 0 && (
                <div className="flex items-center gap-3 px-5 py-2.5 bg-amber-950/30 border-b border-amber-500/15 cursor-pointer hover:bg-amber-950/40 transition-colors" onClick={() => setRightPanel("pinned")}>
                  <Pin className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-amber-300/80 truncate">
                      {pinnedMessages[0].text || pinnedMessages[0].type}
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-500">{pinnedMessages.length} fixada{pinnedMessages.length > 1 ? "s" : ""}</span>
                </div>
              )}

              {/* ── Messages area ── */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto py-4 px-5 space-y-0.5"
                style={{
                  background: "radial-gradient(ellipse at 20% 50%, rgba(14,165,233,0.02) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.025) 0%, transparent 60%)",
                }}
                onScroll={(e) => {
                  if (e.currentTarget.scrollTop < 100 && hasMoreMessages) return;
                }}
              >
                {hasMoreMessages && (
                  <div className="flex justify-center py-3">
                    <button className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 bg-white/4 border border-white/8 px-4 py-2 rounded-xl transition-colors hover:bg-white/8">
                      <RefreshCw className="h-3.5 w-3.5" /> Carregar mensagens anteriores
                    </button>
                  </div>
                )}

                {loadingMessages ? (
                  <div className="flex flex-col items-center gap-3 py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                    <span className="text-xs text-zinc-600">Carregando mensagens…</span>
                  </div>
                ) : messages.length === 0 ? (
                  <EmptyState icon={MessageSquare} title="Nenhuma mensagem" body="Esta é a primeira vez que você fala com este contato" />
                ) : (
                  grouped.map((group) => (
                    <div key={group.day}>
                      <DividerLabel label={group.day} />
                      {group.msgs.map((msg, idx) => {
                        const isAgent = msg.sender === "agent";
                        const nextMsg = group.msgs[idx + 1];
                        const prevMsg = group.msgs[idx - 1];
                        const showAvatar = !isAgent && (nextMsg?.sender !== msg.sender);
                        const replied = msg.replyToId ? messages.find((m) => m.id === msg.replyToId) || null : null;
                        return (
                          <div key={msg.id} className={`mb-${nextMsg?.sender !== msg.sender ? "3" : "0.5"}`}>
                            <MessageBubble
                              message={msg}
                              isAgent={isAgent}
                              replied={replied}
                              meUid={profile.uid}
                              showAvatar={showAvatar}
                              avatarSrc={contactAvatarSrc}
                              avatarName={contactDisplayName}
                              onReply={() => { setReplyTo(msg); }}
                              onCopy={() => { copyToClipboard(msg.text || ""); showToast("ok", "Texto copiado"); }}
                              onDelete={() => deleteMessage(msg.id)}
                              onPin={() => pinMessage(msg.id)}
                              onStar={() => starMessage(msg.id)}
                              onOpenMedia={(url, type) => setLightbox({ url, type })}
                              onReact={(emoji) => toggleReaction(msg.id, emoji)}
                              onEdit={() => showToast("info", "Em breve: edição de mensagens")}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}

                {presence?.typing && (
                  <div className="flex items-center gap-3 py-2">
                    <Avatar src={contactAvatarSrc} name={contactDisplayName} size={28} />
                    <div className="flex items-center gap-1.5 bg-[#1c2536] border border-white/6 rounded-2xl rounded-bl-sm px-4 py-3">
                      {[0,1,2].map((i) => (
                        <span key={i} className="h-2 w-2 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Composer ── */}
              <Composer
                chatId={selectedChatId}
                disabled={selectedChat?.status === "resolved"}
                replyTo={replyTo}
                onClearReply={() => setReplyTo(null)}
                onSend={handleSend}
              />
              {selectedChat?.status === "resolved" && (
                <div className="flex items-center justify-center gap-3 px-4 py-3 bg-blue-950/30 border-t border-blue-500/15">
                  <CheckCircle2 className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-blue-300">Conversa resolvida</span>
                  <button onClick={() => handleChangeStatus("open")} className="px-3 py-1 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs hover:bg-blue-500/30 transition-colors">Reabrir</button>
                </div>
              )}
            </>
          )}
        </main>

        {/* ======= RIGHT PANEL ======= */}
        {selectedChatId && (
          <aside className="w-[300px] flex-shrink-0 flex flex-col border-l border-white/6 bg-[#0d1117]">
            {/* Panel tabs */}
            <div className="flex items-center gap-0.5 px-3 py-3 border-b border-white/6">
              <RightPanelTab icon={UserRound} label="Contato" active={rightPanel === "contact"} onClick={() => setRightPanel("contact")} />
              <RightPanelTab icon={Edit3} label="Notas" active={rightPanel === "notes"} onClick={() => setRightPanel("notes")} />
              <RightPanelTab icon={Pin} label="Fixadas" active={rightPanel === "pinned"} count={pinnedMessages.length} onClick={() => setRightPanel("pinned")} />
              <RightPanelTab icon={Users} label="Transferir" active={rightPanel === "transfer"} onClick={() => setRightPanel("transfer")} />
              <RightPanelTab icon={ImageIcon} label="Mídia" active={rightPanel === "gallery"} onClick={() => setRightPanel("gallery")} />
              <RightPanelTab icon={Clock} label="Histórico" active={rightPanel === "activity"} onClick={() => setRightPanel("activity")} />
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* ── CONTACT PANEL ── */}
              {rightPanel === "contact" && (
                <div className="p-4 space-y-5">
                  <div className="flex flex-col items-center pt-2 pb-4 gap-3 border-b border-white/6">
                    <button onClick={() => contactAvatarSrc && setLightbox({ url: contactAvatarSrc })} className="rounded-full transition-transform hover:scale-[1.02] disabled:cursor-default" disabled={!contactAvatarSrc}>
                      <Avatar src={contactAvatarSrc} name={contactDisplayName} size={60} online={presence?.online} ring />
                    </button>
                    <div className="text-center">
                      <div className="font-semibold text-white text-[15px]">{contactDisplayName || "--"}</div>
                      <div className="text-sm text-zinc-500 mt-0.5">{formatPhone(selectedChat?.contactPhone)}</div>
                      {selectedChat?.contactStatusMessage && (
                        <div className="text-xs text-zinc-600 mt-1.5 italic px-4">"{selectedChat.contactStatusMessage}"</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Tip label="Abrir no WhatsApp">
                        <button onClick={handleOpenWhatsappProfile} className="h-8 w-8 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 hover:bg-sky-500/25 transition-colors">
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                      </Tip>
                      <Tip label="Ligar">
                        <button onClick={handleInitiateCall} className="h-8 w-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                          <Phone className="h-3.5 w-3.5" />
                        </button>
                      </Tip>
                      <Tip label="Enviar email">
                        <button onClick={handleComposeEmail} className="h-8 w-8 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-400 hover:bg-violet-500/25 transition-colors">
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                      </Tip>
                      <Tip label="Copiar telefone">
                        <button onClick={handleCopyContactPhone} className="h-8 w-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:bg-white/10 transition-colors">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </Tip>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold px-0.5">Informacoes</div>
                    {[
                      { icon: Phone, label: formatPhone(selectedChat?.contactPhone) },
                      { icon: Mail, label: contactEmail },
                      { icon: Building2, label: contactCompany },
                      { icon: User, label: selectedChat?.ownerName ? `Atribuido a ${selectedChat.ownerName}` : "Sem atribuicao" },
                    ].filter((row) => row.label).map((row, index) => (
                      <div key={index} className="flex items-center gap-2.5 text-sm text-zinc-300">
                        <row.icon className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                        <span className="truncate">{row.label}</span>
                      </div>
                    ))}
                  </div>

                  {selectedChat?.tags && selectedChat.tags.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Tags</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedChat.tags.map((tag) => (
                          <span key={tag} className="flex items-center gap-1 text-[11px] bg-zinc-800/70 text-zinc-300 px-2 py-1 rounded-lg border border-white/6">
                            <Hash className="h-2.5 w-2.5 text-zinc-500" />{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Lead Vinculado</div>
                    {loadingLead ? (
                      <div className="flex items-center gap-2 text-zinc-600 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...</div>
                    ) : leadContext ? (
                      <div className="rounded-xl p-3 bg-white/4 border border-white/8 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-white text-sm">{leadContext.nome}</div>
                            {leadContext.empresa && <div className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5"><Building2 className="h-3 w-3" />{leadContext.empresa}</div>}
                          </div>
                          {leadContext.value && (
                            <div className="text-sm font-bold text-emerald-400 whitespace-nowrap">
                              R$ {leadContext.value.toLocaleString("pt-BR")}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {leadContext.status && <span className="text-[11px] bg-zinc-800/80 text-zinc-300 px-2 py-0.5 rounded-lg">{leadContext.status}</span>}
                          {leadContext.pipelineStage && <span className="text-[11px] bg-sky-500/15 text-sky-300 border border-sky-500/20 px-2 py-0.5 rounded-lg">{leadContext.pipelineStage}</span>}
                        </div>
                        {leadContext.score !== undefined && (
                          <div>
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="text-zinc-500">Score</span>
                              <span className="text-emerald-400 font-medium">{leadContext.score}/100</span>
                            </div>
                            <ProgressBar value={leadContext.score} max={100} color="emerald" />
                          </div>
                        )}
                        <button onClick={() => router.push(`/admin/leads/${leadContext.id}`)} className="flex items-center gap-1.5 text-[11px] text-sky-400 hover:text-sky-300 transition-colors">
                          <ExternalLink className="h-3 w-3" /> Ver lead completo
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl p-3 bg-white/4 border border-white/8 text-xs text-zinc-600 flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5" /> Sem lead vinculado
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Estatisticas</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Conversas", value: String(contactStats.totalConversations || "--") },
                        { label: "Resolvidas", value: String(contactStats.resolvedConversations || "--") },
                        { label: "Canais", value: String(contactStats.channelCount || "--") },
                        { label: "CSAT", value: selectedChat?.csat ? `${selectedChat.csat}/5` : "--" },
                        { label: "Nao lidas", value: String(contactStats.unreadMessages || "0") },
                        { label: "Ultima atividade", value: contactStats.lastSeenAt ? relativeDate(contactStats.lastSeenAt) : "--" },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-white/4 border border-white/6 rounded-xl p-2.5 text-center">
                          <div className="text-[11px] text-zinc-600">{stat.label}</div>
                          <div className="text-sm font-semibold text-white mt-0.5">{stat.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {rightPanel === "notes" && (
                <div className="p-4 space-y-4">
                  <div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-2">Nova Nota Interna</div>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={6}
                      placeholder="Anote informações importantes sobre esta conversa. Visível apenas para a equipe."
                      className="w-full bg-white/5 rounded-xl px-3.5 py-3 text-sm text-white/85 placeholder-zinc-600 border border-white/8 focus:border-amber-500/40 focus:outline-none resize-none leading-relaxed"
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={handleSaveNote} disabled={savingNote || !notes.trim()}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-300 text-sm font-medium hover:bg-amber-500/25 transition-colors disabled:opacity-40">
                        {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                        Salvar nota
                      </button>
                      <button onClick={() => setNotes("")} className="px-3 py-2 rounded-xl bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] text-zinc-700 flex items-center gap-1.5 px-0.5">
                    <Lock className="h-3 w-3" /> Notas são privadas e não são enviadas ao contato
                  </div>
                </div>
              )}

              {/* ── PINNED PANEL ── */}
              {rightPanel === "pinned" && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Mensagens Fixadas</div>
                    <span className="text-[11px] text-zinc-600">{pinnedMessages.length} item{pinnedMessages.length !== 1 ? "s" : ""}</span>
                  </div>
                  {pinnedMessages.length === 0 ? (
                    <EmptyState icon={Pin} title="Nenhuma mensagem fixada" body="Fixe mensagens importantes para acesso rápido" />
                  ) : (
                    <div className="space-y-2">
                      {pinnedMessages.map((m) => (
                        <div key={m.id} className="group flex items-start gap-2.5 p-3 rounded-xl bg-white/4 border border-white/8 hover:border-white/15 transition-colors">
                          <Pin className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white/85 leading-relaxed line-clamp-2">
                              {m.type === "image" ? "📷 Foto" : m.type === "audio" ? "🎤 Áudio" : m.text || "Arquivo"}
                            </div>
                            <div className="text-[10px] text-zinc-600 mt-1">{shortTime(m.createdAt)}</div>
                          </div>
                          <button onClick={() => pinMessage(m.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 transition-all flex-shrink-0">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TRANSFER PANEL ── */}
              {rightPanel === "transfer" && (
                <div className="p-4 space-y-4">
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Transferir Atendimento</div>

                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">Agente destino</label>
                    <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}
                      className="w-full bg-white/5 rounded-xl px-3 py-2.5 text-sm text-white border border-white/8 focus:border-sky-500/40 focus:outline-none">
                      <option value="">Selecionar agente…</option>
                      <optgroup label="Agentes disponíveis">
                        {teamUsers.filter((u) => u.agentStatus === "online" || !u.agentStatus).map((u) => (
                          <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Selected agent preview */}
                  {transferTo && (() => {
                    const agent = teamUsers.find((u) => u.id === transferTo);
                    if (!agent) return null;
                    return (
                      <div className="flex items-center gap-3 p-3 bg-white/4 border border-white/8 rounded-xl">
                        <Avatar src={agent.photoUrl} name={agent.name} size={36} status="online" />
                        <div>
                          <div className="text-sm font-medium text-white">{agent.name}</div>
                          <div className="text-[11px] text-zinc-500 capitalize">{agent.role}</div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">Motivo da transferência</label>
                    <textarea value={transferReason} onChange={(e) => setTransferReason(e.target.value)} rows={3}
                      className="w-full bg-white/5 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 border border-white/8 focus:border-sky-500/40 focus:outline-none resize-none"
                      placeholder="Ex: Cliente solicita falar com especialista em…" />
                  </div>

                  <div className="space-y-2">
                    <button onClick={handleTransfer} disabled={transferring || !transferTo || !transferReason.trim()}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-all disabled:opacity-40 shadow-lg shadow-sky-900/30">
                      {transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      Transferir conversa
                    </button>
                    <button onClick={() => { setTransferTo(profile?.uid || ""); setTransferReason("Autoatribuição"); }}
                      className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm transition-colors flex items-center justify-center gap-2">
                      <UserCheck className="h-4 w-4" /> Atribuir a mim
                    </button>
                  </div>

                  {/* SLA indicator */}
                  {selectedChat?.firstResponseAt && (
                    <div className="p-3 bg-white/4 border border-white/8 rounded-xl space-y-1.5">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">SLA</div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">Primeira resposta</span>
                        <span className="text-white">{timeAgo(selectedChat.firstResponseAt)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── GALLERY PANEL ── */}
              {rightPanel === "gallery" && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Mídia Compartilhada</div>
                    <span className="text-[11px] text-zinc-600">{profileGallery.length} arquivo{profileGallery.length !== 1 ? "s" : ""}</span>
                  </div>
                  {profileGallery.length === 0 ? (
                    <EmptyState icon={ImageIcon} title="Sem mídia" body="Imagens e vídeos enviados aparecerão aqui" />
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {profileGallery.map((url, i) => (
                        <div key={i} onClick={() => setLightbox({ url })}
                          className="aspect-square rounded-xl overflow-hidden cursor-pointer bg-zinc-800 hover:scale-105 transition-transform">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── ACTIVITY PANEL ── */}
              {rightPanel === "activity" && (
                <div className="p-4 space-y-3">
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Histórico de Atividades</div>
                  {auditLog.length === 0 ? (
                    <EmptyState icon={Clock} title="Sem atividades" body="As ações nesta conversa serão registradas aqui" />
                  ) : (
                    <div className="space-y-2">
                      {auditLog.map((e) => (
                        <div key={e.id} className="flex items-start gap-2.5 py-2 border-b border-white/4 last:border-0">
                          <div className="h-6 w-6 rounded-full bg-white/6 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Clock className="h-3 w-3 text-zinc-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-zinc-300">
                              <span className="font-medium">{e.actorName || "Sistema"}</span>
                              {" "}{e.type.replace(/_/g, " ")}
                            </div>
                            <div className="text-[10px] text-zinc-600 mt-0.5">{timeAgo(e.createdAt)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ======= LIGHTBOX ======= */}
        {lightbox && (
          <div className="fixed inset-0 z-[100] bg-black/97 flex flex-col" onClick={() => setLightbox(null)}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8" onClick={(e) => e.stopPropagation()}>
              <div className="text-sm text-zinc-400">Visualização de mídia</div>
              <div className="flex items-center gap-2">
                <a href={lightbox.url} download className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/8 transition-colors">
                  <Download className="h-4 w-4" /> Baixar
                </a>
                <button onClick={() => setLightbox(null)} className="p-2 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
              {lightbox.type === "video" ? (
                <video src={lightbox.url} controls className="max-h-[85vh] max-w-[90vw] rounded-xl" onClick={(e) => e.stopPropagation()} />
              ) : (
                <img src={lightbox.url} className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
              )}
            </div>
          </div>
        )}

        {/* ======= CALL OVERLAY ======= */}
        {callActive && (
          <div className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-md flex items-center justify-center">
            <div className="w-80 rounded-3xl overflow-hidden shadow-2xl" style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)" }}>
              {/* Header */}
              <div className="px-6 pt-8 pb-4 text-center border-b border-white/8">
                <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Chamada ativa</div>
                <div className="font-mono text-2xl text-white font-light tracking-wider">{formatDuration(callDuration)}</div>
              </div>

              {/* Contact */}
              <div className="flex flex-col items-center gap-4 py-8 px-6">
                <div className="relative">
                  <Avatar src={contactAvatarSrc} name={contactDisplayName} size={88} />
                  <span className="absolute inset-0 rounded-full border-4 border-emerald-400/20 animate-ping" />
                  <span className="absolute inset-0 rounded-full border-2 border-emerald-400/40" />
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold text-white">{contactDisplayName}</div>
                  <div className="text-sm text-zinc-500 mt-1">{formatPhone(selectedChat?.contactPhone)}</div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-5 mt-2">
                  <Tip label="Mudo">
                    <button className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
                      <Mic className="h-5 w-5" />
                    </button>
                  </Tip>
                  <button onClick={() => setCallActive(false)}
                    className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white transition-all shadow-lg shadow-red-900/50">
                    <PhoneOff className="h-7 w-7" />
                  </button>
                  <Tip label="Altofalante">
                    <button className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
                      <Volume2 className="h-5 w-5" />
                    </button>
                  </Tip>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </GlobalContext.Provider>
  );
}


