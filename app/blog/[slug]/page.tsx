import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeSanitize from "rehype-sanitize";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import CTABox from "@/components/blog/CTABox";
import PostHero from "@/components/blog/PostHero";
import RelatedPosts from "@/components/blog/RelatedPosts";
import TableOfContents from "@/components/blog/TableOfContents";
import Callout from "@/components/mdx/Callout";
import Checklist from "@/components/mdx/Checklist";
import FAQAccordion from "@/components/mdx/FAQAccordion";
import Quote from "@/components/mdx/Quote";
import Stats from "@/components/mdx/Stats";
import Steps from "@/components/mdx/Steps";
import {
  extractBlogHeadings,
  getAllBlogPosts,
  getBlogPostBySlug,
  getRelatedPosts,
} from "@/lib/blog";
import { buildArticleSchema, toJsonLdScript } from "@/lib/schema";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const dynamicParams = false;

export async function generateStaticParams() {
  const posts = await getAllBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return {};

  const canonical = `${SITE_URL}/blog/${post.meta.slug}`;
  const ogImageUrl = `${SITE_URL}/blog/${post.meta.slug}/opengraph-image`;

  return {
    title: post.meta.title,
    description: post.meta.description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "article",
      title: post.meta.title,
      description: post.meta.description,
      url: canonical,
      publishedTime: post.meta.date,
      authors: [post.meta.author],
      tags: post.meta.tags,
      images: [
        {
          url: ogImageUrl,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.meta.title,
      description: post.meta.description,
      images: [ogImageUrl],
    },
  };
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const getTextFromNode = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextFromNode).join("");
  if (node && typeof node === "object" && "props" in node) {
    const withProps = node as { props?: { children?: ReactNode } };
    return getTextFromNode(withProps.props?.children ?? "");
  }
  return "";
};

const injectInlineCta = (content: string): string => {
  const matches = [...content.matchAll(/^##\s+.+$/gm)];
  if (matches.length === 0) return `${content}\n\n<CTABox variant="inline" />`;

  const target = matches[Math.floor(matches.length / 2)];
  const targetIndex = (target.index ?? 0) + target[0].length;
  return `${content.slice(0, targetIndex)}\n\n<CTABox variant="inline" />\n\n${content.slice(targetIndex)}`;
};

const mdxComponents = {
  CTABox,
  Callout,
  Steps,
  Checklist,
  Stats,
  Quote,
  FAQAccordion,
  h2: (props: HTMLAttributes<HTMLHeadingElement>) => {
    const text = getTextFromNode(props.children);
    return <h2 id={slugify(text)} className="mb-4 mt-12 text-3xl font-bold leading-tight text-white" {...props} />;
  },
  h3: (props: HTMLAttributes<HTMLHeadingElement>) => {
    const text = getTextFromNode(props.children);
    return <h3 id={slugify(text)} className="mb-3 mt-8 text-2xl font-semibold leading-tight text-white" {...props} />;
  },
  p: (props: HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-6 text-[1.06rem] leading-8 text-white/85" {...props} />
  ),
  ul: (props: HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-7 list-disc space-y-3 pl-6 text-[1.04rem] leading-8 text-white/85" {...props} />
  ),
  ol: (props: HTMLAttributes<HTMLOListElement>) => (
    <ol className="mb-7 list-decimal space-y-3 pl-6 text-[1.04rem] leading-8 text-white/85" {...props} />
  ),
  li: (props: HTMLAttributes<HTMLLIElement>) => <li className="leading-8" {...props} />,
  strong: (props: HTMLAttributes<HTMLElement>) => <strong className="font-semibold text-white" {...props} />,
  a: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="font-medium text-[#F56E0F] underline decoration-[#F56E0F]/40 underline-offset-4 hover:text-[#ff8e44]" {...props} />
  ),
  blockquote: (props: HTMLAttributes<HTMLElement>) => (
    <blockquote className="mb-7 border-l-2 border-[#F56E0F] pl-4 text-white/80" {...props} />
  ),
  code: (props: HTMLAttributes<HTMLElement>) => (
    <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-[#ffd3b1]" {...props} />
  ),
  pre: (props: HTMLAttributes<HTMLPreElement>) => (
    <pre className="mb-7 overflow-x-auto rounded-xl border border-white/10 bg-[#121212] p-4 text-sm text-white/90" {...props} />
  ),
};

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  const allPosts = await getAllBlogPosts();
  const relatedPosts = getRelatedPosts(allPosts, post.meta, 3);
  const headings = extractBlogHeadings(post.content);
  const contentWithInlineCta = injectInlineCta(post.content);

  const canonical = `${SITE_URL}/blog/${post.meta.slug}`;
  const articleSchema = buildArticleSchema({
    headline: post.meta.title,
    description: post.meta.description,
    url: canonical,
    datePublished: post.meta.date,
    authorName: post.meta.author,
    publisherName: "ALTUM",
    publisherUrl: SITE_URL,
    publisherLogoPath: "/logo-a.png",
  });

  return (
    <main className="min-h-screen bg-[#0B0B0B] px-6 py-16 text-white">
      <PostHero
        title={post.meta.title}
        description={post.meta.description}
        coverImage={post.meta.coverImage}
        category={post.meta.category}
        date={post.meta.date}
        readingTime={post.meta.readingTime}
        author={post.meta.author}
      />

      <section className="mx-auto w-full max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <article className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-10">
            <MDXRemote
              source={contentWithInlineCta}
              components={mdxComponents}
              options={{ mdxOptions: { rehypePlugins: [rehypeSanitize] } }}
            />
            <CTABox variant="final" />
          </article>
          <div className="hidden lg:block">
            <TableOfContents headings={headings} />
          </div>
        </div>

        <RelatedPosts posts={relatedPosts} />
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(articleSchema)} />
    </main>
  );
}
