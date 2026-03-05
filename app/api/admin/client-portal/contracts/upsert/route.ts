import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  clientId?: string;
  title?: string;
  status?: "ativo" | "encerrado" | "suspenso";
  monthlyValue?: number;
  dueDay?: number;
  startDate?: string;
  nextDueDate?: string;
  notes?: string;
  paymentLink?: string;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as Body;

    const clientId = clean(body.clientId, 120);
    if (!clientId) {
      return NextResponse.json({ error: "Campo obrigatorio: clientId." }, { status: 400 });
    }

    const clientSnap = await adminDb.collection("clientes").doc(clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    }

    const clientData = clientSnap.data() as { name?: string };
    const payload = {
      clientId,
      clientName: clientData.name || "Cliente",
      title: clean(body.title, 180) || "Contrato de Prestacao de Servicos",
      status: body.status === "encerrado" || body.status === "suspenso" ? body.status : "ativo",
      monthlyValue: Number(toNumber(body.monthlyValue).toFixed(2)),
      dueDay: Math.min(31, Math.max(1, Math.round(toNumber(body.dueDay, 10)))),
      startDate: clean(body.startDate, 16) || null,
      nextDueDate: clean(body.nextDueDate, 16) || null,
      notes: clean(body.notes, 3000) || null,
      paymentLink: clean(body.paymentLink, 500) || null,
      updatedBy: user.uid,
      updatedByName: user.name,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    };

    await Promise.all([
      adminDb.collection("client_contracts").doc(clientId).set(payload, { merge: true }),
      adminDb.collection("audit_logs").add({
        type: "client_portal_contract_upsert",
        actorId: user.uid,
        actorName: user.name,
        clientId,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, clientId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao salvar contrato do portal:", error);
    return NextResponse.json({ error: "Falha ao salvar contrato do portal." }, { status: 500 });
  }
}
