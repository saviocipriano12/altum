import assert from "node:assert/strict";
import test from "node:test";
import robots from "../app/robots.ts";
import sitemap from "../app/sitemap.ts";
import { toJsonLdScript, buildArticleSchema } from "../lib/schema.ts";
import { publicSolutions } from "../lib/public-solutions.ts";

// The application package uses CommonJS; tsx's ESM test runner wraps default exports.
const getRobots =
  typeof robots === "function"
    ? robots
    : (robots as unknown as { default: typeof robots }).default;
const getSitemap =
  typeof sitemap === "function"
    ? sitemap
    : (sitemap as unknown as { default: typeof sitemap }).default;

test("crawler-specific rules keep private areas excluded", () => {
  const rules = getRobots().rules;
  for (const rule of Array.isArray(rules) ? rules : [rules]) {
    for (const route of [
      "/admin",
      "/cliente",
      "/api/",
      "/cadastro",
      "/login",
    ]) {
      assert.ok(
        rule.disallow?.includes(route),
        `${rule.userAgent}: missing ${route}`,
      );
    }
    assert.equal(rule.allow, "/");
  }
});

test("discovery sitemap contains canonical public solutions, no private or noindex templates", async () => {
  const entries = await getSitemap();
  const paths = entries.map((entry) => new URL(entry.url).pathname);
  assert.equal(paths.length, new Set(paths).size);
  assert.ok(
    !paths.some((path) =>
      /^\/(admin|cliente|api|cadastro|login|cidades)(\/|$)/.test(path),
    ),
  );
  assert.ok(!paths.includes("/rss.xml"));
  for (const solution of publicSolutions)
    assert.ok(paths.includes(`/solucoes/${solution.slug}`));
  assert.ok(!paths.includes("/solucoes/imobiliarias"));
  for (const entry of entries)
    if (entry.lastModified)
      assert.ok(Number.isFinite(new Date(entry.lastModified).getTime()));
});

test("structured data cannot terminate its script and preserves the supplied text", () => {
  const value = { text: '</script><script>alert("unexpected")</script>' };
  const encoded = toJsonLdScript(value).__html;
  assert.ok(!encoded.includes("<"));
  assert.deepEqual(JSON.parse(encoded), value);
});

test("team articles identify the editorial organization and include their actual image", () => {
  const article = buildArticleSchema({
    headline: "Guia",
    description: "Texto",
    url: "https://altumia.com.br/blog/guia",
    datePublished: "2026-10-16",
    authorName: "Time ALTUM",
    imageUrl: "/covers/cover-operacao-comercial.svg",
  });
  assert.equal(
    (article.author as Record<string, unknown>)["@type"],
    "Organization",
  );
  assert.equal(
    article.image,
    "https://altumia.com.br/covers/cover-operacao-comercial.svg",
  );
});
