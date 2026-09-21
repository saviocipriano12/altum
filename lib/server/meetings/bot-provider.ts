export type MeetingBotPlatform = "google_meet" | "zoom";

export type MeetingBotTarget = {
  platform: MeetingBotPlatform;
  nativeMeetingId: string;
  meetingUrl: string;
};

export type MeetingBotRun = MeetingBotTarget & {
  providerMeetingId: number | null;
  status: string;
  raw: Record<string, unknown>;
};

export type MeetingRecording = {
  id: number;
  meetingId: number;
  status: string;
  durationSeconds: number | null;
};

export class MeetingBotProviderError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`meeting_bot_provider_${status}`);
    this.status = status;
    this.detail = detail;
  }
}

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readProviderConfig() {
  const baseUrl = cleanText(process.env.ALTUM_MEETING_BOT_API_URL, 500).replace(/\/+$/, "");
  const apiKey = cleanText(process.env.ALTUM_MEETING_BOT_API_KEY, 1000);
  if (!baseUrl || !apiKey) throw new Error("MEETING_BOT_PROVIDER_NOT_CONFIGURED");

  const parsed = new URL(baseUrl);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("MEETING_BOT_PROVIDER_URL_INVALID");
  }
  return {
    baseUrl,
    apiKey,
    botName: cleanText(process.env.ALTUM_MEETING_BOT_NAME, 80) || "Altum IA",
  };
}

export function isMeetingBotProviderConfigured() {
  try {
    readProviderConfig();
    return true;
  } catch {
    return false;
  }
}

export function parseMeetingBotTarget(value: string): MeetingBotTarget {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("MEETING_URL_INVALID");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("MEETING_URL_INVALID");

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  if (hostname === "meet.google.com") {
    const nativeMeetingId = path.split("/").filter(Boolean)[0] || "";
    if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(nativeMeetingId)) throw new Error("MEETING_URL_INVALID");
    return { platform: "google_meet", nativeMeetingId: nativeMeetingId.toLowerCase(), meetingUrl: url.toString() };
  }

  if (hostname === "zoom.us" || hostname.endsWith(".zoom.us")) {
    const match = path.match(/\/(?:j|wc\/join)\/(\d{9,12})(?:\/|$)/i);
    if (!match?.[1]) throw new Error("MEETING_URL_INVALID");
    return { platform: "zoom", nativeMeetingId: match[1], meetingUrl: url.toString() };
  }

  throw new Error("MEETING_PLATFORM_UNSUPPORTED");
}

async function providerFetch(path: string, init?: RequestInit) {
  const config = readProviderConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "X-API-Key": config.apiKey,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new MeetingBotProviderError(response.status, cleanText(payload, 1200) || "Falha no serviço de reunião.");
  }
  return response;
}

export async function startMeetingBot(input: { meetingUrl: string; language?: string }): Promise<MeetingBotRun> {
  const target = parseMeetingBotTarget(input.meetingUrl);
  const config = readProviderConfig();
  const language = cleanText(input.language, 20).toLowerCase().split(/[_-]/)[0] || "pt";
  const response = await providerFetch("/bots", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: target.meetingUrl,
      bot_name: config.botName,
      language,
      transcribe_enabled: false,
      recording_enabled: true,
    }),
  });
  const raw = (await response.json()) as Record<string, unknown>;
  return {
    ...target,
    providerMeetingId: Number.isFinite(Number(raw.id)) ? Number(raw.id) : null,
    status: cleanText(raw.status, 80) || "requested",
    raw,
  };
}

export async function getMeetingBot(providerMeetingId: number) {
  const response = await providerFetch(`/meetings/${encodeURIComponent(String(providerMeetingId))}`);
  return (await response.json()) as Record<string, unknown>;
}

export async function stopMeetingBot(target: Pick<MeetingBotTarget, "platform" | "nativeMeetingId">) {
  const response = await providerFetch(`/bots/${encodeURIComponent(target.platform)}/${encodeURIComponent(target.nativeMeetingId)}`, {
    method: "DELETE",
  });
  return (await response.json()) as Record<string, unknown>;
}

export async function findMeetingRecording(providerMeetingId: number): Promise<MeetingRecording | null> {
  const response = await providerFetch(`/recordings?meeting_db_id=${encodeURIComponent(String(providerMeetingId))}&limit=10`);
  const payload = (await response.json()) as { recordings?: Array<Record<string, unknown>> };
  const raw = (payload.recordings || []).find((item) => Number(item.meeting_id) === providerMeetingId);
  if (!raw || !Number.isFinite(Number(raw.id))) return null;
  return {
    id: Number(raw.id),
    meetingId: Number(raw.meeting_id),
    status: cleanText(raw.status, 80),
    durationSeconds: Number.isFinite(Number(raw.duration_seconds)) ? Number(raw.duration_seconds) : null,
  };
}

export async function downloadMeetingRecording(recordingId: number) {
  const metadataResponse = await providerFetch(`/recordings/${encodeURIComponent(String(recordingId))}/master?type=audio`);
  const metadata = (await metadataResponse.json()) as { raw_url?: unknown };
  const rawUrl = cleanText(metadata.raw_url, 500);
  if (!rawUrl.startsWith(`/recordings/${recordingId}/media/`) || !rawUrl.includes("/raw")) {
    throw new Error("MEETING_RECORDING_URL_INVALID");
  }
  const response = await providerFetch(rawUrl);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 24 * 1024 * 1024) throw new Error("MEETING_RECORDING_TOO_LARGE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > 24 * 1024 * 1024) throw new Error("MEETING_RECORDING_TOO_LARGE");
  return {
    bytes,
    contentType: response.headers.get("content-type") || "audio/webm",
    fileName: `reuniao-${recordingId}.webm`,
  };
}
