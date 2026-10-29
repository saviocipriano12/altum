import test,{after} from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env,{FIREBASE_PROJECT_ID:"demo-altum-qa-lab",NEXT_PUBLIC_FIREBASE_PROJECT_ID:"demo-altum-qa-lab",FIREBASE_STORAGE_EMULATOR_HOST:"127.0.0.1:9199",STORAGE_EMULATOR_HOST:"http://127.0.0.1:9199",FIREBASE_STORAGE_BUCKET:"demo-altum-qa-lab.appspot.com",NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:"",FIREBASE_SERVICE_ACCOUNT_KEY:"",FIREBASE_CLIENT_EMAIL:"",FIREBASE_PRIVATE_KEY:"",GOOGLE_APPLICATION_CREDENTIALS:""});
const {adminDb,adminStorage}=await import("../app/lib/server/firebase-admin.ts");
const {saveChatMediaBuffer:save,findFirebaseStorageFile:find}=await import("../lib/server/firebase-storage.ts");
const tenantId=`qa_media_identity_${Date.now()}`,chatId=`${tenantId}_chat`,bucket=adminStorage.bucket(process.env.FIREBASE_STORAGE_BUCKET),ownedPrefix=`chat-media/${tenantId}/`;
const common={tenantId,chatId,contentType:"application/octet-stream",filename:"arquivo.bin"};
const longPrefix="provider-message-".padEnd(180,"x"),first=longPrefix+"a".repeat(60),second=longPrefix+"b".repeat(60);
after(async()=>{const [files]=await bucket.getFiles({prefix:ownedPrefix});for(const file of files){assert.ok(file.name.startsWith(ownedPrefix));await file.delete({ignoreNotFound:true});}await adminDb.terminate();});
const bytes=async(path:string)=>(await bucket.file(path).download())[0];
test("240-character provider identities sharing their first 180 characters retain separate files",async()=>{
  const a=await save({...common,messageId:first,data:Buffer.from("Arquivo A")}),b=await save({...common,messageId:second,data:Buffer.from("Arquivo B")});assert.notEqual(a,b);assert.equal((await bytes(a)).toString(),"Arquivo A");assert.equal((await bytes(b)).toString(),"Arquivo B");
});
test("even identical bytes do not collapse distinct long message identities",async()=>{
  const data=Buffer.from("Mesmo conteudo"),a=await save({...common,messageId:first,data}),b=await save({...common,messageId:second,data});assert.notEqual(a,b);
});
test("a changed asset under the same message never overwrites the accepted source",async()=>{
  const a=await save({...common,messageId:"qa-reused-message",data:Buffer.from("Original")}),b=await save({...common,messageId:"qa-reused-message",data:Buffer.from("Novo arquivo")});assert.notEqual(a,b);assert.equal((await bytes(a)).toString(),"Original");
});
test("an identical retry reuses the original object generation",async()=>{
  const input={...common,messageId:"qa-media-retry",data:Buffer.from("Repeticao")},path=await save(input),[before]=await bucket.file(path).getMetadata();assert.equal(await save(input),path);const [after]=await bucket.file(path).getMetadata();assert.equal(after.generation,before.generation);
});
test("concurrent identical writes converge without changing the source",async()=>{
  const input={...common,messageId:"qa-media-concurrent",data:Buffer.from("Concorrente")},paths=await Promise.all([save(input),save(input),save(input)]);assert.equal(new Set(paths).size,1);assert.equal((await bytes(paths[0])).toString(),"Concorrente");
});
test("original and playback roles preserve distinct objects even when their bytes match",async()=>{
  const input={...common,messageId:"qa-media-roles",data:Buffer.from("Papel separado")},original=await save(input),playback=await save({...input,variant:"playback"});assert.notEqual(original,playback);
});
test("existing legacy object paths remain readable without a migration",async()=>{
  const path=`${ownedPrefix}${chatId}/qa-legacy-message.ogg`;await bucket.file(path).save(Buffer.from("Arquivo legado"),{resumable:false,metadata:{contentType:"audio/ogg"}});const file=await find(path);assert.ok(file);assert.equal((await file.download())[0].toString(),"Arquivo legado");
});
