import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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

function init() {
  if (getApps().length) return;
  const sa = parseServiceAccount();
  if (sa) {
    initializeApp({ credential: cert(sa) });
    return;
  }
  initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}

async function getAllAuthUsers(auth) {
  let pageToken = undefined;
  const list = [];
  do {
    const page = await auth.listUsers(1000, pageToken);
    list.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return list;
}

async function main() {
  init();
  const db = getFirestore();
  const auth = getAuth();

  console.log("Iniciando migracao de ownership...");

  const [userDocsSnap, authUsers] = await Promise.all([
    db.collection("users").get(),
    getAllAuthUsers(auth),
  ]);

  const authByEmail = new Map();
  for (const authUser of authUsers) {
    if (authUser.email) {
      authByEmail.set(authUser.email.toLowerCase(), authUser.uid);
    }
  }

  const legacyIdToUid = new Map();
  let migratedUsers = 0;

  for (const userDoc of userDocsSnap.docs) {
    const data = userDoc.data() || {};
    const email = String(data.email || "").trim().toLowerCase();
    const resolvedUid = email ? authByEmail.get(email) : null;
    if (!resolvedUid) continue;

    if (userDoc.id !== resolvedUid) {
      legacyIdToUid.set(userDoc.id, resolvedUid);

      await db.collection("users").doc(resolvedUid).set(
        {
          ...data,
          uid: resolvedUid,
          legacyDocId: userDoc.id,
          migratedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db.collection("migration_audit").add({
        type: "user_doc_migrated",
        fromId: userDoc.id,
        toUid: resolvedUid,
        email,
        createdAt: FieldValue.serverTimestamp(),
      });

      migratedUsers += 1;
    } else {
      await userDoc.ref.set(
        {
          uid: resolvedUid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  console.log(`Usuarios migrados: ${migratedUsers}`);

  async function migrateField(collectionName, fieldName) {
    const snap = await db.collection(collectionName).get();
    let updated = 0;

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const legacy = data[fieldName];
      if (!legacy || typeof legacy !== "string") continue;

      const mapped = legacyIdToUid.get(legacy);
      if (!mapped) continue;

      await doc.ref.set(
        {
          [fieldName]: mapped,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db.collection("migration_audit").add({
        type: "ownership_field_migrated",
        collection: collectionName,
        docId: doc.id,
        field: fieldName,
        from: legacy,
        to: mapped,
        createdAt: FieldValue.serverTimestamp(),
      });

      updated += 1;
    }

    return updated;
  }

  const updates = [];
  updates.push(await migrateField("leads", "ownerId"));
  updates.push(await migrateField("chats", "ownerId"));
  updates.push(await migrateField("chats", "assignedTo"));
  updates.push(await migrateField("financeiro", "vendedorId"));
  updates.push(await migrateField("financeiro", "ownerId"));
  updates.push(await migrateField("projetos", "ownerId"));
  updates.push(await migrateField("orcamentos", "ownerId"));
  updates.push(await migrateField("clientes", "ownerId"));
  updates.push(await migrateField("atividades", "ownerId"));

  console.log("Campos de ownership atualizados:", updates.reduce((acc, n) => acc + n, 0));

  const chatsSnap = await db.collection("chats").get();
  let autoAssigned = 0;
  let triage = 0;

  for (const chatDoc of chatsSnap.docs) {
    const chat = chatDoc.data() || {};
    const ownerId = chat.ownerId || chat.assignedTo || null;
    if (ownerId) continue;

    const phone = String(chat.contactPhone || "").replace(/\D/g, "");
    if (!phone) {
      await chatDoc.ref.set(
        {
          queueStatus: "admin_triage",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      triage += 1;
      continue;
    }

    const leadByPhone = await db
      .collection("leads")
      .where("telefone", "==", phone)
      .limit(1)
      .get();

    if (!leadByPhone.empty) {
      const lead = leadByPhone.docs[0].data() || {};
      if (lead.ownerId) {
        await chatDoc.ref.set(
          {
            ownerId: lead.ownerId,
            leadId: leadByPhone.docs[0].id,
            queueStatus: "assigned",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        autoAssigned += 1;
        continue;
      }
    }

    await chatDoc.ref.set(
      {
        queueStatus: "admin_triage",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    triage += 1;
  }

  await db.collection("migration_audit").add({
    type: "ownership_migration_summary",
    migratedUsers,
    ownershipUpdates: updates.reduce((acc, n) => acc + n, 0),
    chatsAutoAssigned: autoAssigned,
    chatsAdminTriage: triage,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`Chats autoatribuidos: ${autoAssigned}`);
  console.log(`Chats para triagem admin: ${triage}`);
  console.log("Migracao concluida.");
}

main().catch((error) => {
  console.error("Falha na migracao:", error);
  process.exit(1);
});
