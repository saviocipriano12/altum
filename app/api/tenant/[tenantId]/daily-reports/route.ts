import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  assertTenantRole,
  TenantAccessError,
} from "@/lib/server/tenant";
import { generateDailyReport, getDailyReport, sendDailyReportWhatsApp } from "@/lib/server/daily-report";

type Body = {
  dateKey?: string;
  send?: boolean;
  dryRun?: boolean;
};

function clean(value: unknown, max = 80) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function readDateKey(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = clean(searchParams.get("dateKey") || searchParams.get("date") || "", 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const dateKey = readDateKey(req);
    if (!dateKey) {
      return NextResponse.json({ error: "Informe dateKey no formato YYYY-MM-DD." }, { status: 400 });
    }

    const existing = await getDailyReport(tenantId, dateKey);
    const report = existing || await generateDailyReport({ tenantId, dateKey });
    return NextResponse.json({ ok: true, tenantId, report });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar fechamento do dia:", error);
    return NextResponse.json({ error: "Falha ao carregar fechamento do dia." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "view_metrics");

    const body = (await req.json().catch(() => ({}))) as Body;
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(clean(body.dateKey, 10)) ? clean(body.dateKey, 10) : undefined;

    if (body.send) {
      assertTenantCapability(membership, "manage_settings");
      const result = await sendDailyReportWhatsApp({
        tenantId,
        dateKey,
        forceGenerate: true,
        forceSend: true,
        dryRun: body.dryRun === true,
      });
      const status = result.ok ? 200 : 422;
      return NextResponse.json({ ok: result.ok, tenantId, result }, { status });
    }

    const report = await generateDailyReport({ tenantId, dateKey });
    return NextResponse.json({ ok: true, tenantId, report });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao gerar fechamento do dia:", error);
    return NextResponse.json({ error: "Falha ao gerar fechamento do dia." }, { status: 500 });
  }
}
