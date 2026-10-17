"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BlogPostMeta } from "@/lib/blog";
import styles from "./public-site.module.css";
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
export function PublicBlogIndex({ posts }: { posts: BlogPostMeta[] }) {
  const [category, setCategory] = useState("Todos");
  const categories = [
    "Todos",
    ...new Set(posts.map((post) => post.category).filter(Boolean)),
  ];
  const filtered =
    category === "Todos"
      ? posts
      : posts.filter((post) => post.category === category);
  const [featured, ...rest] = filtered;
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div
          className={styles.blogFilters}
          aria-label="Filtrar conteúdos por categoria"
        >
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="sr-only" role="status">
          {filtered.length} conteúdos encontrados.
        </p>
        {featured && (
          <article className={styles.blogFeatured}>
            <Link href={`/blog/${featured.slug}`}>
              <Image
                src={featured.coverImage}
                alt={featured.title}
                width={900}
                height={600}
                sizes="(min-width: 768px) 600px, 94vw"
              />
            </Link>
            <div>
              <p className={styles.eyebrow}>
                Em destaque · {featured.category}
              </p>
              <h2>
                <Link href={`/blog/${featured.slug}`}>{featured.title}</Link>
              </h2>
              <p>{featured.description}</p>
              <small>
                {date(featured.date)} · {featured.readingTime}
              </small>
              <div
                className={styles.actions}
                style={{ justifyContent: "start" }}
              >
                <Link
                  className={styles.textLink}
                  href={`/blog/${featured.slug}`}
                >
                  Ler conteúdo <ArrowRight size={17} />
                </Link>
              </div>
            </div>
          </article>
        )}
        <div className={styles.blogGrid}>
          {rest.map((post) => (
            <article key={post.slug} className={styles.blogCard}>
              <Link href={`/blog/${post.slug}`}>
                <Image
                  src={post.coverImage}
                  alt={post.title}
                  width={800}
                  height={450}
                  sizes="(min-width: 768px) 570px, 94vw"
                />
              </Link>
              <div className={styles.blogCardBody}>
                <small>
                  {post.category} · {date(post.date)}
                </small>
                <h2>
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                <p>{post.description}</p>
                <Link href={`/blog/${post.slug}`} className={styles.textLink}>
                  Ler em {post.readingTime}
                  <ArrowRight size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
        {posts.length === 0 && (
          <p className={styles.muted}>
            Novos conteúdos serão publicados em breve.
          </p>
        )}
      </div>
    </section>
  );
}
