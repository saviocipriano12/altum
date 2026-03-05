export type FaqItem = {
  question: string;
  answer: string;
};

type OrganizationSchemaOptions = {
  siteUrl?: string;
  name?: string;
  logoPath?: string;
  socialLinks?: string[];
};

type ArticleSchemaOptions = {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  publisherName?: string;
  publisherUrl?: string;
  publisherLogoPath?: string;
};

type ItemListSchemaOptions = {
  name: string;
  description: string;
  url: string;
  itemUrls: string[];
};

const normalizeSiteUrl = (value: string): string => value.replace(/\/$/, "");

export const getSiteUrl = (): string => normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const toAbsoluteUrl = (siteUrl: string, pathOrUrl: string): string => {
  if (!pathOrUrl) return siteUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
};

export const getSocialLinksFromEnv = (): string[] => {
  const siteUrl = getSiteUrl();
  const maybeLinks = [
    process.env.NEXT_PUBLIC_LINKEDIN_URL,
    process.env.NEXT_PUBLIC_INSTAGRAM_URL,
    process.env.NEXT_PUBLIC_YOUTUBE_URL,
    process.env.NEXT_PUBLIC_FACEBOOK_URL,
    process.env.NEXT_PUBLIC_X_URL,
  ];

  return maybeLinks.filter((item): item is string => Boolean(item && /^https?:\/\//i.test(item) && item !== siteUrl));
};

export const buildOrganizationSchema = (options: OrganizationSchemaOptions = {}) => {
  const siteUrl = normalizeSiteUrl(options.siteUrl ?? getSiteUrl());
  const socialLinks = options.socialLinks ?? [];
  const logoPath = options.logoPath?.trim();

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: options.name ?? "ALTUM",
    url: siteUrl,
  };

  if (logoPath) {
    schema.logo = toAbsoluteUrl(siteUrl, logoPath);
  }

  if (socialLinks.length > 0) {
    schema.sameAs = socialLinks;
  }

  return schema;
};

export const buildArticleSchema = (options: ArticleSchemaOptions) => {
  const publisherUrl = options.publisherUrl ?? getSiteUrl();
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: options.headline,
    description: options.description,
    datePublished: options.datePublished,
    dateModified: options.dateModified ?? options.datePublished,
    mainEntityOfPage: options.url,
    author: {
      "@type": "Person",
      name: options.authorName ?? "Time ALTUM",
    },
    publisher: {
      "@type": "Organization",
      name: options.publisherName ?? "ALTUM",
      url: publisherUrl,
    },
  };

  if (options.publisherLogoPath) {
    const publisher = schema.publisher as Record<string, unknown>;
    publisher.logo = {
      "@type": "ImageObject",
      url: toAbsoluteUrl(publisherUrl, options.publisherLogoPath),
    };
  }

  return schema;
};

export const buildItemListSchema = (options: ItemListSchemaOptions) => ({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: options.name,
  description: options.description,
  url: options.url,
  itemListOrder: "https://schema.org/ItemListOrderDescending",
  numberOfItems: options.itemUrls.length,
  itemListElement: options.itemUrls.map((itemUrl, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: itemUrl,
  })),
});

export const buildFaqSchema = (items: FaqItem[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
});

export const toJsonLdScript = (schema: unknown): { __html: string } => ({
  __html: JSON.stringify(schema),
});
