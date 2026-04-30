/**
 * Aggregates publicly-safe site config exposed via wrangler.toml [vars].
 * Centralizes the env -> shape conversion so layouts/components don't read env directly.
 */
export interface SiteConfig {
  siteUrl: string;
  siteName: string;
  siteDescription: string;
  defaultHeroImageUrl: string;
  org: {
    name: string;
    url: string;
    logoUrl: string;
    description: string;
    sameAs: string[];
    knowsAbout: string[];
  };
  defaultAuthor: {
    name: string;
    url: string;
    jobTitle: string;
    sameAs: string[];
    bio: string;
    avatarUrl: string;
    credentials: string[];
    knowsAbout: string[];
  };
}

function parsePipeList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function getSiteConfig(env: Env): SiteConfig {
  return {
    siteUrl: env.SITE_URL.replace(/\/$/, ''),
    siteName: env.SITE_NAME,
    siteDescription: env.SITE_DESCRIPTION,
    defaultHeroImageUrl: env.DEFAULT_HERO_IMAGE_URL || env.ORG_LOGO_URL,
    org: {
      name: env.ORG_NAME ?? env.SITE_NAME,
      url: env.ORG_URL,
      logoUrl: env.ORG_LOGO_URL,
      description: env.ORG_DESCRIPTION ?? '',
      sameAs: parsePipeList(env.ORG_SAME_AS),
      knowsAbout: parsePipeList(env.ORG_KNOWS_ABOUT),
    },
    defaultAuthor: {
      name: env.DEFAULT_AUTHOR_NAME,
      url: env.DEFAULT_AUTHOR_URL,
      jobTitle: env.DEFAULT_AUTHOR_JOB_TITLE ?? '',
      sameAs: parsePipeList(env.DEFAULT_AUTHOR_SAME_AS),
      bio: env.DEFAULT_AUTHOR_BIO ?? '',
      avatarUrl: env.DEFAULT_AUTHOR_AVATAR_URL ?? '',
      credentials: parsePipeList(env.DEFAULT_AUTHOR_CREDENTIALS),
      knowsAbout: parsePipeList(env.DEFAULT_AUTHOR_KNOWS_ABOUT),
    },
  };
}
