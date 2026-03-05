import { cache } from "react";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { resolveBlogCoverImage } from "@/lib/blog-images";

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  coverImage: string;
  author: string;
  readingTime: string;
  category: string;
};

export type BlogPost = {
  meta: BlogPostMeta;
  content: string;
};

export type BlogHeading = {
  level: 2 | 3;
  text: string;
  id: string;
};

type Frontmatter = Partial<Omit<BlogPostMeta, "slug">>;

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

const parseDate = (value: string): number => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const estimateReadingTime = (content: string): string => {
  const words = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_[\]()!-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  const minutes = Math.max(1, Math.ceil(words / 220));
  return `${minutes} min de leitura`;
};

const getCategory = (frontmatter: Frontmatter): string => {
  if (typeof frontmatter.category === "string" && frontmatter.category.trim().length > 0) {
    return frontmatter.category.trim();
  }

  if (isStringArray(frontmatter.tags) && frontmatter.tags.length > 0) {
    return frontmatter.tags[0];
  }

  return "geral";
};

const parsePost = (slug: string, source: string): BlogPost => {
  const { data, content } = matter(source);
  const frontmatter = data as Frontmatter;
  const category = getCategory(frontmatter);

  return {
    meta: {
      slug,
      title: frontmatter.title ?? slug,
      description: frontmatter.description ?? "",
      date: frontmatter.date ?? "1970-01-01",
      tags: isStringArray(frontmatter.tags) ? frontmatter.tags : [],
      coverImage: resolveBlogCoverImage(
        typeof frontmatter.coverImage === "string" ? frontmatter.coverImage : undefined,
        category,
      ),
      author:
        typeof frontmatter.author === "string" && frontmatter.author.trim().length > 0
          ? frontmatter.author
          : "Time ALTUM",
      readingTime:
        typeof frontmatter.readingTime === "string" && frontmatter.readingTime.trim().length > 0
          ? frontmatter.readingTime
          : estimateReadingTime(content),
      category,
    },
    content,
  };
};

const readFileSafe = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

export const getBlogPostSlugs = cache(async (): Promise<string[]> => {
  try {
    const entries = await fs.readdir(BLOG_DIR, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && /\.(md|mdx)$/i.test(entry.name))
      .map((entry) => entry.name.replace(/\.(md|mdx)$/i, ""))
      .sort();
  } catch {
    return [];
  }
});

export const getBlogPostBySlug = cache(async (slug: string): Promise<BlogPost | null> => {
  const mdxPath = path.join(BLOG_DIR, `${slug}.mdx`);
  const mdPath = path.join(BLOG_DIR, `${slug}.md`);
  const source = (await readFileSafe(mdxPath)) ?? (await readFileSafe(mdPath));

  if (!source) return null;

  return parsePost(slug, source);
});

export const getAllBlogPosts = cache(async (): Promise<BlogPostMeta[]> => {
  const slugs = await getBlogPostSlugs();
  const posts = await Promise.all(slugs.map((slug) => getBlogPostBySlug(slug)));

  return posts
    .filter((post): post is BlogPost => Boolean(post))
    .map((post) => post.meta)
    .sort((a, b) => parseDate(b.date) - parseDate(a.date));
});

export const extractBlogHeadings = (content: string): BlogHeading[] => {
  const headingRegex = /^(##|###)\s+(.+)$/gm;
  const headings: BlogHeading[] = [];

  let match = headingRegex.exec(content);
  while (match) {
    const level = match[1] === "##" ? 2 : 3;
    const text = match[2].replace(/[*_`]/g, "").trim();

    if (text.length > 0) {
      headings.push({
        level,
        text,
        id: slugify(text),
      });
    }

    match = headingRegex.exec(content);
  }

  return headings;
};

export const getRelatedPosts = (
  allPosts: BlogPostMeta[],
  currentPost: BlogPostMeta,
  limit = 3,
): BlogPostMeta[] => {
  const currentTagSet = new Set(currentPost.tags.map((tag) => tag.toLowerCase()));

  const scored = allPosts
    .filter((post) => post.slug !== currentPost.slug)
    .map((post) => {
      const score = post.tags.reduce(
        (acc, tag) => (currentTagSet.has(tag.toLowerCase()) ? acc + 1 : acc),
        0,
      );
      return { post, score };
    })
    .sort((a, b) => b.score - a.score || parseDate(b.post.date) - parseDate(a.post.date))
    .map((item) => item.post);

  return scored.slice(0, limit);
};
