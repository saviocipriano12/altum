import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  name?: string;
  niche?: string;
  city?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  site?: string;
  status?: string;
  services?: string[];
  ownerId?: string;
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json()) as Body;

    const name = clean(body.name, 180);
    const email = clean(body.email, 180);
    if (!name || !email) {
      return NextResponse.json(
        { error: "Campos obrigatorios: name e email." },
        { status: 400 }
      );
    }

    let ownerId = user.uid;
    let ownerName = user.name;
    if (isAdmin(user) && body.ownerId) {
      const targetId = clean(body.ownerId, 120);
      if (targetId) {
        const ownerSnap = await adminDb.collection("users").doc(targetId).get();
        if (ownerSnap.exists) {
          const ownerData = ownerSnap.data() as { name?: string };
          ownerId = targetId;
          ownerName = ownerData.name || user.name;
        }
      }
    }

    const services = Array.isArray(body.services)
      ? body.services.map((item) => clean(item, 120)).filter(Boolean).slice(0, 20)
      : [];

    const ref = await adminDb.collection("clientes").add({
      name,
      niche: clean(body.niche, 120) || "Nao informado",
      city: clean(body.city, 120) || "Nao informado",
      contactName: clean(body.contactName, 140) || "Nao informado",
      email,
      phone: clean(body.phone, 40),
      site: clean(body.site, 240),
      status: clean(body.status, 80) || "Prospeccao",
      services,
      ownerId,
      owner: ownerName,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao criar cliente:", error);
    return NextResponse.json({ error: "Falha ao criar cliente." }, { status: 500 });
  }
}

