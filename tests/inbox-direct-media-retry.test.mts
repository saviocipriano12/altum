import test from "node:test";
import assert from "node:assert/strict";
import { sendInboxDirectMedia, probeInboxUploadedObject, inboxMediaContentSha256, type InboxMediaAttempt } from "../lib/inbox-upload.ts";

const attempt = (): InboxMediaAttempt => Object.freeze({ caption: "Original", replyToId: null, composerText: null });

test("client digest binds exact selected bytes and reuses work for the same File", async () => {
  const file = new Blob(["abc"]);
  const first = inboxMediaContentSha256(file);
  assert.equal(inboxMediaContentSha256(file), first);
  assert.equal(await first, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(await inboxMediaContentSha256(new Blob(["abd"])), await first);
});

test("lost API acknowledgement retries dispatch without rewriting a completed immutable upload", async () => {
  let uploads = 0, dispatches = 0, panels = 0;
  const input = { attempt: attempt(), file: {}, storagePath: "tenant/chat/user/one",
    upload: async () => { uploads++; if (uploads > 1) throw new Error("storage/unauthorized"); },
    sendStored: async () => { dispatches++; if (dispatches === 1) throw new Error("Failed to fetch"); return "same-job"; },
    sendPanel: async () => { panels++; return "other-transport"; }, allowPanelFallback: true };
  await assert.rejects(sendInboxDirectMedia(input), /Failed to fetch/);
  assert.equal(await sendInboxDirectMedia(input), "same-job");
  assert.deepEqual([uploads, dispatches, panels], [1, 2, 0]);
});

test("HTTP error response also preserves completed upload for retry", async () => {
  let uploads = 0, calls = 0;
  const input = { attempt: attempt(), file: {}, storagePath: "two",
    upload: async () => { uploads++; }, sendStored: async () => ++calls === 1 ? 503 : 200,
    sendPanel: async () => { throw new Error("unexpected fallback"); }, allowPanelFallback: false };
  assert.equal(await sendInboxDirectMedia(input), 503);
  assert.equal(await sendInboxDirectMedia(input), 200);
  assert.equal(uploads, 1);
});

test("fallback is sticky after an uncertain panel dispatch", async () => {
  let uploads = 0, panels = 0;
  const input = { attempt: attempt(), file: {}, storagePath: "three",
    upload: async () => { uploads++; throw new Error("storage denied"); },
    sendStored: async () => { throw new Error("must not switch to stored dispatch"); },
    sendPanel: async () => { if (++panels === 1) throw new Error("timeout"); return "same-panel-job"; }, allowPanelFallback: true };
  await assert.rejects(sendInboxDirectMedia(input), /timeout/);
  assert.equal(await sendInboxDirectMedia(input), "same-panel-job");
  assert.deepEqual([uploads, panels], [1, 2]);
});

test("failed upload without fallback can resume; a different File cannot reuse a receipt", async () => {
  let uploads = 0;
  const input = { attempt: attempt(), file: {}, storagePath: "four",
    upload: async () => { if (++uploads === 1) throw new Error("offline"); },
    sendStored: async () => "job", sendPanel: async () => "forbidden", allowPanelFallback: false };
  await assert.rejects(sendInboxDirectMedia(input), /offline/);
  assert.equal(await sendInboxDirectMedia(input), "job");
  await assert.rejects(sendInboxDirectMedia({ ...input, file: {} }), /arquivo desta tentativa mudou/);
  assert.equal(uploads, 2);
});

test("concurrent retries share upload and tenant/chat/user paths never share receipts", async () => {
  let uploads = 0;
  const input = { attempt: attempt(), file: {}, storagePath: "tenant-a/chat/user/one",
    upload: async () => { uploads++; }, sendStored: async () => "job",
    sendPanel: async () => "forbidden", allowPanelFallback: false };
  assert.deepEqual(await Promise.all([sendInboxDirectMedia(input), sendInboxDirectMedia(input)]), ["job", "job"]);
  assert.equal(uploads, 1);
  await sendInboxDirectMedia({ ...input, storagePath: "tenant-b/chat/user/one" });
  await sendInboxDirectMedia({ ...input, attempt: attempt() });
  assert.equal(uploads, 3);
});

test("lost upload callback recovers existing object then retries uncertain API without another upload", async () => {
  let uploads = 0, probes = 0, dispatches = 0;
  const input = { attempt: attempt(), file: {}, storagePath: "lost-upload-callback",
    upload: async () => { uploads++; throw new Error("completion callback lost"); },
    probeUploaded: async () => { probes++; return true; },
    sendStored: async () => { if (++dispatches === 1) throw new Error("lost API response"); return 200; },
    sendPanel: async () => { throw new Error("must not switch transport"); }, allowPanelFallback: true };
  await assert.rejects(sendInboxDirectMedia(input), /lost API response/);
  assert.equal(await sendInboxDirectMedia(input), 200);
  assert.deepEqual([uploads, probes, dispatches], [1, 1, 2]);
});

test("unknown upload existence preserves the draft without starting another transport", async () => {
  let probes = 0, panels = 0, dispatches = 0;
  const input = { attempt: attempt(), file: {}, storagePath: "unknown-upload",
    upload: async () => { throw new Error("storage/unauthorized"); },
    probeUploaded: async () => { if (++probes === 1) throw new Error("offline"); return true; },
    sendStored: async () => { dispatches++; return 200; }, sendPanel: async () => { panels++; return 200; }, allowPanelFallback: true };
  await assert.rejects(sendInboxDirectMedia(input), /confirmar o upload.*mantido nesta pagina/);
  assert.deepEqual([panels, dispatches], [0, 0]);
  assert.equal(await sendInboxDirectMedia(input), 200);
  assert.deepEqual([panels, dispatches, probes], [0, 1, 2]);
});

test("confirmed missing upload retains the pre-dispatch fallback", async () => {
  let panels = 0;
  assert.equal(await sendInboxDirectMedia({ attempt: attempt(), file: {}, storagePath: "missing-upload",
    upload: async () => { throw new Error("upload failed before commit"); }, probeUploaded: async () => false,
    sendStored: async () => { throw new Error("missing file cannot be dispatched"); },
    sendPanel: async () => { panels++; return 200; }, allowPanelFallback: true }), 200);
  assert.equal(panels, 1);
});

test("metadata probe never treats permission or network errors as proof of absence", async () => {
  assert.equal(await probeInboxUploadedObject(async () => ({ generation: "1" })), true);
  assert.equal(await probeInboxUploadedObject(async () => { throw { code: "storage/object-not-found" }; }), false);
  for (const code of ["storage/unauthorized", "storage/retry-limit-exceeded", "network-error"]) {
    await assert.rejects(probeInboxUploadedObject(async () => { throw Object.assign(new Error(code), { code }); }), new RegExp(code));
  }
});
