// ============================================================================
// ROLE RECLASSIFIER
// ============================================================================
// Properly classifies page roles based on URL patterns and content signals.
// Ensures blog posts are never marked as money pages.
// ============================================================================

import { extractSignalsFromText } from './pageExtractor';
import type { PageSummary } from './types';

// ============================================================================
// PAGE DATA INPUT
// ============================================================================

export interface PageForClassification {
  url: string;
  title: string | null;
  h1: string | null;
  cleaned_text: string | null;
  role: string;
  priority_score: number;
  internal_links_in: number;
  internal_links_out: number;
}

// ============================================================================
// ROLE PATTERNS (STRICT)
// ============================================================================

const BLOG_POST_PATTERNS = [
  /\/\d{4}\/\d{2}\/\d{2}\//,  // /2024/01/15/
  /\/\d{4}\/\d{2}\//,         // /2024/01/
  /\/blog\//i,
  /\/news\//i,
  /\/article\//i,
  /\/post\//i,
];

const NON_MONEY_PATTERNS = [
  /\/(tag|category|author|archive)\//i,
  /\/(search|login|register|cart|checkout)\//i,
  /\/(privacy|terms|cookie|sitemap|404)\//i,
  /\/(wp-admin|wp-content|wp-json)\//i,
];

// Portfolio patterns - showcase work but not direct conversion
const PORTFOLIO_PATTERNS = [
  /\/work\//i,
  /\/work$/i,
  /\/works\//i,
  /\/works$/i,
  /\/projects?\//i,
  /\/projects?$/i,
  /\/portfolio\//i,
  /\/portfolio$/i,
  /\/typology\//i,
  /\/typology$/i,
  /\/typologies\//i,
  /\/case-stud(y|ies)\//i,
  /\/gallery\//i,
  /\/showcase\//i,
];

const TRUST_PAGE_PATTERNS = [
  /\/(about|about-us|who-we-are|our-team|our-story)/i,
  /\/(contact|contact-us|get-in-touch|kontakt)/i,
  /\/(reviews|testimonials|our-clients|case-studies)/i,
  /\/(faq|faqs|frequently-asked)/i,
];

const AUTHORITY_PAGE_PATTERNS = [
  /\/(careers|jobs|work-with-us)/i,
  /\/(press|media|news-room)/i,
  /\/(partners|affiliates)/i,
];

// ============================================================================
// MAIN RECLASSIFIER
// ============================================================================

export function reclassifyPages(pages: PageForClassification[]): PageForClassification[] {
  return pages.map((page) => {
    const newRole = classifyPage(page);
    return {
      ...page,
      role: newRole,
    };
  });
}

export function classifyPage(page: PageForClassification): string {
  const url = page.url.toLowerCase();
  const path = extractPath(url);

  // Step 1: Check explicit non-money patterns (HIGHEST priority)
  for (const pattern of NON_MONEY_PATTERNS) {
    if (pattern.test(path)) {
      return 'support';
    }
  }

  // Step 2: Check blog post patterns (very high priority)
  for (const pattern of BLOG_POST_PATTERNS) {
    if (pattern.test(path)) {
      return 'support';
    }
  }

  // Step 2.5: Check portfolio patterns (work/projects/typology)
  for (const pattern of PORTFOLIO_PATTERNS) {
    if (pattern.test(path)) {
      return 'portfolio';
    }
  }

  // Step 3: Check trust page patterns
  for (const pattern of TRUST_PAGE_PATTERNS) {
    if (pattern.test(path)) {
      return 'trust';
    }
  }

  // Step 4: Check authority page patterns
  for (const pattern of AUTHORITY_PAGE_PATTERNS) {
    if (pattern.test(path)) {
      return 'authority';
    }
  }

  // Step 5: Content-based classification
  const signals = extractSignalsFromText(page.cleaned_text || '');

  // Strong CTA presence + service tokens = potential money page
  const hasCTA = signals.ctaTokens.some((cta) =>
    ['quote', 'book', 'contact', 'call'].includes(cta.type)
  );
  const hasServices = signals.serviceTokens.length >= 1;
  const hasPhoneOrContact =
    signals.phoneNumbers.length > 0 ||
    signals.whatsappLinks.length > 0;

  // Homepage check
  if (path === '/' || path === '' || path === '/index.html') {
    // Homepage with CTAs = money
    if (hasCTA && hasServices) {
      return 'money';
    }
    return 'money'; // Homepages are generally money pages
  }

  // Service-like URL patterns
  const serviceUrlPattern = /\/(services|service|plumbing|electrical|repair|installation)/i;
  if (serviceUrlPattern.test(path) && !BLOG_POST_PATTERNS.some((p) => p.test(path))) {
    return 'money';
  }

  // Strong money signals from content
  if (hasCTA && hasServices && hasPhoneOrContact) {
    return 'money';
  }

  // Check title/H1 for service indicators
  const titleLower = (page.title || '').toLowerCase();
  const h1Lower = (page.h1 || '').toLowerCase();
  const hasServiceInTitle =
    signals.serviceTokens.some((s) => titleLower.includes(s.toLowerCase())) ||
    signals.serviceTokens.some((s) => h1Lower.includes(s.toLowerCase()));

  if (hasServiceInTitle && hasCTA) {
    return 'money';
  }

  // Default to support for everything else
  return 'support';
}

// ============================================================================
// HELPER: Extract path from URL
// ============================================================================

function extractPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase();
  } catch {
    // If URL parsing fails, just use the url as-is
    return url.toLowerCase();
  }
}

// ============================================================================
// BUILD RECLASSIFIED SITE MAP
// ============================================================================

export interface ReclassifiedSiteMap {
  moneyPages: PageSummary[];
  trustPages: PageSummary[];
  supportPages: PageSummary[];
  authorityPages: PageSummary[];
  portfolioPages: PageSummary[];
  totalPages: number;
  orphanedPages: number;
  internalLinkingHealth: 'poor' | 'fair' | 'good' | 'excellent';
  reclassificationSummary: {
    pagesReclassified: number;
    blogPostsRemoved: number;
    portfolioPagesIdentified: number;
  };
}

export function buildReclassifiedSiteMap(
  pages: PageForClassification[]
): ReclassifiedSiteMap {
  // Reclassify all pages
  const reclassified = reclassifyPages(pages);

  // Count reclassifications
  let pagesReclassified = 0;
  let blogPostsRemoved = 0;

  pages.forEach((original, i) => {
    const newRole = reclassified[i].role;
    if (original.role !== newRole) {
      pagesReclassified++;
      if (original.role === 'money' && newRole === 'support') {
        blogPostsRemoved++;
      }
    }
  });

  // Group by role
  const moneyPages = reclassified.filter((p) => p.role === 'money');
  const trustPages = reclassified.filter((p) => p.role === 'trust');
  const supportPages = reclassified.filter((p) => p.role === 'support');
  const authorityPages = reclassified.filter((p) => p.role === 'authority');
  const portfolioPages = reclassified.filter((p) => p.role === 'portfolio');

  // Count orphans
  const orphanedPages = reclassified.filter(
    (p) => p.internal_links_in === 0 && extractPath(p.url) !== '/'
  ).length;

  // Calculate linking health
  const avgLinksIn =
    reclassified.length > 0
      ? reclassified.reduce((sum, p) => sum + p.internal_links_in, 0) /
        reclassified.length
      : 0;

  let internalLinkingHealth: ReclassifiedSiteMap['internalLinkingHealth'] = 'poor';
  if (avgLinksIn >= 5 && orphanedPages === 0) {
    internalLinkingHealth = 'excellent';
  } else if (avgLinksIn >= 3 && orphanedPages <= 2) {
    internalLinkingHealth = 'good';
  } else if (avgLinksIn >= 1) {
    internalLinkingHealth = 'fair';
  }

  // Map to PageSummary
  const mapPage = (p: PageForClassification, index: number): PageSummary => ({
    url: p.url,
    title: p.title || '',
    role: p.role as PageSummary['role'],
    priorityScore: p.priority_score,
    priorityRank: index + 1,
    internalLinksIn: p.internal_links_in,
    internalLinksOut: p.internal_links_out,
  });

  return {
    moneyPages: moneyPages.slice(0, 10).map((p, i) => mapPage(p, i)),
    trustPages: trustPages.slice(0, 5).map((p, i) => mapPage(p, i)),
    supportPages: supportPages.slice(0, 15).map((p, i) => mapPage(p, i)),
    authorityPages: authorityPages.slice(0, 5).map((p, i) => mapPage(p, i)),
    portfolioPages: portfolioPages.slice(0, 10).map((p, i) => mapPage(p, i)),
    totalPages: reclassified.length,
    orphanedPages,
    internalLinkingHealth,
    reclassificationSummary: {
      pagesReclassified,
      blogPostsRemoved,
      portfolioPagesIdentified: portfolioPages.length,
    },
  };
}
