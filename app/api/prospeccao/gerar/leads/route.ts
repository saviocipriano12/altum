import { NextResponse } from "next/server";
import { db } from "@/firebaseConfig";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

// Função para limpar telefone e garantir formato brasileiro (55 + DDD + Numero)
function cleanPhone(phone?: string) {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  
  // Se começar com 0 (ex: 0319999...), remove o 0
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Se tiver 10 ou 11 dígitos (DDD+Num) e não tiver 55, adiciona
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }
  return digits;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Extração Inteligente de Campos Padrão
    const nome = body.nome || body.name || body.full_name || "Lead via Webhook";
    const email = body.email || body.mail || "";
    const telefoneRaw = body.telefone || body.phone || body.whatsapp || body.celular || "";
    const origem = body.origem || body.source || "webhook_generico";
    const mensagem = body.mensagem || body.message || "";
    
    // 2. Extração de UTMs (Rastreamento de Anúncios)
    const utms = {
      utm_source: body.utm_source || "",
      utm_medium: body.utm_medium || "",
      utm_campaign: body.utm_campaign || "",
      utm_content: body.utm_content || "",
      utm_term: body.utm_term || "",
    };

    // 3. Extração de Dados de Qualificação (O Pulo do Gato)
    // Removemos os campos padrão para sobrar apenas os "extras" (faturamento, cargo, nicho, etc)
    const { 
      nome: _n, name: _nm, 
      email: _e, mail: _m, 
      telefone: _t, phone: _p, whatsapp: _w, 
      origem: _o, source: _s,
      mensagem: _msg, 
      ...dadosExtras 
    } = body;

    // 4. Validação
    if (!telefoneRaw && !email) {
      return NextResponse.json(
        { error: "É obrigatório enviar telefone ou email para criar um lead." },
        { status: 400 }
      );
    }

    const telefoneLimpo = cleanPhone(String(telefoneRaw));

    // 5. Deduplicação (Evitar Leads Duplicados)
    let existingId = null;
    let existingData: any = null;
    const leadsRef = collection(db, "leads");

    // Tenta achar por telefone
    if (telefoneLimpo) {
      const qPhone = query(leadsRef, where("telefone", "==", telefoneLimpo));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        existingId = snapPhone.docs[0].id;
        existingData = snapPhone.docs[0].data();
      }
    }

    // Tenta achar por email (se não achou por telefone)
    if (!existingId && email) {
      const qEmail = query(leadsRef, where("email", "==", email));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        existingId = snapEmail.docs[0].id;
        existingData = snapEmail.docs[0].data();
      }
    }

    // 6. Ação: Atualizar ou Criar
    if (existingId) {
      // === ATUALIZAR LEAD EXISTENTE ===
      console.log(`[Webhook] Atualizando lead existente: ${existingId}`);
      const docRef = doc(db, "leads", existingId);
      
      await updateDoc(docRef, {
        updatedAt: serverTimestamp(),
        // Atualiza campos de contato se estiverem vazios no original
        email: existingData.email || email,
        nome: existingData.nome === "Lead via Webhook" ? nome : existingData.nome, // Prioriza nome real se o antigo for genérico
        
        // Salva os dados extras (faturamento, respostas do typebot) no perfil
        ...dadosExtras,
        ...utms, // Atualiza a origem do tráfego recente

        lastConversion: {
          origem: origem,
          data: new Date().toISOString(),
          mensagem: mensagem
        }
      });

      // Loga evento na timeline
      await addDoc(collection(db, "leads", existingId, "events"), {
        type: "conversion",
        title: "Reconversão via Site/Typebot",
        detail: `Lead converteu novamente em: ${origem}.`,
        metadata: { ...utms, mensagem },
        createdAt: serverTimestamp(),
      });

      return NextResponse.json({ success: true, action: "updated", id: existingId });

    } else {
      // === CRIAR NOVO LEAD ===
      console.log(`[Webhook] Criando novo lead: ${nome}`);
      
      const newDoc = await addDoc(leadsRef, {
        // Dados Padrão
        nome,
        email,
        telefone: telefoneLimpo,
        origem,
        
        // Dados de CRM
        status: "novo",
        pipelineStage: "captado",
        kanbanIndex: 0,
        
        // Dados Ricos (UTMs + Respostas do Typebot)
        ...dadosExtras, 
        ...utms,

        notes: mensagem ? `Msg Inicial: ${mensagem}` : "",
        
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Loga evento inicial
      await addDoc(collection(db, "leads", newDoc.id, "events"), {
        type: "system",
        title: "Lead Criado via Webhook",
        detail: `Origem: ${origem}`,
        metadata: utms,
        createdAt: serverTimestamp(),
      });

      return NextResponse.json({ success: true, action: "created", id: newDoc.id }, { status: 201 });
    }

  } catch (error: any) {
    console.error("Erro Crítico no Webhook:", error);
    return NextResponse.json(
      { error: "Erro interno", details: error.message },
      { status: 500 }
    );
  }
}