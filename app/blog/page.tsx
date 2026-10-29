import type { Metadata } from "next";
import { SiteShell } from "@/components/public/site-shell";
import { PublicHero } from "@/components/public/shared/public-sections";
import { PublicBlogIndex } from "@/components/public/public-blog-index";
import { getAllBlogPosts } from "@/lib/blog";
import { buildItemListSchema, toJsonLdScript } from "@/lib/schema";
import { buildMarketingMetadata, SITE_URL } from "@/lib/public-site";
export const metadata: Metadata = {
  ...buildMarketingMetadata({
    title: "Guias de CRM, WhatsApp e vendas com IA",
    description:
      "Ideias e guias sobre atendimento, vendas, WhatsApp, automação e inteligência artificial para uma operação comercial melhor.",
    path: "/blog",
  }),
  alternates: {
    canonical: `${SITE_URL}/blog`,
    types: { "application/rss+xml": `${SITE_URL}/rss.xml` },
  },
};
export default async function BlogPage() {
  const posts = await getAllBlogPosts();
  return (
    <SiteShell>
      <PublicHero
        breadcrumbs={[
          { name: "Início", href: "/" },
          { name: "Guias e conteúdos", href: "/blog" },
        ]}
        eyebrow="Conteúdos Altum"
        title={
          <>
            Ideias que conectam.
            <br />
            Conhecimento que faz avançar.
          </>
        }
        description="Atendimento, vendas, automação e inteligência artificial. Leituras para transformar o dia a dia da sua operação."
      />
      <PublicBlogIndex posts={posts} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={toJsonLdScript(
          buildItemListSchema({
            name: "Conteúdos Altum",
            description:
              "Artigos sobre atendimento, vendas e inteligência artificial.",
            url: `${SITE_URL}/blog`,
            itemUrls: posts.map((post) => `${SITE_URL}/blog/${post.slug}`),
          }),
        )}
      />
    </SiteShell>
  );
}
