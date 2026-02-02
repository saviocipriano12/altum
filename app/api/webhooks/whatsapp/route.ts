// src/app/api/webhooks/whatsapp/route.ts
import { NextResponse } from "next/server";
import { db } from "@/firebaseConfig";
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, limit } from "firebase/firestore";

const VERIFY_TOKEN = process.env.NEXT_PUBLIC_META_VERIFY_TOKEN;

// 1. VALIDAÇÃO (A Meta chama isso quando você clica em 'Verificar' no painel deles)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// 2. RECEBIMENTO (A Meta chama isso quando o cliente manda mensagem)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message) {
      const from = message.from; // Número do cliente
      const text = message.text?.body;

      // Busca o chat no Firebase pelo número
      const chatsRef = collection(db, "chats");
      const q = query(chatsRef, where("contactPhone", "==", from), limit(1));
      const snap = await getDocs(q);

      let chatId;
      if (snap.empty) {
        // Se o cliente é novo, cria o chat
        const newChat = await addDoc(chatsRef, {
          contactName: body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || from,
          contactPhone: from,
          lastMessage: text,
          lastMessageTime: serverTimestamp(),
          status: "open"
        });
        chatId = newChat.id;
      } else {
        // Se já existe, atualiza a última mensagem
        chatId = snap.docs[0].id;
        await updateDoc(doc(db, "chats", chatId), {
          lastMessage: text,
          lastMessageTime: serverTimestamp()
        });
      }

      // Salva a mensagem na sub-coleção
      await addDoc(collection(db, "messages"), {
        chatId,
        text,
        sender: "client",
        type: "text",
        createdAt: serverTimestamp(),
      });
    }
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}