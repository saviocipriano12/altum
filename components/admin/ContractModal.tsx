import React, { useState } from 'react';
import { FileText, X, Printer } from 'lucide-react';

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientData: {
    nome: string;
    telefone: string;
  };
}

export default function ContractModal({ isOpen, onClose, clientData }: ContractModalProps) {
  const [value, setValue] = useState('');
  const [service, setService] = useState('Gestão de Tráfego e Landing Page');
  const [duration, setDuration] = useState('6');

  if (!isOpen) return null;

  const today = new Date().toLocaleDateString('pt-BR');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#151515] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#1a1a1a] rounded-t-2xl">
          <div className="flex items-center gap-3">
            <FileText className="text-blue-500" />
            <h2 className="text-xl font-bold text-white">Gerador de Contrato - ALTUM</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-white/50"><X /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Configurações Lateral */}
          <div className="w-80 p-6 border-r border-white/10 space-y-4 bg-[#121212]">
            <div>
              <label className="text-[10px] text-white/40 uppercase font-bold">Serviço</label>
              <select 
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg p-2 text-sm text-white mt-1"
                value={service} onChange={(e) => setService(e.target.value)}
              >
                <option>Gestão de Tráfego e Landing Page</option>
                <option>Desenvolvimento de Website</option>
                <option>E-commerce Noture</option>
                <option>Consultoria Estratégica</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-white/40 uppercase font-bold">Valor Mensal (R$)</label>
              <input 
                type="number" className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg p-2 text-sm text-white mt-1"
                placeholder="Ex: 2500" value={value} onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-white/40 uppercase font-bold">Vigência (Meses)</label>
              <input 
                type="number" className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg p-2 text-sm text-white mt-1"
                value={duration} onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <button 
              onClick={() => window.print()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <Printer size={18} /> Imprimir / Salvar PDF
            </button>
          </div>

          {/* Preview do Contrato */}
          <div id="contract-content" className="flex-1 p-8 overflow-y-auto bg-white text-black text-[12px] leading-relaxed font-serif">
            <div className="max-w-[21cm] mx-auto">
              <h1 className="text-center text-xl font-bold mb-8 uppercase underline">Contrato de Prestação de Serviços Digitais</h1>
              
              <p className="mb-4"><strong>CONTRATADA:</strong> ALTUM, registrada sob o CNPJ 35.319.629/0001-83, com sede na Av. Antonio Pinheiro Diniz, 113, Sol Nascente, representada por Sávio Cipriano.</p>
              
              <p className="mb-4"><strong>CONTRATANTE:</strong> {clientData.nome}, portador do contato {clientData.telefone}.</p>

              <h2 className="font-bold mt-6 mb-2">1. OBJETO</h2>
              <p>O presente contrato tem por objeto a prestação de serviços de {service}, visando a otimização de vendas e posicionamento digital.</p>

              <h2 className="font-bold mt-6 mb-2">2. VALORES E PAGAMENTO</h2>
              <p>Pelo serviço prestado, a CONTRATANTE pagará à CONTRATADA o valor mensal de <strong>R$ {value}</strong>, com vencimento todo dia 05 de cada mês.</p>

              <h2 className="font-bold mt-6 mb-2">3. RESCISÃO</h2>
              <p>O presente contrato tem validade de {duration} meses. Em caso de rescisão antecipada por parte da CONTRATANTE, será aplicada multa de 20% sobre o valor restante do contrato.</p>

              <div className="mt-20 flex justify-between gap-10 text-center">
                <div className="flex-1 border-t border-black pt-2">ALTUM (Sávio Cipriano)</div>
                <div className="flex-1 border-t border-black pt-2">{clientData.nome} (CONTRATANTE)</div>
              </div>
              <p className="text-center mt-10 italic">Data: {today}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
