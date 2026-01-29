// ============================================================================
// PAGE SUMMARISER
// ============================================================================
// Creates PageEssence objects from raw page content.
// Deterministic extraction with optional LLM enhancement.
// ============================================================================

import {
  extractSignalsFromText,
  type ExtractedSignals,
} from './pageExtractor';
import type { PageEssence } from './types';

// ============================================================================
// MAIN SUMMARISER FUNCTION
// ============================================================================

export function summarisePage(
  url: string,
  title: string | null,
  cleanedText: string | null,
  existingRole?: string
): PageEssence {
  const signals = extractSignalsFromText(cleanedText || '');

  // Infer role if not provided
  const role = existingRole
    ? (existingRole as PageEssence['role'])
    : inferRoleFromSignals(url, signals);

  // Build one-liner from title and first sentence
  const oneLiner = buildOneLiner(title, cleanedText);

  // Extract compliance notes
  const complianceNotes = buildComplianceNotes(signals);

  return {
    url,
    title: title || undefined,
    role,
    oneLiner,
    servicesMentioned: signals.serviceTokens,
    locationsMentioned: signals.locationTokens,
    ctas: signals.ctaTokens.map((cta) => ({
      label: cta.label,
      type: cta.type as PageEssence['ctas'][0]['type'],
      url: cta.url,
    })),
    proofMentions: signals.proofTokens,
    toneSignals: signals.toneSignals,
    complianceNotes,
    extractedSignals: {
      phoneNumbers: signals.phoneNumbers,
      emails: signals.emails,
      whatsappLinks: signals.whatsappLinks,
      addressSnippets: signals.addressSnippets,
    },
  };
}

// ============================================================================
// HELPER: Build One-Liner
// ============================================================================

// Patterns that indicate a broken/template oneLiner
// These check ANYWHERE in the string, not just at the start
const BROKEN_ONELINER_PATTERNS = [
  /Title:/i,           // Template junk
  /URL Source:/i,      // Template junk  
  /Markdown Content/i, // Template junk
  /https?:\/\//i,      // Raw URLs anywhere
  /www\./i,            // Raw URLs anywhere
  /^\s*$/,             // Empty/whitespace only
  /^\[.*\]$/,          // Just markdown links
  /^#+ /,              // Markdown headings
];

// Minimum acceptable oneLiner length
const MIN_ONELINER_LENGTH = 30;

function buildOneLiner(title: string | null, text: string | null): string {
  // Try to extract a clean one-liner first
  const extracted = extractOneLiner(title, text);
  
  // Validate it's not broken
  if (isValidOneLiner(extracted)) {
    return extracted;
  }
  
  // Return empty - will be fixed by enforceOneLineQuality() later
  return '';
}

function extractOneLiner(title: string | null, text: string | null): string {
  if (!text && !title) {
    return '';
  }

  // Try to extract the first meaningful sentence
  if (text) {
    // Remove common header/nav noise
    const cleaned = text
      .replace(/^(menu|home|about|services|contact|search|login|register|skip to content)[\s|,]+/gi, '')
      .replace(/^Title:[^\n]+\n?/gi, '')
      .replace(/^URL Source:[^\n]+\n?/gi, '')
      .replace(/^Markdown Content[^\n]*\n?/gi, '')
      .trim();

    // Find first sentence (ending with . ! ?)
    const firstSentenceMatch = cleaned.match(/^[^.!?]+[.!?]/);
    if (firstSentenceMatch && firstSentenceMatch[0].length > 20) {
      const sentence = firstSentenceMatch[0].trim();
      // Make sure it doesn't start with broken patterns
      if (isValidOneLiner(sentence)) {
        return sentence.slice(0, 150);
      }
    }

    // Fall back to first N characters if they look valid
    if (cleaned.length > 30) {
      const snippet = cleaned.slice(0, 150).trim();
      if (isValidOneLiner(snippet)) {
        return snippet + (cleaned.length > 150 ? '...' : '');
      }
    }
  }

  // Fall back to title if it's valid
  if (title && isValidOneLiner(title)) {
    return title;
  }
  
  return '';
}

function isValidOneLiner(text: string): boolean {
  // Must exist and meet minimum length
  if (!text || text.length < MIN_ONELINER_LENGTH) {
    return false;
  }
  
  // Check for broken patterns ANYWHERE in the text
  for (const pattern of BROKEN_ONELINER_PATTERNS) {
    if (pattern.test(text)) {
      return false;
    }
  }
  
  // Must start with a capital letter or number (real content)
  if (!/^[A-Z0-9]/.test(text.trim())) {
    return false;
  }
  
  return true;
}

/**
 * Enforces one-liner quality with deterministic fallback.
 * Call this after page summarisation to fix broken oneLiners.
 */
export function enforceOneLinerQuality(
  essence: PageEssence,
  businessName?: string,
  niche?: string,
  primaryLocation?: string,
  topServices?: string[]
): PageEssence {
  // If oneLiner is valid, return as-is
  if (isValidOneLiner(essence.oneLiner)) {
    return essence;
  }
  
  // Build deterministic fallback
  const fallback = buildFallbackOneLiner(
    businessName,
    niche,
    primaryLocation,
    topServices || essence.servicesMentioned
  );
  
  return {
    ...essence,
    oneLiner: fallback,
  };
}

function buildFallbackOneLiner(
  businessName?: string,
  niche?: string,
  primaryLocation?: string,
  topServices?: string[]
): string {
  const name = businessName || 'This business';
  const nicheText = niche ? `a ${niche.toLowerCase()}` : 'a professional service';
  const locationText = primaryLocation ? ` in ${primaryLocation}` : '';
  const servicesText = topServices?.length 
    ? ` specialising in ${topServices.slice(0, 3).join(', ')}`
    : '';
  
  return `${name} is ${nicheText}${locationText}${servicesText}.`;
}

// ============================================================================
// HELPER: Infer Role from Signals
// ============================================================================

function inferRoleFromSignals(url: string, signals: ExtractedSignals): PageEssence['role'] {
  const path = url.toLowerCase();

  // Blog/date patterns -> support
  if (/\/\d{4}\/\d{2}\/\d{2}\//.test(path)) {
    return 'support';
  }

  // Category/tag/author -> support
  if (/\/(tag|category|author|archive)\//.test(path)) {
    return 'support';
  }

  // About page -> trust
  if (/\/(about|about-us|who-we-are|our-team|our-story)/.test(path)) {
    return 'trust';
  }

  // Contact page -> trust
  if (/\/(contact|contact-us|get-in-touch)/.test(path)) {
    return 'trust';
  }

  // Reviews/testimonials -> trust
  if (/\/(reviews|testimonials|our-clients)/.test(path)) {
    return 'trust';
  }

  // Services page -> money
  if (/\/(services|our-services)/.test(path) && signals.serviceTokens.length >= 2) {
    return 'money';
  }

  // Strong CTA + service signals -> money
  const hasCTA = signals.ctaTokens.some((cta) =>
    ['quote', 'book', 'contact'].includes(cta.type)
  );
  if (hasCTA && signals.serviceTokens.length >= 1) {
    return 'money';
  }

  // Blog content indicators -> support
  if (signals.proofTokens.length === 0 && signals.serviceTokens.length <= 1) {
    return 'support';
  }

  return 'unknown';
}

// ============================================================================
// HELPER: Build Compliance Notes
// ============================================================================

function buildComplianceNotes(signals: ExtractedSignals): string[] {
  const notes: string[] = [];

  if (signals.riskyClaimsFound.length > 0) {
    notes.push(`Risky claims found: ${signals.riskyClaimsFound.join(', ')}`);
  }

  // Check for unverifiable superlatives
  const superlatives = ['best', 'cheapest', 'fastest', 'number 1', '#1'];
  signals.riskyClaimsFound.forEach((claim) => {
    const lower = claim.toLowerCase();
    if (superlatives.some((s) => lower.includes(s))) {
      notes.push(`Contains superlative claim: "${claim}" - consider rewording`);
    }
  });

  return notes;
}

// ============================================================================
// BATCH SUMMARISER
// ============================================================================

export interface PageData {
  url: string;
  title: string | null;
  cleaned_text: string | null;
  role?: string;
}

export function summarisePages(pages: PageData[]): PageEssence[] {
  return pages.map((page) =>
    summarisePage(page.url, page.title, page.cleaned_text, page.role)
  );
}

// ============================================================================
// KEY PAGE SELECTOR
// ============================================================================

export interface KeyPages {
  home?: PageData;
  about?: PageData;
  services?: PageData;
  contact?: PageData;
  moneyPages: PageData[];
  missing: string[];
}

export function selectKeyPages(pages: PageData[], rootUrl: string): KeyPages {
  const missing: string[] = [];
  
  // Normalize root URL
  const normalizedRoot = rootUrl.replace(/\/$/, '');

  // Find homepage (exact match or index)
  const home = pages.find((p) => {
    const path = new URL(p.url).pathname;
    return path === '/' || path === '' || path === '/index.html';
  });
  if (!home) missing.push('home');

  // Find about page
  const about = pages.find((p) =>
    /\/(about|about-us|who-we-are|our-team|our-story)/i.test(p.url)
  );
  if (!about) missing.push('about');

  // Find services page
  const services = pages.find((p) => {
    const path = new URL(p.url).pathname.toLowerCase();
    return (
      /\/(services|our-services)/i.test(path) &&
      !/\/\d{4}\//.test(path)  // Not a blog post
    );
  });
  if (!services) missing.push('services');

  // Find contact page
  const contact = pages.find((p) =>
    /\/(contact|contact-us|get-in-touch|kontakt)/i.test(p.url)
  );
  if (!contact) missing.push('contact');

  // Find money pages (reclassified, not blog posts)
  const moneyPages = pages
    .filter((p) => {
      const path = p.url.toLowerCase();
      // Exclude blog/date posts
      if (/\/\d{4}\/\d{2}\/\d{2}\//.test(path)) return false;
      if (/\/(tag|category|author|archive)\//.test(path)) return false;
      // Must be marked as money OR have strong signals
      return p.role === 'money';
    })
    .slice(0, 5);

  return {
    home,
    about,
    services,
    contact,
    moneyPages,
    missing,
  };
}
