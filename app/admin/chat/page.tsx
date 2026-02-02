"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { WhatsAppService } from "@/services/whatsapp";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  limit, // Adicionado import que faltava
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  Search,
  Send,
  MoreVertical,
  Phone,
  Paperclip,
  Check,
  CheckCheck,
  UserCircle2,
  Loader2,
  MessageSquarePlus,
  Archive,
  Inbox,
  UserPlus,
  Tag,
  StickyNote,
  ArrowRight,
  ExternalLink,
  X,
  Smile,
  FileText,
  Target // Adicionado import que faltava
} from "lucide-react";

// --- TIPAGENS ROBUSTAS ---

type ChatContact = {
  id: string;
  contactName: string;
  contactPhone: string; // Ex: 553199999999
  photoUrl?: string;
  lastMessage?: string;
  lastMessageTime?: any;
  unreadCount?: number;
  status: "open" | "archived"; // Controle de inbox zero
  leadId?: string; // Vínculo crucial com o CRM
  tags?: string[]; // Ex: "Cliente", "Quente", "Suporte"
  notes?: string; // Notas internas sobre o contato
};

type Message = {
  id: string;
  chatId: string;
  text: string;
  sender: "agent" | "client" | "system"; // System para avisos automáticos
  type: "text" | "image" | "file" | "template"; // Preparado para futuro
  fileUrl?: string;
  createdAt: any;
  status?: "sent" | "delivered" | "read";
};

type LeadData = {
  id: string;
  nome: string;
  status: string;
  pipelineStage: string;
};

export default function ChatPage() {
  // Hooks de navegação
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlChatId = searchParams.get("chatId");

  // Estados principais
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatContact | null>(null);
  
  // Estados de UI
  const [inputText, setInputText] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tabFilter, setTabFilter] = useState<"open" | "archived">("open");
  const [showRightSidebar, setShowRightSidebar] = useState(true); // Painel de contexto

  // Contexto inteligente do Lead
  const [leadContext, setLeadContext] = useState<any>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------
  // 1. CARREGAMENTO DE DADOS
  // ---------------------------------------------------------

  // Carregar contatos (Sidebar Esquerda)
  useEffect(() => {
    // DICA: Crie o índice composto no Firebase se der erro aqui
    const q = query(
      collection(db, "chats"), 
      orderBy("lastMessageTime", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ChatContact[];
      setContacts(list);
      setLoadingContacts(false);
    });

    return () => unsub();
  }, []);

  // Lógica de URL: Se der F5, reabre o chat que estava na URL
  useEffect(() => {
    if (urlChatId && contacts.length > 0 && !selectedChat) {
      const found = contacts.find((c) => c.id === urlChatId);
      if (found) {
        handleSelectChat(found);
      }
    }
  }, [urlChatId, contacts]);

  // Carregar mensagens (Centro)
  useEffect(() => {
    if (!selectedChat) return;

    const qMsg = query(
      collection(db, "messages"),
      where("chatId", "==", selectedChat.id),
      orderBy("createdAt", "asc")
    );

    const unsubMsg = onSnapshot(qMsg, (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Message[];
      setMessages(list);
      scrollToBottom();
    });

    return () => unsubMsg();
  }, [selectedChat]);

  // --- INTELIGÊNCIA: Buscar Lead Contextual (Lado Direito) ---
  useEffect(() => {
    async function fetchLeadContext() {
      if (!selectedChat?.contactPhone) {
        setLeadContext(null);
        return;
      }
      
      // Limpa o numero para buscar (apenas digitos)
      const rawPhone = selectedChat.contactPhone.replace(/\D/g, ""); 
      
      // Tenta buscar no banco de leads pelo telefone
      const q = query(
          collection(db, "leads"), 
          where("telefone", "==", rawPhone), 
          limit(1)
      );
      
      const snap = await getDocs(q);
      if (!snap.empty) {
        const leadData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setLeadContext(leadData);
      } else {
        setLeadContext(null);
      }
    }

    fetchLeadContext();
  }, [selectedChat]); // Executa toda vez que troca o chat selecionado

  // ---------------------------------------------------------
  // 2. AÇÕES E FUNÇÕES
  // ---------------------------------------------------------

  function scrollToBottom() {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 100);
  }

  function handleSelectChat(chat: ChatContact) {
    setSelectedChat(chat);
    router.push(`/admin/chat?chatId=${chat.id}`);
  }

  async function handleSendMessage(e?: React.FormEvent) {
  if (e) e.preventDefault();
  // Validamos se há texto e se há um contato selecionado
  if (!inputText.trim() || !selectedChat) return;

  const text = inputText.trim();
  const phone = selectedChat.contactPhone; // Pegamos o telefone do chat selecionado
  
  setInputText("");
  setSending(true);

  try {
    // 2. DISPARO REAL PARA A META
    // Isso vai enviar a mensagem para o celular do cliente
    await WhatsAppService.sendMessage(phone, text);

    // 3. SALVAMENTO NO FIREBASE (Histórico local)
    // Só salvamos se o envio acima não der erro
    await addDoc(collection(db, "messages"), {
      chatId: selectedChat.id,
      text: text,
      sender: "agent", // Você como agente
      type: "text",
      createdAt: serverTimestamp(),
      status: "sent",
    });

    // 4. ATUALIZA O STATUS DO CHAT
    const chatRef = doc(db, "chats", selectedChat.id);
    await updateDoc(chatRef, {
      lastMessage: text,
      lastMessageTime: serverTimestamp(),
      status: "open",
    });

    scrollToBottom();
  } catch (err: any) {
    console.error("Erro ao enviar mensagem via Meta:", err);
    alert("Erro no WhatsApp: " + err.message);
  } finally {
    setSending(false);
  }
}

  async function handleArchiveChat() {
    if (!selectedChat) return;
    if (!confirm("Marcar conversa como resolvida/arquivada?")) return;

    try {
      await updateDoc(doc(db, "chats", selectedChat.id), {
        status: "archived"
      });
      alert("Conversa arquivada!");
      setSelectedChat(null);
      router.push("/admin/chat");
    } catch (err) {
      console.error(err);
    }
  }

  async function createLeadFromChat() {
    if (!selectedChat) return;
    const name = prompt("Nome do Lead:", selectedChat.contactName);
    if (!name) return;

    try {
      const cleanPhone = selectedChat.contactPhone.replace(/\D/g, "");
      
      const leadRef = await addDoc(collection(db, "leads"), {
        nome: name,
        telefone: cleanPhone,
        origem: "WhatsApp Inbox",
        status: "novo",
        pipelineStage: "captado",
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "chats", selectedChat.id), {
        leadId: leadRef.id,
        contactName: name
      });

      alert("Lead criado e vinculado! 🚀");
      // Atualiza o contexto localmente para aparecer na hora
      setLeadContext({ id: leadRef.id, nome: name, status: "novo", pipelineStage: "captado" });
    } catch (err) {
      console.error(err);
    }
  }

  async function createTestChat() {
    const phone = prompt("Número (ex: 5511999999999):");
    if (!phone) return;
    await addDoc(collection(db, "chats"), {
      contactName: "Novo Contato",
      contactPhone: phone,
      lastMessage: "Iniciou conversa",
      lastMessageTime: serverTimestamp(),
      unreadCount: 0,
      status: "open",
    });
  }

  const filteredContacts = contacts
    .filter(c => (c.status || "open") === tabFilter)
    .filter(c => 
      c.contactName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.contactPhone.includes(searchTerm)
    );

  // ---------------------------------------------------------
  // 3. RENDERIZAÇÃO
  // ---------------------------------------------------------

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[#0a0a0a]">
      
      {/* === COLUNA 1: LISTA DE CONTATOS === */}
      <div className={`w-full md:w-[320px] lg:w-[360px] flex flex-col border-r border-white/10 bg-[#0E0E0E] shrink-0 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Header Lista */}
        <div className="h-16 px-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex gap-4 text-sm font-medium">
            <button 
              onClick={() => setTabFilter("open")}
              className={`relative py-5 transition ${tabFilter === "open" ? "text-white" : "text-white/40 hover:text-white/70"}`}
            >
              Abertos
              {tabFilter === "open" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 rounded-t-full"/>}
            </button>
            <button 
              onClick={() => setTabFilter("archived")}
              className={`relative py-5 transition ${tabFilter === "archived" ? "text-white" : "text-white/40 hover:text-white/70"}`}
            >
              Arquivados
              {tabFilter === "archived" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-white/50 rounded-t-full"/>}
            </button>
          </div>
          <button onClick={createTestChat} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
            <MessageSquarePlus size={18} className="text-white/80"/>
          </button>
        </div>

        {/* Busca */}
        <div className="p-3">
          <div className="flex items-center gap-2 rounded-lg bg-[#1a1a1a] px-3 py-2 border border-white/5 focus-within:border-white/20 transition">
            <Search size={14} className="text-white/40" />
            <input 
              placeholder="Buscar conversa..." 
              className="w-full bg-transparent text-xs text-white outline-none placeholder:text-white/30"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
          {loadingContacts ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-white/40">
              <Loader2 className="animate-spin h-5 w-5" />
              <span className="text-xs">Sincronizando...</span>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center text-white/30">
              <Inbox size={32} className="mb-2 opacity-50"/>
              <p className="text-xs">Nenhuma conversa nesta caixa.</p>
            </div>
          ) : (
            filteredContacts.map((chat) => (
              <div
                key={chat.id}
                onClick={() => handleSelectChat(chat)}
                className={`group flex items-center gap-3 border-b border-white/5 px-4 py-3 cursor-pointer transition
                  ${selectedChat?.id === chat.id 
                    ? "bg-blue-600/10 border-l-2 border-l-blue-500" 
                    : "hover:bg-white/5 border-l-2 border-l-transparent"
                  }
                `}
              >
                <div className="relative shrink-0">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-xs font-bold text-white border border-white/10">
                    {chat.contactName.slice(0, 2).toUpperCase()}
                  </div>
                  {/* Indicador se tiver leadId (manual ou automático) */}
                  {chat.leadId && (
                    <div className="absolute -bottom-1 -right-1 bg-[#0E0E0E] rounded-full p-0.5">
                      <div className="bg-emerald-500 h-3 w-3 rounded-full border border-black" title="Lead vinculado"/>
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span className={`text-sm truncate ${selectedChat?.id === chat.id ? "font-semibold text-white" : "font-medium text-white/90"}`}>
                      {chat.contactName}
                    </span>
                    {chat.lastMessageTime && (
                      <span className="text-[10px] text-white/40">
                        {new Date(chat.lastMessageTime?.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-white/50 truncate max-w-[180px]">
                      {chat.lastMessage || "Nova conversa"}
                    </p>
                    {chat.unreadCount ? (
                      <div className="h-4 min-w-[16px] px-1 rounded-full bg-blue-500 text-[9px] font-bold text-white flex items-center justify-center">
                        {chat.unreadCount}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* === COLUNA 2: ÁREA DE CHAT === */}
      <div className={`flex-1 flex flex-col bg-[#050505] relative min-w-0 ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {selectedChat ? (
          <>
            {/* Header Chat */}
            <div className="h-16 px-4 border-b border-white/10 bg-[#0E0E0E] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <button 
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden p-2 -ml-2 text-white/60"
                >
                  <ArrowRight className="rotate-180" size={20} />
                </button>

                <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-xs font-bold text-white">
                  {selectedChat.contactName.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-semibold text-white/90 truncate cursor-pointer hover:underline" onClick={() => setShowRightSidebar(!showRightSidebar)}>
                    {selectedChat.contactName}
                  </span>
                  <span className="text-[10px] text-white/50 flex items-center gap-1">
                    {selectedChat.contactPhone}
                    {leadContext && <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">LEAD</span>}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-white/60">
                <button 
                  onClick={handleArchiveChat}
                  title="Arquivar conversa"
                  className="p-2 hover:bg-white/10 rounded-lg transition hover:text-emerald-400"
                >
                  <Check size={18} />
                </button>
                <button 
                  onClick={() => setShowRightSidebar(!showRightSidebar)}
                  className={`p-2 hover:bg-white/10 rounded-lg transition ${showRightSidebar ? "text-blue-400 bg-blue-400/10" : ""}`}
                >
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>

            {/* Mensagens */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#050505] bg-opacity-[0.03] bg-repeat"
            >
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 opacity-60">
                  <div className="p-4 rounded-full bg-white/5">
                    <MessageSquarePlus size={24} className="text-white/40"/>
                  </div>
                  <p className="text-xs text-white/40">
                    Inicie a conversa com uma saudação.
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                const isMe = msg.sender === "agent";
                const isSystem = msg.sender === "system";

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center my-4">
                      <span className="bg-[#1f2225] text-white/50 text-[10px] px-3 py-1 rounded-full border border-white/5">
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div 
                    key={msg.id} 
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div 
                      className={`max-w-[85%] sm:max-w-[65%] rounded-2xl px-4 py-2 text-sm relative shadow-sm border border-white/5
                        ${isMe 
                          ? "bg-[#005c4b] text-white rounded-tr-none" 
                          : "bg-[#202c33] text-white/90 rounded-tl-none"
                        }
                      `}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      <div className="flex items-center justify-end gap-1 mt-1 opacity-60">
                        <span className="text-[9px]">
                          {msg.createdAt?.toDate 
                            ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                            : "..."}
                        </span>
                        {isMe && (
                          <CheckCheck size={12} className={msg.status === "read" ? "text-blue-300" : ""} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <form 
              onSubmit={handleSendMessage}
              className="p-3 bg-[#0E0E0E] border-t border-white/10 flex items-end gap-2 shrink-0 z-10"
            >
              <div className="flex gap-1">
                <button type="button" title="Anexar (Futuro)" className="p-2 text-white/40 hover:text-white/70 hover:bg-white/5 rounded-full transition">
                  <Paperclip size={20} />
                </button>
                <button type="button" title="Templates (Futuro)" className="p-2 text-white/40 hover:text-white/70 hover:bg-white/5 rounded-full transition">
                  <FileText size={20} />
                </button>
              </div>
              
              <div className="flex-1 bg-[#1f2225] rounded-xl min-h-[42px] flex items-center px-4 border border-white/5 focus-within:border-white/20 transition">
                <input
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                  placeholder="Digite uma mensagem..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
                <button type="button" className="text-white/30 hover:text-white/60 ml-2">
                  <Smile size={18}/>
                </button>
              </div>

              <button 
                type="submit" 
                disabled={!inputText.trim() || sending}
                className="p-3 bg-emerald-600 rounded-full text-white hover:bg-emerald-500 transition shadow-lg disabled:opacity-50 disabled:bg-[#1f2225]"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}
              </button>
            </form>
          </>
        ) : (
          /* Estado Vazio */
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 p-8 text-center bg-[#050505]">
            <div className="h-24 w-24 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5 animate-pulse">
              <MessageSquarePlus size={48} className="opacity-40" />
            </div>
            <h2 className="text-2xl font-light text-white/70 mb-3">ALTUM Inbox</h2>
            <p className="text-sm max-w-md text-white/40 leading-relaxed">
              Centralize seu atendimento do WhatsApp Oficial. <br/>
              Selecione uma conversa ou aguarde novos leads.
            </p>
            <div className="mt-8 flex gap-4 text-[10px] text-white/20 uppercase tracking-widest">
              <span className="flex items-center gap-1"><Check size={10}/> Criptografado</span>
              <span className="flex items-center gap-1"><Check size={10}/> Meta API</span>
            </div>
          </div>
        )}
      </div>

      {/* === COLUNA 3: BARRA LATERAL DE CONTEXTO (DIREITA) === */}
      {selectedChat && showRightSidebar && (
        <div className="w-[300px] hidden lg:flex flex-col border-l border-white/10 bg-[#0E0E0E] shrink-0 overflow-y-auto">
          <div className="p-5 border-b border-white/10 flex flex-col items-center text-center">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-2xl font-bold text-white mb-3 border-4 border-[#0a0a0a]">
              {selectedChat.contactName.slice(0, 2).toUpperCase()}
            </div>
            <h3 className="font-semibold text-white text-lg">{selectedChat.contactName}</h3>
            <p className="text-white/50 text-sm mt-1 select-all">{selectedChat.contactPhone}</p>
            
            <div className="flex gap-2 mt-4 w-full">
              <button className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-white transition flex items-center justify-center gap-2">
                <Phone size={14}/> Ligar
              </button>
              <button className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-white transition flex items-center justify-center gap-2">
                <Archive size={14}/> Arquivar
              </button>
            </div>
          </div>

          {/* CRM INFO */}
          <div className="p-5 border-b border-white/10 space-y-3">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wide flex items-center gap-2">
              <UserCircle2 size={14}/> Dados do CRM
            </h4>
            
            {leadContext ? (
              <div className="rounded-xl bg-[#151515] border border-white/5 p-3 space-y-2">
                <div>
                  <p className="text-[10px] text-white/40 uppercase">Lead Detectado</p>
                  <p className="text-sm font-medium text-white">{leadContext.nome}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40 uppercase">Estágio</p>
                  <p className="text-sm font-medium text-emerald-400">{leadContext.pipelineStage || "Novo"}</p>
                </div>
                <Link 
                  href={`/admin/prospeccao/${leadContext.id}`}
                  target="_blank"
                  className="block w-full py-2 text-center text-xs bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 rounded-lg transition mt-2 flex items-center justify-center gap-1"
                >
                  Ver Perfil Completo <ExternalLink size={12}/>
                </Link>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-white/40">Este contato não está no CRM.</p>
                <button 
                  onClick={createLeadFromChat}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition flex items-center justify-center gap-2"
                >
                  <UserPlus size={14}/> Cadastrar Lead
                </button>
              </div>
            )}
          </div>

          {/* TAGS (Mock) */}
          <div className="p-5 border-b border-white/10 space-y-3">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wide flex items-center gap-2">
              <Tag size={14}/> Etiquetas
            </h4>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-300 text-[10px] border border-amber-500/20">Quente</span>
              <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-300 text-[10px] border border-purple-500/20">Agência</span>
              <button className="px-2 py-1 rounded border border-dashed border-white/20 text-white/40 text-[10px] hover:text-white hover:border-white/40 transition">
                + Adicionar
              </button>
            </div>
          </div>

          {/* NOTAS (Mock) */}
          <div className="p-5 space-y-3 flex-1">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wide flex items-center gap-2">
              <StickyNote size={14}/> Notas Internas
            </h4>
            <textarea 
              className="w-full h-32 bg-[#151515] border border-white/5 rounded-lg p-3 text-xs text-white/80 outline-none focus:border-white/20 transition resize-none placeholder:text-white/20"
              placeholder="Digite observações sobre este contato (não será enviado)..."
            />
          </div>
        </div>
      )}
    </div>
  );
}