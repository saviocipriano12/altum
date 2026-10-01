import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { buildOwnershipTransferPatch, buildPersonalChannelTransferPatch, recordBelongsToUser } from "@/lib/team-member-lifecycle";
import { isEligibleLeadSeller } from "@/lib/lead-assignment";

type Body = { replacementUserId?: string; channelAction?: "transfer" | "shared" };

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function tenantRows(collection: string, tenantId: string) {
  const snap = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
  return snap.docs;
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string; userId: string }> }) {
  try {
    const actor = await requireRequestUser(req);
    const { tenantId, userId } = await context.params;
    const membership = await assertTenantAccess(actor.uid, tenantId);
    assertTenantCapability(membership, "manage_users");

    if (actor.uid === userId) return NextResponse.json({ error: "Você não pode desligar o próprio acesso." }, { status: 403 });
    const targetRef = adminDb.collection("tenant_users").doc(`${tenantId}_${userId}`);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });
    const target = targetSnap.data() as Record<string, unknown>;
    if (clean(target.role, 40) === "client_owner") return NextResponse.json({ error: "O dono da conta não pode ser desligado." }, { status: 403 });

    const body = await req.json().catch(() => ({})) as Body;
    const replacementUserId = clean(body.replacementUserId, 140);
    let replacement: { userId: string; name?: string } | null = null;
    if (replacementUserId) {
      if (replacementUserId === userId) return NextResponse.json({ error: "Escolha outra pessoa para receber a carteira." }, { status: 400 });
      const replacementSnap = await adminDb.collection("tenant_users").doc(`${tenantId}_${replacementUserId}`).get();
      const replacementData = replacementSnap.data() as Record<string, unknown> | undefined;
      if (!replacementSnap.exists || clean(replacementData?.status, 20) === "blocked") {
        return NextResponse.json({ error: "A pessoa escolhida para receber a carteira está inativa." }, { status: 400 });
      }
      const replacementName = clean(replacementData?.name, 140) || clean(replacementData?.email, 180);
      if (!isEligibleLeadSeller({
        userId: replacementUserId,
        name: replacementName,
        role: clean(replacementData?.role, 60),
        status: clean(replacementData?.status, 40),
        accessProfile: clean(replacementData?.accessProfile, 60),
        capabilities: Array.isArray(replacementData?.capabilities)
          ? replacementData.capabilities.filter((item): item is string => typeof item === "string")
          : [],
      })) {
        return NextResponse.json({ error: "A carteira comercial so pode ser transferida para um vendedor ativo." }, { status: 400 });
      }
      replacement = { userId: replacementUserId, name: replacementName };
    }

    const collections = ["chats", "leads", "appointments", "lead_tasks"];
    const counts: Record<string, number> = {};
    const writes: Array<{ ref: FirebaseFirestore.DocumentReference; patch: Record<string, unknown> }> = [];
    for (const collection of collections) {
      const rows = await tenantRows(collection, tenantId);
      for (const row of rows) {
        const data = row.data() as Record<string, unknown>;
        if (!recordBelongsToUser(data, userId)) continue;
        const patch = buildOwnershipTransferPatch(data, userId, replacement);
        if (!Object.keys(patch).length) continue;
        writes.push({ ref: row.ref, patch: { ...patch, reassignedAt: FieldValue.serverTimestamp(), reassignedBy: actor.uid } });
        counts[collection] = (counts[collection] || 0) + 1;
      }
    }

    const channelRows = await tenantRows("tenant_channels", tenantId);
    for (const row of channelRows) {
      const patch = buildPersonalChannelTransferPatch(row.data() as Record<string, unknown>, userId, body.channelAction === "transfer" ? replacement : null);
      if (!Object.keys(patch).length) continue;
      writes.push({ ref: row.ref, patch: { ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid } });
      counts.channels = (counts.channels || 0) + 1;
    }

    writes.push({ ref: targetRef, patch: { status: "blocked", availability: "offline", offboardedAt: FieldValue.serverTimestamp(), offboardedBy: actor.uid, replacementUserId: replacement?.userId || null } });
    for (let index = 0; index < writes.length; index += 400) {
      const batch = adminDb.batch();
      writes.slice(index, index + 400).forEach((write) => batch.set(write.ref, write.patch, { merge: true }));
      await batch.commit();
    }

    await Promise.all([
      adminAuth.revokeRefreshTokens(userId).catch(() => undefined),
      adminDb.collection("audit_logs").add({
        type: "tenant_user_offboard",
        tenantId,
        actorId: actor.uid,
        actorName: actor.name,
        targetUserId: userId,
        targetUserName: clean(target.name, 140) || clean(target.email, 180),
        replacementUserId: replacement?.userId || null,
        replacementUserName: replacement?.name || null,
        affected: counts,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, affected: counts, replacement });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao desligar pessoa do tenant:", error);
    return NextResponse.json({ error: "Não foi possível concluir o desligamento." }, { status: 500 });
  }
}
