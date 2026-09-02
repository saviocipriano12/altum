import { NextResponse } from "next/server";
import { listPlatformPlans } from "@/lib/server/platform-plans";

export async function GET() {
  try {
    const plans = (await listPlatformPlans()).filter((plan) => plan.active);
    return NextResponse.json({ plans }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error("Falha ao listar planos publicos:", error);
    return NextResponse.json({ error: "Planos indisponiveis." }, { status: 503 });
  }
}
