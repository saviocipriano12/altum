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

/**
 * =====================================================================
 * API WEBHOOK DE ENTRADA DE LEADS (Typebot / Site / Landing Page)
 * =====================================================================
 * * Como usar no Typebot (Bloco HTTP Request):
 * - Method: POST
 * - URL: https://seu-dominio.com/api/webhooks/leads
 * - Headers: Content-Type: application/json
 * - Body:
 * {
 * "nome": "{{nome}}",
 * "telefone": "{{whatsapp}}",
 * "email": "{{email}}",
 * "origem": "Site Oficial",
 * "mensagem": "Quero saber mais sobre tráfego"
 * }
 */

// Função para limpar telefone (garantir padrão 55...)
function cleanPhone(phone?: string) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  
  // Se tiver 10 ou 11 dígitos (com DDD) mas sem DDI 55, adiciona
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }
  return digits;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Mapeamento Flexível (aceita 'name' ou 'nome', 'phone' ou 'telefone')
    const nome = body.nome || body.name || "Lead via Webhook";
    const telefoneRaw = body.telefone || body.phone || body.whatsapp || "";
    const email = body.email || body.mail || "";
    const origem = body.origem || body.source || "webhook_site";
    const mensagem = body.mensagem || body.message || "";
    const tags = body.tags || []; // Array de strings opcional

    // 2. Validação Mínima
    if (!telefoneRaw && !email) {
      return NextResponse.json(
        { error: "É obrigatório enviar telefone ou email." },
        { status: 400 }
      );
    }

    const telefoneLimpo = cleanPhone(String(telefoneRaw));

    // 3. Deduplicação (Verificar se já existe)
    let existingId = null;
    const leadsRef = collection(db, "leads");

    // Tenta achar por telefone primeiro
    if (telefoneLimpo) {
      const qPhone = query(leadsRef, where("telefone", "==", telefoneLimpo));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) existingId = snapPhone.docs[0].id;
    }

    // Se não achou e tem email, tenta por email
    if (!existingId && email) {
      const qEmail = query(leadsRef, where("email", "==", email));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) existingId = snapEmail.docs[0].id;
    }

    // 4. Salvar ou Atualizar
    if (existingId) {
      // ATUALIZAR (Lead recorrente)
      const docRef = doc(db, "leads", existingId);
      
      await updateDoc(docRef, {
        // Não sobrescrevemos pipelineStage se ele já estiver avançado
        // Apenas avisamos que ele converteu de novo
        updatedAt: serverTimestamp(),
        lastConversion: {
          origem: origem,
          data: new Date().toISOString(),
          mensagem: mensagem
        }
      });

      // Adiciona evento na timeline do lead
      await addDoc(collection(db, "leads", existingId, "events"), {
        type: "conversion",
        title: "Nova conversão (Webhook)",
        detail: `Lead converteu novamente via ${origem}. Msg: ${mensagem}`,
        createdAt: serverTimestamp(),
      });

      return NextResponse.json({ 
        success: true, 
        action: "updated", 
        id: existingId, 
        message: "Lead já existia, histórico atualizado." 
      });

    } else {
      // CRIAR NOVO
      const newDoc = await addDoc(leadsRef, {
        nome: nome,
        telefone: telefoneLimpo,
        email: email,
        origem: origem,
        
        // Campos Obrigatórios para o Kanban funcionar:
        status: "novo",
        pipelineStage: "captado", 
        kanbanIndex: 0,
        
        // Dados extras
        notes: mensagem ? `Mensagem inicial: ${mensagem}` : "",
        tags: tags, // ex: ["lp-high-ticket"]
        
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Adiciona evento inicial
      await addDoc(collection(db, "leads", newDoc.id, "events"), {
        type: "system",
        title: "Lead Criado via Webhook",
        detail: `Origem: ${origem}`,
        createdAt: serverTimestamp(),
      });

      return NextResponse.json({ 
        success: true, 
        action: "created", 
        id: newDoc.id 
      }, { status: 201 });
    }

  } catch (error: any) {
    console.error("Erro no Webhook de Leads:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar lead", details: error.message },
      { status: 500 }
    );
  }
}