import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type ProductInput = {
  id?: string;
  title?: string;
  category?: string;
  targetProfile?: string;
  whenToOffer?: string;
  priceFrom?: number;
  priceTo?: number;
};

type ScriptInput = {
  id?: string;
  situation?: string;
  goal?: string;
  script?: string;
};

type Body = {
  products?: ProductInput[];
  scripts?: ScriptInput[];
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanProducts(input: unknown): ProductInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const p = item as ProductInput;
      return {
        id: clean(p.id, 80) || `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: clean(p.title, 120),
        category: clean(p.category, 120),
        targetProfile: clean(p.targetProfile, 220),
        whenToOffer: clean(p.whenToOffer, 400),
        priceFrom: num(p.priceFrom),
        priceTo: num(p.priceTo),
      };
    })
    .filter((p) => p.title);
}

function cleanScripts(input: unknown): ScriptInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const s = item as ScriptInput;
      return {
        id: clean(s.id, 80) || `scr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        situation: clean(s.situation, 140),
        goal: clean(s.goal, 220),
        script: clean(s.script, 4000),
      };
    })
    .filter((s) => s.situation && s.script);
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_agent"] });

    const playbookRef = adminDb.collection("sales_playbook").doc("main");
    const tipsRef = adminDb.collection("sales_playbook_tips");

    const [playbookSnap, tipsSnap] = await Promise.all([
      playbookRef.get(),
      tipsRef.orderBy("createdAt", "desc").limit(100).get(),
    ]);

    const base = playbookSnap.exists
      ? (playbookSnap.data() as {
          products?: ProductInput[];
          scripts?: ScriptInput[];
          updatedAt?: unknown;
          updatedByName?: string;
        })
      : {};

    const tips = tipsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));

    return NextResponse.json({
      ok: true,
      products: Array.isArray(base.products) ? base.products : [],
      scripts: Array.isArray(base.scripts) ? base.scripts : [],
      tips,
      updatedAt: base.updatedAt || null,
      updatedByName: base.updatedByName || null,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao carregar playbook comercial:", error);
    return NextResponse.json({ error: "Falha ao carregar playbook." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as Body;

    const products = cleanProducts(body.products);
    const scripts = cleanScripts(body.scripts);

    await adminDb.collection("sales_playbook").doc("main").set(
      {
        products,
        scripts,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      { merge: true }
    );

    await adminDb.collection("audit_logs").add({
      type: "sales_playbook_update",
      actorId: user.uid,
      actorName: user.name,
      productsCount: products.length,
      scriptsCount: scripts.length,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, productsCount: products.length, scriptsCount: scripts.length });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao salvar playbook comercial:", error);
    return NextResponse.json({ error: "Falha ao salvar playbook." }, { status: 500 });
  }
}

