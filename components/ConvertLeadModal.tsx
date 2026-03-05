"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  X,
  Loader2,
  CheckCircle2,
  UserPlus,
  FolderPlus,
  DollarSign,
} from "lucide-react";

interface ConvertLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadData: {
    id: string; // ID do lead ou orçamento original
    name: string; // Nome do cliente/lead
    email?: string;
    phone?: string;
    origin?: string;
    serviceSummary?: string; // Título do projeto ou serviços
    value?: number; // Valor mensal ou único
    type?: "lead" | "orcamento"; // De onde veio
  };
}

export default function ConvertLeadModal({
  isOpen,
  onClose,
  leadData,
}: ConvertLeadModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Checkboxes de decisão (o que criar?)
  const [createClient, setCreateClient] = useState(true);
  const [createProject, setCreateProject] = useState(true);
  const [createFinance, setCreateFinance] = useState(true);

  if (!isOpen) return null;

  async function handleConversion() {
    setLoading(true);
    try {
      let clientId = "";
      const clientName = leadData.name;

      // 1. Criar Cliente (se marcado)
      if (createClient) {
        const clientRef = await addDoc(collection(db, "clientes"), {
          name: leadData.name,
          email: leadData.email || "",
          phone: leadData.phone || "",
          status: "Ativo", // Já entra como ativo
          contactName: leadData.name.split(" ")[0], // Pega primeiro nome
          services: leadData.serviceSummary ? [leadData.serviceSummary] : [],
          createdAt: serverTimestamp(),
        });
        clientId = clientRef.id;
      }

      // 2. Criar Projeto (se marcado)
      let projectId = "";
      if (createProject) {
        const projRef = await addDoc(collection(db, "projetos"), {
          titulo: leadData.serviceSummary || `Projeto ${leadData.name}`,
          clientId: clientId || "sem_id", // Se não criou cliente, fica solto
          clientName: clientName,
          status: "Onboarding",
          canalPrincipal: leadData.origin || "Indefinido",
          valorMensal: leadData.value || 0,
          createdAt: serverTimestamp(),
        });
        projectId = projRef.id;
      }

      // 3. Criar Financeiro (se marcado e tiver valor)
      if (createFinance && leadData.value) {
        await addDoc(collection(db, "financeiro"), {
          clientId: clientId || null,
          clientName: clientName,
          projectId: projectId || null,
          projectTitle: leadData.serviceSummary || "Novo Projeto",
          tipo: "Setup", // Padrão inicial
          status: "Pendente",
          valor: leadData.value,
          referencia: "Entrada / Setup",
          createdAt: serverTimestamp(),
        });
      }

      // 4. Atualizar o Lead Original (Marcar como Fechado/Ganho)
      const collectionName = leadData.type === "orcamento" ? "orcamentos" : "leads";
      const docRef = doc(db, collectionName, leadData.id);
      
      const updatePayload = leadData.type === "lead" 
        ? { status: "qualificado", pipelineStage: "fechado" }
        : { status: "Aprovado" };

      await updateDoc(docRef, updatePayload);

      // 5. Finalização
      alert("Sucesso! O ecossistema foi atualizado. 🚀");
      onClose();
      
      // Redireciona para o projeto criado para começar a trabalhar
      if (projectId) {
        router.push(`/admin/projetos/${projectId}`);
      } else if (clientId) {
        router.push(`/admin/clientes/${clientId}`);
      }

    } catch (error) {
      console.error("Erro na conversão:", error);
      alert("Houve um erro ao processar. Veja o console.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F0F0F] shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Fechar Negócio</h3>
            <p className="text-xs text-white/50">Automatize a entrada deste cliente na agência.</p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex gap-3 items-center">
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300 font-bold text-lg">
              $
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-100">Venda Realizada!</p>
              <p className="text-xs text-emerald-200/60">Vamos preparar a casa para o {leadData.name}.</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition select-none">
              <input 
                type="checkbox" 
                checked={createClient} 
                onChange={(e) => setCreateClient(e.target.checked)}
                className="h-5 w-5 rounded border-white/30 bg-black checked:bg-blue-600 accent-blue-600"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                  <UserPlus size={16} className="text-blue-400"/> Criar Cliente
                </div>
                <p className="text-xs text-white/40">Cadastra na base de clientes ativos.</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition select-none">
              <input 
                type="checkbox" 
                checked={createProject} 
                onChange={(e) => setCreateProject(e.target.checked)}
                className="h-5 w-5 rounded border-white/30 bg-black checked:bg-blue-600 accent-blue-600"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                  <FolderPlus size={16} className="text-purple-400"/> Criar Projeto
                </div>
                <p className="text-xs text-white/40">Abre o quadro de entrega (Status: Onboarding).</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition select-none">
              <input 
                type="checkbox" 
                checked={createFinance} 
                onChange={(e) => setCreateFinance(e.target.checked)}
                className="h-5 w-5 rounded border-white/30 bg-black checked:bg-blue-600 accent-blue-600"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                  <DollarSign size={16} className="text-emerald-400"/> Lançar Financeiro
                </div>
                <p className="text-xs text-white/40">
                  Cria conta a receber: 
                  <b className="text-white ml-1">
                    {leadData.value ? leadData.value.toLocaleString("pt-BR", {style: 'currency', currency: 'BRL'}) : "R$ 0,00"}
                  </b>
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white/60 hover:text-white transition"
          >
            Cancelar
          </button>
          <button 
            onClick={handleConversion}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50 shadow-lg shadow-emerald-900/20"
          >
            {loading ? <Loader2 className="animate-spin h-4 w-4"/> : <CheckCircle2 className="h-4 w-4"/>}
            Confirmar e Iniciar
          </button>
        </div>
      </div>
    </div>
  );
}
