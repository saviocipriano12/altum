import nextEnv from "@next/env";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

nextEnv.loadEnvConfig(process.cwd());

const rawCredential = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawCredential) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY nao encontrada em .env.local.");
}

const app = initializeApp(
  { credential: cert(JSON.parse(rawCredential)) },
  `outbound-index-check-${Date.now()}`
);

try {
  const snapshot = await getFirestore(app)
    .collection("outbound_campaign_jobs")
    .where("status", "==", "ready")
    .orderBy("dueAt", "asc")
    .limit(1000)
    .get();
  const now = Date.now();
  const due = snapshot.docs.filter((document) => {
    const dueAt = document.data().dueAt;
    const dueDate = typeof dueAt?.toDate === "function" ? dueAt.toDate() : new Date(dueAt || 0);
    return Number.isFinite(dueDate.getTime()) && dueDate.getTime() <= now;
  }).length;
  console.log(`OUTBOUND_QUEUE ready=${snapshot.size} due=${due}`);
} finally {
  await deleteApp(app);
}
