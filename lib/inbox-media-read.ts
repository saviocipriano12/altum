/** Fetch private media as bytes. No expiring signed URL or public access is needed. */
export async function readInboxMedia(
  request: (signal: AbortSignal) => Promise<Response>, signal: AbortSignal, timeoutMs = 60000
) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await request(controller.signal);
    if (!response.ok) throw new Error(`media_http_${response.status}`);
    const blob = await response.blob();
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (!blob.size || /application\/json|text\/html/i.test(blob.type)) throw new Error("media_invalid_response");
    return blob;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
