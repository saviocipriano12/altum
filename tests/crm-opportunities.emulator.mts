import test,{before,after,mock} from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env,{FIREBASE_PROJECT_ID:"demo-altum-qa-lab",NEXT_PUBLIC_FIREBASE_PROJECT_ID:"demo-altum-qa-lab",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080",FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9099",FIREBASE_SERVICE_ACCOUNT_KEY:"",FIREBASE_CLIENT_EMAIL:"",FIREBASE_PRIVATE_KEY:"",GOOGLE_APPLICATION_CREDENTIALS:""});
const {adminDb,adminAuth}=await import("../app/lib/server/firebase-admin.ts");
const {GET:list,POST:create}=await import("../app/api/tenant/[tenantId]/leads/[leadId]/opportunities/route.ts");
const {GET:listLeads,POST:createLead}=await import("../app/api/tenant/[tenantId]/leads/route.ts");
const {GET:pipeline}=await import("../app/api/tenant/[tenantId]/pipeline/route.ts");
const {GET:detail,PATCH:updateLead}=await import("../app/api/tenant/[tenantId]/leads/[leadId]/route.ts");
const {GET:chatDetail}=await import("../app/api/tenant/[tenantId]/chats/[chatId]/route.ts");
const {GET:search}=await import("../app/api/tenant/[tenantId]/search/route.ts");
const {upsertContactProfile}=await import("../lib/server/contact-profile.ts");
const tenantId=`qa_opportunities_${Date.now()}`,foreign=`${tenantId}_foreign`,uid=`${tenantId}_seller`,peer=`${tenantId}_peer`;
const tokens=new Map<string,string>();let sequence=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);assert.ok(["127.0.0.1","localhost"].includes(url.hostname),"Only emulator transport is permitted");return originalFetch(input,init);};
before(async()=>{
  for(const userId of [uid,peer]){
    await adminAuth.createUser({uid:userId,email:`${userId}@qa.invalid`,password:"OpportunitiesLocalOnly2026!"});
    await adminDb.collection("users").doc(userId).set({tenantId,name:"Vendedor ficticio",role:"client_agent",status:"active"});
    await adminDb.collection("tenant_users").doc(`${tenantId}_${userId}`).set({tenantId,userId,role:"client_agent",status:"active",capabilities:["edit_leads"]});
    const response=await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:`${userId}@qa.invalid`,password:"OpportunitiesLocalOnly2026!",returnSecureToken:true})});
    assert.equal(response.status,200);tokens.set(userId,(await response.json()).idToken);
  }
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({tenantId,mode:"custom",modules:{crm:true},limits:{}});
  await adminDb.collection("pipeline").doc(tenantId).set({tenantId,stages:[{id:"entrada",label:"Entrada",position:0,isTerminal:false},{id:"proposta",label:"Proposta",position:1,isTerminal:false},{id:"ganho",label:"Ganho",position:2,isTerminal:true}]});
});
after(async()=>{
  globalThis.fetch=originalFetch;
  for(const collection of ["users","tenant_users","tenant_entitlements","pipeline","leads","contacts","contact_identity_aliases","audit_logs","jobs","orcamentos","financeiro","chats"]){const rows=await adminDb.collection(collection).where("tenantId","in",[tenantId,foreign]).get();for(const row of rows.docs)await adminDb.recursiveDelete(row.ref);}
  for(const userId of [uid,peer])await adminAuth.deleteUser(userId);
  await adminDb.terminate();
});
function req(body?:unknown,userId=uid){return new Request("http://127.0.0.1/opportunities",{method:body===undefined?"GET":"POST",headers:{authorization:`Bearer ${tokens.get(userId)}`,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function source(options:{identifier?:boolean;contact?:boolean;owner?:string}={}){
  const index=++sequence,leadId=`${tenantId}_source_${index}`,ref=adminDb.collection("leads").doc(leadId);
  const telefone=options.identifier===false?"":`551198700${String(index).padStart(4,"0")}`;
  await ref.set({tenantId,nome:"Marina ficticia",telefone,empresa:"Empresa ficticia",pipelineStage:"ganho",stage:"ganho",potentialValue:900,status:"ganho",notes:"Negociacao antiga preservada",ownerId:options.owner||uid,owner:"Vendedor ficticio"});
  let contactId:string|null=null;
  if(options.contact!==false){contactId=await upsertContactProfile({tenantId,phone:telefone,leadId,name:"Marina ficticia",channel:"whatsapp"});if(contactId)await ref.update({contactId});}
  const context={params:Promise.resolve({tenantId,leadId})};
  return {leadId,ref,context,contactId};
}
async function bodyFor(target:Awaited<ReturnType<typeof source>>,extra:Record<string,unknown>={}){
  const res=await list(req(),target.context);assert.equal(res.status,200);return {title:"Nova compra",requestId:`request_${target.leadId}`,expectedSourceRevision:(await res.json()).sourceRevision,potentialValue:250,...extra};
}
test("a new purchase is a separate opportunity linked to the same person, without changing the won sale",async()=>{
  const target=await source(),before=(await target.ref.get()).data()!,body=await bodyFor(target);
  const response=await create(req(body),target.context);assert.equal(response.status,201);const result=await response.json();assert.notEqual(result.opportunityId,target.leadId);assert.equal(result.contactId,target.contactId);
  const created=(await adminDb.collection("leads").doc(result.opportunityId).get()).data()!;
  assert.equal(created.opportunityTitle,"Nova compra");assert.equal(created.pipelineStage,"entrada");assert.equal(created.potentialValue,250);assert.equal(created.ownerId,uid);assert.equal(created.recordKind,"opportunity");
  assert.deepEqual((await target.ref.get()).data(),before);
  assert.deepEqual(new Set((await adminDb.collection("contacts").doc(result.contactId).get()).data()?.leadIds),new Set([target.leadId,result.opportunityId]));
  assert.equal((await adminDb.collection("jobs").where("tenantId","==",tenantId).get()).size,0);
  assert.equal((await adminDb.collection("leads").doc(result.opportunityId).collection("events").get()).size,1);
});
test("concurrent retries create one opportunity and reuse the receipt after a later human correction",async()=>{
  const target=await source(),body=await bodyFor(target);
  const responses=await Promise.all([create(req(body),target.context),create(req(body),target.context)]);assert.deepEqual(responses.map(row=>row.status).sort(),[200,201]);
  const payloads=await Promise.all(responses.map(row=>row.json()));assert.equal(payloads[0].opportunityId,payloads[1].opportunityId);
  const ref=adminDb.collection("leads").doc(payloads[0].opportunityId);await ref.update({opportunityTitle:"Correcao humana"});
  assert.equal((await create(req(body),target.context)).status,200);assert.equal((await ref.get()).data()?.opportunityTitle,"Correcao humana");
  assert.equal((await create(req({...body,title:"Outro conteudo"}),target.context)).status,409);
});
test("two people sharing only a name do not become the same contact",async()=>{
  const first=await source({identifier:false,contact:false}),second=await source({identifier:false,contact:false});
  const a=await create(req(await bodyFor(first)),first.context),b=await create(req(await bodyFor(second)),second.context);
  assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual((await a.json()).contactId,(await b.json()).contactId);
});
test("a later phone alias enriches the existing person instead of splitting its opportunities",async()=>{
  const target=await source({identifier:false,contact:false}),response=await create(req(await bodyFor(target)),target.context);assert.equal(response.status,201);const result=await response.json();
  const before = await target.ref.get();
  const enriched=await upsertContactProfile({tenantId,leadId:target.leadId,phone:"5511987654355",name:"Marina ficticia",channel:"whatsapp"});
  assert.equal(enriched,result.contactId);assert.ok((await adminDb.collection("contacts").doc(enriched!).get()).data()?.leadIds.includes(result.opportunityId));
  assert.ok((await target.ref.get()).updateTime!.isEqual(before.updateTime!),"Profile-only enrichment must not invalidate the opportunity snapshot used by AI or a human form");
});
test("the person's other opportunities remain restricted to their current sellers",async()=>{
  const target=await source(),member=adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);await member.update({capabilities:["edit_leads","view_team_records"]});
  let result:{opportunityId:string};
  try{const response=await create(req(await bodyFor(target,{ownerUserId:peer})),target.context);assert.equal(response.status,201);result=await response.json();}
  finally{await member.update({capabilities:["edit_leads"]});}
  const own=await(await list(req(),target.context)).json();assert.ok(!own.items.some((row:{id:string})=>row.id===result!.opportunityId));
  const peerContext={params:Promise.resolve({tenantId,leadId:result!.opportunityId})};const other=await list(req(undefined,peer),peerContext);assert.equal(other.status,200);
  assert.deepEqual((await other.json()).items.map((row:{id:string})=>row.id),[result!.opportunityId]);
});
test("old source revisions, terminal/invalid stages and negative values fail before creating a deal",async()=>{
  const target=await source(),body=await bodyFor(target);await target.ref.update({notes:"Atualizacao recente"});assert.equal((await create(req(body),target.context)).status,409);
  for(const extra of [{pipelineStage:"inexistente"},{pipelineStage:"ganho"},{potentialValue:-1}])assert.equal((await create(req(await bodyFor(target,extra)),target.context)).status,400);
  assert.equal((await adminDb.collection("leads").where("tenantId","==",tenantId).where("opportunitySourceLeadId","==",target.leadId).get()).size,0);
});
test("another seller's source record and revoked capability cannot create or list opportunities",async()=>{
  const target=await source({owner:peer});assert.equal((await list(req(),target.context)).status,403);
  const snapshot=await target.ref.get();const body={title:"Negado",requestId:"denied",expectedSourceRevision:`${snapshot.updateTime!.seconds}:${snapshot.updateTime!.nanoseconds}`};assert.equal((await create(req(body),target.context)).status,403);
  const own=await source(),ownBody=await bodyFor(own),member=adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);await member.update({capabilities:[]});
  try{assert.equal((await create(req(ownBody),own.context)).status,403);}finally{await member.update({capabilities:["edit_leads"]});}
});
test("canonical redirects are followed but cyclic or cross-company identities are rejected",async()=>{
  const target=await source(),old=adminDb.collection("contacts").doc(target.contactId!),canonical=adminDb.collection("contacts").doc(`${target.contactId}_canonical`),data=(await old.get()).data()!;
  await canonical.set(data);await old.update({canonicalContactId:canonical.id});
  const response=await create(req(await bodyFor(target)),target.context);assert.equal(response.status,201);assert.equal((await response.json()).contactId,canonical.id);
  const cycle=await source(),cycleContact=adminDb.collection("contacts").doc(cycle.contactId!);await cycleContact.update({canonicalContactId:old.id});await old.update({canonicalContactId:cycleContact.id});
  assert.equal((await list(req(),cycle.context)).status,409);
  const cross=await source(),crossContact=adminDb.collection("contacts").doc(cross.contactId!),outside=adminDb.collection("contacts").doc(`${cross.contactId}_foreign`);await outside.set({tenantId:foreign,leadIds:[cross.leadId]});await crossContact.update({canonicalContactId:outside.id});
  assert.equal((await list(req(),cross.context)).status,409);
});
test("history write failure rolls back contact linkage, the opportunity and its audit together",async()=>{
  const target=await source({contact:false}),body=await bodyFor(target),before=await target.ref.get(),{Transaction}=await import("firebase-admin/firestore"),original=Transaction.prototype.create;
  const interceptor=mock.method(Transaction.prototype,"create",function(this:FirebaseFirestore.Transaction,...args:Parameters<typeof original>){if(args[0].path.includes("/events/opportunity_created"))throw new Error("QA_OPPORTUNITY_EVENT_FAILURE");return original.apply(this,args);});
  try{assert.equal((await create(req(body),target.context)).status,500);}finally{interceptor.mock.restore();}
  assert.ok((await target.ref.get()).updateTime!.isEqual(before.updateTime!));assert.equal((await adminDb.collection("leads").where("tenantId","==",tenantId).where("opportunitySourceLeadId","==",target.leadId).get()).size,0);
});

test("first channel enrichment racing a new purchase retains one person and both opportunity links",async()=>{
  const target=await source({identifier:false,contact:false}),body=await bodyFor(target);
  const [response,profileId]=await Promise.all([create(req(body),target.context),upsertContactProfile({tenantId,leadId:target.leadId,phone:"5511987654366",channel:"whatsapp",name:"Marina ficticia"})]);
  assert.equal(response.status,201);const result=await response.json();assert.equal(result.contactId,profileId);
  const profile=(await adminDb.collection("contacts").doc(profileId!).get()).data()!;
  assert.ok(profile.leadIds.includes(target.leadId));assert.ok(profile.leadIds.includes(result.opportunityId));
});

test("a legacy reverse link is reused without guessing identity from the customer's name",async()=>{
  const target=await source({identifier:false,contact:false}),contact=adminDb.collection("contacts").doc(`${target.leadId}_legacy`);
  await contact.set({tenantId,leadId:target.leadId,name:"Marina ficticia"});
  const response=await create(req(await bodyFor(target)),target.context);assert.equal(response.status,201);assert.equal((await response.json()).contactId,contact.id);
});

test("contradictory identifiers require review and do not silently merge two people",async()=>{
  const first=await source(),second=await source();
  await upsertContactProfile({tenantId,leadId:second.leadId,phone:(await second.ref.get()).data()?.telefone,email:"different-person@qa.invalid"});
  await first.ref.update({email:"different-person@qa.invalid"});const snapshot=await first.ref.get();
  const response=await create(req({title:"Nao juntar",requestId:"identity-conflict",expectedSourceRevision:`${snapshot.updateTime!.seconds}:${snapshot.updateTime!.nanoseconds}`}),first.context);
  assert.equal(response.status,409);assert.equal((await adminDb.collection("contacts").doc(first.contactId!).get()).data()?.canonicalContactId,undefined);
  assert.equal((await adminDb.collection("contacts").doc(second.contactId!).get()).data()?.canonicalContactId,undefined);
});

test("an unknown forecast stays unknown instead of becoming an invented zero-value deal",async()=>{
  const target=await source(),body=await bodyFor(target);delete (body as Record<string,unknown>).potentialValue;
  const response=await create(req(body),target.context);assert.equal(response.status,201);const result=await response.json();
  assert.equal((await adminDb.collection("leads").doc(result.opportunityId).get()).data()?.potentialValue,null);
  const listing=await(await list(req(),target.context)).json();assert.equal(listing.items.find((row:{id:string})=>row.id===result.opportunityId).potentialValue,null);
});

test("retrying a committed purchase after a contact merge returns its current canonical person",async()=>{
  const target=await source(),body=await bodyFor(target),created=await create(req(body),target.context);
  assert.equal(created.status,201);const result=await created.json();
  const old=adminDb.collection("contacts").doc(result.contactId),canonical=adminDb.collection("contacts").doc(`${result.contactId}_merged`);
  await canonical.set((await old.get()).data()!);await old.update({canonicalContactId:canonical.id});
  const before=await adminDb.collection("leads").doc(result.opportunityId).get();
  const response=await create(req(body),target.context);assert.equal(response.status,200);
  const replay=await response.json();assert.equal(replay.opportunityId,result.opportunityId);assert.equal(replay.contactId,canonical.id);assert.equal(replay.deduped,true);
  assert.ok((await before.ref.get()).updateTime!.isEqual(before.updateTime!),"A receipt retry must not rewrite the commercial record");
});

test("list, detail, pipeline, family and conversation preserve the same opportunity identity and unknown forecast",async()=>{
  const target=await source(),body=await bodyFor(target,{title:`Reposição especial ${sequence}`,potentialValue:null});
  const created=await create(req(body),target.context);assert.equal(created.status,201);const result=await created.json();
  const ref=adminDb.collection("leads").doc(result.opportunityId);
  await ref.update({valorPotencial:8800});
  const before=await ref.get(),context={params:Promise.resolve({tenantId,leadId:ref.id})};
  const listed=await listLeads(req(),{params:Promise.resolve({tenantId})});assert.equal(listed.status,200);
  const rows=(await listed.json()).items;assert.ok(Array.isArray(rows));
  const pageItem=rows.find((row:{id:string})=>row.id===ref.id);assert.ok(pageItem);
  const detailed=await detail(req(),context);assert.equal(detailed.status,200);
  const board=await pipeline(req(),{params:Promise.resolve({tenantId})});assert.equal(board.status,200);
  const boardBody=await board.json(),boardRows=boardBody.columns.flatMap((column:{items:unknown[]})=>column.items);
  const boardItem=boardRows.find((row:{id:string})=>row.id===ref.id);assert.ok(boardItem);
  await adminDb.collection("tenant_entitlements").doc(tenantId).update({"modules.inbox":true});
  const chatId=`${ref.id}_chat`;
  await adminDb.collection("chats").doc(chatId).set({tenantId,leadId:ref.id,ownerId:uid,channel:"whatsapp",status:"open"});
  const chat=await chatDetail(req(),{params:Promise.resolve({tenantId,chatId})});assert.equal(chat.status,200);
  const items=[pageItem,(await detailed.json()).lead,boardItem,(await chat.json()).lead];
  for(const item of items){assert.equal(item.id,ref.id);assert.equal(item.contactId,result.contactId);assert.equal(item.recordKind,"opportunity");assert.equal(item.opportunityTitle,body.title);assert.equal(item.potentialValue,null);}
  const family=await list(req(),target.context);assert.equal(family.status,200);
  assert.equal((await family.json()).items.find((row:{id:string})=>row.id===ref.id).potentialValue,null);
  assert.equal(boardBody.summary.unknownValueCount,boardRows.filter((row:{potentialValue:unknown})=>row.potentialValue===null).length);
  assert.equal(boardBody.summary.knownValueCount+boardBody.summary.unknownValueCount,boardRows.length);
  assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!),"reading projections must not rewrite the opportunity");
});

test("an opportunity can be found by its title without exposing another seller's purchase",async()=>{
  const target=await source(),title=`Recompra exclusiva ${sequence}`;
  const response=await create(req(await bodyFor(target,{title})),target.context);assert.equal(response.status,201);const result=await response.json();
  const requestFor=(userId:string)=>new Request(`http://127.0.0.1/search?q=${encodeURIComponent(title)}`,{headers:{authorization:`Bearer ${tokens.get(userId)}`}});
  const context={params:Promise.resolve({tenantId})};
  const own=await search(requestFor(uid),context);assert.equal(own.status,200);
  assert.ok((await own.json()).leads.some((row:{id:string;opportunityTitle:string})=>row.id===result.opportunityId&&row.opportunityTitle===title));
  const hidden=await search(requestFor(peer),context);assert.equal(hidden.status,200);
  assert.ok(!(await hidden.json()).leads.some((row:{id:string})=>row.id===result.opportunityId));
});

test("human editing preserves unknown versus zero and rejects malformed amounts without a write",async()=>{
  const target=await source(),ref=target.ref;
  const update=(value:unknown)=>updateLead(new Request("http://127.0.0.1/lead",{method:"PATCH",headers:{authorization:`Bearer ${tokens.get(uid)}`,"content-type":"application/json"},body:JSON.stringify({potentialValue:value})}),target.context);
  assert.equal((await update(null)).status,200);assert.equal((await ref.get()).data()?.potentialValue,null);
  assert.equal((await update(0)).status,200);assert.equal((await ref.get()).data()?.potentialValue,0);
  assert.equal((await update("")).status,200);assert.equal((await ref.get()).data()?.potentialValue,null);
  const before=await ref.get();
  for(const value of [true,{},-1,"abc",1e13])assert.equal((await update(value)).status,400);
  assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
});

test("manual intake leaves an omitted forecast unknown, preserves explicit zero and rejects bad values before creating a record",async()=>{
  const createManual=(body:Record<string,unknown>)=>createLead(req({nome:`Cliente de teste ${++sequence}`,pipelineStage:"entrada",...body}),{params:Promise.resolve({tenantId})});
  for(const value of [undefined,0]){
    const response=await createManual(value===undefined?{}:{potentialValue:value});
    assert.ok([201,202].includes(response.status),`unexpected intake status ${response.status}`);
    const result=await response.json();assert.ok(result.leadId);
    assert.equal((await adminDb.collection("leads").doc(result.leadId).get()).data()?.potentialValue,value===undefined?null:0);
  }
  const before=await adminDb.collection("leads").where("tenantId","==",tenantId).count().get();
  for(const value of [false,-1,"abc",1e13])assert.equal((await createManual({potentialValue:value})).status,400);
  const after=await adminDb.collection("leads").where("tenantId","==",tenantId).count().get();
  assert.equal(after.data().count,before.data().count);
});

test("the limited pipeline reports partial coverage and counts missing values without pretending to count people",async()=>{
  const batch=adminDb.batch();
  for(let index=0;index<245;index++)batch.create(adminDb.collection("leads").doc(`${tenantId}_coverage_${String(index).padStart(3,"0")}`),{
    tenantId,ownerId:uid,nome:"Pessoa fictícia",recordKind:"opportunity",opportunityTitle:`Compra ${index}`,contactId:`${tenantId}_same_person`,pipelineStage:"entrada",potentialValue:index===0?0:null,
  });
  await batch.commit();
  const response=await pipeline(req(),{params:Promise.resolve({tenantId})});assert.equal(response.status,200);
  const result=await response.json(),items=result.columns.flatMap((column:{items:unknown[]})=>column.items);
  assert.equal(items.length,240);assert.deepEqual(result.coverage,{scope:"loaded_accessible_records",limit:240,hasMore:true});
  assert.equal(result.summary.recordCount,240);assert.equal(result.summary.explicitOpportunityCount,240);assert.equal(result.summary.legacyRecordCount,0);
  assert.equal(result.summary.knownValueCount,1);assert.equal(result.summary.unknownValueCount,239);assert.equal(result.summary.totalValue,0);
});
