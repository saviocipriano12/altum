import type { MetadataRoute } from "next";
import { cityPages } from "@/data/city-pages";
import { segmentPages } from "@/data/segment-pages";
import { getAllBlogPosts } from "@/lib/blog";
import { verticals } from "@/lib/verticals";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.altumia.com.br").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllBlogPosts();
  const staticRoutes = [
    "",
    "/blog",
    "/solucoes",
    "/segmentos",
    "/automacao-com-ia",
    "/ia-no-whatsapp",
    "/chatbot-para-empresas",
  ];

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.9,
  }));

  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const verticalEntries: MetadataRoute.Sitemap = verticals.map((vertical) => ({
    url: `${SITE_URL}/solucoes/${vertical.slug}`,
    changeFrequency: "monthly",
    priority: 0.78,
  }));

  const segmentEntries: MetadataRoute.Sitemap = segmentPages.map((segment) => ({
    url: `${SITE_URL}/segmentos/${segment.slug}`,
    changeFrequency: "monthly",
    priority: 0.72,
  }));

  const cityEntries: MetadataRoute.Sitemap = cityPages.map((city) => ({
    url: `${SITE_URL}/cidades/${city.slug}`,
    changeFrequency: "monthly",
    priority: 0.55,
  }));

  return [...staticEntries, ...blogEntries, ...verticalEntries, ...segmentEntries, ...cityEntries];
}
