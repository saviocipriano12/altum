import test from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env,{FIREBASE_PROJECT_ID:"demo-altum-qa-lab",NEXT_PUBLIC_FIREBASE_PROJECT_ID:"demo-altum-qa-lab",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080",FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9099",FIREBASE_SERVICE_ACCOUNT_KEY:"",FIREBASE_CLIENT_EMAIL:"",FIREBASE_PRIVATE_KEY:"",GOOGLE_APPLICATION_CREDENTIALS:"",META_GRAPH_VERSION:"v21.0 \n"});
const {adminDb}=await import("../app/lib/server/firebase-admin.ts");
const {fetchMetaConversationProfile}=await import("../app/lib/server/meta-channel.ts");
const {resolveMetaContactProfile,refreshStoredMetaContactProfile}=await import("../lib/server/meta-contact-profile.ts");
const {upsertContactProfile}=await import("../lib/server/contact-profile.ts");
const suffix=`qa_meta_profile_${Date.now()}`,tenantId=suffix,other=suffix+"_other";
const channel={id:suffix+"_channel",tenantId,type:"instagram" as const,provider:"instagram",accessToken:"qa_only",externalAccountId:"qa_business",pageId:"qa_page"};
const original=globalThis.fetch;let calls=0,mode="profile";
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
 if(url.hostname==="127.0.0.1")return original(input,init);
 calls++;assert.equal(url.hostname,"graph.facebook.com");assert.match(url.pathname,/^\/v21\.0\//);assert.equal(url.searchParams.has("access_token"),false);
 assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer qa_only");assert.ok(!init?.method||init.method==="GET");
 if(mode==="revoked")return Response.json({error:{code:190,error_subcode:460}},{status:401});
 if(mode==="fields"&&url.searchParams.get("fields")?.includes("profile_pic"))return Response.json({error:{code:100}},{status:400});
 return Response.json({name:"Cliente Ficticio",username:"cliente.qa",profile_pic:"https://scontent.cdninstagram.com/qa.jpg"});
};
let contactId:string|null=null;
test.before(async()=>{
 await adminDb.collection("tenant_channels").doc(channel.id).set({...channel,status:"active"});
 contactId=await upsertContactProfile({tenantId,channel:"instagram",externalProfileId:"qa_customer",name:"Instagram 123456"});
 await adminDb.collection("leads").doc(suffix+"_lead").set({tenantId,externalProfileId:"qa_customer",contactId,nome:"Instagram 123456",ownerId:"human",stage:"negociacao"});
 await adminDb.collection("chats").doc(suffix+"_chat").set({tenantId,channel:"instagram",channelId:channel.id,contactExternalId:"qa_customer",contactId,leadId:suffix+"_lead",contactName:"Instagram 123456",status:"resolved",assignedTo:"human",lastMessage:"Preservar"});
});
test.after(async()=>{globalThis.fetch=original;await adminDb.terminate();});
test("profile requests normalize API version, use bearer and recover name without optional photo fields",async()=>{
 mode="fields";calls=0;const profile=await fetchMetaConversationProfile({channel,userId:"qa_customer"});
 assert.equal(profile?.username,"cliente.qa");assert.equal(calls,2);
 mode="revoked";calls=0;assert.equal(await fetchMetaConversationProfile({channel,userId:"qa_customer"}),null);assert.equal(calls,1);
});
test("enrichment repairs existing conversation, contact and lead without messages, AI or assignment changes",async()=>{
 mode="profile";const profile=await resolveMetaContactProfile({channel,userId:"qa_customer"});
 assert.equal(await refreshStoredMetaContactProfile({channel,userId:"qa_customer",chatId:suffix+"_chat",profile}),true);
 const chat=(await adminDb.collection("chats").doc(suffix+"_chat").get()).data()!;
 assert.equal(chat.contactName,"Cliente Ficticio");assert.equal(chat.instagramUsername,"cliente.qa");assert.equal(chat.status,"resolved");assert.equal(chat.assignedTo,"human");assert.equal(chat.lastMessage,"Preservar");
 const lead=(await adminDb.collection("leads").doc(suffix+"_lead").get()).data()!;assert.equal(lead.nome,"Cliente Ficticio");assert.equal(lead.stage,"negociacao");
 assert.equal((await adminDb.collection("contacts").doc(contactId!).get()).data()?.instagramUsername,"cliente.qa");
 for(const collection of ["messages","ai_jobs","chat_outbound_jobs"])assert.equal((await adminDb.collection(collection).where("tenantId","==",tenantId).get()).size,0);
});
test("cached names survive provider failure and manual names are preserved while username is enriched",async()=>{
 mode="revoked";calls=0;const cached=await resolveMetaContactProfile({channel,userId:"qa_customer"});assert.equal(cached.name,"Cliente Ficticio");assert.equal(calls,0);
 await adminDb.collection("chats").doc(suffix+"_chat").update({contactName:"Nome cadastrado pela equipe"});
 assert.equal(await refreshStoredMetaContactProfile({channel,userId:"qa_customer",chatId:suffix+"_chat",profile:{name:"Novo perfil",username:"novo.qa",photoUrl:null}}),true);
 const chat=(await adminDb.collection("chats").doc(suffix+"_chat").get()).data()!;assert.equal(chat.contactName,"Nome cadastrado pela equipe");assert.equal(chat.instagramUsername,"novo.qa");assert.ok(chat.contactPhotoUrl);
});
test("profile writes reject foreign conversation and contact references",async()=>{
 const profile={name:"QA",username:"qa",photoUrl:null};
 await adminDb.collection("chats").doc(other).set({tenantId:other,channel:"instagram",channelId:channel.id,contactExternalId:"qa_customer",contactName:"Privado"});
 await assert.rejects(refreshStoredMetaContactProfile({channel,userId:"qa_customer",chatId:other,profile}),/scope_invalid/);
 await adminDb.collection("contacts").doc(other).set({tenantId:other,externalProfileId:"qa_customer",name:"Privado"});
 await adminDb.collection("chats").doc(suffix+"_chat").update({contactId:other});
 await assert.rejects(refreshStoredMetaContactProfile({channel,userId:"qa_customer",chatId:suffix+"_chat",profile}),/contact_scope_invalid/);
 assert.equal((await adminDb.collection("contacts").doc(other).get()).data()?.name,"Privado");
});
