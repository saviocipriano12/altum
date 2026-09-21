import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { pixelDocumentId } from "@/lib/server/growth/pixel-inventory";

const schema = z.object({ tenantId: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/), provider: z.enum(["meta", "google", "tiktok", "other"]),
  name: z.string().trim().min(2).max(120), externalId: z.string().trim().regex(/^[A-Za-z0-9_./:-]{1,180}$/),
  domains: z.array(z.string().trim().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i)).max(20),
}).strict();

export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_admin"] });
    const result = schema.safeParse(await req.json());
    if (!result.success) return NextResponse.json({ error: "Informe empresa, nome, provedor, identificador e domínios válidos." }, { status: 400 });
    const data = result.data;
    const tenant = await adminDb.collection("tenants").doc(data.tenantId).get();
    if (!tenant.exists) throw new RouteAuthError(404, "company_not_found", "Empresa não encontrada.");
    // Registration is an inventory entry, never proof that a provider pixel is receiving events.
    const ref = adminDb.collection("admin_growth_pixels").doc(pixelDocumentId(data.tenantId, data.provider, data.externalId));
    const duplicate = await adminDb.collection("admin_growth_pixels").where("tenantId", "==", data.tenantId).limit(501).get();
    if (duplicate.size > 500) throw new RouteAuthError(409, "pixel_inventory_limit", "Revise o inventário desta empresa antes de cadastrar outro pixel.");
    if (duplicate.docs.some(doc => doc.data().provider === data.provider && doc.data().externalId === data.externalId)) throw new RouteAuthError(409, "pixel_exists", "Este pixel já está cadastrado nesta empresa.");
    await adminDb.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      if (existing.exists) throw new RouteAuthError(409, "pixel_exists", "Este pixel já está cadastrado nesta empresa.");
      transaction.create(ref, { ...data, domains: [...new Set(data.domains.map(domain => domain.toLowerCase()))], verificationStatus: "unverified", createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() });
      transaction.set(adminDb.collection("audit_logs").doc(), { type: "admin_pixel_registered", tenantId: data.tenantId, pixelId: ref.id, actorId: actor.uid, createdAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ ok: true, id: ref.id, verificationStatus: "unverified" }, { status: 201 });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Falha no inventário de pixels:", error);
    return NextResponse.json({ error: "Falha ao cadastrar o pixel." }, { status: 500 });
  }
}
