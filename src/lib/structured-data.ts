import type { Article, FaqItem } from '../db/schema';

interface OrgInfo {
  name: string;
  url: string;
  logoUrl: string;
  description?: string;
  sameAs?: string[];
  knowsAbout?: string[];
}

interface AuthorInfo {
  name: string;
  url?: string | null;
  jobTitle?: string;
  sameAs?: string[];
  bio?: string;
  avatarUrl?: string;
  credentials?: string[];
  knowsAbout?: string[];
}

interface SiteInfo {
  siteUrl: string;
  siteName: string;
  defaultHeroImageUrl: string;
  org: OrgInfo;
  defaultAuthor: AuthorInfo;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function countWords(html: string): number {
  const text = stripHtml(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function articleJsonLd(article: Article, site: SiteInfo, categoryName?: string): Record<string, unknown> {
  const url = `${site.siteUrl}/${article.slug}`;
  const image = article.hero_image_url || site.defaultHeroImageUrl;
  const wordCount = countWords(article.content);
  const tags = Array.isArray(article.tags) ? article.tags : [];

  const authorNode: Record<string, unknown> = {
    '@type': 'Person',
    name: article.author_name,
  };
  if (article.author_url) authorNode.url = article.author_url;
  if (site.defaultAuthor.name === article.author_name) {
    if (site.defaultAuthor.jobTitle) authorNode.jobTitle = site.defaultAuthor.jobTitle;
    if (site.defaultAuthor.sameAs && site.defaultAuthor.sameAs.length > 0) {
      authorNode.sameAs = site.defaultAuthor.sameAs;
    }
    if (site.defaultAuthor.avatarUrl) authorNode.image = site.defaultAuthor.avatarUrl;
    if (site.defaultAuthor.bio) authorNode.description = site.defaultAuthor.bio;
    if (site.defaultAuthor.knowsAbout && site.defaultAuthor.knowsAbout.length > 0) {
      authorNode.knowsAbout = site.defaultAuthor.knowsAbout;
    }
  }

  const rating = article.aggregate_rating;
  const aggregateRatingNode =
    rating && typeof rating.value === 'number' && typeof rating.count === 'number'
      ? {
          '@type': 'AggregateRating',
          ratingValue: rating.value,
          ratingCount: rating.count,
          bestRating: rating.best ?? 5,
          worstRating: rating.worst ?? 1,
        }
      : null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.meta_title || article.title,
    description: article.meta_description || article.summary,
    image,
    datePublished: article.published_at ?? article.created_at,
    dateModified: article.updated_at,
    author: authorNode,
    publisher: {
      '@type': 'Organization',
      name: site.org.name,
      url: site.org.url,
      logo: {
        '@type': 'ImageObject',
        url: site.org.logoUrl,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    inLanguage: 'pt-BR',
    wordCount,
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['.summary-speakable', '.key-takeaways'],
    },
    ...(categoryName ? { articleSection: categoryName } : {}),
    ...(tags.length > 0 ? { keywords: tags.join(', ') } : {}),
    ...(aggregateRatingNode ? { aggregateRating: aggregateRatingNode } : {}),
  };
}

interface BreadcrumbItem {
  name: string;
  url?: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };
}

export function organizationJsonLd(org: OrgInfo): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    url: org.url,
    logo: org.logoUrl,
    ...(org.description ? { description: org.description } : {}),
    ...(org.sameAs && org.sameAs.length > 0 ? { sameAs: org.sameAs } : {}),
    ...(org.knowsAbout && org.knowsAbout.length > 0 ? { knowsAbout: org.knowsAbout } : {}),
  };
}

export function websiteJsonLd(site: SiteInfo): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.siteName,
    url: site.siteUrl,
    inLanguage: 'pt-BR',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${site.siteUrl}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function faqPageJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

// Detecta H2s numerados no content ("Passo 1: ...", "1. ...", "Passo 1 — ...")
// e emite schema HowTo quando há >= 3 passos. Ativa rich results de HowTo em AI Overviews.
export function howToJsonLd(article: Article, site: SiteInfo): Record<string, unknown> | null {
  const url = `${site.siteUrl}/${article.slug}`;
  const stepRegex = /<h2(?:\s+[^>]*)?>\s*(?:<[^>]+>\s*)*(?:Passo\s+)?(\d+)(?:\s*[:.\u2013\u2014\u2015\-]\s*|\s+)([^<]+?)\s*<\/h2>/gi;
  const steps: { name: string; text: string; anchor?: string }[] = [];
  const seenNumbers = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(article.content)) !== null) {
    const num = Number(match[1]);
    if (seenNumbers.has(num)) continue;
    seenNumbers.add(num);
    const name = match[2].trim();
    if (!name) continue;
    steps.push({ name, text: name });
  }
  if (steps.length < 3) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: article.meta_title || article.title,
    description: article.meta_description || article.summary,
    inLanguage: 'pt-BR',
    totalTime: article.reading_time_min ? `PT${article.reading_time_min}M` : undefined,
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      url: `${url}#passo-${i + 1}`,
    })),
  };
}

// Reading time em minutos (200 wpm), mínimo 1.
export function computeReadingTime(content: string): number {
  const words = countWords(content);
  return Math.max(1, Math.round(words / 200));
}

export { countWords };
