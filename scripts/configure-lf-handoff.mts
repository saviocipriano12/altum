// The owner explicitly designated Luiz's phone for LF sales escalations.
import nextEnv from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
nextEnv.loadEnvConfig(process.cwd());
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { FieldValue } = await import("firebase-admin/firestore");
const tenantId = "saas_fZxgDGSTcpRaiKOp1SpNNcwrOOM2";
const phone = "5527998914048";
try {
  const ref = adminDb.collection("tenant_settings").doc(tenantId);
  const snap = await ref.get();
  const ai = snap.data()?.ai;
  if (!ai?.businessSummary?.includes("LF Multimarcas Vitória") || !/^55\d{11}$/.test(phone)) throw Error("LF settings/authorized phone mismatch");
  if (process.argv.includes("--apply")) {
    const directory = join(tmpdir(), "altum-lf-recovery-20261016");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "handoff-before.json"), JSON.stringify({ responsiblePhone: ai.responsiblePhone || "", handoffNotifyPhones: ai.handoffNotifyPhones || [], handoffNotifyEnabled: ai.handoffNotifyEnabled }, null, 2), { flag: "wx" });
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (!current.updateTime?.isEqual(snap.updateTime!)) throw Error("Settings changed during review");
      transaction.update(ref, { "ai.responsiblePhone": phone, "ai.handoffNotifyPhones": [phone], "ai.handoffNotifyEnabled": true,
        updatedAt: FieldValue.serverTimestamp(), updatedBy: "codex_owner_designated_luiz", updatedByName: "Responsável Luiz indicado pelo proprietário" });
    });
  }
  console.log(JSON.stringify({ applied: process.argv.includes("--apply"), tenant: "LF Multimarcas Vitória", recipient: "Luiz", suffix: "4048", platformUserCreated: false, messagesSent: false }));
} finally { await adminDb.terminate(); }
