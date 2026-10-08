import { NextResponse } from "next/server";
import { processCreativeMediaJobs } from "@/lib/server/agent-os/creative-job-worker";
import { processAvatarAnchorJobs } from "@/lib/server/agent-os/avatar-anchor-worker";

function accessToken(request: Request) {
  const bearer = String(request.headers.get("authorization") || "").trim();
  if (bearer.toLowerCase().startsWith("bearer ")) return bearer.slice(7).trim();
  return String(request.headers.get("x-creative-media-jobs-token") || request.headers.get("x-cron-secret") || "").trim();
}

export async function GET(request: Request) {
  const tokens = [process.env.CREATIVE_MEDIA_JOBS_TOKEN, process.env.CRON_SECRET].map((value) => String(value || "").trim()).filter(Boolean);
  if (!tokens.length) return NextResponse.json({ error: "CREATIVE_MEDIA_JOBS_TOKEN ou CRON_SECRET nao configurado." }, { status: 503 });
  if (!tokens.includes(accessToken(request))) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") || 12);
    const [media, avatars] = await Promise.all([processCreativeMediaJobs({ limit }), processAvatarAnchorJobs({ limit: Math.min(8, limit) })]);
    return NextResponse.json({ ok: true, media, avatars });
  } catch (error) {
    console.error("Falha no worker de mídia criativa:", error);
    return NextResponse.json({ error: "Falha ao processar mídia criativa." }, { status: 500 });
  }
}

export async function POST(request: Request) { return GET(request); }
