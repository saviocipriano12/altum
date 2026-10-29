"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { BlogPostMeta } from "@/lib/blog";
import styles from "../public-site.module.css";

export function ArticleCarousel({
  posts,
}: {
  posts: Pick<
    BlogPostMeta,
    "slug" | "title" | "description" | "category" | "readingTime" | "coverImage"
  >[];
}) {
  const track = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [position, setPosition] = useState(0);
  const [last, setLast] = useState(0);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const measure = () => {
      const card = element.querySelector("article");
      if (!card) return;
      const step =
        card.getBoundingClientRect().width +
        parseFloat(getComputedStyle(element).columnGap || "0");
      const max = Math.max(0, element.scrollWidth - element.clientWidth);
      const final = Math.ceil(max / step);
      setLast(final);
      setPosition(
        max - element.scrollLeft < 4
          ? final
          : Math.min(final, Math.round(element.scrollLeft / step)),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [posts]);
  const go = (next: number) => {
    const element = track.current;
    const card = element?.querySelector("article");
    if (!element || !card) return;
    const step =
      card.getBoundingClientRect().width +
      parseFloat(getComputedStyle(element).columnGap || "0");
    element.scrollTo({
      left: Math.min(
        element.scrollWidth - element.clientWidth,
        Math.max(0, next) * step,
      ),
      behavior: reduced ? "auto" : "smooth",
    });
  };
  return (
    <div className={styles.articleCarousel}>
      <div className={styles.articleToolbar}>
        <Link href="/blog" className={styles.textLink}>
          Explorar todos os conteúdos <ArrowRight size={17} />
        </Link>
        <div>
          <button
            type="button"
            onClick={() => go(position - 1)}
            disabled={position === 0}
            aria-label="Ver artigos anteriores"
          >
            <ArrowLeft size={19} />
          </button>
          <button
            type="button"
            onClick={() => go(position + 1)}
            disabled={position >= last}
            aria-label="Ver próximos artigos"
          >
            <ArrowRight size={19} />
          </button>
        </div>
      </div>
      <div
        ref={track}
        className={styles.articleTrack}
        role="region"
        aria-label="Artigos do blog — deslize ou use as setas"
        aria-roledescription="carrossel"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const next =
            event.key === "ArrowRight"
              ? position + 1
              : event.key === "ArrowLeft"
                ? position - 1
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? last
                    : null;
          if (next !== null) {
            event.preventDefault();
            go(next);
          }
        }}
      >
        {posts.map((post) => (
          <article key={post.slug} className={styles.blogCard}>
            <Link href={`/blog/${post.slug}`} tabIndex={-1} aria-hidden="true">
              <Image
                src={post.coverImage}
                alt=""
                width={800}
                height={450}
                sizes="(min-width: 1100px) 420px, (min-width: 768px) 48vw, 85vw"
              />
            </Link>
            <div className={styles.blogCardBody}>
              <small>
                {post.category} · {post.readingTime}
              </small>
              <h3>
                <Link href={`/blog/${post.slug}`}>{post.title}</Link>
              </h3>
              <p>{post.description}</p>
              <Link
                href={`/blog/${post.slug}`}
                className={styles.textLink}
                aria-label={`Ler: ${post.title}`}
              >
                Ler conteúdo <ArrowRight size={16} />
              </Link>
            </div>
          </article>
        ))}
      </div>
      <p className={styles.articlePosition} role="status">
        Posição {position + 1} de {last + 1} · {posts.length} artigos para
        explorar
      </p>
    </div>
  );
}
