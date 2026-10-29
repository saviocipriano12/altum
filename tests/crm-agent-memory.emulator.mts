import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env,{FIREBASE_PROJECT_ID:"demo-altum-qa-lab",NEXT_PUBLIC_FIREBASE_PROJECT_ID:"demo-altum-qa-lab",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080",FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9099",FIREBASE_SERVICE_ACCOUNT_KEY:"",FIREBASE_CLIENT_EMAIL:"",FIREBASE_PRIVATE_KEY:"",GOOGLE_APPLICATION_CREDENTIALS:"",OPENAI_API_KEY:""});
const {adminDb}=await import("../app/lib/server/firebase-admin.ts");
const {upsertLeadMemory:save,getLeadMemory:read,getLeadMemoryDocId}=await import("../lib/server/ai/runtime-state.ts");
const {getUnambiguousConversationLead:target,matchesConversationCommercialFence:matches}=await import("../lib/server/crm/conversation-commercial-context.ts");
const {loadInboundEnrichmentSource:load,commitInboundMessageEnrichment:commit}=await import("../lib/server/ai/inbound-enrichment-write.ts");
const {enrichInboundMessageForAgent:enrich}=await import("../lib/server/ai/multimodal.ts");
const {handleIncomingMessage}=await import("../lib/server/ai/agent.ts");
const tenantId=`qa_agent_memory_${Date.now()}`,foreign=`${tenantId}_foreign`;let sequence=0,externalAttempts=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(!["127.0.0.1","localhost"].includes(url.hostname)){externalAttempts++;assert.fail("No external model/media/channel calls allowed in memory QA");}return originalFetch(input,init);};
after(async()=>{
  mock.restoreAll();globalThis.fetch=originalFetch;
  for(const collection of ["leads","contacts","messages","chats","ai_lead_memory","tenant_settings","pipeline","chat_state","ai_conversation_state","ai_conversation_turns","ai_logs","lead_tasks","ai_action_approvals","ai_action_executions","tenant_usage_monthly","ai_usage_monthly","ai_usage_ledger","tenant_channels"]){const rows=await adminDb.collection(collection).where("tenantId","in",[tenantId,foreign]).get();for(const row of rows.docs)await adminDb.recursiveDelete(row.ref);}
  await adminDb.terminate();
  assert.equal(externalAttempts,0,"No caught exception may hide an external transport attempt");
});
async function fixture(type="text",longId=false){
  const id=`${tenantId}_${++sequence}`,lead=adminDb.collection("leads").doc(`${id}_lead`),person=adminDb.collection("contacts").doc(`${id}_person`),chat=adminDb.collection("chats").doc(`${id}_chat`),message=adminDb.collection("messages").doc(longId?`${id}_message_`.padEnd(240,"x"):`${id}_message`),memory=adminDb.collection("ai_lead_memory").doc(getLeadMemoryDocId(tenantId,lead.id));
  await adminDb.collection("tenant_settings").doc(tenantId).set({tenantId,ai:{responsePaused:true,rollout:{mode:"automatic",rolloutPercent:100}}});
  await lead.set({tenantId,nome:"Pessoa ficticia",contactId:person.id,pipelineStage:"entrada"});await person.set({tenantId,leadIds:[lead.id]});await chat.set({tenantId,leadId:lead.id,channel:"whatsapp"});
  await message.set({tenantId,chatId:chat.id,leadId:lead.id,type,sender:"client",text:"Somos uma clinica odontologica",createdAt:new Date()});
  const input={tenantId,chatId:chat.id,messageId:message.id};
  const capture=async()=>{const t=await target(input);assert.ok(t.ok);const snap=await message.get();return {...input,leadId:lead.id,leadGeneration:t.generation,chatGeneration:t.chatGeneration,contactId:t.contactId,contactGeneration:t.contactGeneration,messageVersion:snap.updateTime!};};
  const fence=await capture(),source=await message.get(),row=source.data()!;
  const memoryInput={tenantId,leadId:lead.id,sourceMessageId:message.id,sourceOccurredAtMs:Date.now(),inboundText:row.text,extractedFields:{businessType:"clinica odontologica"},conversationFence:fence};
  const addPurchase=async()=>{const other=adminDb.collection("leads").doc(`${id}_purchase`);await other.set({tenantId,recordKind:"opportunity",contactId:person.id});await person.update({leadIds:[lead.id,other.id]});};
  return {lead,person,chat,message,memory,input,fence,source,row,capture,memoryInput,addPurchase};
}

test("a current memory observation records its parent generation and complete 240-character evidence id",async()=>{
  const f=await fixture("text",true);assert.equal((await save(f.memoryInput)).applied,true);const raw=(await f.memory.get()).data()!;assert.ok(raw.leadGeneration.isEqual(f.fence.leadGeneration));assert.equal(raw.relationshipUpdate.sourceMessageId,f.message.id);
  const memory=await read(tenantId,f.lead.id);assert.equal(memory?.businessType,"clinica odontologica");assert.equal(memory?.relationshipState?.facts.businessType.sourceMessageId,f.message.id);
});
test("a second purchase during analysis prevents a late memory write",async()=>{const f=await fixture();await f.addPurchase();const result=await save(f.memoryInput);assert.equal(result.applied,false);assert.equal(result.reason,"commercial_context_changed");assert.equal((await f.memory.get()).exists,false);});
test("a source correction preserves existing memory instead of applying the stale model result",async()=>{const f=await fixture();await save(f.memoryInput);const before=await f.memory.get();await f.message.update({text:"Corrigindo: somos uma loja"});assert.equal((await save({...f.memoryInput,extractedFields:{businessType:"loja"}})).applied,false);assert.ok((await f.memory.get()).updateTime!.isEqual(before.updateTime!));});
test("recreated CRM records cannot inherit or overwrite the former generation's memory",async()=>{const f=await fixture();await save(f.memoryInput);const before=await f.memory.get(),row=(await f.lead.get()).data()!;await f.lead.delete();await f.lead.set(row);assert.equal(await read(tenantId,f.lead.id),null);assert.equal((await save(f.memoryInput)).reason,"commercial_context_changed");assert.equal((await save({...f.memoryInput,conversationFence:await f.capture()})).reason,"memory_generation_conflict");assert.ok((await f.memory.get()).updateTime!.isEqual(before.updateTime!));});
test("a memory key with another company's metadata is neither read nor overwritten",async()=>{const f=await fixture();await f.memory.set({tenantId:foreign,leadId:f.lead.id,businessType:"Dado de outro cadastro"});const before=await f.memory.get();assert.equal(await read(tenantId,f.lead.id),null);assert.equal((await save(f.memoryInput)).reason,"memory_identity_conflict");assert.ok((await f.memory.get()).updateTime!.isEqual(before.updateTime!));});
test("legacy memory older than a recreated parent requires review",async()=>{const f=await fixture();const {conversationFence,...legacy}=f.memoryInput;void conversationFence;await save(legacy);const row=(await f.lead.get()).data()!;await f.lead.delete();await f.lead.set(row);assert.equal(await read(tenantId,f.lead.id),null);assert.equal((await save({...f.memoryInput,conversationFence:await f.capture()})).reason,"memory_generation_conflict");});
test("legacy memory created under the current parent remains compatible with guarded updates",async()=>{const f=await fixture();const {conversationFence,...legacy}=f.memoryInput;void conversationFence;await save(legacy);const result=await save({...f.memoryInput,sourceOccurredAtMs:Date.now()+1000,extractedFields:{businessType:"clinica odontologica",primaryGoal:"Agendar visitas"}});assert.equal(result.applied,true);assert.ok((await f.memory.get()).data()?.leadGeneration.isEqual(f.fence.leadGeneration));});

test("a valid video enrichment advances only its own revision and the memory accepts that fence",async()=>{
  const f=await fixture("video"),result=await enrich({...f.input,message:f.row,conversationFence:f.fence});assert.equal(result.source,"video");assert.ok(result.conversationFence);assert.equal(await adminDb.runTransaction(tx=>matches(tx,f.fence),{readOnly:true}),false);
  assert.equal(await adminDb.runTransaction(tx=>matches(tx,result.conversationFence!),{readOnly:true}),true);assert.equal((await f.message.get()).data()?.text,f.row.text);assert.equal((await save({...f.memoryInput,conversationFence:result.conversationFence})).applied,true);
});
test("an unreadable audio retains a guarded fallback without making an external call",async()=>{const f=await fixture("audio"),result=await enrich({...f.input,message:f.row,conversationFence:f.fence});assert.equal(result.source,"fallback");assert.ok(result.conversationFence);assert.equal(await adminDb.runTransaction(tx=>matches(tx,result.conversationFence!),{readOnly:true}),true);});
test("cached enrichment retains the caller's unchanged evidence revision",async()=>{const f=await fixture("video");await enrich({...f.input,message:f.row,conversationFence:f.fence});const fence=await f.capture(),row=(await f.message.get()).data()!;const result=await enrich({...f.input,message:row,conversationFence:fence});assert.equal(result.source,"cached");assert.ok(result.conversationFence?.messageVersion.isEqual(fence.messageVersion));});
test("stale supplied content is rejected before enrichment begins",async()=>{const f=await fixture("video");assert.equal(await load({...f.input,message:{...f.row,text:"Texto nao persistido"},conversationFence:f.fence}),null);});
test("an enrichment cannot rewrite message content or authority metadata",async()=>{const f=await fixture("video");await assert.rejects(commit({...f.input,source:f.source,conversationFence:f.fence,patch:{text:"Sobrescrita indevida"}}),/PATCH_INVALID/);assert.ok((await f.message.get()).updateTime!.isEqual(f.source.updateTime!));});
test("editing or recreating the source prevents annotation writes",async()=>{for(const change of ["edit","recreate","delete"]){const f=await fixture("video");if(change==="edit")await f.message.update({text:"Texto humano novo"});if(change==="recreate"){await f.message.delete();await f.message.set(f.row);}if(change==="delete")await f.message.delete();const before=await f.message.get();assert.equal((await commit({...f.input,source:f.source,conversationFence:f.fence,patch:{aiNormalizedText:"Antigo"}})).applied,false);const after=await f.message.get();assert.equal(after.exists,before.exists);if(before.exists)assert.ok(after.updateTime!.isEqual(before.updateTime!));}});
test("legacy enrichment without a commercial fence still preserves the source generation",async()=>{const f=await fixture("video");await f.message.delete();await f.message.set(f.row);assert.equal((await commit({...f.input,source:f.source,patch:{aiNormalizedText:"Antigo"}})).applied,false);});
test("media preflight with an ambiguous opportunity never adds an annotation",async()=>{const f=await fixture("video");await f.addPurchase();const before=await f.message.get(),result=await enrich({...f.input,message:f.row,conversationFence:f.fence});assert.equal(result.source,"context_changed");assert.equal(result.conversationFence,undefined);assert.ok((await f.message.get()).updateTime!.isEqual(before.updateTime!));});

test("a post-commit source edit cannot be rebased as the agent's own annotation",async()=>{
  const f=await fixture("video"),{DocumentReference}=await import("firebase-admin/firestore"),original=DocumentReference.prototype.get;let injected=false;
  const hook=mock.method(DocumentReference.prototype,"get",async function(this:FirebaseFirestore.DocumentReference,...args:Parameters<typeof original>){const snap=await original.apply(this,args);if(!injected&&this.path===f.message.path&&snap.data()?.aiMediaWriteToken){injected=true;await this.update({text:"Edicao humana apos a transcricao"});}return snap;});
  try{const result=await commit({...f.input,source:f.source,conversationFence:f.fence,patch:{aiNormalizedText:"Descricao da mensagem original"}});assert.equal(injected,true);assert.equal(result.applied,false);}finally{hook.mock.restore();}
  assert.equal((await f.message.get()).data()?.text,"Edicao humana apos a transcricao");
});
test("the real inbound agent stops before memory or model actions when context changes during media processing",async()=>{
  const f=await fixture("video"),{DocumentReference}=await import("firebase-admin/firestore"),original=DocumentReference.prototype.get;let injected=false;
  const hook=mock.method(DocumentReference.prototype,"get",async function(this:FirebaseFirestore.DocumentReference,...args:Parameters<typeof original>){const snap=await original.apply(this,args);if(!injected&&this.path===f.message.path&&snap.data()?.aiMediaWriteToken){injected=true;await f.addPurchase();}return snap;});
  try{const result=await handleIncomingMessage(f.input);assert.equal(injected,true);assert.equal(result.reason,"conversation_commercial_context_changed");assert.equal((await f.memory.get()).exists,false);}finally{hook.mock.restore();}
});

async function pausedChannel(f:Awaited<ReturnType<typeof fixture>>){
  const channel=adminDb.collection("tenant_channels").doc(`${f.chat.id}_channel`);await channel.set({tenantId,type:"whatsapp",provider:"meta_whatsapp",status:"active",phoneNumberId:"qa-memory-number",accessToken:"qa-local-only"});await f.chat.update({channelId:channel.id,contactPhone:"5511000000123",lastClientMessageAt:new Date()});
  await adminDb.collection("tenant_settings").doc(tenantId).update({"ai.businessSummary":"Clinica ficticia para testes locais","ai.operatingProfile":{preferredProviders:["altum_rules"]}});
}
test("the real paused agent still records valid text and media memory with its captured context",async()=>{
  for(const type of ["text","video"]){const f=await fixture(type);await pausedChannel(f);const result=await handleIncomingMessage(f.input);assert.equal(result.reason,"tenant_ai_response_paused");const row=(await f.memory.get()).data()!;assert.ok(row);assert.ok(row.leadGeneration.isEqual(f.fence.leadGeneration));assert.equal(row.relationshipUpdate.sourceMessageId,f.message.id);}
});

test("the real paused agent cannot persist a result after a new purchase appears during context retrieval",async()=>{
  const f=await fixture();await pausedChannel(f);const {DocumentReference}=await import("firebase-admin/firestore"),original=DocumentReference.prototype.get;let injected=false;
  const hook=mock.method(DocumentReference.prototype,"get",async function(this:FirebaseFirestore.DocumentReference,...args:Parameters<typeof original>){const snap=await original.apply(this,args);if(!injected&&this.path===f.memory.path){injected=true;await f.addPurchase();}return snap;});
  try{const result=await handleIncomingMessage(f.input);assert.equal(injected,true);assert.equal(result.reason,"tenant_ai_response_paused");assert.equal((await f.memory.get()).exists,false);}finally{hook.mock.restore();}
});
