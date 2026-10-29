export class InboxRequestTimeoutError extends Error {
  constructor() {
    super("A resposta demorou demais. Seus dados foram mantidos; tente novamente.");
    this.name = "InboxRequestTimeoutError";
  }
}

/** Bounds auth-token restoration, fetch and JSON body consumption as one operation. */
export async function fetchInboxJson<T>(fetcher: (signal: AbortSignal) => Promise<Response>, timeoutMs = 25000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new InboxRequestTimeoutError());
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(controller.signal);
        const payload = await response.json() as T;
        return { response, payload };
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
