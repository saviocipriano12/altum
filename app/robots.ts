import type { MetadataRoute } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://altumia.com.br")
  .trim()
  .replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/admin", "/cliente", "/api/", "/login", "/cadastro"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privatePaths },
      // Search discovery is separate from model training. Keep private routes excluded.
      { userAgent: "OAI-SearchBot", allow: "/", disallow: privatePaths },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
