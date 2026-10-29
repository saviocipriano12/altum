import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const { handleIncomingMessage } = await import("../lib/server/ai/agent.ts");
const { getUnambiguousConversationLead: target } = await import("../lib/server/crm/conversation-commercial-context.ts");
const { matchesConversationCommercialFence } = await import("../lib/server/crm/conversation-commercial-context.ts");
const { commitAutomaticLeadPatch } = await import("../lib/server/crm/field-ownership.ts");
const { prepareConversationProjectionEffects } = await import("../lib/server/crm/conversation-projection-effects.ts");
const { loadTenantPipelineConfig } = await import("../lib/server/crm/pipeline.ts");
const { conversationStageTransitionId, processConversationStageTransition, assertConversationStageAutomationSource } = await import("../lib/server/crm/conversation-stage-transition.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const { processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const { enqueueConversationCommercialObservation: enqueue, processConversationCommercialObservationJobs: processJobs, getTenantConversationCommercialObservationHealth: health } = await import("../lib/server/crm/conversation-observation-queue.ts");
const tenantId=`qa_commercial_context_${Date.now()}`;let sequence=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);assert.ok(["127.0.0.1","localhost"].includes(url.hostname),"No provider calls are allowed in commercial context QA");return originalFetch(input,init);};
after(async()=>{
  mock.restoreAll();globalThis.fetch=originalFetch;
  for(const collection of ["leads","contacts","chats","messages","tenant_settings","pipeline","lead_tasks","lead_notes","ai_logs","audit_logs","crm_conversation_observations","crm_observation_jobs","jobs","automations","tenant_entitlements","tenants","tenant_channels","chat_state","chat_outbound_jobs","chat_outbound_locks","ai_learning_outcomes","ai_tenant_learning_daily","lead_conversion_trails","tenant_usage_monthly"])for(const row of (await adminDb.collection(collection).where("tenantId","==",tenantId).get()).docs)await adminDb.recursiveDelete(row.ref);
  await adminDb.terminate();
});
async function fixture(multiple=false,sourceMessageId?:string){
  const id=`${tenantId}_${++sequence}`,lead=adminDb.collection("leads").doc(`${id}_original`),purchase=adminDb.collection("leads").doc(`${id}_purchase`),person=adminDb.collection("contacts").doc(`${id}_person`),chat=adminDb.collection("chats").doc(`${id}_chat`),message=adminDb.collection("messages").doc(sourceMessageId||`${id}_message`);
  await adminDb.collection("tenant_settings").doc(tenantId).set({tenantId,ai:{responsePaused:true}});
  await adminDb.collection("pipeline").doc(tenantId).set({tenantId,stages:[{id:"entrada",label:"Entrada"},{id:"proposta",label:"Proposta"},{id:"ganho",label:"Ganho",isTerminal:true}]});
  await lead.set({tenantId,contactId:person.id,nome:"Pessoa ficticia",pipelineStage:"ganho",potentialValue:4000,customFields:{humano:"Preservado"}});
  await person.set({tenantId,leadIds:[lead.id]});
  await chat.set({tenantId,leadId:lead.id,channel:"whatsapp"});
  await message.set({tenantId,chatId:chat.id,leadId:lead.id,sender:"client",text:"Meu orçamento é 2000 reais",createdAt:new Date(Date.now()-5000)});
  const input={tenantId,chatId:chat.id,messageId:message.id};
  const addPurchase=async()=>{await purchase.set({tenantId,recordKind:"opportunity",contactId:person.id,opportunitySourceLeadId:lead.id,pipelineStage:"entrada",potentialValue:9000});await person.update({leadIds:[lead.id,purchase.id]});};
  if(multiple)await addPurchase();return {lead,purchase,person,chat,message,input,addPurchase};
}

test("a single legacy record retains passive CRM observation",async()=>{
  const f=await fixture();assert.equal((await target(f.input)).ok,true);assert.equal((await observe(f.input)).observed,true);
  assert.equal((await f.lead.get()).data()?.customFields.orcamento,"2000 reais");
});

test("several purchases block both passive CRM writes and the reply agent before provider calls",async()=>{
  const f=await fixture(true),before=await f.lead.get(),purchase=await f.purchase.get();
  assert.deepEqual(await target(f.input),{ok:false,reason:"opportunity_context_required"});
  assert.equal((await observe(f.input)).reason,"opportunity_context_required");
  const result=await handleIncomingMessage(f.input);assert.equal(result.decision,"skip");assert.equal(result.reason,"opportunity_context_required");
  assert.ok((await f.lead.get()).updateTime!.isEqual(before.updateTime!));assert.ok((await f.purchase.get()).updateTime!.isEqual(purchase.updateTime!));
  assert.equal((await adminDb.collection("crm_conversation_observations").where("chatId","==",f.chat.id).get()).size,0);
});

test("an ambiguous observation is retained as pending context instead of falsely completed",async()=>{
  const f=await fixture(true),job=await enqueue(f.input),result=await processJobs({jobId:job.jobId});assert.equal(result.results[0].status,"awaiting_context");
  const row=(await adminDb.collection("crm_observation_jobs").doc(job.jobId).get()).data()!;assert.equal(row.status,"awaiting_context");assert.equal(row.completedAt,null);assert.equal(row.errorCode,"CRM_COMMERCIAL_CONTEXT_REQUIRED");
  assert.equal((await processJobs({jobId:job.jobId})).results[0].status,"skipped");assert.equal((await health(tenantId)).healthy,false);
});

async function beforeFacts(f:Awaited<ReturnType<typeof fixture>>,change:()=>Promise<void>){
  const {Query}=await import("firebase-admin/firestore"),original=Query.prototype.get;let injected=false;
  const hook=mock.method(Query.prototype,"get",async function(this:FirebaseFirestore.Query){const rows=await original.call(this);if(!injected&&rows.docs.some(doc=>doc.ref.path===f.message.path)){injected=true;await change();}return rows;});
  try{const result=await observe(f.input);assert.equal(injected,true);assert.equal(result.observed,false);assert.equal(result.reason,"conversation_commercial_context_changed");}
  finally{hook.mock.restore();}
  assert.equal((await f.lead.get()).data()?.customFields.orcamento,undefined);
}

test("a second purchase created after extraction invalidates the transactional facts write",async()=>{const f=await fixture();await beforeFacts(f,f.addPurchase);});
test("reusing a deleted lead id cannot authorize an old observation",async()=>{const f=await fixture(),data=(await f.lead.get()).data()!;await beforeFacts(f,async()=>{await f.lead.delete();await f.lead.set(data);});});
test("editing the source message during extraction invalidates its evidence",async()=>{const f=await fixture();await beforeFacts(f,async()=>{await f.message.update({text:"Mensagem corrigida"});});});
test("recreating a contact with the same id invalidates its previous identity generation",async()=>{const f=await fixture(),data=(await f.person.get()).data()!;await beforeFacts(f,async()=>{await f.person.delete();await f.person.set(data);});});
test("recreating a chat with the same id invalidates the previous conversation generation",async()=>{const f=await fixture(),data=(await f.chat.get()).data()!;await beforeFacts(f,async()=>{await f.chat.delete();await f.chat.set(data);});});
test("reassigning the same lead to another person's contact invalidates extracted facts",async()=>{const f=await fixture();await beforeFacts(f,async()=>{const other=adminDb.collection("contacts").doc(`${f.person.id}_other`);await other.set({tenantId,leadIds:[f.lead.id]});await f.lead.update({contactId:other.id});});});

test("a purchase created after facts commit prevents stale commercial derivation",async()=>{
  const f=await fixture(),original=adminDb.runTransaction;let injected=false;
  const hook=mock.method(adminDb,"runTransaction",async function(this:typeof adminDb,...args:Parameters<typeof original>){const result=await Reflect.apply(original,this,args);if(!injected&&result==="written"){injected=true;await f.addPurchase();}return result;});
  try{const result=await observe(f.input);assert.equal(injected,true);assert.equal(result.observed,false);assert.equal(result.reason,"conversation_commercial_context_changed");}
  finally{hook.mock.restore();}
  const row=(await f.lead.get()).data()!;assert.equal(row.customFields.orcamento,"2000 reais");assert.equal(row.commercialState,undefined);assert.equal(row.qualification,undefined);assert.equal(row.pipelineStage,"ganho");
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId","==",tenantId).where("leadId","==",f.lead.id).get()).size,0);
});

test("canonical contact links cannot escape the company or silently drop reciprocity",async()=>{
  const f=await fixture();await f.person.update({leadIds:[]});assert.deepEqual(await target(f.input),{ok:false,reason:"contact_identity_review"});
  await f.person.update({leadIds:[f.lead.id,"../invalid"]});assert.deepEqual(await target(f.input),{ok:false,reason:"contact_identity_review"});
  await f.person.update({leadIds:"invalid-list"});assert.deepEqual(await target(f.input),{ok:false,reason:"contact_identity_review"});
  await f.person.update({leadIds:[f.lead.id],canonicalContactId:"../invalid"});assert.deepEqual(await target(f.input),{ok:false,reason:"contact_identity_review"});
  await f.person.update({canonicalContactId:f.person.id,tenantId:"another-company"});
  try{assert.deepEqual(await target(f.input),{ok:false,reason:"contact_identity_review"});}finally{await f.person.update({tenantId});}
});

async function projectionFixture(sourceMessageId?:string){
  const f=await fixture(false,sourceMessageId);await f.lead.update({pipelineStage:"entrada",origem:f.lead.id,ownerId:"qa-assigned-seller",owner:"Vendedora ficticia"});
  const commercial=await target(f.input);assert.ok(commercial.ok);const message=await f.message.get(),snapshot=await f.lead.get();
  const fence={...f.input,leadId:f.lead.id,leadGeneration:commercial.generation,chatGeneration:commercial.chatGeneration,contactId:commercial.contactId,contactGeneration:commercial.contactGeneration,messageVersion:message.updateTime!};
  const task={title:"Confirmar proposta",type:"follow_up",priority:"high",dueAt:new Date(Date.now()+3600_000),reasonCode:"qa_projection_followup",taskKey:"qa_followup:proposta"};
  const plan={fence,stages:(await loadTenantPipelineConfig(tenantId)).stages,tasks:[task],actorId:"crm_observer",actorName:"Altum ficticia",stageChange:{previous:"entrada",next:"proposta"}};
  const commit=async(expectedVersion=snapshot.updateTime!)=>commitAutomaticLeadPatch({tenantId,leadId:f.lead.id,expectedVersion,patch:{pipelineStage:"proposta",stage:"proposta",score:75},verifyContext:tx=>matchesConversationCommercialFence(tx,fence),prepareEffects:(tx,lead)=>prepareConversationProjectionEffects(tx,lead,plan)});
  return {...f,fence,task,plan,snapshot,commit};
}

test("projection, stage history, task and task history share one atomic commit and real responsibility",async()=>{
  const f=await projectionFixture();assert.equal(await f.commit(),true);
  const lead=await f.lead.get(),tasks=await adminDb.collection("lead_tasks").where("tenantId","==",tenantId).where("leadId","==",f.lead.id).get();assert.equal(tasks.size,1);
  const task=tasks.docs[0],row=task.data();assert.ok(task.createTime.isEqual(lead.updateTime!));assert.equal(row.ownerUserId,"qa-assigned-seller");assert.equal(row.version,1);assert.equal(row.sourceMessageId,f.message.id);assert.equal(row.sourceChatId,f.chat.id);
  const events=await f.lead.collection("events").get();assert.equal(events.size,2);for(const event of events.docs)assert.ok(event.createTime.isEqual(lead.updateTime!));
});

test("a task history write failure rolls back the projection, stage, task and both histories",async()=>{
  const f=await projectionFixture(),{Transaction}=await import("firebase-admin/firestore"),original=Transaction.prototype.create;
  const hook=mock.method(Transaction.prototype,"create",function(this:FirebaseFirestore.Transaction,...args:Parameters<typeof original>){if(args[0].path.includes("/events/task_created_crm_observation_task_"))throw new Error("QA_PROJECTION_EVENT_FAILURE");return original.apply(this,args);});
  try{await assert.rejects(f.commit(),/QA_PROJECTION_EVENT_FAILURE/);}finally{hook.mock.restore();}
  assert.ok((await f.lead.get()).updateTime!.isEqual(f.snapshot.updateTime!));assert.equal((await f.lead.collection("events").get()).size,0);assert.equal((await adminDb.collection("lead_tasks").where("tenantId","==",tenantId).where("leadId","==",f.lead.id).get()).size,0);
  assert.equal((await adminDb.collection("jobs").doc(conversationStageTransitionId(f.fence)).get()).exists,false);
});

test("concurrent projections based on the same source cannot create duplicate returns or events",async()=>{
  const f=await projectionFixture(),results=await Promise.all([f.commit(),f.commit(),f.commit()]);assert.equal(results.filter(Boolean).length,1);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId","==",tenantId).where("leadId","==",f.lead.id).get()).size,1);assert.equal((await f.lead.collection("events").get()).size,2);
});

test("a completed and rescheduled return is preserved when its source projection retries",async()=>{
  const f=await projectionFixture();assert.equal(await f.commit(),true);const task=(await adminDb.collection("lead_tasks").where("tenantId","==",tenantId).where("leadId","==",f.lead.id).get()).docs[0];
  await task.ref.update({title:"Titulo humano",status:"done",version:2,dueAt:new Date("2027-02-12T13:00:00Z"),source:"manual"});const edited=await task.ref.get();
  assert.equal(await f.commit((await f.lead.get()).updateTime!),true);assert.ok((await task.ref.get()).updateTime!.isEqual(edited.updateTime!));assert.equal((await f.lead.collection("events").get()).size,2);
});

test("pending return deduplication covers older tasks beyond the former first 24",async()=>{
  const f=await projectionFixture(),batch=adminDb.batch();for(let index=0;index<26;index++)batch.set(adminDb.collection("lead_tasks").doc(`${f.lead.id}_legacy_${index}`),{tenantId,leadId:f.lead.id,status:"pending",taskKey:index===25?f.task.taskKey:`other_${index}`,reasonCode:`other_${index}`});await batch.commit();
  assert.equal(await f.commit(),true);assert.equal((await adminDb.collection("lead_tasks").where("tenantId","==",tenantId).where("leadId","==",f.lead.id).get()).size,26);assert.equal((await f.lead.collection("events").get()).size,1);
});

test("a changed funnel invalidates the whole prepared projection before creating a return",async()=>{
  const f=await projectionFixture();await adminDb.collection("pipeline").doc(tenantId).update({stages:[{id:"entrada",label:"Entrada"},{id:"revisao",label:"Revisao"},{id:"ganho",label:"Ganho",isTerminal:true}]});
  assert.equal(await f.commit(),false);assert.ok((await f.lead.get()).updateTime!.isEqual(f.snapshot.updateTime!));assert.equal((await f.lead.collection("events").get()).size,0);
});

test("a new purchase rejects the task plan in the same transaction as its projection",async()=>{
  const f=await projectionFixture();await f.addPurchase();assert.equal(await f.commit(),false);assert.ok((await f.lead.get()).updateTime!.isEqual(f.snapshot.updateTime!));assert.equal((await f.lead.collection("events").get()).size,0);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId","==",tenantId).where("leadId","==",f.lead.id).get()).size,0);
});

test("the real passive observer creates its return in the projection commit",async()=>{
  const f=await fixture();await f.lead.update({pipelineStage:"entrada",ownerId:"qa-assigned-seller"});const result=await observe(f.input);assert.equal(result.observed,true);
  const lead=await f.lead.get(),tasks=await adminDb.collection("lead_tasks").where("tenantId","==",tenantId).where("leadId","==",f.lead.id).get();assert.ok(tasks.size>0);
  for(const task of tasks.docs){assert.ok(task.createTime.isEqual(lead.updateTime!));assert.equal(task.data().ownerUserId,"qa-assigned-seller");}
});

async function stageFixture(actions:Array<Record<string,unknown>>=[{type:"create_task",title:"Retorno da regra comercial"}]){
  const f=await projectionFixture(),automation=adminDb.collection("automations").doc(`${f.lead.id}_rule`);
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({tenantId,mode:"custom",modules:{crm:true},limits:{}});
  await automation.set({tenantId,name:"Regra ficticia",trigger:"lead_stage_changed",enabled:true,status:"active",conditions:{sourceIn:[f.lead.id]},actions});
  assert.equal(await f.commit(),true);const root=adminDb.collection("jobs").doc(conversationStageTransitionId(f.fence));assert.equal((await root.get()).data()?.status,"ready");
  return {...f,root,automation};
}
async function ruleTasks(f:Awaited<ReturnType<typeof stageFixture>>){return (await adminDb.collection("lead_tasks").where("tenantId","==",tenantId).where("leadId","==",f.lead.id).get()).docs.filter(doc=>doc.data().title==="Retorno da regra comercial");}

test("a committed conversation stage retains a durable effect source before any worker runs",async()=>{
  const f=await stageFixture(),row=(await f.root.get()).data()!;assert.equal(row.conversationFence.messageId,f.message.id);assert.equal(row.previousStage,"entrada");assert.equal(row.nextStage,"proposta");
  assert.equal((await f.lead.get()).data()?.aiCommercialStageTransitionId,f.root.id);assert.equal((await ruleTasks(f)).length,0);
});

test("the real periodic worker recovers the committed projection and registers its rule exactly once",async()=>{
  const f=await stageFixture(),before=await f.lead.get();await processPendingAutomationActions({tenantId,limit:20});assert.equal((await f.root.get()).data()?.status,"done");assert.equal((await ruleTasks(f)).length,1);
  assert.equal((await processConversationStageTransition(f.root.id,tenantId)).processed,false);assert.equal((await ruleTasks(f)).length,1);
  assert.equal((await f.lead.get()).data()?.pipelineStage,before.data()?.pipelineStage);
  await adminDb.runTransaction(tx=>assertConversationStageAutomationSource(tx,{id:f.root.id,tenantId,leadId:f.lead.id,delivery:true}),{readOnly:true});
});

test("concurrent stage consumers register a single effect and preserve the projection",async()=>{
  const f=await stageFixture();await Promise.all([processConversationStageTransition(f.root.id,tenantId),processConversationStageTransition(f.root.id,tenantId)]);
  assert.equal((await f.root.get()).data()?.status,"done");assert.equal((await f.root.get()).data()?.attempts,1);assert.equal((await ruleTasks(f)).length,1);
});

test("context, message, source event, owner, human stage and module revocations stop pending stage effects",async()=>{
  for(const change of ["new_purchase","message","event","owner","manual_stage","module"]){
    const f=await stageFixture();
    if(change==="new_purchase")await f.addPurchase();
    if(change==="message")await f.message.update({text:"Texto corrigido"});
    if(change==="event")await f.lead.collection("events").doc((await f.root.get()).data()!.sourceEventId).delete();
    if(change==="owner")await f.lead.update({ownerId:"another-seller"});
    if(change==="manual_stage")await f.lead.update({crmFieldOwnership:{pipelineStage:{source:"manual",locked:true}}});
    if(change==="module")await adminDb.collection("tenant_entitlements").doc(tenantId).update({"modules.crm":false});
    try{assert.equal((await processConversationStageTransition(f.root.id,tenantId)).processed,false,change);assert.equal((await f.root.get()).data()?.status,"reconciliation_required",change);assert.equal((await ruleTasks(f)).length,0,change);}
    finally{if(change==="module")await adminDb.collection("tenant_entitlements").doc(tenantId).update({"modules.crm":true});}
  }
});

test("a context change after accepting the rule blocks its subsequent effects",async()=>{
  const f=await stageFixture(),original=adminDb.runTransaction;let injected=false;
  // Freeze/accept the rule, then change context before any subsequent effect tx.
  const hook=mock.method(adminDb,"runTransaction",async function(this:typeof adminDb,...args:Parameters<typeof original>){const result=await Reflect.apply(original,this,args);if(!injected&&Array.isArray(result)&&result.some(row=>row?.id===f.automation.id)){injected=true;await f.addPurchase();}return result;});
  try{await processConversationStageTransition(f.root.id,tenantId);assert.equal(injected,true);assert.equal((await ruleTasks(f)).length,0);assert.equal((await f.root.get()).data()?.status,"reconciliation_required");}
  finally{hook.mock.restore();}
});

test("expired stage ownership is quarantined without blindly repeating uncertain effects",async()=>{
  const f=await stageFixture();await f.root.update({status:"processing",claimToken:"abandoned-worker",leaseUntil:new Date(0)});
  assert.equal((await processConversationStageTransition(f.root.id,tenantId)).processed,false);assert.equal((await f.root.get()).data()?.status,"reconciliation_required");assert.equal((await ruleTasks(f)).length,0);
});

async function queuedStageMessage(waitInHours=0){
  const f=await stageFixture([{type:"send_message",text:"Acompanhamento ficticio",waitInHours}]),channel=adminDb.collection("tenant_channels").doc(`${f.chat.id}_channel`);
  await channel.set({tenantId,type:"whatsapp",provider:"meta_whatsapp",status:"active",phoneNumberId:"qa-conversation-stage-number",accessToken:"qa-local-only"});
  await f.chat.update({channelId:channel.id,contactPhone:"5511000000099",lastClientMessageAt:new Date()});
  assert.equal((await processConversationStageTransition(f.root.id,tenantId)).completed,true);return f;
}
async function outbox(f:Awaited<ReturnType<typeof stageFixture>>){const rows=await adminDb.collection("chat_outbound_jobs").where("tenantId","==",tenantId).where("chatId","==",f.chat.id).get();assert.equal(rows.size,1);return rows.docs[0].ref;}
async function deliverStage(jobId:string){
  const previous=globalThis.fetch;let calls=0;
  globalThis.fetch=(input,init)=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(["127.0.0.1","localhost"].includes(url.hostname))return previous(input,init);assert.equal(url.hostname,"graph.facebook.com");assert.match(url.pathname,/\/qa-conversation-stage-number\/messages$/);calls++;return Promise.resolve(Response.json({messages:[{id:`wamid.qa-conversation-${jobId}`}]}));};
  try{await processChatOutboundJobs({jobId});}finally{globalThis.fetch=previous;}return calls;
}

test("conversation stage messages use the guarded outbox and simulated provider exactly once",async()=>{
  const f=await queuedStageMessage(),job=await outbox(f);assert.equal((await job.get()).data()?.stageAutomationSourceKind,"conversation");assert.equal((await job.get()).data()?.providerAttemptStartedAt,undefined);
  assert.equal(await deliverStage(job.id),1);assert.equal((await job.get()).data()?.status,"completed");assert.equal(await deliverStage(job.id),0);
});

test("a second purchase after enqueue revokes the queued message before any provider attempt",async()=>{
  const f=await queuedStageMessage(),job=await outbox(f);await f.addPurchase();assert.equal(await deliverStage(job.id),0);const row=(await job.get()).data()!;assert.equal(row.status,"dead_letter");assert.equal(row.providerAttemptStartedAt,undefined);
});

test("a still-valid original deadline cannot authorize delayed messages or tasks after context changes",async()=>{
  for(const type of ["send_message","create_task"]){
    const f=type==="send_message"?await queuedStageMessage(0.000001):await stageFixture([{type:"create_task",title:"Retorno da regra comercial",waitInHours:0.000001}]);
    if(type==="create_task")assert.equal((await processConversationStageTransition(f.root.id,tenantId)).completed,true);
    const rows=await adminDb.collection("jobs").where("tenantId","==",tenantId).where("stageSourceId","==",f.root.id).get(),scheduled=rows.docs.filter(doc=>doc.data().type==="automation_scheduled_action");assert.equal(scheduled.length,1);
    const deadline=scheduled[0].data().executeAfter.toMillis();await f.addPurchase();await processPendingAutomationActions({tenantId,limit:50});
    assert.equal((await scheduled[0].ref.get()).data()?.status,"reconciliation_required");assert.equal((await scheduled[0].ref.get()).data()?.executeAfter.toMillis(),deadline);
    assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId","==",tenantId).where("chatId","==",f.chat.id).get()).size,0);assert.equal((await ruleTasks(f)).length,0);
  }
});

test("delayed internal stage actions retain the conversation source and commit once",async()=>{
  const f=await stageFixture([{type:"create_task",title:"Retorno da regra comercial",waitInHours:0.000001}]);assert.equal((await processConversationStageTransition(f.root.id,tenantId)).completed,true);
  await processPendingAutomationActions({tenantId,limit:50});assert.equal((await ruleTasks(f)).length,1);await processPendingAutomationActions({tenantId,limit:50});assert.equal((await ruleTasks(f)).length,1);
});

test("the effect source accepts the observer's full 240-character message id contract",async()=>{
  const messageId=`${tenantId}_long_message_`.padEnd(240,"x"),f=await projectionFixture(messageId);assert.equal(await f.commit(),true);
  const result=await processConversationStageTransition(conversationStageTransitionId(f.fence),tenantId);assert.equal(result.completed,true);
});

for (const changed of ["none", "message", "progress", "expired", "learning", "trail"] as const) test(`causal receipt recovery conversation ${changed}`, async () => {
  const f = await stageFixture([{ type: "create_task", title: "Retorno da regra comercial", sequenceOrder: 1 }, { type: "add_note", text: "Nota restante", sequenceOrder: 2 }]);
  const { loseStageHookAcknowledgement } = await import("./fixtures/stage-hook-ack-fault.mts");
  await loseStageHookAcknowledgement(adminDb, changed === "learning" ? "ai_learning_outcomes" : changed === "trail" ? "lead_conversion_trails" : "jobs", () => processConversationStageTransition(f.root.id, tenantId));
  const before = (await f.root.get()).data()!, tasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("stageSourceId", "==", f.root.id).get();
  const originalTask = (await tasks()).docs; assert.equal(originalTask.length, 1); await originalTask[0].ref.update({ title: "Edicao humana" });
  if (changed === "message") await f.message.update({ text: "Mensagem corrigida" });
  if (changed === "progress") { const { FieldValue } = await import("firebase-admin/firestore"); await f.root.update({ stageHookProgress: FieldValue.delete() }); }
  if (changed === "expired") await f.root.update({ status: "processing", claimToken: "qa-old-conversation", leaseUntil: new Date(0) });
  await Promise.all([processConversationStageTransition(f.root.id, tenantId), processConversationStageTransition(f.root.id, tenantId)]);
  const recover = !["message", "progress"].includes(changed), final = (await f.root.get()).data()!;
  assert.equal(final.status, recover ? "done" : "reconciliation_required");
  assert.equal((await tasks()).size, 1); assert.equal((await originalTask[0].ref.get()).data()?.title, "Edicao humana");
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get()).size, recover ? 1 : 0);
  assert.deepEqual(final.stageUsageReservations, before.stageUsageReservations);
  if (recover) { const trails = await adminDb.collection("lead_conversion_trails").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get(); assert.equal(trails.size, 1); assert.equal(trails.docs[0].data().occurrences, 1); }
});
