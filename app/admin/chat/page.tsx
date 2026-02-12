"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ContractModal from "@/components/admin/ContractModal";
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
  limit,
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
  Target,
  Zap,
  DollarSign,
  Calendar,
  Sparkles,
  TrendingUp,
  LayoutGrid
} from "lucide-react";

// --- TIPAGENS ---
type ChatContact = {
  id: string;
  contactName: string;
  contactPhone: string;
  photoUrl?: string;
  lastMessage?: string;
  lastMessageTime?: any;
  unreadCount?: number;
  status: "open" | "archived";
  leadId?: string;
  tags?: string[];
  notes?: string;
};

type Message = {
  id: string;
  chatId: string;
  text: string;
  sender: "agent" | "client" | "system";
  type: "text" | "image" | "file" | "template";
  createdAt: any;
  status?: "sent" | "delivered" | "read";
};

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlChatId = searchParams.get("chatId");
  
  const [isContractOpen, setIsContractOpen] = useState(false);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatContact | null>(null);
  
  const [inputText, setInputText] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tabFilter, setTabFilter] = useState<"open" | "archived">("open");
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [leadContext, setLeadContext] = useState<any>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. CARREGAMENTO DE DADOS
  useEffect(() => {
    const q = query(collection(db, "chats"), orderBy("lastMessageTime", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ChatContact[];
      setContacts(list);
      setLoadingContacts(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (urlChatId && contacts.length > 0 && !selectedChat) {
      const found = contacts.find((c) => c.id === urlChatId);
      if (found) handleSelectChat(found);
    }
  }, [urlChatId, contacts]);

  useEffect(() => {
    if (!selectedChat) return;
    const qMsg = query(
      collection(db, "messages"),
      where("chatId", "==", selectedChat.id),
      orderBy("createdAt", "asc")
    );
    const unsubMsg = onSnapshot(qMsg, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Message[];
      setMessages(list);
      scrollToBottom();
    });
    return () => unsubMsg();
  }, [selectedChat]);

  useEffect(() => {
    async function fetchLeadContext() {
      if (!selectedChat?.contactPhone) {
        setLeadContext(null);
        return;
      }
      const rawPhone = selectedChat.contactPhone.replace(/\D/g, ""); 
      const q = query(collection(db, "leads"), where("telefone", "==", rawPhone), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setLeadContext({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setLeadContext(null);
      }
    }
    fetchLeadContext();
  }, [selectedChat]);

  // 2. FUNÇÕES DE AÇÃO
  function scrollToBottom() {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 100);
  }

  function handleSelectChat(chat: ChatContact) {
    setSelectedChat(chat);
    router.push(`/admin/chat?chatId=${chat.id}`);
  }

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!inputText.trim() || !selectedChat) return;

    const text = inputText.trim();
    const phone = selectedChat.contactPhone;
    setInputText("");
    setSending(true);

    try {
      await WhatsAppService.sendMessage(phone, text);
      await addDoc(collection(db, "messages"), {
        chatId: selectedChat.id,
        text,
        sender: "agent",
        type: "text",
        createdAt: serverTimestamp(),
        status: "sent",
      });
      await updateDoc(doc(db, "chats", selectedChat.id), {
        lastMessage: text,
        lastMessageTime: serverTimestamp(),
        status: "open",
      });
      scrollToBottom();
    } catch (err: any) {
      console.error(err);
      alert("Erro no WhatsApp: " + err.message);
    } finally {
      setSending(false);
    }
  }

  async function createLeadFromChat() {
    if (!selectedChat) return;
    const name = prompt("Nome da Empresa/Lead:", selectedChat.contactName);
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
      await updateDoc(doc(db, "chats", selectedChat.id), { leadId: leadRef.id, contactName: name });
      setLeadContext({ id: leadRef.id, nome: name, status: "novo", pipelineStage: "captado" });
    } catch (err) { console.error(err); }
  }

  const filteredContacts = contacts
    .filter(c => (c.status || "open") === tabFilter)
    .filter(c => c.contactName.toLowerCase().includes(searchTerm.toLowerCase()) || c.contactPhone.includes(searchTerm));

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[#050505] font-sans">
      
      {/* === COLUNA 1: SIDEBAR DE CONTATOS === */}
      <div className={`w-full md:w-[350px] flex flex-col border-r border-white/5 bg-[#0A0A0A] shrink-0 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-white/5 bg-[#0D0D0D]">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <Inbox className="text-blue-500" size={20}/> Inbox
            </h1>
            <button onClick={() => {}} className="p-2 rounded-full bg-white/5 hover:bg-blue-600/20 text-white transition">
              <MessageSquarePlus size={20} />
            </button>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-blue-500 transition-colors" size={16} />
            <input 
              placeholder="Buscar clientes ou números..." 
              className="w-full bg-[#151515] border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:border-blue-500/50 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loadingContacts ? (
            <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-blue-500"/></div>
          ) : filteredContacts.map((chat) => (
            <div
              key={chat.id}
              onClick={() => handleSelectChat(chat)}
              className={`flex items-center gap-3 px-4 py-4 cursor-pointer transition-all border-l-4 ${selectedChat?.id === chat.id ? "bg-blue-600/10 border-blue-500" : "hover:bg-white/5 border-transparent opacity-70 hover:opacity-100"}`}
            >
              <div className="relative">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center text-sm font-black text-white border border-white/10 shadow-lg">
                  {chat.contactName.slice(0, 2).toUpperCase()}
                </div>
                {chat.unreadCount ? <span className="absolute -top-1 -right-1 h-5 w-5 bg-blue-500 rounded-full border-2 border-[#0A0A0A] text-[10px] font-bold flex items-center justify-center text-white">{chat.unreadCount}</span> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-sm font-bold text-white truncate">{chat.contactName}</h3>
                  <span className="text-[10px] text-white/20 font-medium">{chat.lastMessageTime ? new Date(chat.lastMessageTime?.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}</span>
                </div>
                <p className="text-xs text-white/40 truncate italic">{chat.lastMessage || "Aguardando interação..."}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === COLUNA 2: ÁREA DO CHAT === */}
      <div className={`flex-1 flex flex-col bg-[#050505] relative shadow-2xl ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {selectedChat ? (
          <>
            <div className="h-16 px-6 border-b border-white/5 bg-[#0D0D0D]/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-20">
              <div className="flex items-center gap-4">
                <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 text-white/40"><X size={24} /></button>
                <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-xs font-black text-white border border-white/10">
                  {selectedChat.contactName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-sm font-black text-white tracking-tight">{selectedChat.contactName}</h2>
                  <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1"><span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse"/> Online na API</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowRightSidebar(!showRightSidebar)} className={`p-2.5 rounded-xl transition ${showRightSidebar ? "bg-blue-600/20 text-blue-400" : "text-white/20 hover:bg-white/5"}`}><LayoutGrid size={20}/></button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
              {messages.map((msg) => {
                const isMe = msg.sender === "agent";
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2`}>
                    <div className={`max-w-[75%] rounded-3xl px-5 py-3 shadow-xl relative ${isMe ? "bg-blue-600 text-white rounded-tr-none" : "bg-[#1A1A1A] text-white/90 rounded-tl-none border border-white/5"}`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      <div className="flex items-center justify-end gap-1 mt-2 opacity-40">
                        <span className="text-[9px] font-bold">{msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "..."}</span>
                        {isMe && <CheckCheck size={12} className={msg.status === "read" ? "text-blue-200" : ""}/>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-[#0D0D0D] border-t border-white/5 flex items-center gap-3">
              <button type="button" className="p-3 text-white/20 hover:text-blue-500 transition"><Paperclip size={22}/></button>
              <div className="flex-1 bg-[#151515] rounded-2xl flex items-center px-4 border border-white/5 focus-within:border-blue-500/30 transition-all shadow-inner">
                <input 
                  className="w-full bg-transparent py-4 text-sm text-white outline-none placeholder:text-white/20"
                  placeholder="Escreva sua mensagem mestre..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
                <Smile size={20} className="text-white/10" />
              </div>
              <button 
                type="submit" 
                disabled={!inputText.trim() || sending}
                className="p-4 bg-blue-600 rounded-2xl text-white hover:bg-blue-500 transition shadow-lg shadow-blue-900/40 disabled:opacity-30"
              >
                {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
             <div className="h-32 w-32 bg-blue-600/5 rounded-[3rem] flex items-center justify-center mb-8 border border-blue-500/10 shadow-inner animate-pulse">
                <Sparkles size={60} className="text-blue-500/30" />
             </div>
             <h2 className="text-3xl font-black text-white mb-4 tracking-tighter uppercase">Altum HQ Control</h2>
             <p className="text-white/30 max-w-sm font-medium leading-relaxed uppercase text-[10px] tracking-[0.2em]">Selecione um terminal de conversa para iniciar a operação de escala.</p>
          </div>
        )}
      </div>

      {/* === COLUNA 3: BARRA DE INTELIGÊNCIA (DIREITA) === */}
      {selectedChat && showRightSidebar && (
        <div className="w-[340px] hidden xl:flex flex-col bg-[#0A0A0A] border-l border-white/5 overflow-y-auto custom-scrollbar">
          
          {/* PERFIL EXPANDIDO */}
          <div className="p-8 flex flex-col items-center text-center border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
            <div className="relative mb-6">
              <div className="h-24 w-24 rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-3xl font-black text-white shadow-2xl border-4 border-[#0A0A0A] transform rotate-3">
                {selectedChat.contactName.slice(0, 2).toUpperCase()}
              </div>
              <div className="absolute -bottom-2 -right-2 p-2 bg-emerald-500 rounded-2xl border-4 border-[#0A0A0A]">
                <Zap size={16} fill="white" className="text-white"/>
              </div>
            </div>
            <h3 className="text-xl font-black text-white tracking-tight leading-none mb-2">{selectedChat.contactName}</h3>
            <p className="px-3 py-1 rounded-full bg-white/5 text-white/40 font-mono text-[10px] border border-white/5">{selectedChat.contactPhone}</p>
          </div>

          {/* DASHBOARD DE CONTEXTO CRM */}
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
                <TrendingUp size={14} className="text-blue-500"/> Performance Lead
              </h4>
              
              {leadContext ? (
                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-[#111] border border-white/5 rounded-2xl p-4 group hover:border-blue-500/30 transition-all">
                    <p className="text-[10px] text-white/20 uppercase font-black mb-1">Pipeline</p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-black text-blue-400 uppercase tracking-tight">{leadContext.pipelineStage || "Início"}</p>
                      <Target size={18} className="text-white/10"/>
                    </div>
                    <div className="w-full bg-white/5 h-1.5 rounded-full mt-3 overflow-hidden">
                       <div className="bg-blue-500 h-full w-[45%]" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                     <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black text-white/50 border border-white/5 transition uppercase">Agendar</button>
                     <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black text-white/50 border border-white/5 transition uppercase">Mudar Etapa</button>
                  </div>

                  <Link 
                    href={`/admin/prospeccao/${leadContext.id}`}
                    target="_blank"
                    className="flex items-center justify-center gap-2 w-full py-4 bg-[#111] border border-white/5 hover:bg-white/10 rounded-2xl text-xs font-black text-white transition uppercase tracking-widest shadow-lg"
                  >
                    Abrir CRM <ArrowRight size={14}/>
                  </Link>
                </div>
              ) : (
                <div className="bg-blue-600/5 border border-blue-500/10 rounded-[2rem] p-6 text-center">
                  <p className="text-xs text-white/30 mb-4 font-medium italic">Contato não registrado na base de dados Altum.</p>
                  <button 
                    onClick={createLeadFromChat}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition shadow-xl shadow-blue-900/20"
                  >
                    <UserPlus size={16} className="inline mr-2"/> Iniciar Lead
                  </button>
                </div>
              )}
            </div>

            {/* AÇÕES DE FECHAMENTO */}
            <div className="space-y-4">
               <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
                 <DollarSign size={14} className="text-emerald-500"/> Conversão High-Ticket
               </h4>
               <button 
                 onClick={() => setIsContractOpen(true)}
                 className="w-full py-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-3xl text-xs font-black uppercase tracking-[0.15em] transition shadow-2xl shadow-emerald-900/40 flex items-center justify-center gap-3 border-t border-white/20"
               >
                 <FileText size={18}/> Gerar Contrato Oficial
               </button>
            </div>

            {/* NOTAS E TAGS */}
            <div className="space-y-4">
               <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
                 <StickyNote size={14} className="text-amber-500"/> Inteligência Interna
               </h4>
               <textarea 
                 className="w-full h-32 bg-[#111] border border-white/5 rounded-3xl p-5 text-xs text-white/60 outline-none focus:border-white/10 transition-all resize-none font-medium placeholder:text-white/10 shadow-inner"
                 placeholder="O que aprendemos sobre este cliente hoje?"
               />
               <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase border border-amber-500/20">Lead Quente</span>
                  <span className="px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-400 text-[9px] font-black uppercase border border-blue-500/20">Agência</span>
                  <button className="px-3 py-1.5 rounded-xl border border-dashed border-white/10 text-white/20 text-[9px] font-black uppercase hover:text-white transition">+</button>
               </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE CONTRATO INTEGRADO */}
      <ContractModal 
        isOpen={isContractOpen} 
        onClose={() => setIsContractOpen(false)} 
        clientData={{
          nome: selectedChat?.contactName || "",
          telefone: selectedChat?.contactPhone || ""
        }}
      />
    </div>
  );
}