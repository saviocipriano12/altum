"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebaseConfig";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "firebase/firestore";
import {
  Users,
  UserPlus,
  MoreHorizontal,
  Percent,
  CheckCircle2,
  XCircle,
  Loader2,
  Briefcase,
  Search,
  Lock,
  Unlock,
  Save,
  X,
  Info,
  Wallet // <--- Ícone novo
} from "lucide-react";

/**
 * ======================================================================
 * ALTUM TEAM MANAGER (GESTAO DE EQUIPE) - VERSÃO SAAS
 * ======================================================================
 */

// --- TYPES ---

type UserRole = "admin" | "closer" | "sdr";
type UserStatus = "active" | "blocked";

interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  commissionRate: number;
  asaasWalletId?: string; // <--- O CAMPO CHAVE PARA O SPLIT
  createdAt?: any;
}

// --- CONSTANTS ---

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string; desc: string }> = {
  admin: { label: "Administrador", color: "text-red-200", bg: "bg-red-500/20", desc: "Acesso total + Financeiro Global" },
  closer: { label: "Closer (Vendedor)", color: "text-emerald-200", bg: "bg-emerald-500/20", desc: "Vê seus leads + Comissão" },
  sdr: { label: "SDR (Hunter)", color: "text-blue-200", bg: "bg-blue-500/20", desc: "Apenas qualificação e agenda" },
};

// --- PAGE ---

export default function TeamPage() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  // Form State
  const [form, setForm] = useState({ 
      name: "", 
      email: "", 
      role: "sdr" as UserRole, 
      commissionRate: 0,
      asaasWalletId: "" // <--- Estado novo
  });
  const [saving, setSaving] = useState(false);

  // Load Users
  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemUser)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Handlers
  const handleOpenModal = (user?: SystemUser) => {
    if (user) {
      setEditingUser(user);
      setForm({ 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          commissionRate: user.commissionRate,
          asaasWalletId: user.asaasWalletId || "" // Carrega se existir
      });
    } else {
      setEditingUser(null);
      setForm({ name: "", email: "", role: "sdr", commissionRate: 10, asaasWalletId: "" });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) return alert("Preencha nome e email");
    setSaving(true);
    try {
      const payload = {
          ...form,
          commissionRate: Number(form.commissionRate),
          // Se estiver vazio, salva null pra não sujar o banco
          asaasWalletId: form.asaasWalletId.trim() || null 
      };

      if (editingUser) {
        await updateDoc(doc(db, "users", editingUser.id), payload);
      } else {
        await addDoc(collection(db, "users"), {
          ...payload,
          status: "active",
          createdAt: serverTimestamp(),
          leadsCount: 0,
          salesCount: 0
        });
      }
      setIsModalOpen(false);
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar usuário");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user: SystemUser) => {
    const newStatus = user.status === "active" ? "blocked" : "active";
    if (confirm(`Deseja realmente ${newStatus === "blocked" ? "BLOQUEAR" : "ATIVAR"} este usuário?`)) {
      await updateDoc(doc(db, "users", user.id), { status: newStatus });
    }
  };

  // Metrics
  const activeUsers = users.filter(u => u.status === "active").length;
  const avgCommission = users.length > 0 ? (users.reduce((acc, u) => acc + u.commissionRate, 0) / users.length).toFixed(1) : "0";

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 lg:p-10 font-sans">
      
      {/* HEADER */}
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Users className="text-blue-500" size={32} /> Gestão de Time
            </h1>
            <p className="text-white/50 text-sm mt-1">Configure comissões e carteiras de pagamento.</p>
          </div>
          <button 
            onClick={() => handleOpenModal()} 
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-lg shadow-blue-900/20"
          >
            <UserPlus size={18} /> NOVO MEMBRO
          </button>
        </div>

        {/* LISTA */}
        <div className="bg-[#0f0f0f] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <h3 className="font-bold text-lg">Membros da Equipe</h3>
            <div className="bg-black/30 px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-2 text-white/50 text-xs">
              <Search size={14}/> Buscar...
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-white/40 uppercase font-bold text-[10px] tracking-widest">
                <tr>
                  <th className="px-6 py-4">Nome / Email</th>
                  <th className="px-6 py-4">Cargo</th>
                  <th className="px-6 py-4">Comissão & Pagamento</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-500"/></td></tr>
                ) : users.map((user) => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center font-bold text-white/50 border border-white/10">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-white">{user.name}</p>
                          <p className="text-xs text-white/40">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-bold uppercase ${ROLE_CONFIG[user.role].bg} ${ROLE_CONFIG[user.role].color} border-white/5`}>
                        <Briefcase size={12}/> {ROLE_CONFIG[user.role].label}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                            <span className="font-mono text-emerald-400 font-bold">{user.commissionRate}%</span>
                            {user.asaasWalletId ? (
                                <span className="text-[10px] text-white/30 flex items-center gap-1" title={user.asaasWalletId}>
                                    <Wallet size={10}/> Conectado
                                </span>
                            ) : (
                                <span className="text-[10px] text-red-400/50 flex items-center gap-1">
                                    <XCircle size={10}/> Sem Wallet
                                </span>
                            )}
                        </div>
                    </td>
                    <td className="px-6 py-4">
                      {user.status === "active" ? (
                        <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 w-fit">
                          <CheckCircle2 size={12}/> ATIVO
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-red-400 text-xs font-bold bg-red-500/10 px-2 py-1 rounded border border-red-500/20 w-fit">
                          <XCircle size={12}/> BLOQUEADO
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => handleOpenModal(user)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-blue-400 transition">
                          <MoreHorizontal size={16}/>
                        </button>
                        <button onClick={() => toggleStatus(user)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-red-400 transition">
                          {user.status === 'active' ? <Lock size={16}/> : <Unlock size={16}/>}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL EDIT/ADD */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#151515] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">{editingUser ? "Editar Membro" : "Novo Membro"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition"><X size={20}/></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase font-bold text-white/40 block mb-2">Nome Completo</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-blue-500 transition" placeholder="Ex: João Silva" />
              </div>
              
              <div>
                <label className="text-xs uppercase font-bold text-white/40 block mb-2">E-mail de Acesso</label>
                <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-blue-500 transition" placeholder="joao@altum.com" disabled={!!editingUser} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase font-bold text-white/40 block mb-2">Cargo</label>
                  <select value={form.role} onChange={e => setForm({...form, role: e.target.value as UserRole})} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-blue-500 transition appearance-none">
                    <option value="sdr">SDR (Hunter)</option>
                    <option value="closer">Closer (Vendedor)</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase font-bold text-white/40 block mb-2">Comissão (%)</label>
                  <div className="relative">
                    <input type="number" value={form.commissionRate} onChange={e => setForm({...form, commissionRate: Number(e.target.value)})} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-blue-500 transition pr-8" placeholder="10" />
                    <span className="absolute right-3 top-3 text-white/30">%</span>
                  </div>
                </div>
              </div>

              {/* CAMPO NOVO: WALLET ID */}
              <div>
                <label className="text-xs uppercase font-bold text-white/40 mb-2 flex items-center gap-2">
                    <Wallet size={12}/> ID da Carteira Asaas
                </label>
                <input 
                    value={form.asaasWalletId} 
                    onChange={e => setForm({...form, asaasWalletId: e.target.value})} 
                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white font-mono text-sm outline-none focus:border-emerald-500 transition" 
                    placeholder="wallet_123abc..." 
                />
                <p className="text-[10px] text-white/30 mt-1">Necessário para o Split de Pagamento automático.</p>
              </div>

              <button onClick={handleSave} disabled={saving} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl mt-4 flex items-center justify-center gap-2 transition disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin"/> : <Save size={18}/>} SALVAR DADOS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}