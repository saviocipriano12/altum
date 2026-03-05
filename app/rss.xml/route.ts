import { NextResponse } from "next/server";
import { getAllBlogPosts } from "@/lib/blog";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET() {
  const posts = await getAllBlogPosts();
  const sortedPosts = [...posts].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  const latestPostDate =
    sortedPosts.length > 0 && !Number.isNaN(Date.parse(sortedPosts[0].date))
      ? new Date(sortedPosts[0].date)
      : new Date();

  const itemsXml = sortedPosts
    .map((post) => {
      const link = `${SITE_URL}/blog/${post.slug}`;
      const pubDate = new Date(post.date);
      const normalizedPubDate = Number.isNaN(pubDate.getTime()) ? new Date() : pubDate;
      const categories = post.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join("\n");

      return `<item>
<title>${escapeXml(post.title)}</title>
<link>${escapeXml(link)}</link>
<guid>${escapeXml(link)}</guid>
<description>${escapeXml(post.description)}</description>
<pubDate>${normalizedPubDate.toUTCString()}</pubDate>
${categories}
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>Blog ALTUM</title>
<link>${SITE_URL}/blog</link>
<description>Insights sobre IA, automacao comercial, WhatsApp e geracao de leads B2B.</description>
<language>pt-BR</language>
<lastBuildDate>${latestPostDate.toUTCString()}</lastBuildDate>
<atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
${itemsXml}
</channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
