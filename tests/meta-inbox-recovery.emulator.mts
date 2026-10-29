import test from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env,{FIREBASE_PROJECT_ID:"demo-altum-qa-lab",NEXT_PUBLIC_FIREBASE_PROJECT_ID:"demo-altum-qa-lab",FIRESTORE_EMULATOR_HOST:process.env.QA_META_FIRESTORE_HOST||"127.0.0.1:8080",FIREBASE_AUTH_EMULATOR_HOST:process.env.QA_META_AUTH_HOST||"127.0.0.1:9099",FIREBASE_SERVICE_ACCOUNT_KEY:"",FIREBASE_CLIENT_EMAIL:"",FIREBASE_PRIVATE_KEY:"",GOOGLE_APPLICATION_CREDENTIALS:""});
const {adminDb,adminAuth}=await import("../app/lib/server/firebase-admin.ts");
const {recoverRecentMetaInbox}=await import("../lib/server/meta-inbox-recovery.ts");
const {POST}=await import("../app/api/tenant/[tenantId]/chats/sync-meta/route.ts");
const {socialChatIdentityId}=await import("../lib/server/social-chat-identity.ts");
const tenantId=`qa_meta_history_${Date.now()}`,uid=tenantId+"_owner",other=tenantId+"_other";
const original=globalThis.fetch;let reads=0,failedInstagram=false;
const at=new Date(Date.now()-180000).toISOString();
globalThis.fetch=async(input,init)=>{
  const u=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
  if(u.hostname==="127.0.0.1")return original(input,init);
  assert.equal(u.hostname,"graph.facebook.com");assert.ok(!init?.method||init.method==="GET","Recovery cannot send messages");reads++;
  const type=new Headers(init?.headers).get("Authorization")==="Bearer qa_instagram"?"instagram":"messenger";
  assert.equal(init?.headers && (init.headers as Record<string,string>).Authorization,`Bearer qa_${type}`);
  if(type==="instagram"&&failedInstagram)return Response.json({error:{code:190}},{status:401});
  if(!u.pathname.endsWith("/conversations"))return Response.json({name:"Ficticio",username:`qa_${type}_customer`});
  return Response.json({data:[{id:`qa_conversation_${type}`,participants:{data:[{id:type==="instagram"?"ig-business":"page",name:"QA Business"},{id:`qa_${type}_customer`,name:"Ficticio"}]},messages:{data:[
    {id:`qa_${type}_media`,message:"",from:{id:`qa_${type}_customer`},to:{data:[{id:type==="instagram"?"ig-business":"page"}]},created_time:at,attachments:{data:[{mime_type:"image/jpeg",file_url:"https://scontent.fbcdn.net/qa.jpg"}]}},
    {id:`qa_${type}_own`,message:"Resposta pelo aplicativo",from:{id:type==="instagram"?"ig-business":"page"},to:{data:[{id:`qa_${type}_customer`}]},created_time:at},
  ]}}]});
};
test.before(async()=>{
  const batch=adminDb.batch();
  for(const type of["instagram","messenger"])batch.set(adminDb.collection("tenant_channels").doc(`${tenantId}_${type}`),{tenantId,type,status:"active",provider:`meta_${type}`,pageId:"page",externalAccountId:type==="instagram"?"ig-business":"page",accessToken:`qa_${type}`});
  batch.set(adminDb.collection("tenants").doc(tenantId),{status:"active",billingStatus:"active",accessStatus:"active"});
  batch.set(adminDb.collection("users").doc(uid),{uid,role:"client_owner",status:"active",name:"QA",email:`${uid}@qa.invalid`});
  batch.set(adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`),{tenantId,userId:uid,role:"client_owner",status:"active"});
  batch.set(adminDb.collection("tenant_entitlements").doc(tenantId),{version:1,mode:"custom",modules:{inbox:true,crm:true},limits:{}});
  await batch.commit();await adminAuth.createUser({uid,email:`${uid}@qa.invalid`,password:"QaOnly2026!"});
});
test.after(async()=>{globalThis.fetch=original;await adminDb.terminate();});
test("both channels recover text and media-only messages with native direction, no AI or outbound jobs",async()=>{
  const result=await recoverRecentMetaInbox(tenantId);assert.equal(result.synced,4);assert.ok(result.channels.every(c=>c.status==="ok"));
  const chats=await adminDb.collection("chats").where("tenantId","==",tenantId).get();assert.equal(chats.size,2);
  const messages=await adminDb.collection("messages").where("tenantId","==",tenantId).get();assert.equal(messages.size,4);
  assert.equal(messages.docs.filter(d=>d.data().type==="image").length,2);assert.equal(messages.docs.filter(d=>d.data().sender==="agent").length,2);
  for(const collection of["ai_jobs","chat_outbound_jobs","automation_execution_logs"])assert.equal((await adminDb.collection(collection).where("tenantId","==",tenantId).get()).size,0);
});
test("repeated and concurrent recovery does not duplicate or reset ownership, status and newer message",async()=>{
  const chats=await adminDb.collection("chats").where("tenantId","==",tenantId).get();const future=new Date();
  await chats.docs[0].ref.update({ownerId:"qa_human",assignedTo:"qa_human",status:"resolved",lastMessage:"Resposta mais nova",lastMessageTime:future});
  const before=reads;const throttled=await recoverRecentMetaInbox(tenantId);assert.equal(throttled.skipped,"throttled");assert.equal(reads,before);
  await adminDb.collection("integration_sync_state").doc(`${tenantId}_meta_inbox`).update({nextAttemptAt:new Date(0)});
  await Promise.all([recoverRecentMetaInbox(tenantId),recoverRecentMetaInbox(tenantId)]);
  assert.equal((await adminDb.collection("messages").where("tenantId","==",tenantId).get()).size,4);
  const current=(await chats.docs[0].ref.get()).data()!;assert.equal(current.status,"resolved");assert.equal(current.ownerId,"qa_human");assert.equal(current.lastMessage,"Resposta mais nova");
});
test("one provider error does not hide the other channel and foreign mapped conversations cannot be written",async()=>{
  failedInstagram=true;await adminDb.collection("integration_sync_state").doc(`${tenantId}_meta_inbox`).update({nextAttemptAt:new Date(0)});
  const result=await recoverRecentMetaInbox(tenantId);assert.equal(result.channels.find(c=>c.channel==="instagram")?.status,"error");assert.equal(result.channels.find(c=>c.channel==="messenger")?.status,"ok");failedInstagram=false;
  const id=socialChatIdentityId({tenantId,channel:"instagram",channelId:`${tenantId}_instagram`,externalProfileId:"qa_instagram_customer"});
  await adminDb.collection("chats").doc(`${other}_chat`).set({tenantId:other,channel:"instagram",lastMessage:"Privado"});
  await adminDb.collection("chat_identities").doc(id).update({chatId:`${other}_chat`});
  await adminDb.collection("integration_sync_state").doc(`${tenantId}_meta_inbox`).update({nextAttemptAt:new Date(0)});
  const guarded=await recoverRecentMetaInbox(tenantId);assert.equal(guarded.channels.find(c=>c.channel==="instagram")?.status,"error");assert.equal((await adminDb.collection("chats").doc(`${other}_chat`).get()).data()?.lastMessage,"Privado");
});
test("recovery endpoint requires authentication, membership and the inbox module",async()=>{
  assert.equal((await POST(new Request("http://qa/sync",{method:"POST"}),{params:Promise.resolve({tenantId})})).status,401);
  const r=await original(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:`${uid}@qa.invalid`,password:"QaOnly2026!",returnSecureToken:true})});
  const token=(await r.json()).idToken,req=new Request("http://qa/sync",{method:"POST",headers:{Authorization:`Bearer ${token}`}});
  assert.equal((await POST(req,{params:Promise.resolve({tenantId:other})})).status,403);
  await adminDb.collection("tenant_entitlements").doc(tenantId).update({"modules.inbox":false});
  assert.equal((await POST(req,{params:Promise.resolve({tenantId})})).status,403);
});
