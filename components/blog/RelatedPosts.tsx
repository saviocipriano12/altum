import Image from "next/image";
import Link from "next/link";
import type { BlogPostMeta } from "@/lib/blog";

type RelatedPostsProps = {
  posts: BlogPostMeta[];
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

export default function RelatedPosts({ posts }: RelatedPostsProps) {
  if (posts.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="mb-6 text-2xl font-bold">Posts relacionados</h2>
      <div className="grid gap-6 md:grid-cols-3">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <Link href={`/blog/${post.slug}`} className="block">
              <Image
                src={post.coverImage}
                alt={post.title}
                width={1200}
                height={675}
                className="h-44 w-full object-cover"
              />
            </Link>
            <div className="p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-600">
                {post.category} - {formatDate(post.date)}
              </p>
              <h3 className="mb-2 text-lg font-semibold leading-snug">
                <Link
                  href={`/blog/${post.slug}`}
                  className="transition-colors hover:text-[#292a2d]"
                >
                  {post.title}
                </Link>
              </h3>
              <p className="line-clamp-3 text-sm text-slate-600">
                {post.description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
