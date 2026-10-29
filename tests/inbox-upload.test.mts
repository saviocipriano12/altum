import test from "node:test";
import assert from "node:assert/strict";
import { waitForInboxUpload, canFallbackInboxVideoUpload, clearAcknowledgedMediaCaption, describeInboxMediaFailure } from "../lib/inbox-upload.ts";

test("media network failures describe uncertain delivery and page-only file retention", () => {
  for (const message of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Network request failed", "Load failed", "fetch failed"]) {
    const result = describeInboxMediaFailure(new TypeError(message));
    assert.match(result, /confirmar o envio/);
    assert.match(result, /nesta pagina/);
    assert.match(result, /tente novamente/);
    assert.doesNotMatch(result, /nao foi enviado|entregue|salvo permanentemente/i);
  }
  assert.match(describeInboxMediaFailure(null), /confirmar o envio/);
});

test("media failure guidance preserves specific timeout and format errors", () => {
  assert.match(describeInboxMediaFailure(new Error("storage/unauthorized")), /administrador/);
  for (const message of ["Formato nao permitido.", "O upload parou de progredir. O arquivo foi mantido; tente novamente."]) {
    assert.equal(describeInboxMediaFailure(new Error(message)), message);
  }
});

test("lost dispatch acknowledgement after upload cannot select another transport", () => {
  assert.equal(canFallbackInboxVideoUpload("video", 1024, true), false);
});

test("upload failure retains the existing small-video fallback only before dispatch", () => {
  assert.equal(canFallbackInboxVideoUpload("video", 32 * 1024 * 1024, false), true);
  assert.equal(canFallbackInboxVideoUpload("video", 32 * 1024 * 1024 + 1, false), false);
  assert.equal(canFallbackInboxVideoUpload("image", 1024, false), false);
});

test("media acknowledgement preserves a newer composer draft exactly", () => {
  assert.equal(clearAcknowledgedMediaCaption("Nova mensagem\n🙂", "Legenda enviada"), "Nova mensagem\n🙂");
  assert.equal(clearAcknowledgedMediaCaption("Legenda enviada", "Legenda enviada"), "");
  assert.equal(clearAcknowledgedMediaCaption(" Legenda enviada ", "Legenda enviada"), " Legenda enviada ");
});

test("stalled upload is cancelled and observer detached", async () => {
  let cancelled = 0, detached = 0;
  await assert.rejects(waitForInboxUpload({ on: () => () => { detached++; }, cancel: () => { cancelled++; return true; } }, () => {}, 10), /parou de progredir/);
  assert.equal(cancelled, 1); assert.equal(detached, 1);
});
test("byte progress allows uploads longer than the idle deadline", async () => {
  let cancelled = false;
  const percentages: number[] = [];
  await waitForInboxUpload({ on: (_event, progress, _error, complete) => {
    let bytes = 0;
    const timer = setInterval(() => { bytes++; progress({ bytesTransferred: bytes, totalBytes: 5 }); if (bytes === 5) complete(); }, 5);
    return () => clearInterval(timer);
  }, cancel: () => { cancelled = true; return true; } }, (percent) => percentages.push(percent), 20);
  assert.equal(cancelled, false); assert.equal(percentages.at(-1), 100);
});
test("identical progress notifications cannot keep a stalled upload alive", async () => {
  let detached = false;
  await assert.rejects(waitForInboxUpload({ on: (_event, progress) => {
    const timer = setInterval(() => progress({ bytesTransferred: 0, totalBytes: 50 }), 3);
    return () => { clearInterval(timer); detached = true; };
  }, cancel: () => true }, () => {}, 15), /parou de progredir/);
  assert.equal(detached, true);
});
test("synchronous provider failure is surfaced and detached", async () => {
  let detached = false;
  await assert.rejects(waitForInboxUpload({ on: (_event, _progress, error) => {
    error(new Error("storage denied")); return () => { detached = true; };
  }, cancel: () => true }, () => {}, 10), /storage denied/);
  assert.equal(detached, true);
});
