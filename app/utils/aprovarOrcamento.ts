import {
  doc,
  writeBatch,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

export async function aprovarOrcamentoHub(orc: any) {
  const batch = writeBatch(db);

  const orcRef = doc(db, "orcamentos", orc.id);

  const projetosRef = orc.projectId
    ? doc(db, "projetos", orc.projectId)
    : doc(collection(db, "projetos"));

  const financeiroRef = doc(collection(db, "financeiro"));
  const atividadeRef = doc(collection(db, "atividades"));

  // Projeto
  if (!orc.projectId) {
    batch.set(projetosRef, {
      titulo: orc.projectTitle || orc.titulo,
      clientId: orc.clientId,
      clientName: orc.clientName,
      status: "Onboarding",
      canalPrincipal: "Não informado",
      servicos: orc.resumo
        ? orc.resumo.split("+").map((s: string) => s.trim())
        : [],
      valorMensal: orc.tipo === "Recorrente" ? orc.valorTotal : null,
      createdAt: serverTimestamp(),
    });
  }

  // Financeiro
  batch.set(financeiroRef, {
    clientId: orc.clientId,
    clientName: orc.clientName,
    projectId: projetosRef.id,
    projectTitle: orc.titulo,
    tipo: orc.tipo === "Recorrente" ? "Mensalidade" : "Projeto único",
    status: "Pendente",
    valor: orc.valorTotal || 0,
    referencia: orc.titulo,
    createdAt: serverTimestamp(),
    dataPagamento: null,
  });

  // Atividade
  batch.set(atividadeRef, {
    descricao: `Onboarding do projeto ${orc.titulo}`,
    status: "pendente",
    tipo: "onboarding",
    clienteNome: orc.clientName,
    projetoId: projetosRef.id,
    orcamentoId: orc.id,
    createdAt: serverTimestamp(),
  });

  // Atualiza orçamento
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
