import {
  doc,
  writeBatch,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

interface OrcamentoHubInput {
  id: string;
  clientId: string;
  clientName: string;
  projectId?: string | null;
  projectTitle?: string | null;
  titulo: string;
  tipo?: string | null;
  resumo?: string | null;
  valorTotal?: number | null;
}

export async function aprovarOrcamentoHub(orc: OrcamentoHubInput) {
  const batch = writeBatch(db);

  const orcRef = doc(db, "orcamentos", orc.id);
  const projetosRef = orc.projectId
    ? doc(db, "projetos", orc.projectId)
    : doc(collection(db, "projetos"));

  const financeiroRef = doc(collection(db, "financeiro"));
  const atividadeRef = doc(collection(db, "atividades"));

  if (!orc.projectId) {
    batch.set(projetosRef, {
      titulo: orc.projectTitle || orc.titulo,
      clientId: orc.clientId,
      clientName: orc.clientName,
      status: "Onboarding",
      canalPrincipal: "Nao informado",
      servicos: orc.resumo
        ? orc.resumo.split("+").map((value: string) => value.trim())
        : [],
      valorMensal: orc.tipo === "Recorrente" ? orc.valorTotal || 0 : null,
      createdAt: serverTimestamp(),
    });
  }

  batch.set(financeiroRef, {
    clientId: orc.clientId,
    clientName: orc.clientName,
    projectId: projetosRef.id,
    projectTitle: orc.titulo,
    tipo: "Receita",
    categoria: orc.tipo === "Recorrente" ? "Mensalidade" : "Projeto",
    status: "pendente",
    descricao: `Orcamento aprovado - ${orc.titulo}`,
    valor: orc.valorTotal || 0,
    referencia: orc.titulo,
    createdAt: serverTimestamp(),
    dataPagamento: null,
  });

  batch.set(atividadeRef, {
    descricao: `Onboarding do projeto ${orc.titulo}`,
    status: "pendente",
    tipo: "onboarding",
    clienteNome: orc.clientName,
    projetoId: projetosRef.id,
    orcamentoId: orc.id,
    createdAt: serverTimestamp(),
  });

  batch.update(orcRef, {
    status: "Aprovado",
    aprovadoEm: serverTimestamp(),
    projectId: projetosRef.id,
    financeiroId: financeiroRef.id,
  });

  await batch.commit();

  return {
    projetoId: projetosRef.id,
    financeiroId: financeiroRef.id,
  };
}
