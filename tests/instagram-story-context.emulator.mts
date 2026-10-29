import test from "node:test";import assert from "node:assert/strict";
Object.assign(process.env,{FIREBASE_PROJECT_ID:"demo-altum-qa-lab",NEXT_PUBLIC_FIREBASE_PROJECT_ID:"demo-altum-qa-lab",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080",FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9099",FIREBASE_SERVICE_ACCOUNT_KEY:"",FIREBASE_CLIENT_EMAIL:"",FIREBASE_PRIVATE_KEY:"",GOOGLE_APPLICATION_CREDENTIALS:""});
const {adminDb,adminAuth}=await import("../app/lib/server/firebase-admin.ts");
const {resolveInstagramStoryContext,refreshInstagramStoryMessage}=await import("../lib/server/instagram-story-context.ts");
const {GET}=await import("../app/api/tenant/[tenantId]/chats/[chatId]/messages/[messageId]/story/route.ts");
const suffix=`qa_story_${Date.now()}`,tenantId=suffix,chatId=suffix+"_chat",messageId=suffix+"_message",uid=suffix+"_owner";
const channel={id:suffix+"_channel",tenantId,type:"instagram" as const,provider:"instagram",accessToken:"qa-token",externalAccountId:"qa-business"};
const original={kind:"story_reply" as const,storyId:"123456789",previewUrl:"https://lookaside.fbsbx.com/qa-mp4",messageId:null,text:null};
const originalFetch=globalThis.fetch;let calls=0,mode="VIDEO";
globalThis.fetch=async(input,init)=>{const u=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(u.hostname==="127.0.0.1")return originalFetch(input,init);assert.equal(u.hostname,"graph.facebook.com");assert.ok(!init?.method||init.method==="GET");assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer qa-token");calls++;
 if(mode==="revoked")return Response.json({error:{code:190}},{status:401});
 return Response.json({id:"123456789",owner:{id:mode==="foreign"?"other-business":"qa-business"},media_type:mode==="IMAGE"?"IMAGE":"VIDEO",media_url:"https://scontent.cdninstagram.com/qa-media",thumbnail_url:"https://scontent.cdninstagram.com/qa-poster.jpg",permalink:"https://www.instagram.com/stories/qa/123456789/"});};
test.before(async()=>{
 await adminDb.collection("tenant_channels").doc(channel.id).set({...channel,status:"active"});
 await adminDb.collection("chats").doc(chatId).set({tenantId,channel:"instagram",channelId:channel.id,status:"resolved",assignedTo:"human"});
 await adminDb.collection("messages").doc(messageId).set({tenantId,chatId,channel:"instagram",channelId:channel.id,text:"Pergunta ficticia",instagramContext:original});
 await adminDb.collection("tenants").doc(tenantId).set({status:"active",billingStatus:"active",accessStatus:"active"});
 await adminDb.collection("users").doc(uid).set({uid,role:"client_owner",status:"active",email:`${uid}@qa.invalid`});
 await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({tenantId,userId:uid,role:"client_owner",status:"active"});
 await adminDb.collection("tenant_entitlements").doc(tenantId).set({version:1,mode:"custom",modules:{inbox:true,crm:true},limits:{}});
 await adminAuth.createUser({uid,email:`${uid}@qa.invalid`,password:"QaOnly2026!"});
});
test.after(async()=>{globalThis.fetch=originalFetch;await adminDb.terminate();});
test("video stories have separate MP4 source and image poster; image stories remain images",async()=>{
 mode="VIDEO";const video=await resolveInstagramStoryContext(channel,original);assert.equal(video.mediaType,"VIDEO");assert.equal(video.previewUrl,"https://scontent.cdninstagram.com/qa-poster.jpg");assert.equal(video.mediaUrl,"https://scontent.cdninstagram.com/qa-media");
 mode="IMAGE";const image=await resolveInstagramStoryContext(channel,original);assert.equal(image.mediaType,"IMAGE");assert.equal(image.previewUrl,image.mediaUrl);
});
test("foreign owner and revoked authorization preserve original context without claiming expiry",async()=>{
 for(const value of["foreign","revoked"]){mode=value;assert.deepEqual(await resolveInstagramStoryContext(channel,original),original);}
 const before=calls;assert.deepEqual(await resolveInstagramStoryContext(channel,{...original,storyId:"../other"}),{...original,storyId:"../other"});assert.equal(calls,before);
});
test("existing reply is enriched once and leaves original message, human ownership and job queues unchanged",async()=>{
 mode="VIDEO";const result=await refreshInstagramStoryMessage({channel,chatId,messageId});assert.equal(result?.mediaType,"VIDEO");const before=calls;await refreshInstagramStoryMessage({channel,chatId,messageId});assert.equal(calls,before);
 assert.equal((await adminDb.collection("messages").doc(messageId).get()).data()?.text,"Pergunta ficticia");
 assert.equal((await adminDb.collection("chats").doc(chatId).get()).data()?.status,"resolved");
 for(const c of["ai_jobs","chat_outbound_jobs"])assert.equal((await adminDb.collection(c).where("tenantId","==",tenantId).get()).size,0);
 await adminDb.collection("messages").doc(suffix+"_foreign").set({tenantId:"other",chatId,channelId:channel.id,channel:"instagram",instagramContext:original});
 await assert.rejects(refreshInstagramStoryMessage({channel,chatId,messageId:suffix+"_foreign"}),/scope_invalid/);
});
test("a failed refresh preserves the previous cache time instead of marking an expired link as renewed",async()=>{
 await adminDb.collection("messages").doc(messageId).update({instagramStoryResolvedAt:new Date(0)});mode="revoked";
 const result=await refreshInstagramStoryMessage({channel,chatId,messageId,force:true});assert.equal(result?.mediaType,"VIDEO");
 assert.equal((await adminDb.collection("messages").doc(messageId).get()).data()?.instagramStoryResolvedAt.toMillis(),0);mode="VIDEO";
});
test("story endpoint requires session, tenant access and matching message",async()=>{
 const params=Promise.resolve({tenantId,chatId,messageId});assert.equal((await GET(new Request("http://qa/story"),{params})).status,401);
 const response=await originalFetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:`${uid}@qa.invalid`,password:"QaOnly2026!",returnSecureToken:true})});
 const token=(await response.json()).idToken,req=new Request("http://qa/story",{headers:{Authorization:`Bearer ${token}`}});
 assert.equal((await GET(req,{params})).status,200);
 assert.equal((await GET(req,{params:Promise.resolve({tenantId:"other",chatId,messageId})})).status,403);
 assert.equal((await GET(req,{params:Promise.resolve({tenantId,chatId,messageId:suffix+"_foreign"})})).status,404);
});
