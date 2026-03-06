import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";

type Body = {
  type?: "faq" | "catalog" | "policy";
  content?: string;
  tags?: string[] | string;
};

function clean(value: unknown, max = 800) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => clean(item, 60))
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => clean(item, 60))
      .filter(Boolean)
      .slice(0, 20);
  }

  return [] as string[];
}

function normalizeType(value: unknown): "faq" | "catalog" | "policy" {
  const type = String(value || "faq").toLowerCase();
  if (type === "catalog") return "catalog";
  if (type === "policy") return "policy";
  return "faq";
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;

    await assertTenantAccess(user.uid, tenantId);

    const snap = await adminDb
      .collection("kb_docs")
      .where("tenantId", "==", tenantId)
      .limit(200)
      .get();

    const items = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        tenantId,
        type: normalizeType(data.type),
        content: clean(data.content, 1200),
        tags: parseTags(data.tags),
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      };
    });

    return NextResponse.json({ ok: true, tenantId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao listar base de conhecimento:", error);
    return NextResponse.json({ error: "Falha ao listar documentos." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;

    await assertTenantAccess(user.uid, tenantId);

    const body = (await req.json()) as Body;
    const content = clean(body.content, 1600);
    if (!content) {
      return NextResponse.json({ error: "Campo obrigatorio: content." }, { status: 400 });
    }

    const docRef = await adminDb.collection("kb_docs").add({
      tenantId,
      type: normalizeType(body.type),
      content,
      tags: parseTags(body.tags),
      createdBy: user.uid,
      createdByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, tenantId, kbDocId: docRef.id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao salvar base de conhecimento:", error);
    return NextResponse.json({ error: "Falha ao salvar documento." }, { status: 500 });
  }
}