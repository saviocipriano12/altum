import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
Object.assign(process.env,{FIREBASE_PROJECT_ID:"demo-altum-qa-lab",NEXT_PUBLIC_FIREBASE_PROJECT_ID:"demo-altum-qa-lab",FIRESTORE_EMULATOR_HOST:process.env.QA_META_FIRESTORE_HOST||"127.0.0.1:8080",FIREBASE_AUTH_EMULATOR_HOST:process.env.QA_META_AUTH_HOST||"127.0.0.1:9099",FIREBASE_SERVICE_ACCOUNT_KEY:"",FIREBASE_CLIENT_EMAIL:"",FIREBASE_PRIVATE_KEY:"",GOOGLE_APPLICATION_CREDENTIALS:"",META_APP_SECRET:"qa-meta-webhook-only"});
const {adminDb}=await import("../app/lib/server/firebase-admin.ts");
const {POST}=await import("../app/api/webhooks/meta/route.ts");
const suffix=`qa_meta_batch_${Date.now()}`,tenants=[suffix+"_one",suffix+"_two"];
const original=globalThis.fetch;let sends=0;
globalThis.fetch=async(input,init)=>{const u=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(u.hostname==="127.0.0.1")return original(input,init);assert.equal(u.hostname,"graph.facebook.com");if(init?.method&&init.method!=="GET")sends++;assert.ok(!init?.method||init.method==="GET");return Response.json({id:u.pathname.split('/').at(-1),name:"Ficticio"});};
test.before(async()=>{for(const tenantId of tenants){await adminDb.collection("tenant_channels").doc(tenantId+"_channel").set({tenantId,type:"instagram",status:"active",pageId:tenantId+"_page",externalAccountId:tenantId+"_ig",accessToken:"qa-no-external"});await adminDb.collection("social_automations").doc(tenantId).set({tenantId,enabled:false,dmAutoReply:false});}});
test.after(async()=>{globalThis.fetch=original;await adminDb.terminate();});
const body=()=>({object:"instagram",entry:[{id:suffix+"_unknown",messaging:[{sender:{id:"qa_unknown_customer"},recipient:{id:suffix+"_unknown"},timestamp:Date.now(),message:{mid:"qa_unknown",text:"Sem canal"}}]},...tenants.map(tenantId=>({id:tenantId+"_ig",messaging:[{sender:{id:tenantId+"_customer"},recipient:{id:tenantId+"_ig"},timestamp:Date.now(),message:{mid:tenantId+"_mid",text:"Teste ficticio de roteamento"}}]}))]});
function request(payload:unknown,valid=true){const raw=JSON.stringify(payload),signature=createHmac('sha256',valid?'qa-meta-webhook-only':'invalid').update(raw).digest('hex');return new Request('http://qa/meta',{method:'POST',headers:{'x-hub-signature-256':'sha256='+signature,'Content-Type':'application/json'},body:raw});}
test("one signed Meta batch routes each account to its own tenant, not the first entry",async()=>{
 const response=await POST(request(body()));assert.equal(response.status,200);
 for(const tenantId of tenants){const messages=await adminDb.collection("messages").where("tenantId","==",tenantId).get();assert.equal(messages.size,1);assert.equal(messages.docs[0].data().channelId,tenantId+"_channel");assert.equal(messages.docs[0].data().metaMessageId,tenantId+"_mid");const seen=await adminDb.collection("tenant_channels").doc(tenantId+"_channel").get();assert.ok(seen.data()?.lastWebhookAt);}
 assert.equal(sends,0);
});
test("invalid signatures cannot persist messages for either account",async()=>{
 assert.equal((await POST(request(body(),false))).status,401);
 for(const tenantId of tenants)assert.equal((await adminDb.collection("messages").where("tenantId","==",tenantId).get()).size,1);
});
test("a channel secret cannot authorize a different channel when no shared app secret exists",async()=>{
 const shared=process.env.META_APP_SECRET;process.env.META_APP_SECRET="";
 try{
  await adminDb.collection("tenant_channels").doc(tenants[0]+"_channel").update({metadata:{appSecret:shared}});
  await adminDb.collection("tenant_channels").doc(tenants[1]+"_channel").update({metadata:{appSecret:"different-app-secret"}});
  const payload=body();for(const entry of payload.entry)for(const event of entry.messaging)event.message.mid+="_separate_apps";
  assert.equal((await POST(request(payload))).status,200);
  assert.equal((await adminDb.collection("messages").where("tenantId","==",tenants[0]).get()).size,2);
  assert.equal((await adminDb.collection("messages").where("tenantId","==",tenants[1]).get()).size,1);
 }finally{process.env.META_APP_SECRET=shared;}
});
