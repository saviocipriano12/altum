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
  for(const tenantId of tenants)for(const collection of ["leads","chats","messages","automations","jobs","lead_tasks","lead_notes","tenant_usage_monthly","tenant_entitlements","tenant_settings","pipeline","tenant_channels","social_automations","social_automation_logs","social_automation_contacts","contact_profiles","contacts","contact_identity_aliases","lead_identities","ai_logs","ai_learning_outcomes","ai_tenant_learning_daily","crm_observation_jobs","audit_logs"]){for(const doc of(await adminDb.collection(collection).where("tenantId","==",tenantId).get()).docs){assert.ok(tenantId.startsWith("qa_social_mixed_"));await adminDb.recursiveDelete(doc.ref);}}
  await adminDb.terminate();
});
async function fixture(){
  const tenantId=`qa_social_mixed_${randomUUID()}`;tenants.push(tenantId);
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


test("a historical social consumer cannot reclaim a new event after its preparation lease expires",async()=>{
  const f=await fixture(),{Transaction}=await import("firebase-admin/firestore"),originalCreate=Transaction.prototype.create,originalUpdate=Transaction.prototype.update;let interruptedNote=false,interruptedSource=false;
  const note=mock.method(Transaction.prototype,"create",function(this:FirebaseFirestore.Transaction,...args:Parameters<typeof originalCreate>){if(args[0].parent.id==="lead_notes"){interruptedNote=true;throw new Error("QA_NOTE_INTERRUPTED");}return Reflect.apply(originalCreate,this,args);});
  const source=mock.method(Transaction.prototype,"update",function(this:FirebaseFirestore.Transaction,...args:Parameters<typeof originalUpdate>){if(args[0].parent.id==="social_automation_logs"&&args[1]&&typeof args[1]==="object"&&"status" in args[1]&&args[1].status==="processed"){interruptedSource=true;throw new Error("QA_BEFORE_SOCIAL_SOURCE_FINALIZATION");}return Reflect.apply(originalUpdate,this,args);});
  try{await assert.rejects(handleMetaSocialEvent(f),/QA_BEFORE_SOCIAL_SOURCE_FINALIZATION/);}finally{note.mock.restore();source.mock.restore();}
  assert.ok(interruptedNote);assert.ok(interruptedSource);assert.equal((await f.tasks()).size,1);assert.equal((await f.notes()).size,0);
  const logs=await adminDb.collection("social_automation_logs").where("tenantId","==",f.tenantId).get();assert.equal(logs.size,1);const log=logs.docs[0].ref;await log.update({claimUntil:new Date(0)});const before=await log.get();
  const {claimSocialEventV1}=await import("./fixtures/social-preparation-v1.mts");
  await assert.rejects(claimSocialEventV1({...f.event,tenantId:f.tenantId,channelId:f.channel.id}),/legado/);
  assert.ok((await log.get()).updateTime!.isEqual(before.updateTime!));
  await processPendingAutomationActions({tenantId:f.tenantId});
  const {retrySocialAutomationLog}=await import("../lib/server/social/service.ts");
  await retrySocialAutomationLog({tenantId:f.tenantId,logId:log.id,actorId:"qa-human",actorName:"Pessoa de teste"});
  assert.equal((await f.tasks()).size,1);assert.equal((await f.notes()).size,1);assert.equal((await log.get()).data()?.status,"processed");
});
