// CAMINHO: components/WarRoom/WarRoomWidgets.tsx
"use client";

import { Calculator, CheckCircle2, X, Copy, Printer, MousePointerClick } from "lucide-react";
// Importando do arquivo que acabamos de criar.
// Se der erro aqui, mude para: "../../lib/war-room"
import { FinancialScenario, ProposalItem, Lead, calculateROI } from "@/app/lib/war-room";

// --- WIDGET 1: CALCULADORA ROI ---
interface ROIProps {
  data: FinancialScenario;
  onChange: (key: keyof FinancialScenario, value: number) => void;
}

export function ROICalculator({ data, onChange }: ROIProps) {
  const safeData = data || { ticketMedio: 0, leadsGoal: 0, conversionRate: 0, investmentAds: 0 };
  const result = calculateROI(safeData);

  return (
    <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-white/10 flex items-center gap-2">
        <Calculator className="text-emerald-400" size={18}/>
        <h3 className="font-bold text-white">Simulador de Lucro</h3>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">
        <InputNumber label="Ticket Médio" value={safeData.ticketMedio} onChange={(v) => onChange('ticketMedio', v)} />
        <InputNumber label="Meta Leads" value={safeData.leadsGoal} onChange={(v) => onChange('leadsGoal', v)} />
        <InputNumber label="Taxa Conv. (%)" value={safeData.conversionRate} onChange={(v) => onChange('conversionRate', v)} />
        <InputNumber label="Investimento" value={safeData.investmentAds} onChange={(v) => onChange('investmentAds', v)} />
      </div>
      <div className="mx-5 mb-5 p-4 bg-emerald-900/20 border border-emerald-500/20 rounded-xl">
        <div className="flex justify-between items-end">
          <span className="text-emerald-200 text-xs uppercase">Faturamento</span>
          <span className="text-xl font-bold text-white">R$ {result.revenue.toLocaleString('pt-BR')}</span>
        </div>
      </div>
    </div>
  );
}

// --- WIDGET 2: SELETOR DE SERVIÇOS ---
interface ServiceSelectorProps {
  items: ProposalItem[];
  onToggle: (id: string) => void;
}

export function ServiceSelector({ items, onToggle }: ServiceSelectorProps) {
  // AQUI ESTAVA O ERRO DE TIPAGEM 'ANY' - CORRIGIDO:
  const totalSetup = items
    .filter((i: ProposalItem) => i.selected && i.type === 'setup')
    .reduce((acc: number, curr: ProposalItem) => acc + curr.price, 0);
    
  const totalMensal = items
    .filter((i: ProposalItem) => i.selected && i.type === 'mensal')
    .reduce((acc: number, curr: ProposalItem) => acc + curr.price, 0);

  return (
    <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-white/10 flex items-center gap-2">
        <MousePointerClick className="text-blue-400" size={18}/>
        <h3 className="font-bold text-white">Escopo</h3>
      </div>
      <div className="flex-1 p-2 overflow-y-auto space-y-1">
        {items.map((item: ProposalItem) => (
          <div key={item.id} onClick={() => onToggle(item.id)}
            className={`flex justify-between p-3 rounded border cursor-pointer ${item.selected ? 'bg-blue-600/10 border-blue-500/40' : 'border-transparent hover:bg-white/5'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${item.selected ? 'bg-blue-500 border-blue-500' : 'border-white/20'}`}>
                {item.selected && <CheckCircle2 size={10} className="text-white"/>}
              </div>
              <span className="text-sm text-white/90">{item.name}</span>
            </div>
            <span className="text-xs font-mono text-white/60">R$ {item.price}</span>
          </div>
        ))}
      </div>
      <div className="p-4 bg-black/40 border-t border-white/10 text-right">
        <p className="text-xs text-white/50">Setup: R$ {totalSetup}</p>
        <p className="text-sm font-bold text-white">Mensal: R$ {totalMensal}/mês</p>
      </div>
    </div>
  );
}

// --- WIDGET 3: CONTRATO ---
interface ContractProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
}

export function ContractModal({ lead, isOpen, onClose }: ContractProps) {
  if (!isOpen) return null;
  
  const items = lead.activeProposal || [];
  const total = items.filter((i: ProposalItem) => i.selected).reduce((acc: number, curr: ProposalItem) => acc + curr.price, 0);
  
  const text = `CONTRATO\n\nCLIENTE: ${lead.nome}\nVALOR TOTAL: R$ ${total},00\n\nSERVIÇOS:\n${items.filter((i: ProposalItem) => i.selected).map((i: ProposalItem) => `- ${i.name}`).join('\n')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-[#111] border border-white/10 rounded-xl w-full max-w-2xl flex flex-col">
        <div className="p-4 border-b border-white/10 flex justify-between">
          <h3 className="font-bold text-white">Minuta de Contrato</h3>
          <button onClick={onClose}><X className="text-white/50 hover:text-white"/></button>
        </div>
        <textarea readOnly className="w-full h-96 bg-black p-6 text-sm text-white/70 font-mono resize-none outline-none" value={text}/>
        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          <button onClick={() => navigator.clipboard.writeText(text)} className="px-4 py-2 border border-white/10 rounded text-white text-xs flex gap-2"><Copy size={14}/> Copiar</button>
          <button className="px-4 py-2 bg-blue-600 rounded text-white text-xs font-bold flex gap-2"><Printer size={14}/> PDF</button>
        </div>
      </div>
    </div>
  );
}

// Helper
function InputNumber({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[10px] text-white/40 uppercase font-bold">{label}</label>
      <input type="number" value={value || 0} onChange={(e) => onChange(Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"/>
    </div>
  );
}
