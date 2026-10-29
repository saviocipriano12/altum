import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env,{FIREBASE_PROJECT_ID:"demo-altum-qa-lab",NEXT_PUBLIC_FIREBASE_PROJECT_ID:"demo-altum-qa-lab",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080",FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9099",FIREBASE_SERVICE_ACCOUNT_KEY:"",FIREBASE_CLIENT_EMAIL:"",FIREBASE_PRIVATE_KEY:"",GOOGLE_APPLICATION_CREDENTIALS:""});
const {adminDb}=await import("../app/lib/server/firebase-admin.ts");
const {handleMetaSocialEvent}=await import("../lib/server/social/service.ts");
const {processPendingAutomationActions}=await import("../lib/server/automations.ts");
const tenants:string[]=[],originalFetch=globalThis.fetch;
globalThis.fetch=(url,init)=>{const host=new URL(typeof url==="string"?url:url instanceof URL?url.href:url.url).hostname;assert.ok(["127.0.0.1","localhost"].includes(host),"No external social or model calls");return originalFetch(url,init);};
after(async()=>{
  mock.restoreAll();globalThis.fetch=originalFetch;
  for(const tenantId of tenants)for(const collection of ["leads","chats","messages","automations","jobs","lead_tasks","lead_notes","tenant_usage_monthly","tenant_entitlements","tenant_settings","pipeline","tenant_channels","social_automations","social_automation_logs","social_automation_contacts","contact_profiles","contacts","contact_identity_aliases","lead_identities","ai_logs","ai_learning_outcomes","ai_tenant_learning_daily","crm_observation_jobs","audit_logs"]){for(const doc of(await adminDb.collection(collection).where("tenantId","==",tenantId).get()).docs){assert.ok(tenantId.startsWith("qa_social_event_"));await adminDb.recursiveDelete(doc.ref);}}
  await adminDb.terminate();
});
async function fixture(){
  const tenantId=`qa_social_event_${randomUUID()}`;tenants.push(tenantId);
  const channel={id:`${tenantId}_channel`,tenantId,type:"instagram" as const,provider:"instagram",accessToken:"qa-only",externalAccountId:`${tenantId}_account`};
  await adminDb.collection("tenant_channels").doc(channel.id).set({...channel,status:"active"});
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({tenantId,mode:"custom",modules:{crm:true},limits:{}});
  await adminDb.collection("pipeline").doc(tenantId).set({tenantId,stages:[{id:"captado",label:"Entrada"},{id:"proposta",label:"Proposta"},{id:"ganho",label:"Ganho",isTerminal:true}]});
  await adminDb.collection("social_automations").doc(tenantId).set({tenantId,enabled:true,commentAutoReply:false,commentRules:[],activeHours:{timezone:"UTC",start:"00:00",end:"00:00",days:[0,1,2,3,4,5,6]}});
  const event={eventId:`${tenantId}_event`,eventType:"comment" as const,channelType:"instagram" as const,entryId:channel.externalAccountId,actorId:`${tenantId}_person`,actorName:"Pessoa ficticia",actorUsername:"qa",text:"Ola",commentId:`${tenantId}_comment`,postId:"qa-post",timestamp:null,field:"comments"};
  const automation=adminDb.collection("automations").doc(`${tenantId}_automation`);
  await automation.set({tenantId,name:"Atendimento social",trigger:"message_received",enabled:true,status:"active",conditions:{},actions:[{type:"create_task",title:"Tarefa do evento",sequenceOrder:1},{type:"add_note",text:"Nota restante",sequenceOrder:2}]});
  return {tenantId,channel,event,automation,tasks:()=>adminDb.collection("lead_tasks").where("tenantId","==",tenantId).where("source","==","tenant_automation").get(),notes:()=>adminDb.collection("lead_notes").where("tenantId","==",tenantId).get()};
}
test("social event partial automation resumes remaining effects from the durable event without a fake client message",async()=>{
  const f=await fixture(),{DocumentReference}=await import("firebase-admin/firestore"),originalCreate=DocumentReference.prototype.create,originalTx=adminDb.runTransaction;
  let injected=false;
  const create=mock.method(DocumentReference.prototype,"create",async function(this:FirebaseFirestore.DocumentReference,...args:Parameters<typeof originalCreate>){const result=await Reflect.apply(originalCreate,this,args);if(!injected&&this.parent.id==="lead_tasks"&&args[0].source==="tenant_automation"){injected=true;throw new Error("QA_SOCIAL_TASK_ACK_LOST");}return result;});
  const tx=mock.method(adminDb,"runTransaction",async function(this:typeof adminDb,...args:Parameters<typeof originalTx>){const result=await Reflect.apply(originalTx,this,args);if(!injected&&(await f.tasks()).size===1){injected=true;throw new Error("QA_SOCIAL_TASK_ACK_LOST");}return result;});
  try{await handleMetaSocialEvent(f);}finally{create.mock.restore();tx.mock.restore();}
  assert.ok(injected);const first=(await f.tasks()).docs;assert.equal(first.length,1);await first[0].ref.update({title:"Edicao humana"});
  await processPendingAutomationActions({tenantId:f.tenantId});
  assert.equal((await f.tasks()).size,1);assert.equal((await first[0].ref.get()).data()?.title,"Edicao humana");assert.equal((await f.notes()).size,1);
  assert.equal((await adminDb.collection("messages").where("tenantId","==",f.tenantId).where("sender","==","client").get()).size,0);
});
test("a public social event never creates a generic private message automation",async()=>{
  const f=await fixture();await f.automation.update({actions:[{type:"send_message",text:"Nao enviar DM de comentario publico",waitInHours:1}]});
  await handleMetaSocialEvent(f);await processPendingAutomationActions({tenantId:f.tenantId});
  assert.equal((await adminDb.collection("jobs").where("tenantId","==",f.tenantId).where("type","==","automation_scheduled_action").get()).size,0);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId","==",f.tenantId).get()).size,0);
});
