import type { MetadataRoute } from "next";
import { segmentPages } from "@/data/segment-pages";
import { getAllBlogPosts } from "@/lib/blog";
import { publicSolutions } from "@/lib/public-solutions";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://altumia.com.br")
  .trim()
  .replace(/\/+$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const configuredDate = process.env.NEXT_PUBLIC_SITE_UPDATED_AT;
  const siteUpdatedAt =
    configuredDate && Number.isFinite(Date.parse(configuredDate))
      ? new Date(configuredDate)
      : undefined;
  const posts = await getAllBlogPosts();
  const staticRoutes = [
    "",
    "/blog",
    "/contato",
    "/diagnostico",
    "/implantacao",
    "/plataforma",
    "/precos",
    "/sobre",
    "/integracoes",
    "/politica-de-privacidade",
    "/termos",
    "/agencia",
    "/portfolio",
    "/estrutura-digital",
    "/exclusao-de-dados",
    "/solucoes",
    "/segmentos",
    "/crm",
    "/crm-para-whatsapp",
    "/inbox",
    "/pipeline",
    "/follow-up",
    "/ia-para-vendas",
    "/qualificacao-de-leads-com-ia",
    "/automacoes",
    "/automacao-com-ia",
    "/automacao-instagram",
    "/ia-no-whatsapp",
    "/chatbot-whatsapp",
  ];

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: siteUpdatedAt,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.9,
  }));

  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt || post.date),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const segmentEntries: MetadataRoute.Sitemap = segmentPages.map((segment) => ({
    url: `${SITE_URL}/segmentos/${segment.slug}`,
    lastModified: siteUpdatedAt,
    changeFrequency: "monthly",
    priority: 0.72,
  }));

  const solutionEntries: MetadataRoute.Sitemap = publicSolutions.map(
    (solution) => ({
      url: `${SITE_URL}/solucoes/${solution.slug}`,
      lastModified: siteUpdatedAt,
      changeFrequency: "monthly",
      priority: 0.9,
    }),
  );
  return [
    ...staticEntries,
    ...blogEntries,
    ...segmentEntries,
    ...solutionEntries,
  ];
}
