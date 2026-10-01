(function () {
  "use strict";

  if (window.Altum && window.Altum.loaded) return;
  var script = document.currentScript;
  var writeKey = script && script.getAttribute("data-key");
  if (!writeKey) return;

  var collector = new URL("/api/growth/collect", script.src).toString();
  var consentMode = script.getAttribute("data-consent-mode") === "implicit" ? "implicit" : "required";
  var storagePrefix = "altum_" + writeKey.slice(-8) + "_";
  var externalId = "";

  function id() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function read(storage, key) {
    try { return storage.getItem(storagePrefix + key) || ""; } catch { return ""; }
  }

  function write(storage, key, value) {
    try { storage.setItem(storagePrefix + key, value); } catch {}
  }

  function getAnonymousId() {
    var value = read(localStorage, "anonymous_id") || id();
    write(localStorage, "anonymous_id", value);
    return value;
  }

  function getSessionId() {
    var now = Date.now();
    var lastActivity = Number(read(localStorage, "last_activity") || 0);
    var value = read(localStorage, "session_id");
    if (!value || now - lastActivity > 30 * 60 * 1000) value = id();
    write(localStorage, "session_id", value);
    write(localStorage, "last_activity", String(now));
    return value;
  }

  function currentAttribution() {
    var params = new URLSearchParams(location.search);
    var current = {
      source: params.get("utm_source") || "",
      medium: params.get("utm_medium") || "",
      campaign: params.get("utm_campaign") || "",
      content: params.get("utm_content") || "",
      term: params.get("utm_term") || "",
      gclid: params.get("gclid") || "",
      fbclid: params.get("fbclid") || "",
      fbc: readCookie("_fbc"),
      fbp: readCookie("_fbp")
    };
    var hasCampaign = Object.keys(current).some(function (key) { return Boolean(current[key]); });
    if (hasCampaign) write(localStorage, "last_attribution", JSON.stringify(current));
    try { return hasCampaign ? current : JSON.parse(read(localStorage, "last_attribution") || "{}"); }
    catch { return current; }
  }

  function readCookie(name) {
    var prefix = name + "=";
    var parts = document.cookie ? document.cookie.split(";") : [];
    for (var index = 0; index < parts.length; index += 1) {
      var part = parts[index].trim();
      if (part.indexOf(prefix) === 0) return decodeURIComponent(part.slice(prefix.length)).slice(0, 300);
    }
    return "";
  }

  function hasConsent() {
    return consentMode === "implicit" || read(localStorage, "consent") === "granted";
  }

  function send(name, properties) {
    if (!hasConsent()) return false;
    properties = properties || {};
    var payload = {
      writeKey: writeKey,
      event: {
        eventId: id(),
        name: name,
        occurredAt: new Date().toISOString(),
        anonymousId: getAnonymousId(),
        sessionId: getSessionId(),
        externalId: externalId,
        url: location.href,
        path: location.pathname,
        title: document.title,
        referrer: document.referrer,
        value: Number(properties.value || 0),
        currency: properties.currency || "BRL",
        properties: properties,
        attribution: currentAttribution()
      }
    };
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      return navigator.sendBeacon(collector, new Blob([body], { type: "application/json" }));
    }
    fetch(collector, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
    return true;
  }

  function consent(status) {
    var normalized = status === "granted" ? "granted" : "denied";
    write(localStorage, "consent", normalized);
    if (normalized === "granted" && !read(sessionStorage, "page_view")) {
      write(sessionStorage, "page_view", "1");
      send("page_view");
    }
  }

  function identify(value) {
    externalId = typeof value === "string" ? value.slice(0, 180) : "";
  }

  // Checkout externo nao deve receber PII pela URL. Esta funcao preserva somente
  // os IDs anonimos e a origem comercial para que o adaptador do checkout possa
  // devolver a compra para a Altum com a mesma jornada.
  function decorateCheckout(value) {
    try {
      var checkout = new URL(value, location.href);
      checkout.searchParams.set("altum_vid", getAnonymousId());
      checkout.searchParams.set("altum_sid", getSessionId());
      var attribution = currentAttribution();
      ["source", "medium", "campaign", "content", "term", "gclid", "fbclid"].forEach(function (key) {
        if (attribution[key] && !checkout.searchParams.has("utm_" + key)) {
          checkout.searchParams.set(key === "source" || key === "medium" || key === "campaign" || key === "content" || key === "term" ? "utm_" + key : key, attribution[key]);
        }
      });
      return checkout.toString();
    } catch {
      return "";
    }
  }

  window.Altum = { loaded: true, track: send, identify: identify, consent: consent, decorateCheckout: decorateCheckout };

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("a,button,[data-altum-event]") : null;
    if (!target) return;
    var customEvent = target.getAttribute("data-altum-event");
    var href = target.getAttribute("href") || "";
    if (target.hasAttribute("data-altum-checkout") && href) {
      var decorated = decorateCheckout(href);
      if (decorated) target.setAttribute("href", decorated);
    }
    if (customEvent) send(customEvent, { label: target.getAttribute("data-altum-label") || target.textContent.trim().slice(0, 120) });
    else if (/wa\.me|whatsapp\.com|api\.whatsapp\.com/i.test(href)) send("whatsapp_clicked", { destination: href });
  }, true);

  if (hasConsent()) {
    write(sessionStorage, "page_view", "1");
    send("page_view");
  }
})();
