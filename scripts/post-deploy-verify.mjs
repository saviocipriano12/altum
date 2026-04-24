const baseUrlRaw = process.env.POST_DEPLOY_BASE_URL || "";
const baseUrl = baseUrlRaw.trim().replace(/\/$/, "");

if (!baseUrl) {
  console.error("Missing POST_DEPLOY_BASE_URL.");
  console.error("Example: POST_DEPLOY_BASE_URL=https://app.altum.com.br npm run verify:postdeploy");
  process.exit(1);
}

function joinUrl(path) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function requestJson(path, init = {}) {
  const url = joinUrl(path);
  const response = await fetch(url, {
    redirect: "follow",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { url, response, body };
}

function assertStatus(result, expected, label) {
  if (!expected.includes(result.response.status)) {
    throw new Error(
      `${label} failed: expected status ${expected.join(" or ")}, got ${result.response.status} at ${result.url}`
    );
  }
  console.log(`ok - ${label}: ${result.response.status}`);
}

function assertHeaderContains(response, headerName, expectedPart, label) {
  const value = response.headers.get(headerName) || "";
  if (!value.toLowerCase().includes(expectedPart.toLowerCase())) {
    throw new Error(`${label} failed: header ${headerName} missing "${expectedPart}"`);
  }
  console.log(`ok - ${label}: ${headerName}`);
}

async function run() {
  console.log(`Running post-deploy verification on ${baseUrl}`);

  const home = await requestJson("/");
  assertStatus(home, [200], "home page availability");
  assertHeaderContains(home.response, "strict-transport-security", "max-age", "hsts header");
  assertHeaderContains(home.response, "content-security-policy", "default-src", "csp header");
  assertHeaderContains(home.response, "x-frame-options", "deny", "x-frame-options header");
  assertHeaderContains(
    home.response,
    "x-content-type-options",
    "nosniff",
    "x-content-type-options header"
  );

  const privacy = await requestJson("/politica-de-privacidade");
  assertStatus(privacy, [200], "privacy policy page");

  const metaGet = await requestJson(
    "/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=test"
  );
  assertStatus(metaGet, [403], "meta webhook challenge with invalid token");

  const waGet = await requestJson(
    "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=test"
  );
  assertStatus(waGet, [403], "whatsapp webhook challenge with invalid token");

  const asaasPost = await requestJson("/api/webhooks/asaas", {
    method: "POST",
    body: JSON.stringify({ event: "PAYMENT_CONFIRMED", payment: { id: "fake" } }),
  });
  assertStatus(asaasPost, [401], "asaas webhook rejects invalid token");

  const internalJob = await requestJson("/api/internal/jobs/ai/process?health=1");
  assertStatus(internalJob, [401], "internal job endpoint rejects anonymous request");

  const adminEndpoint = await requestJson("/api/admin/integrations/status");
  assertStatus(adminEndpoint, [401], "admin endpoint rejects anonymous request");

  console.log("Post-deploy verification passed.");
}

run().catch((error) => {
  console.error("Post-deploy verification failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
