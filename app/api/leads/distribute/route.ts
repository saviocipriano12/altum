import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getTenantForCurrentUser } from "@/lib/server/tenant";
import { AGENCY_SELLER_ROLES, canReceiveDistributedLeads } from "@/lib/agency-roles";

type Body = {
  leadIds?: string[];
  sellerIds?: string[];
  sellerRoles?: string[];
  vendedorIds?: string[];
};

type SellerTarget = {
  id: string;
  name: string;
  role: string;
  status: string;
  tenantId: string | null;
};

export async function POST(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as Body;

    const leadIds = Array.isArray(body.leadIds)
      ? body.leadIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const sellerIdsRaw = Array.isArray(body.sellerIds)
      ? body.sellerIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const vendedorIdsRaw = Array.isArray(body.vendedorIds)
      ? body.vendedorIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const sellerRolesRaw = Array.isArray(body.sellerRoles)
      ? body.sellerRoles.map((role) => String(role || "").trim().toLowerCase()).filter(Boolean)
      : [];

    const mergedTargets = [...sellerIdsRaw, ...vendedorIdsRaw];
    const roleSet = new Set<string>(AGENCY_SELLER_ROLES);
    const targetRoles = new Set<string>(sellerRolesRaw.filter((role) => roleSet.has(role)));

    const explicitIds = mergedTargets.filter((target) => {
      const value = target.toLowerCase();
      if (roleSet.has(value)) {
        targetRoles.add(value);
        return false;
      }
      return true;
    });

    if (!leadIds.length || (!explicitIds.length && !targetRoles.size)) {
      return NextResponse.json(
        { error: "Campos obrigatorios: leadIds[] e sellerIds[]/sellerRoles[]/vendedorIds[]." },
        { status: 400 }
      );
    }

    const sellerMap = new Map<string, SellerTarget>();

    if (explicitIds.length) {
      const sellerDocs = await Promise.all(
        explicitIds.map((id) => adminDb.collection("users").doc(id).get())
      );

      const explicitEntries = await Promise.all(
        sellerDocs
          .filter((doc) => doc.exists)
          .map(async (doc) => {
            const data = doc.data() as { name?: string; role?: string; status?: string };
            return {
              id: doc.id,
              name: data.name || "Vendedor",
              role: (data.role || "sdr").toLowerCase(),
              status: (data.status || "active").toLowerCase(),
              tenantId: await getTenantForCurrentUser(doc.id),
            } satisfies SellerTarget;
          })
      );

      explicitEntries.forEach((entry) => {
        sellerMap.set(entry.id, entry);
      });
    }

    if (targetRoles.size) {
      const roleTargets = Array.from(targetRoles);
      const roleSnap = await adminDb
        .collection("users")
        .where("status", "==", "active")
        .where("role", "in", roleTargets)
        .get();

      const roleEntries = await Promise.all(
        roleSnap.docs.map(async (doc) => {
          const data = doc.data() as { name?: string; role?: string; status?: string };
          return {
            id: doc.id,
            name: data.name || "Vendedor",
            role: (data.role || "sdr").toLowerCase(),
            status: (data.status || "active").toLowerCase(),
            tenantId: await getTenantForCurrentUser(doc.id),
          } satisfies SellerTarget;
        })
      );

      roleEntries.forEach((entry) => {
        sellerMap.set(entry.id, entry);
      });
    }

    const sellers = Array.from(sellerMap.values()).filter(
      (user) => user.status === "active" && canReceiveDistributedLeads(user.role)
    );

    if (!sellers.length) {
      return NextResponse.json(
        { error: "Nenhum vendedor ativo valido para distribuicao." },
        { status: 400 }
      );
    }

    const batch = adminDb.batch();
    let index = 0;

    for (const leadId of leadIds) {
      const seller = sellers[index];
      const leadRef = adminDb.collection("leads").doc(leadId);
      batch.set(
        leadRef,
        {
          ownerId: seller.id,
          owner: seller.name,
          tenantId: seller.tenantId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      index = (index + 1) % sellers.length;
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      distributed: leadIds.length,
      sellers: sellers.map((item) => ({ id: item.id, name: item.name })),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao distribuir leads:", error);
    return NextResponse.json({ error: "Falha ao distribuir leads." }, { status: 500 });
  }
}
