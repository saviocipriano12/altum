import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteShell } from "@/components/public/site-shell";
import { getAllBlogPosts } from "@/lib/blog";
import { buildItemListSchema, toJsonLdScript } from "@/lib/schema";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://altum.ag").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Blog",
  description: "Insights praticos sobre engenharia de vendas, IA no comercial e operacao de crescimento previsivel.",
  alternates: {
    canonical: `${SITE_URL}/blog`,
    types: {
      "application/rss+xml": `${SITE_URL}/rss.xml`,
    },
  },
  openGraph: {
    type: "website",
    title: "Blog ALTUM",
    description: "Conteudos tecnicos para captacao qualificada, automacao e escala comercial.",
    url: `${SITE_URL}/blog`,
  },
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

export default async function BlogPage() {
  const posts = await getAllBlogPosts();
  const itemListSchema = buildItemListSchema({
    name: "Blog ALTUM",
    description: "Artigos tecnicos sobre IA, automacao comercial, WhatsApp e geracao de leads B2B.",
    url: `${SITE_URL}/blog`,
    itemUrls: posts.map((post) => `${SITE_URL}/blog/${post.slug}`),
  });

  return (
    <SiteShell>
    <div className="min-h-screen bg-[#0B0B0B] px-6 py-20 text-white">
      <section className="mx-auto w-full max-w-6xl">
        <p className="mb-4 text-sm uppercase tracking-[0.2em] text-[#F56E0F]">Blog ALTUM</p>
        <h1 className="mb-4 text-4xl font-bold md:text-5xl">Inteligência para uma operação comercial mais previsível</h1>
        <p className="mb-12 max-w-3xl text-lg leading-8 text-white/75">
          Artigos sobre atendimento, vendas, automação, inteligência artificial e decisões que aproximam a operação da receita.
        </p>

        <div className="grid gap-8 md:grid-cols-2">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition-transform duration-300 hover:-translate-y-1"
            >
              <Link href={`/blog/${post.slug}`} className="block overflow-hidden">
                <Image
                  src={post.coverImage}
                  alt={post.title}
                  width={1200}
                  height={675}
                  className="h-56 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </Link>

              <div className="p-6">
                <p className="mb-2 text-xs uppercase tracking-[0.12em] text-white/60">
                  {post.category} - {formatDate(post.date)} - {post.readingTime}
                </p>
                <h2 className="mb-3 text-2xl font-semibold leading-snug">
                  <Link href={`/blog/${post.slug}`} className="transition-colors hover:text-[#F56E0F]">
                    {post.title}
                  </Link>
                </h2>
                <p className="mb-5 text-white/75">{post.description}</p>
                <Link href={`/blog/${post.slug}`} className="text-sm font-semibold text-[#F56E0F] hover:text-[#ff8e44]">
                  Ler artigo
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(itemListSchema)} />
    </div>
    </SiteShell>
  );
}
