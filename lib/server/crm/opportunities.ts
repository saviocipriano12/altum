import { createHash } from "node:crypto";
import { commercialPotentialValue } from "@/lib/crm-commercial-record";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTransactionalTenantAuthority } from "@/lib/server/tenant-operation-authority";
import { assertAssignedCommercialRecordAccess, canAccessAssignedCommercialRecord, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { TenantAccessError } from "@/lib/server/tenant";
import { describeContactIdentity, contactIdentityAliasId,contactLeadIdentityAlias } from "@/lib/server/contact-profile";
import { manualCrmOwnershipPatch } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction, assertPipelineStageExists } from "@/lib/server/crm/pipeline";

export class OpportunityError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
type Actor = { tenantId: string; sourceLeadId: string; userId: string; userName: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0,max) : "";
const validId = (value: unknown, max = 180): value is string => typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim() && !value.includes("/") && value !== "." && value !== "..";
const revision = (snapshot: FirebaseFirestore.DocumentSnapshot) => `${snapshot.updateTime!.seconds}:${snapshot.updateTime!.nanoseconds}`;
const generation = (snapshot: FirebaseFirestore.DocumentSnapshot) => `${snapshot.createTime!.seconds}:${snapshot.createTime!.nanoseconds}`;
const linkedIds = (data: FirebaseFirestore.DocumentData) => [...new Set([data.leadId,data.primaryLeadId,...(Array.isArray(data.leadIds) ? data.leadIds : [])].filter((id): id is string => validId(id)))];
async function source(tx: FirebaseFirestore.Transaction, actor: Actor, write: boolean) {
  if (!validId(actor.tenantId,140) || !validId(actor.sourceLeadId) || !validId(actor.userId)) throw new OpportunityError(400,"invalid_opportunity_context","Contexto da oportunidade invalido.");
  const membership = await assertTransactionalTenantAuthority(tx,{tenantId:actor.tenantId,userId:actor.userId,module:"crm",...(write ? {capability:"edit_leads" as const} : {})});
  const snapshot = await tx.get(adminDb.collection("leads").doc(actor.sourceLeadId)), row = snapshot.data();
  if (!row) throw new OpportunityError(404,"lead_not_found","Cliente ou oportunidade nao encontrado.");
  if (row.tenantId !== actor.tenantId) throw new TenantAccessError("lead_tenant_mismatch","Registro fora desta empresa.");
  assertAssignedCommercialRecordAccess(membership,actor.userId,row);
  return { snapshot,row,membership };
}
async function identity(tx: FirebaseFirestore.Transaction, actor: Actor, snapshot: FirebaseFirestore.DocumentSnapshot) {
  const row = snapshot.data()!;
  const descriptor = describeContactIdentity({tenantId:actor.tenantId,phone:text(row.telefone,60),email:text(row.email),externalProfileId:text(row.externalProfileId),channel:text(row.channel,60)});
  const identityAliases = [...descriptor.aliases,contactLeadIdentityAlias({tenantId:actor.tenantId,leadId:actor.sourceLeadId,generation:generation(snapshot)})];
  const aliases = identityAliases.map(alias => adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({tenantId:actor.tenantId,...alias})));
  const aliasDocs = aliases.length ? await tx.getAll(...aliases) : [];
  if (aliasDocs.some(doc => doc.exists && doc.data()?.tenantId !== actor.tenantId)) throw new OpportunityError(409,"contact_identity_conflict","Identidade do cliente precisa de revisao.");
  const ids = new Set<string>();
  if (row.contactId) { if (!validId(row.contactId,220)) throw new OpportunityError(409,"contact_identity_conflict","Vinculo do cliente invalido."); ids.add(row.contactId); }
  for (const doc of aliasDocs) if (doc.exists) {
    if (!validId(doc.data()?.contactId,220)) throw new OpportunityError(409,"contact_identity_conflict","Identidade do cliente incompleta."); ids.add(doc.data()!.contactId);
  }
  // The current foreign key/identity aliases are authoritative. Scan legacy
  // reverse links only when neither exists, rather than locking three contact
  // queries for every purchase by a person who is already linked correctly.
  if (!ids.size) {
    const legacy = await Promise.all([
      tx.get(adminDb.collection("contacts").where("tenantId","==",actor.tenantId).where("leadIds","array-contains",actor.sourceLeadId)),
      tx.get(adminDb.collection("contacts").where("tenantId","==",actor.tenantId).where("leadId","==",actor.sourceLeadId)),
      tx.get(adminDb.collection("contacts").where("tenantId","==",actor.tenantId).where("primaryLeadId","==",actor.sourceLeadId)),
    ]);
    for (const rows of legacy) for (const doc of rows.docs) ids.add(doc.id);
  }
  const cache = new Map<string,FirebaseFirestore.DocumentSnapshot>();
  async function canonical(id: string) {
    const visited = new Set<string>();
    for (let depth=0;depth<32;depth++) {
      if (!validId(id,220) || visited.has(id)) throw new OpportunityError(409,"contact_identity_conflict","Identidade do cliente precisa de revisao.");
      visited.add(id); let doc = cache.get(id);
      if (!doc) { doc = await tx.get(adminDb.collection("contacts").doc(id)); cache.set(id,doc); }
      if (!doc.exists || doc.data()?.tenantId !== actor.tenantId) throw new OpportunityError(409,"contact_identity_conflict","Identidade do cliente ausente ou fora desta empresa.");
      const next = doc.data()?.canonicalContactId;
      if (!next || next === id) return doc;
      id = next;
    }
    throw new OpportunityError(409,"contact_identity_conflict","Identidade do cliente precisa de revisao.");
  }
  const roots = new Map<string,FirebaseFirestore.DocumentSnapshot>();
  for (const id of ids) { const root=await canonical(id); roots.set(root.id,root); }
  if (roots.size > 1) throw new OpportunityError(409,"contact_identity_conflict","Os identificadores apontam para clientes diferentes. Revise o vinculo antes de abrir outra oportunidade.");
  let existing = [...roots.values()][0];
  const contactId = existing?.id || descriptor.suggestedContactId || `contact_source_${hash(`${actor.tenantId}\0${actor.sourceLeadId}\0${generation(snapshot)}`).slice(0,48)}`;
  const ref = adminDb.collection("contacts").doc(contactId);
  if (!existing) { const candidate=await tx.get(ref); if(candidate.exists)existing=await canonical(candidate.id); }
  if (existing && !linkedIds(existing.data()!).includes(actor.sourceLeadId)) throw new OpportunityError(409,"contact_link_review","Este identificador ja esta associado a outro cadastro. Revise a identidade do cliente antes de continuar.");
  return {ref:existing?.ref || ref,data:existing?.data() || null,aliases,aliasDocs,identityAliases,descriptor,canonical};
}
export async function listContactOpportunities(actor: Actor) {
  return adminDb.runTransaction(async tx => {
    const current=await source(tx,actor,false), contact=await identity(tx,actor,current.snapshot);
    const snapshots = new Map<string,FirebaseFirestore.DocumentSnapshot>([[current.snapshot.id,current.snapshot]]);
    const ids = contact.data ? linkedIds(contact.data) : [];
    for(let offset=0;offset<ids.length;offset+=200) for(const doc of await tx.getAll(...ids.slice(offset,offset+200).map(id=>adminDb.collection("leads").doc(id)))) snapshots.set(doc.id,doc);
    const direct=await tx.get(adminDb.collection("leads").where("tenantId","==",actor.tenantId).where("contactId","==",contact.ref.id));
    for(const doc of direct.docs) snapshots.set(doc.id,doc);
    const items=[];
    for(const doc of snapshots.values()) {
      const row=doc.data(); if(!row || row.tenantId!==actor.tenantId || !canAccessAssignedCommercialRecord(current.membership,actor.userId,row))continue;
      if(row.contactId && (await contact.canonical(row.contactId)).id!==contact.ref.id) continue;
      items.push({id:doc.id,title:text(row.opportunityTitle)||(row.recordKind==="opportunity"?"Oportunidade sem titulo":"Registro anterior"),kind:row.recordKind==="opportunity"?"opportunity":"legacy",revision:revision(doc),pipelineStage:text(row.pipelineStage||row.stage),potentialValue:commercialPotentialValue(row),owner:text(row.ownerName||row.owner),isCurrent:doc.id===actor.sourceLeadId});
    }
    return {sourceRevision:revision(current.snapshot),contactId:contact.data ? contact.ref.id : null,items};
  }, { readOnly:true });
}
export async function createContactOpportunity(actor: Actor, value: unknown) {
  if(!value || typeof value!=="object" || Array.isArray(value))throw new OpportunityError(400,"invalid_opportunity_body","Dados da oportunidade invalidos.");
  const body=value as Record<string,unknown>, title=text(body.title), requestId=body.requestId, expectedRevision=body.expectedSourceRevision;
  if(!title || typeof body.title!=="string" || body.title.trim().length>180 || !validId(requestId) || typeof expectedRevision!=="string" || !/^\d+:\d{1,9}$/.test(expectedRevision))throw new OpportunityError(400,"invalid_opportunity_body","Informe titulo, identificador do pedido e revisao do cliente.");
  const amount=body.potentialValue===undefined||body.potentialValue===null ? null : body.potentialValue;
  if(amount!==null&&(typeof amount!=="number" || !Number.isFinite(amount) || amount<0 || amount>1e12)) throw new OpportunityError(400,"invalid_opportunity_value","Valor previsto invalido.");
  if(body.pipelineStage!==undefined && !validId(body.pipelineStage))throw new OpportunityError(400,"invalid_pipeline_stage","Etapa invalida.");
  if(body.ownerUserId!==undefined && !validId(body.ownerUserId))throw new OpportunityError(400,"invalid_opportunity_owner","Responsavel invalido.");
  const requestHash=hash(JSON.stringify({title,amount,stage:body.pipelineStage||null,owner:body.ownerUserId||null}));
  const ref=adminDb.collection("leads").doc(`opportunity_${hash(`${actor.tenantId}\0${actor.sourceLeadId}\0${actor.userId}\0${requestId}`)}`);
  return adminDb.runTransaction(async tx => {
    const current=await source(tx,actor,true), previous=await tx.get(ref);
    if(previous.exists) {
      if(previous.data()?.tenantId!==actor.tenantId || previous.data()?.opportunityRequestHash!==requestHash)throw new OpportunityError(409,"opportunity_request_conflict","Este pedido ja foi usado para outra oportunidade.");
      assertAssignedCommercialRecordAccess(current.membership,actor.userId,previous.data()!);
      const contact=await identity(tx,{...actor,sourceLeadId:ref.id},previous);
      return {opportunityId:ref.id,contactId:contact.ref.id,deduped:true};
    }
    if(revision(current.snapshot)!==expectedRevision)throw new OpportunityError(409,"opportunity_source_changed","O cadastro foi alterado. Atualize antes de abrir outra oportunidade.");
    const contact=await identity(tx,actor,current.snapshot), pipeline=await loadTenantPipelineInTransaction(tx,actor.tenantId);
    const stage=body.pipelineStage===undefined ? pipeline.stages.find(stage=>!stage.isTerminal)?.id || "" : String(body.pipelineStage);
    assertPipelineStageExists(pipeline.stages,stage);
    if(pipeline.stages.find(item=>item.id===stage)?.isTerminal)throw new OpportunityError(400,"opportunity_terminal_stage","Uma nova oportunidade deve comecar em uma etapa aberta.");
    const ownerId=String(body.ownerUserId||actor.userId);
    if(ownerId!==actor.userId && !hasTeamWideCommercialAccess(current.membership))throw new TenantAccessError("opportunity_owner_denied","Somente gestores podem criar oportunidades para outro vendedor.");
    await assertTransactionalTenantAuthority(tx,{tenantId:actor.tenantId,userId:ownerId,module:"crm",capability:"edit_leads"});
    const owner=await tx.get(adminDb.collection("users").doc(ownerId));
    const ownerName=text(owner.data()?.name)||(ownerId===actor.userId ? actor.userName : "Vendedor");
    const identityFields={nome:text(current.row.nome)||"Contato sem nome",empresa:text(current.row.empresa),telefone:text(current.row.telefone,60),email:text(current.row.email).toLowerCase()};
    if(!contact.data) {
      tx.create(contact.ref,{tenantId:actor.tenantId,identityVersion:2,name:identityFields.nome,company:identityFields.empresa||null,
        phone:contact.descriptor.phone||null,phones:contact.descriptor.phone ? [contact.descriptor.phone] : [],email:contact.descriptor.email||null,emails:contact.descriptor.email ? [contact.descriptor.email] : [],
        externalProfileId:contact.descriptor.externalProfileId||null,externalProfileIds:contact.descriptor.externalProfileId ? [contact.descriptor.externalProfileId] : [],
        leadId:actor.sourceLeadId,primaryLeadId:actor.sourceLeadId,leadIds:[actor.sourceLeadId,ref.id],channel:contact.descriptor.channel||null,channels:contact.descriptor.channel ? [contact.descriptor.channel] : [],
        identitySource:contact.descriptor.aliases.length ? "existing_record_identifiers" : "source_record_without_identifier",createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    } else tx.update(contact.ref,{leadIds:FieldValue.arrayUnion(actor.sourceLeadId,ref.id),updatedAt:FieldValue.serverTimestamp()});
    contact.identityAliases.forEach((alias,index)=>{
      if(!contact.aliasDocs[index].exists && (!contact.data || alias.type==="lead"))tx.create(contact.aliases[index],{tenantId:actor.tenantId,...alias,channel:alias.channel||null,contactId:contact.ref.id,identityVersion:2,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    });
    if(current.row.contactId!==contact.ref.id) tx.update(current.snapshot.ref,{contactId:contact.ref.id,contactLinkedAt:FieldValue.serverTimestamp()});
    tx.create(ref,{tenantId:actor.tenantId,...identityFields,recordKind:"opportunity",contactId:contact.ref.id,opportunityTitle:title,opportunitySourceLeadId:actor.sourceLeadId,opportunityRequestHash:requestHash,
      pipelineStage:stage,stage,status:"novo",potentialValue:amount,sourceType:"manual_opportunity",origem:"manual",channel:text(current.row.channel,60)||"manual",
      ownerId,ownerUserId:ownerId,assignedTo:ownerId,owner:ownerName,ownerName,assignedUserName:ownerName,
      ...(body.pipelineStage===undefined?{}:manualCrmOwnershipPatch(["pipelineStage"],actor.userId)),
      createdBy:actor.userId,createdByName:actor.userName,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    tx.create(ref.collection("events").doc("opportunity_created"),{tenantId:actor.tenantId,type:"opportunity_created",title:"Nova oportunidade",detail:title,initialPotentialValue:amount,actorId:actor.userId,actorName:actor.userName,contactId:contact.ref.id,sourceLeadId:actor.sourceLeadId,createdAt:FieldValue.serverTimestamp()});
    tx.create(adminDb.collection("audit_logs").doc(`opportunity_created_${ref.id}`),{tenantId:actor.tenantId,type:"opportunity_created",leadId:ref.id,contactId:contact.ref.id,actorId:actor.userId,createdAt:FieldValue.serverTimestamp()});
    return {opportunityId:ref.id,contactId:contact.ref.id,deduped:false};
  });
}
