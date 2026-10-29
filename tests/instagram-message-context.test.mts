import { test } from "node:test";
import assert from "node:assert/strict";
import { extractInstagramMessageContext, normalizeInstagramMessageContext, instagramStoryPresentation } from "../lib/instagram-message-context.ts";

test("story response preserves origin independently of reply text or emoji", () => {
  for (const text of ["Qual o preço?", "😍"]) {
    assert.deepEqual(extractInstagramMessageContext({ text, reply_to: { story: { id: "story-1", url: "https://lookaside.fbsbx.com/story" } } }), {
      kind: "story_reply", storyId: "story-1", previewUrl: "https://lookaside.fbsbx.com/story", messageId: null, text: null,
    });
  }
});

test("mention without text or media URL retains story context", () => {
  assert.equal(extractInstagramMessageContext({ attachments: [{ type: "story_mention", payload: {} }] })?.kind, "story_mention");
});

test("ordinary message replies retain provider message reference", () => {
  const context = extractInstagramMessageContext({ reply_to: { mid: "original", text: "Olá" } });
  assert.equal(context?.kind, "message_reply");
  assert.equal(context?.messageId, "original");
  assert.equal(context?.text, "Olá");
  assert.equal(extractInstagramMessageContext({ text: "DM comum" }), null);
});

test("untrusted preview URLs are rejected without losing the origin", () => {
  for (const url of ["javascript:alert(1)", "https://fbcdn.net.evil.com/story", "http://lookaside.fbsbx.com/story", "https://example.com/story"]) {
    assert.equal(normalizeInstagramMessageContext({ kind: "story_reply", previewUrl: url })?.previewUrl, null);
  }
  assert.equal(normalizeInstagramMessageContext({ kind: "unknown" }), null);
});
test("video sources, posters and Instagram links retain their types and reject untrusted targets", () => {
 const context=normalizeInstagramMessageContext({kind:"story_reply",storyId:"123",mediaType:"VIDEO",mediaUrl:"https://scontent.fbcdn.net/story.mp4",previewUrl:"https://scontent.fbcdn.net/story.jpg",permalink:"https://www.instagram.com/stories/qa/123/"});
 assert.equal(context?.mediaType,"VIDEO");assert.ok(context?.mediaUrl?.endsWith(".mp4"));assert.ok(context?.previewUrl?.endsWith(".jpg"));
 const unsafe=normalizeInstagramMessageContext({...context,mediaUrl:"https://localhost/private",permalink:"https://instagram.com.evil.test/story"});assert.equal(unsafe?.mediaUrl,null);assert.equal(unsafe?.permalink,null);
});
test("story player uses MP4 as video, JPEG as poster, and supports poster-only videos", () => {
 const context=normalizeInstagramMessageContext({kind:"story_reply",mediaType:"VIDEO",mediaUrl:"https://scontent.fbcdn.net/story.mp4",previewUrl:"https://scontent.fbcdn.net/story.jpg"})!;
 assert.deepEqual(instagramStoryPresentation(context),{kind:"video",src:context.mediaUrl,poster:context.previewUrl});
 assert.deepEqual(instagramStoryPresentation({...context,mediaUrl:null}),{kind:"image",src:context.previewUrl,poster:undefined});
});
