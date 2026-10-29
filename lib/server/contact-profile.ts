import { createHash } from "node:crypto";
import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhoneBR } from "@/app/lib/server/phone";

type UpsertContactProfileInput = {
  tenantId: string;
  phone?: string | null;
  externalProfileId?: string | null;
  leadId?: string | null;
  channel?: string | null;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  photoUrl?: string | null;
};

type ContactAlias = { type: "phone" | "email" | "external" | "lead"; value: string; channel: string };
const MAX_CANONICAL_CONTACT_DEPTH = 32;

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown, max = 240) {
  return Array.isArray(value) ? value.map((item) => clean(item, max)).filter(Boolean) : [];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function hashId(prefix: string, values: string[]) {
  return `${prefix}_${createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 48)}`;
}

function isPlaceholderName(value: string) {
  return /^(instagram|messenger|whatsapp|contato|cliente|lead)(\s|$)/i.test(value) || /\d{4,}$/.test(value);
}

function aliasesFor(input: UpsertContactProfileInput) {
  const tenantId = clean(input.tenantId, 140);
  const phone = normalizePhoneBR(clean(input.phone, 40));
  const email = clean(input.email, 180).toLowerCase();
  const externalProfileId = clean(input.externalProfileId, 180);
  const channel = clean(input.channel, 60).toLowerCase();
  const aliases: ContactAlias[] = [];
  if (phone) aliases.push({ type: "phone", value: phone, channel: "" });
  if (email) aliases.push({ type: "email", value: email, channel: "" });
  // IDs de perfil do provedor sao escopados por canal. Um valor igual no
  // Instagram e Messenger nao prova que se trata da mesma pessoa.
  if (externalProfileId && channel) aliases.push({ type: "external", value: externalProfileId, channel });
  return { tenantId, phone, email, externalProfileId, channel, aliases };
}

/** Shared normalization; a name alone never establishes a person's identity. */
export function describeContactIdentity(input: UpsertContactProfileInput) {
  const identity = aliasesFor(input);
  return { ...identity, suggestedContactId: identity.aliases.length
    ? hashId("contact", [identity.tenantId, ...identity.aliases.map(alias => `${alias.type}:${alias.channel}:${alias.value}`).sort()]) : null };
}

/** Internal reference to a particular record generation, not a verified channel
 * identifier. Shared CAS receipt prevents first-alias enrichment from splitting
 * a person while another opportunity is being opened. */
export function contactLeadIdentityAlias(input: {tenantId:string;leadId:string;generation:string}): ContactAlias {
  return {type:"lead",channel:"",value:hashId("lead",[input.tenantId,input.leadId,input.generation])};
}

export function contactIdentityAliasId(input: { tenantId: string; type: ContactAlias["type"]; value: string; channel?: string }) {
  return hashId("contact_alias", [clean(input.tenantId, 140), input.type, clean(input.channel, 60).toLowerCase(), clean(input.value, 240).toLowerCase()]);
}

async function followCanonicalContact(snapshot: DocumentSnapshot, tenantId: string) {
  let current = snapshot;
  const visited = new Set<string>();
  for (let depth = 0; depth < MAX_CANONICAL_CONTACT_DEPTH && current.exists; depth += 1) {
    if (clean(current.data()?.tenantId, 140) !== tenantId || visited.has(current.id)) return null;
    visited.add(current.id);
    const nextId = clean(current.data()?.canonicalContactId, 220);
    if (!nextId || nextId === current.id) return current;
    const next = await adminDb.collection("contacts").doc(nextId).get();
    if (!next.exists) return null;
    current = next;
  }
  return null;
}

export async function findContactProfile(input: {
  tenantId: string;
  phone?: string | null;
  email?: string | null;
  externalProfileId?: string | null;
  channel?: string | null;
}): Promise<({ id: string } & Record<string, unknown>) | null> {
  const normalized = aliasesFor(input);
  if (!normalized.tenantId || normalized.aliases.length === 0) return null;
  for (const alias of normalized.aliases) {
    const aliasSnap = await adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({
      tenantId: normalized.tenantId, type: alias.type, value: alias.value, channel: alias.channel,
    })).get();
    if (!aliasSnap.exists || clean(aliasSnap.data()?.tenantId, 140) !== normalized.tenantId) continue;
    const contactId = clean(aliasSnap.data()?.contactId, 220);
    if (!contactId) continue;
    const contact = await followCanonicalContact(await adminDb.collection("contacts").doc(contactId).get(), normalized.tenantId);
    if (contact?.exists) {
      return { ...(contact.data() as Record<string, unknown>), id: contact.id };
    }
  }
  return null;
}

// Coordinate overlapping writers in this process, not all tenants or all
// contacts. Cross-process correctness still comes from the atomic CAS below.
// These promises are admission ordering, never a durable receipt of success.
const contactWriteTails = new Map<string, Promise<void>>();
async function coordinateContactWrites<T>(keys: string[], work: () => Promise<T>) {
  const uniqueKeys = [...new Set(keys)].sort();
  const predecessors = [...new Set(uniqueKeys.map(key => contactWriteTails.get(key)).filter((value): value is Promise<void> => Boolean(value)))];
  let release!: () => void;
  const tail = new Promise<void>(resolve => { release = resolve; });
  for (const key of uniqueKeys) contactWriteTails.set(key, tail);
  try { await Promise.all(predecessors); return await work(); }
  finally {
    release();
    for (const key of uniqueKeys) if (contactWriteTails.get(key) === tail) contactWriteTails.delete(key);
  }
}

export async function upsertContactProfile(input: UpsertContactProfileInput) {
  const normalized = aliasesFor(input);
  if (!normalized.tenantId || normalized.aliases.length === 0) return null;
  const aliases = normalized.aliases.map(alias => adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({
    tenantId: normalized.tenantId, type: alias.type, value: alias.value, channel: alias.channel,
  })));
  // Advisory reads select local coordination keys only. Never reuse these
  // snapshots as authorization or write data: the core re-reads EVERYTHING.
  const snapshots = await adminDb.getAll(...aliases);
  const known = await Promise.all(snapshots.map(async alias => {
    if (alias.data()?.tenantId !== normalized.tenantId) return null;
    const id = clean(alias.data()?.contactId, 220);
    if (!id) return null;
    return followCanonicalContact(await adminDb.collection("contacts").doc(id).get(), normalized.tenantId);
  }));
  const linkedLeadId = clean(input.leadId, 180);
  const keys = [...aliases.map(ref => ref.path), ...known.filter((value): value is DocumentSnapshot => Boolean(value)).map(value => value.ref.path),
    ...(linkedLeadId && !linkedLeadId.includes("/") ? [`leads/${linkedLeadId}`] : [])];
  return coordinateContactWrites(keys, () => upsertContactProfileOptimistic(input));
}

async function upsertContactProfileOptimistic(input: UpsertContactProfileInput) {
  const normalized = aliasesFor(input);
  const { tenantId, phone, email, externalProfileId, channel, aliases } = normalized;
  const leadId = clean(input.leadId, 180);
  const name = clean(input.name, 180);
  const company = clean(input.company, 180);
  const photoUrl = clean(input.photoUrl, 600);
  if (!tenantId || aliases.length === 0) return null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
    // Optimistic read/plan/commit: preserve the same atomic merge without
    // holding pessimistic read locks while other messages update this person.
    // EVERY observed document is guarded, including intermediate redirects.
    const reads = new Map<string, DocumentSnapshot>();
    const writes = new Map<string, { snapshot: DocumentSnapshot; data: FirebaseFirestore.DocumentData }>();
    const read = async (ref: FirebaseFirestore.DocumentReference) => {
      const cached = reads.get(ref.path);
      if (cached) return cached;
      const snapshot = await ref.get(); reads.set(ref.path, snapshot); return snapshot;
    };
    const stage = (snapshot: DocumentSnapshot, data: FirebaseFirestore.DocumentData) => {
      writes.set(snapshot.ref.path, { snapshot, data: { ...writes.get(snapshot.ref.path)?.data, ...data } });
    };
    let sourceLead: DocumentSnapshot | null = null;
    if (leadId) {
      if (leadId.includes("/")) throw new Error("Identificador de oportunidade invalido para o contato.");
      sourceLead = await adminDb.collection("leads").doc(leadId).get();
      if (sourceLead.exists && clean(sourceLead.data()?.tenantId,140)!==tenantId) throw new Error("Oportunidade do contato pertence a outro tenant.");
    }
    const participantAliases = [...aliases, ...(sourceLead?.exists ? [contactLeadIdentityAlias({tenantId,leadId,generation:`${sourceLead.createTime!.seconds}:${sourceLead.createTime!.nanoseconds}`})] : [])];
    const aliasRefs = participantAliases.map(alias=>adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({tenantId,...alias})));
    const aliasSnapshots = await Promise.all(aliasRefs.map(read));
    if (aliasSnapshots.some((snapshot) => snapshot.exists && clean(snapshot.data()?.tenantId, 140) !== tenantId)) {
      throw new Error("Identidade de contato pertence a outro tenant.");
    }
    const internalLink = participantAliases.findIndex(alias=>alias.type==="lead");
    const linkedContactId = internalLink >= 0 && !aliasSnapshots[internalLink].exists ? clean(sourceLead?.data()?.contactId,220) : "";
    const mappedIds = unique([...aliasSnapshots.map((snapshot) => clean(snapshot.data()?.contactId, 220)), linkedContactId]);
    const mappedSnapshots = await Promise.all(mappedIds.map((id) => read(adminDb.collection("contacts").doc(id))));
    const resolvedSnapshots = new Map(mappedSnapshots.map((snapshot) => [snapshot.id, snapshot]));
    const canonicalRoots = new Map<string, DocumentSnapshot>();
    for (const mapped of mappedSnapshots) {
      let current = mapped;
      const visited = new Set<string>();
      for (let depth = 0; ; depth += 1) {
        if (depth >= MAX_CANONICAL_CONTACT_DEPTH || visited.has(current.id) || !current.exists) {
          throw new Error("Identidade canonica de contato invalida: ciclo, destino ausente ou limite excedido.");
        }
        if (clean(current.data()?.tenantId, 140) !== tenantId) {
          throw new Error("Identidade de contato aponta para outro tenant.");
        }
        visited.add(current.id);
        const nextId = clean(current.data()?.canonicalContactId, 220);
        if (!nextId || nextId === current.id) {
          canonicalRoots.set(current.id, current);
          break;
        }
        const cached = resolvedSnapshots.get(nextId);
        current = cached || await read(adminDb.collection("contacts").doc(nextId));
        resolvedSnapshots.set(current.id, current);
      }
    }
    const candidates = [...resolvedSnapshots.values()];
    const roots = [...canonicalRoots.values()].sort((left, right) => left.id.localeCompare(right.id));
    const contactId = roots[0]?.id || hashId("contact", [tenantId, ...aliases.map((alias) => `${alias.type}:${alias.channel}:${alias.value}`).sort()]);
    const contactRef = adminDb.collection("contacts").doc(contactId);
    const contactSnapshot = candidates.find((snapshot) => snapshot.id === contactId) || await read(contactRef);
    if (contactSnapshot.exists && clean(contactSnapshot.data()?.tenantId, 140) !== tenantId) {
      throw new Error("Identidade de contato pertence a outro tenant.");
    }
    const existing = contactSnapshot.exists ? contactSnapshot.data() || {} : {};
    const existingName = clean(existing.name, 180);
    const preferredName = !existingName || (isPlaceholderName(existingName) && name && !isPlaceholderName(name))
      ? name || existingName
      : existingName;

    const allContacts = candidates;
    const phones = unique([clean(existing.phone, 40), ...cleanList(existing.phones, 40), phone, ...allContacts.flatMap((snapshot) => [clean(snapshot.data()?.phone, 40), ...cleanList(snapshot.data()?.phones, 40)])]);
    const emails = unique([clean(existing.email, 180).toLowerCase(), ...cleanList(existing.emails, 180).map((item) => item.toLowerCase()), email, ...allContacts.flatMap((snapshot) => [clean(snapshot.data()?.email, 180).toLowerCase(), ...cleanList(snapshot.data()?.emails, 180).map((item) => item.toLowerCase())])]);
    const externalProfileIds = unique([clean(existing.externalProfileId, 180), ...cleanList(existing.externalProfileIds, 180), externalProfileId, ...allContacts.flatMap((snapshot) => [clean(snapshot.data()?.externalProfileId, 180), ...cleanList(snapshot.data()?.externalProfileIds, 180)])]);
    const leadIds = unique([clean(existing.primaryLeadId || existing.leadId, 180), ...cleanList(existing.leadIds, 180), leadId, ...allContacts.flatMap((snapshot) => [clean(snapshot.data()?.primaryLeadId || snapshot.data()?.leadId, 180), ...cleanList(snapshot.data()?.leadIds, 180)])]);
    const channels = unique([clean(existing.channel, 60), ...cleanList(existing.channels, 60), channel, ...allContacts.flatMap((snapshot) => [clean(snapshot.data()?.channel, 60), ...cleanList(snapshot.data()?.channels, 60)])]);

    stage(contactSnapshot, {
      tenantId,
      identityVersion: 2,
      phone: phone || clean(existing.phone, 40) || phones[0] || null,
      phones,
      email: email || clean(existing.email, 180).toLowerCase() || emails[0] || null,
      emails,
      externalProfileId: externalProfileId || clean(existing.externalProfileId, 180) || externalProfileIds[0] || null,
      externalProfileIds,
      leadId: clean(existing.leadId, 180) || leadId || leadIds[0] || null,
      leadIds,
      primaryLeadId: clean(existing.primaryLeadId || existing.leadId, 180) || leadId || leadIds[0] || null,
      channel: channel || clean(existing.channel, 60) || channels[0] || null,
      channels,
      name: preferredName || null,
      company: company || clean(existing.company, 180) || null,
      photoUrl: photoUrl || clean(existing.photoUrl, 600) || null,
      createdAt: contactSnapshot.exists ? existing.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      firstSeenAt: contactSnapshot.exists ? existing.firstSeenAt || existing.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    participantAliases.forEach((alias, index) => stage(aliasSnapshots[index], {
      tenantId,
      type: alias.type,
      value: alias.value,
      channel: alias.channel || null,
      contactId,
      identityVersion: 2,
      createdAt: aliasSnapshots[index].exists ? aliasSnapshots[index].data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }));

    for (const duplicate of candidates) {
      if (duplicate.exists && duplicate.id !== contactId) {
        stage(duplicate, { canonicalContactId: contactId, mergedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      }
    }
    for (const snapshot of reads.values()) {
      if (!writes.has(snapshot.ref.path)) stage(snapshot, { tenantId });
    }
    const batch = adminDb.batch();
    for (const { snapshot, data } of writes.values()) {
      if (snapshot.exists) {
        if (!snapshot.updateTime) throw new Error("Versao do contato indisponivel para consolidacao.");
        batch.update(snapshot.ref, data, { lastUpdateTime: snapshot.updateTime });
      } else batch.create(snapshot.ref, data);
    }
    await batch.commit();
    return contactId;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
      const message = error instanceof Error ? error.message : "";
      if (attempt >= 5 || (![5, 6, 9, 10].includes(code) && !/ABORTED|lock timeout|contention/i.test(message))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt + Math.floor(Math.random() * 40)));
    }
  }
  throw new Error("Nao foi possivel consolidar a identidade do contato.");
}
