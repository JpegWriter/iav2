import type { AuditCheck, AuditCategory, AuditSeverity } from '@/types';

// ============================================================================
// SERP / AEO AUDIT GATE EXPORTS
// ============================================================================

export * from './types';
export * from './gate';
export { analyzeTitle, matchTitlePattern } from './title-intelligence';
export { validateIntent, validateOutlineIntent } from './intent-validation';
export { checkAEOCoverage, enhanceOutlineForAEO } from './aeo-coverage';
export { checkCredibility } from './credibility';
export { scanForRisks, generateDisclaimers, softenClaim } from './risk-compliance';

// ============================================================================
// PAGE AUDIT TYPES & FUNCTIONS
// ============================================================================

export interface AuditResult {
  checks: AuditCheck[];
  healthScore: number;
  technicalScore: number;
  contentScore: number;
  trustScore: number;
  linkingScore: number;
}

// Minimal page type for audit - only requires fields we actually use
export interface AuditPageData {
  id: string;
  url: string;
  statusCode: number;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  canonical: string | null;
  wordCount: number;
  textHash?: string | null;
  role?: string;
}

export interface AuditContext {
  page: AuditPageData;
  allPages: Array<{
    id: string;
    url: string;
    title: string | null;
    h1: string | null;
    textHash?: string | null;
  }>;
  internalLinksIn: number;
  internalLinksOut: number;
}

// ============================================================================
// AUDIT CHECKS
// ============================================================================

function checkTitle(page: AuditPageData): AuditCheck {
  const id = 'title-present';
  const category: AuditCategory = 'seo';
  const name = 'Page Title';

  if (!page.title) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'critical',
      message: 'Page is missing a title tag',
      details: {},
    };
  }

  const length = page.title.length;
  if (length < 30) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'warning',
      message: `Title is too short (${length} chars). Aim for 50-60 characters.`,
      details: { length, title: page.title },
    };
  }

  if (length > 60) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'warning',
      message: `Title may be truncated in search results (${length} chars). Aim for under 60 characters.`,
      details: { length, title: page.title },
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: `Title is good (${length} chars)`,
    details: { length, title: page.title },
  };
}

function checkH1(page: AuditPageData): AuditCheck {
  const id = 'h1-present';
  const category: AuditCategory = 'seo';
  const name = 'H1 Heading';

  if (!page.h1) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'critical',
      message: 'Page is missing an H1 heading',
      details: {},
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: 'Page has an H1 heading',
    details: { h1: page.h1 },
  };
}

function checkMetaDescription(page: AuditPageData): AuditCheck {
  const id = 'meta-description';
  const category: AuditCategory = 'seo';
  const name = 'Meta Description';

  if (!page.metaDescription) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'warning',
      message: 'Page is missing a meta description',
      details: {},
    };
  }

  const length = page.metaDescription.length;
  if (length < 120) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'info',
      message: `Meta description is short (${length} chars). Aim for 150-160 characters.`,
      details: { length, description: page.metaDescription },
    };
  }

  if (length > 160) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'info',
      message: `Meta description may be truncated (${length} chars). Aim for under 160 characters.`,
      details: { length, description: page.metaDescription },
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: `Meta description is good (${length} chars)`,
    details: { length, description: page.metaDescription },
  };
}

function checkCanonical(page: AuditPageData): AuditCheck {
  const id = 'canonical';
  const category: AuditCategory = 'technical';
  const name = 'Canonical URL';

  if (!page.canonical) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'warning',
      message: 'Page is missing a canonical tag',
      details: {},
    };
  }

  // Check if canonical points to self
  const normalizedCanonical = page.canonical.replace(/\/$/, '');
  const normalizedUrl = page.url.replace(/\/$/, '');

  if (normalizedCanonical !== normalizedUrl) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'warning',
      message: 'Canonical URL points to a different page',
      details: { canonical: page.canonical, pageUrl: page.url },
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: 'Canonical URL is correctly set',
    details: { canonical: page.canonical },
  };
}

function checkWordCount(page: AuditPageData): AuditCheck {
  const id = 'word-count';
  const category: AuditCategory = 'content';
  const name = 'Content Length';

  if (page.wordCount < 300) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'critical',
      message: `Page has thin content (${page.wordCount} words). Aim for at least 400 words for money/trust pages.`,
      details: { wordCount: page.wordCount },
    };
  }

  if (page.wordCount < 500 && (page.role === 'money' || page.role === 'trust')) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'warning',
      message: `${page.role} page could benefit from more content (${page.wordCount} words)`,
      details: { wordCount: page.wordCount, role: page.role },
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: `Good content length (${page.wordCount} words)`,
    details: { wordCount: page.wordCount },
  };
}

function checkInternalLinks(ctx: AuditContext): AuditCheck {
  const id = 'internal-links';
  const category: AuditCategory = 'seo';
  const name = 'Internal Links';

  if (ctx.internalLinksOut < 2) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'warning',
      message: `Page has few outgoing internal links (${ctx.internalLinksOut}). Add links to related pages.`,
      details: { linksOut: ctx.internalLinksOut, linksIn: ctx.internalLinksIn },
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: `Good internal linking (${ctx.internalLinksOut} outgoing, ${ctx.internalLinksIn} incoming)`,
    details: { linksOut: ctx.internalLinksOut, linksIn: ctx.internalLinksIn },
  };
}

function checkOrphanPage(ctx: AuditContext): AuditCheck {
  const id = 'orphan-page';
  const category: AuditCategory = 'technical';
  const name = 'Orphan Page';

  if (ctx.internalLinksIn === 0) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: ctx.page.role === 'money' ? 'critical' : 'warning',
      message: 'This is an orphan page with no internal links pointing to it',
      details: {},
    };
  }

  if (ctx.internalLinksIn === 1 && ctx.page.role === 'money') {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'warning',
      message: 'Money page has only 1 internal link pointing to it. Add more links from relevant pages.',
      details: { linksIn: ctx.internalLinksIn },
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: `Page has ${ctx.internalLinksIn} internal links pointing to it`,
    details: { linksIn: ctx.internalLinksIn },
  };
}

function checkDuplicateTitle(ctx: AuditContext): AuditCheck {
  const id = 'duplicate-title';
  const category: AuditCategory = 'seo';
  const name = 'Unique Title';

  if (!ctx.page.title) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'critical',
      message: 'Cannot check for duplicates - title is missing',
      details: {},
    };
  }

  const duplicates = ctx.allPages.filter(
    p => p.id !== ctx.page.id && p.title === ctx.page.title
  );

  if (duplicates.length > 0) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'critical',
      message: `Title is duplicated on ${duplicates.length} other page(s)`,
      details: { duplicateUrls: duplicates.map(p => p.url) },
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: 'Title is unique across the site',
    details: {},
  };
}

function checkDuplicateH1(ctx: AuditContext): AuditCheck {
  const id = 'duplicate-h1';
  const category: AuditCategory = 'seo';
  const name = 'Unique H1';

  if (!ctx.page.h1) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'critical',
      message: 'Cannot check for duplicates - H1 is missing',
      details: {},
    };
  }

  const duplicates = ctx.allPages.filter(
    p => p.id !== ctx.page.id && p.h1 === ctx.page.h1
  );

  if (duplicates.length > 0) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'warning',
      message: `H1 is duplicated on ${duplicates.length} other page(s)`,
      details: { duplicateUrls: duplicates.map(p => p.url) },
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: 'H1 is unique across the site',
    details: {},
  };
}

function checkDuplicateContent(ctx: AuditContext): AuditCheck {
  const id = 'duplicate-content';
  const category: AuditCategory = 'content';
  const name = 'Unique Content';

  if (!ctx.page.textHash) {
    return {
      id,
      category,
      name,
      passed: true,
      severity: 'info',
      message: 'No content hash available',
      details: {},
    };
  }

  const duplicates = ctx.allPages.filter(
    p => p.id !== ctx.page.id && p.textHash === ctx.page.textHash
  );

  if (duplicates.length > 0) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'critical',
      message: `Page content is duplicated on ${duplicates.length} other page(s)`,
      details: { duplicateUrls: duplicates.map(p => p.url) },
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: 'Page content is unique',
    details: {},
  };
}

function checkStatusCode(page: AuditPageData): AuditCheck {
  const id = 'status-code';
  const category: AuditCategory = 'technical';
  const name = 'HTTP Status';

  if (page.statusCode >= 400) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'critical',
      message: `Page returns ${page.statusCode} error`,
      details: { statusCode: page.statusCode },
    };
  }

  if (page.statusCode >= 300) {
    return {
      id,
      category,
      name,
      passed: false,
      severity: 'warning',
      message: `Page redirects (${page.statusCode})`,
      details: { statusCode: page.statusCode },
    };
  }

  return {
    id,
    category,
    name,
    passed: true,
    severity: 'info',
    message: `Page returns ${page.statusCode} OK`,
    details: { statusCode: page.statusCode },
  };
}

// ============================================================================
// MAIN AUDIT FUNCTION
// ============================================================================

export function runAudit(ctx: AuditContext): AuditResult {
  const checks: AuditCheck[] = [
    checkTitle(ctx.page),
    checkH1(ctx.page),
    checkMetaDescription(ctx.page),
    checkCanonical(ctx.page),
    checkWordCount(ctx.page),
    checkInternalLinks(ctx),
    checkOrphanPage(ctx),
    checkDuplicateTitle(ctx),
    checkDuplicateH1(ctx),
    checkDuplicateContent(ctx),
    checkStatusCode(ctx.page),
  ];

  // Calculate scores
  const technicalChecks = checks.filter(c => c.category === 'technical');
  const seoChecks = checks.filter(c => c.category === 'seo');
  const contentChecks = checks.filter(c => c.category === 'content');
  const trustChecks = checks.filter(c => c.category === 'trust');

  const calculateCategoryScore = (categoryChecks: AuditCheck[]): number => {
    if (categoryChecks.length === 0) return 100;
    
    const passed = categoryChecks.filter(c => c.passed).length;
    const critical = categoryChecks.filter(c => !c.passed && c.severity === 'critical').length;
    const warnings = categoryChecks.filter(c => !c.passed && c.severity === 'warning').length;
    
    let score = (passed / categoryChecks.length) * 100;
    score -= critical * 15;
    score -= warnings * 5;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const technicalScore = calculateCategoryScore(technicalChecks);
  const contentScore = calculateCategoryScore(contentChecks);
  const trustScore = trustChecks.length > 0 ? calculateCategoryScore(trustChecks) : 70;
  const linkingScore = calculateCategoryScore(seoChecks.filter(c => 
    c.id.includes('link') || c.id.includes('orphan')
  ));

  // Overall health score: On-page (40%) + Technical (30%) + Trust (20%) + Internal linking (10%)
  const seoScore = calculateCategoryScore(seoChecks);
  const healthScore = Math.round(
    (seoScore * 0.4) +
    (technicalScore * 0.3) +
    (trustScore * 0.2) +
    (linkingScore * 0.1)
  );

  return {
    checks,
    healthScore,
    technicalScore,
    contentScore,
    trustScore,
    linkingScore,
  };
}

// ============================================================================
// FIX ITEM GENERATION
// ============================================================================

export interface FixItemData {
  severity: AuditSeverity;
  category: AuditCategory;
  title: string;
  description: string;
  whyItMatters: string;
  fixActions: string[];
  acceptanceCriteria: string[];
  effortEstimate: 'low' | 'medium' | 'high';
}

export function generateFixItems(checks: AuditCheck[]): FixItemData[] {
  const failedChecks = checks.filter(c => !c.passed && c.severity !== 'info');
  
  return failedChecks.map(check => {
    const fixData = getFixDataForCheck(check);
    return {
      severity: check.severity,
      category: check.category,
      title: fixData.title,
      description: check.message,
      whyItMatters: fixData.whyItMatters,
      fixActions: fixData.fixActions,
      acceptanceCriteria: fixData.acceptanceCriteria,
      effortEstimate: fixData.effortEstimate,
    };
  });
}

function getFixDataForCheck(check: AuditCheck): {
  title: string;
  whyItMatters: string;
  fixActions: string[];
  acceptanceCriteria: string[];
  effortEstimate: 'low' | 'medium' | 'high';
} {
  const fixMap: Record<string, ReturnType<typeof getFixDataForCheck>> = {
    'title-present': {
      title: 'Fix page title',
      whyItMatters: 'Page titles are crucial for SEO and user experience. They appear in search results and browser tabs.',
      fixActions: [
        'Write a unique, descriptive title that includes the primary keyword',
        'Keep it between 50-60 characters',
        'Put the most important words at the beginning',
        'Include your brand name at the end if space allows',
      ],
      acceptanceCriteria: [
        'Title is present',
        'Title is 50-60 characters',
        'Title is unique across the site',
        'Title accurately describes the page content',
      ],
      effortEstimate: 'low',
    },
    'h1-present': {
      title: 'Add H1 heading',
      whyItMatters: 'The H1 is the main heading of your page. It tells search engines and users what the page is about.',
      fixActions: [
        'Add a single H1 heading at the top of the main content',
        'Include the primary keyword naturally',
        'Make it compelling and descriptive',
      ],
      acceptanceCriteria: [
        'Page has exactly one H1',
        'H1 is unique across the site',
        'H1 accurately describes the page content',
      ],
      effortEstimate: 'low',
    },
    'meta-description': {
      title: 'Write meta description',
      whyItMatters: 'Meta descriptions appear in search results and influence click-through rates.',
      fixActions: [
        'Write a compelling summary of the page (150-160 chars)',
        'Include a call-to-action',
        'Include the primary keyword naturally',
      ],
      acceptanceCriteria: [
        'Meta description is present',
        'Length is 150-160 characters',
        'Description is unique across the site',
      ],
      effortEstimate: 'low',
    },
    'canonical': {
      title: 'Fix canonical URL',
      whyItMatters: 'Canonical tags tell search engines which version of a page is the "main" version to prevent duplicate content issues.',
      fixActions: [
        'Add a self-referencing canonical tag',
        'Ensure the canonical URL matches the page URL exactly',
      ],
      acceptanceCriteria: [
        'Canonical tag is present',
        'Canonical URL points to the correct page',
      ],
      effortEstimate: 'low',
    },
    'word-count': {
      title: 'Expand page content',
      whyItMatters: 'Thin content provides less value to users and has lower chances of ranking well.',
      fixActions: [
        'Add more valuable content relevant to the page topic',
        'Include FAQs to address common questions',
        'Add sections for benefits, process, or features',
        'Include trust signals (reviews, proof points)',
      ],
      acceptanceCriteria: [
        'Page has at least 400 words',
        'Content answers user questions comprehensively',
        'Content is scannable with clear sections',
      ],
      effortEstimate: 'high',
    },
    'internal-links': {
      title: 'Add internal links',
      whyItMatters: 'Internal links help users navigate your site and distribute SEO value across pages.',
      fixActions: [
        'Add links to related pages within the content',
        'Use descriptive anchor text',
        'Link to money pages from supporting content',
      ],
      acceptanceCriteria: [
        'Page has at least 3 internal links',
        'Links use descriptive anchor text',
        'Links are contextually relevant',
      ],
      effortEstimate: 'low',
    },
    'orphan-page': {
      title: 'Link to this page',
      whyItMatters: 'Orphan pages are hard for users and search engines to find.',
      fixActions: [
        'Add links to this page from relevant pages',
        'Consider adding to navigation if important',
        'Link from blog posts or related content',
      ],
      acceptanceCriteria: [
        'Page has at least 2 internal links pointing to it',
        'Links come from relevant pages',
      ],
      effortEstimate: 'medium',
    },
    'duplicate-title': {
      title: 'Make title unique',
      whyItMatters: 'Duplicate titles confuse search engines and can hurt rankings.',
      fixActions: [
        'Write a unique title for this page',
        'Differentiate from similar pages',
      ],
      acceptanceCriteria: [
        'Title is unique across the entire site',
      ],
      effortEstimate: 'low',
    },
    'duplicate-h1': {
      title: 'Make H1 unique',
      whyItMatters: 'Duplicate H1s can confuse search engines about page differentiation.',
      fixActions: [
        'Write a unique H1 for this page',
        'Differentiate from pages with similar topics',
      ],
      acceptanceCriteria: [
        'H1 is unique across the entire site',
      ],
      effortEstimate: 'low',
    },
    'duplicate-content': {
      title: 'Address duplicate content',
      whyItMatters: 'Duplicate content wastes crawl budget and can lead to ranking issues.',
      fixActions: [
        'Rewrite the content to be unique',
        'Or use canonical tag to point to the primary version',
        'Or consider merging/redirecting pages',
      ],
      acceptanceCriteria: [
        'Content is unique',
        'Or proper canonical/redirect is in place',
      ],
      effortEstimate: 'high',
    },
    'status-code': {
      title: 'Fix HTTP error',
      whyItMatters: 'Error pages provide a poor user experience and waste crawl budget.',
      fixActions: [
        'Restore the page content',
        'Or set up a redirect to a relevant page',
        'Remove internal links pointing to this URL',
      ],
      acceptanceCriteria: [
        'Page returns 200 status code',
        'Or appropriate redirect is in place',
      ],
      effortEstimate: 'medium',
    },
  };

  return fixMap[check.id] || {
    title: `Fix: ${check.name}`,
    whyItMatters: check.message,
    fixActions: ['Review and fix the issue'],
    acceptanceCriteria: ['Issue is resolved'],
    effortEstimate: 'medium' as const,
  };
}
