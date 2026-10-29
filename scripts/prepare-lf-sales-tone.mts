// Update only LF's existing commercial style fields, never autonomy or rollout.
import nextEnv from "@next/env";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
nextEnv.loadEnvConfig(process.cwd());
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { FieldValue } = await import("firebase-admin/firestore");
const tenantId = "saas_fZxgDGSTcpRaiKOp1SpNNcwrOOM2";
const style = {
  toneOfVoice: "Acolhedor, educado e vendedor consultivo. Conversa natural, objetiva e sem pressão ou promessas não confirmadas.",
  diagnosisStyle: "Na primeira resposta, cumprimente e pergunte se está tudo bem; não reinicie a saudação. Uma pergunta útil por vez. Aproveite time, modelo, manga e tamanho já informados. Mostre até quatro modelos numerados em linhas separadas, com nomes legíveis. Confirme cada variante ao vivo; catálogo importado não comprova estoque. Se não encontrar, ofereça procurar outro modelo ou, com interesse, o site oficial.",
  proposalStyle: "Venda camisas, não consultoria. Não ofereça reunião, diagnóstico ou material genérico para escolher uma camisa. Responda ao pedido antes de sugerir o próximo passo. Se faltar estoque, pergunte se quer outro time/modelo ou o site para navegar. Link apenas se confirmado para a loja; foto ou carrinho só se a ferramenta realmente conseguir enviar/criar. Nunca diga que enviou se não houve envio.",
};
if (style.toneOfVoice.length > 120 || style.diagnosisStyle.length > 420 || style.proposalStyle.length > 420) throw Error("Style exceeds existing settings limits");
try {
  const ref = adminDb.collection("tenant_settings").doc(tenantId);
  const snap = await ref.get();
  const ai = snap.data()?.ai;
  if (!ai?.businessSummary || !ai?.commercialBrain) throw Error("LF commercial profile missing");
  const before = { toneOfVoice: ai.toneOfVoice || "", diagnosisStyle: ai.commercialBrain.diagnosisStyle || "", proposalStyle: ai.commercialBrain.proposalStyle || "" };
  if (process.argv.includes("--apply")) {
    const directory = join(tmpdir(), "altum-lf-sales-quality-20261016");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "lf-style-before.json"), JSON.stringify({ tenantId, before }, null, 2), { flag: "wx" });
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (!current.exists || current.updateTime?.isEqual(snap.updateTime!) !== true) throw Error("Settings changed during review");
      transaction.update(ref, {
        "ai.toneOfVoice": style.toneOfVoice,
        "ai.commercialBrain.diagnosisStyle": style.diagnosisStyle,
        "ai.commercialBrain.proposalStyle": style.proposalStyle,
        updatedAt: FieldValue.serverTimestamp(), updatedBy: "codex_lf_authorized_sales_alignment", updatedByName: "Alinhamento comercial LF autorizado",
      });
    });
  }
  console.log(JSON.stringify({ applied: process.argv.includes("--apply"), tenant: "LF Multimarcas Vitória", style, untouched: ["enabled", "responsePaused", "operatingProfile", "rollout", "guardrails", "mandatoryQuestions", "responsiblePhone"] }));
} finally { await adminDb.terminate(); }
