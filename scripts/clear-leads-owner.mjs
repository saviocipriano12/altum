import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    if (!json.project_id || !json.client_email || !json.private_key) return null;
    return {
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey: String(json.private_key).replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

function initAdmin() {
  if (getApps().length) return;
  const sa = parseServiceAccount();
  if (sa) {
    initializeApp({ credential: cert(sa) });
    return;
  }
  initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}

async function main() {
  initAdmin();
  const db = getFirestore();

  const leadsSnap = await db.collection("leads").get();
  if (leadsSnap.empty) {
    console.log("Nenhum lead encontrado.");
    return;
  }

  let totalUpdated = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of leadsSnap.docs) {
    batch.set(
      doc.ref,
      {
        ownerId: null,
        owner: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    ops += 1;
    totalUpdated += 1;

    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  console.log(`Leads atualizados para sem dono: ${totalUpdated}`);
}

main().catch((error) => {
  console.error("Falha ao limpar ownership dos leads:", error);
  process.exit(1);
});

