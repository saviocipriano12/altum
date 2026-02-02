import { NextResponse } from "next/server";
import { db } from "@/firebaseConfig";
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc } from "firebase/firestore";

// Token de verificação que você inventa e coloca lá no painel da Meta
const VERIFY_TOKEN = "ALTUM_WA_2026"; 

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message) {
      const from = message.from; // Número do cliente
      const text = message.text?.body;

      // 1. Lógica para encontrar ou criar o Chat no seu sistema baseado no número
      const chatsRef = collection(db, "chats");
      const q = query(chatsRef, where("contactPhone", "==", from));
      const snap = await getDocs(q);

      let chatId;
      if (snap.empty) {
        // Cria chat novo se o cliente for novo
        const newChat = await addDoc(chatsRef, {
          contactName: value.contacts?.[0]?.profile?.name || from,
          contactPhone: from,
          lastMessage: text,
          lastMessageTime: serverTimestamp(),
          status: "open"
        });
        chatId = newChat.id;
      } else {
        chatId = snap.docs[0].id;
        await updateDoc(doc(db, "chats", chatId), {
          lastMessage: text,
          lastMessageTime: serverTimestamp()
        });
      }

      // 2. Salva a mensagem na coleção de mensagens
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
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}