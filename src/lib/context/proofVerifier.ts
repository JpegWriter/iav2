// ============================================================================
// PROOF VERIFIER
// ============================================================================
// Validates proof atoms against actual page content and reviews.
// Adds verification status and safe paraphrases for unverified claims.
//
// HARDENED: Review claims are only verified if:
// 1. GBP is connected and reviews are scraped, OR
// 2. Testimonials page is parsed with explicit count
// ============================================================================

import { textContainsToken } from './pageExtractor';
import type { ProofAtom } from './types';

// ============================================================================
// VERIFICATION CONTEXT
// ============================================================================

export interface VerificationContext {
  /** Concatenated text from all crawled pages */
  allPageText: string;
  /** Number of reviews found (from GBP or parsed testimonials) */
  reviewCount: number;
  /** Average review rating */
  averageRating: number;
  /** Page essences for targeted verification */
  pageEssences?: Array<{ url: string; proofMentions: string[] }>;
  /** Whether GBP (Google Business Profile) is connected */
  gbpConnected?: boolean;
  /** Whether reviews were scraped from Google Maps */
  reviewsScraped?: boolean;
  /** Google Maps URL for review verification */
  googleMapsUrl?: string;
}

// ============================================================================
// SAFE PARAPHRASE MAPPINGS
// ============================================================================

const SAFE_PARAPHRASES: Record<string, string> = {
  // Star ratings
  '5 star': 'highly rated by our customers',
  '5-star': 'highly rated by our customers',
  'google rating': 'well-reviewed online',
  
  // 24/7 claims
  '24/7': 'out-of-hours service when possible',
  '24 hour': 'out-of-hours service when possible',
  '24hr': 'out-of-hours service when possible',
  'emergency service': 'fast response for urgent issues',
  
  // Contact claims
  'whatsapp': 'fast messaging support available',
  'instant response': 'quick response times',
  'call anytime': 'flexible contact hours',
  
  // Superlative claims
  'cheapest': 'competitive pricing',
  'lowest price': 'competitive pricing',
  'best in': 'trusted local provider',
  'number 1': 'established provider',
  '#1': 'established provider',
  
  // Guarantee claims
  'guaranteed': 'we stand behind our work',
  '100% satisfaction': 'customer satisfaction is our priority',
  'money back': 'we aim to resolve any issues',
  
  // Speed claims
  'same day': 'fast turnaround when available',
  'fastest': 'quick response times',
  'immediate': 'prompt attention to your needs',
};

// ============================================================================
// MAIN VERIFIER
// ============================================================================

export function verifyProofAtoms(
  atoms: ProofAtom[],
  context: VerificationContext
): ProofAtom[] {
  return atoms.map((atom) => verifyAtom(atom, context));
}

function verifyAtom(
  atom: ProofAtom,
  context: VerificationContext
): ProofAtom {
  const value = atom.value.toLowerCase();
  
  // Check for star/rating claims
  if (hasStarRatingClaim(value)) {
    return verifyStarRatingClaim(atom, context);
  }

  // Check for 24/7 claims
  if (has24HourClaim(value)) {
    return verify24HourClaim(atom, context);
  }

  // Check for WhatsApp claims
  if (hasWhatsAppClaim(value)) {
    return verifyWhatsAppClaim(atom, context);
  }

  // Check for superlative claims (always unverified)
  if (hasSuperlativeClaim(value)) {
    return markUnverified(atom, 'superlative_claim', findSafeParaphrase(value));
  }

  // Check for guarantee claims
  if (hasGuaranteeClaim(value)) {
    return verifyInPageContent(atom, context, ['guarantee', 'warranty']);
  }

  // Check for speed claims
  if (hasSpeedClaim(value)) {
    return verifyInPageContent(atom, context, ['same day', 'same-day', 'immediate', 'fast']);
  }

  // Default: verify if token appears in page content
  const keyTokens = extractKeyTokens(atom.value);
  if (keyTokens.length > 0) {
    const foundInContent = keyTokens.some((token) =>
      textContainsToken(context.allPageText, token)
    );
    
    if (foundInContent) {
      return markVerified(atom, 'page_content');
    }
  }

  // If we can't verify, mark as pending (not unverified)
  return {
    ...atom,
    verification: 'pending',
    verificationSource: 'no_matching_content',
  };
}

// ============================================================================
// CLAIM DETECTION
// ============================================================================

function hasStarRatingClaim(value: string): boolean {
  return /\bstar|\bgoogle\s*rating|\breview/i.test(value);
}

function has24HourClaim(value: string): boolean {
  return /24\s*(hour|hr|\/7)|emergency/i.test(value);
}

function hasWhatsAppClaim(value: string): boolean {
  return /whatsapp|wa\.me/i.test(value);
}

function hasSuperlativeClaim(value: string): boolean {
  return /\b(cheapest|lowest\s*price|best\s*in|number\s*1|#1|fastest|unbeatable)\b/i.test(value);
}

function hasGuaranteeClaim(value: string): boolean {
  return /\b(guarantee|warranty|100%|money\s*back)\b/i.test(value);
}

function hasSpeedClaim(value: string): boolean {
  return /\b(same\s*day|immediate|instant|fastest|quick)\b/i.test(value);
}

// ============================================================================
// VERIFICATION METHODS
// ============================================================================

/**
 * HARDENED: Star/review rating claims require verified source.
 * Only verified if:
 * 1. GBP connected + reviews scraped, OR
 * 2. We have actual review data from testimonials
 * 
 * Numeric claims (e.g., "259 five star reviews") are NOT verified
 * unless we have scraped the actual count from a trusted source.
 */
function verifyStarRatingClaim(
  atom: ProofAtom,
  context: VerificationContext
): ProofAtom {
  const value = atom.value.toLowerCase();
  
  // Check if this is a NUMERIC review claim (e.g., "259 five star reviews")
  const numericMatch = value.match(/(\d+)\s*(five\s*star|5\s*star|\d\.\d\s*star|star)/i);
  
  if (numericMatch) {
    // Numeric claims require GBP connection OR verified review count
    const claimedCount = parseInt(numericMatch[1], 10);
    
    if (context.gbpConnected && context.reviewsScraped && context.reviewCount > 0) {
      // Verify the claimed count is roughly accurate (within 20% or +/- 10)
      const difference = Math.abs(claimedCount - context.reviewCount);
      const percentDiff = (difference / context.reviewCount) * 100;
      
      if (percentDiff <= 20 || difference <= 10) {
        return markVerified(atom, `verified_from_gbp: ${context.reviewCount} reviews found`);
      } else {
        // Count mismatch - mark as outdated
        return markUnverified(
          atom,
          `review_count_mismatch: claimed ${claimedCount}, found ${context.reviewCount}`,
          'well-reviewed by our customers'
        );
      }
    }
    
    // No GBP/verified source - cannot verify numeric claim
    return markUnverified(
      atom,
      'numeric_review_claim_unverified: requires GBP connection or review scrape',
      'well-reviewed by our customers'
    );
  }
  
  // Non-numeric star claims (e.g., "five star service", "highly rated")
  if (context.reviewCount > 0 && context.averageRating >= 4.0) {
    return markVerified(atom, `${context.reviewCount} reviews, avg ${context.averageRating} stars`);
  }
  
  // Generic star claims without verification - safe paraphrase
  return markUnverified(
    atom,
    'star_claim_requires_review_verification',
    'well-reviewed by our customers'
  );
}

function verify24HourClaim(
  atom: ProofAtom,
  context: VerificationContext
): ProofAtom {
  // Check if 24/7 or emergency appears in page content
  const found = textContainsToken(context.allPageText, '24/7') ||
    textContainsToken(context.allPageText, '24 hour') ||
    textContainsToken(context.allPageText, '24hr') ||
    textContainsToken(context.allPageText, 'emergency');

  if (found) {
    return markVerified(atom, 'found_in_page_content');
  }

  return markUnverified(
    atom,
    '24_hour_not_found_in_content',
    'out-of-hours service when possible'
  );
}

function verifyWhatsAppClaim(
  atom: ProofAtom,
  context: VerificationContext
): ProofAtom {
  const found = textContainsToken(context.allPageText, 'whatsapp') ||
    context.allPageText.toLowerCase().includes('wa.me');

  if (found) {
    return markVerified(atom, 'whatsapp_found_in_content');
  }

  return markUnverified(
    atom,
    'whatsapp_not_found',
    'fast messaging support available'
  );
}

function verifyInPageContent(
  atom: ProofAtom,
  context: VerificationContext,
  tokens: string[]
): ProofAtom {
  const found = tokens.some((token) =>
    textContainsToken(context.allPageText, token)
  );

  if (found) {
    return markVerified(atom, 'found_in_page_content');
  }

  return markUnverified(
    atom,
    'claim_not_found_in_content',
    findSafeParaphrase(atom.value.toLowerCase())
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function markVerified(atom: ProofAtom, source: string): ProofAtom {
  return {
    ...atom,
    verification: 'verified',
    verificationSource: source,
  };
}

function markUnverified(
  atom: ProofAtom,
  source: string,
  safeParaphrase: string
): ProofAtom {
  return {
    ...atom,
    verification: 'unverified',
    verificationSource: source,
    safeParaphrase,
  };
}

function extractKeyTokens(value: string): string[] {
  // Extract meaningful tokens from the claim value
  const words = value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  // Filter out common stop words
  const stopWords = new Set([
    'with', 'that', 'this', 'from', 'have', 'been', 'were', 'will',
    'your', 'their', 'they', 'about', 'would', 'there', 'could',
  ]);

  return words.filter((w) => !stopWords.has(w));
}

function findSafeParaphrase(value: string): string {
  // Check for known patterns
  for (const [pattern, paraphrase] of Object.entries(SAFE_PARAPHRASES)) {
    if (value.includes(pattern)) {
      return paraphrase;
    }
  }

  // Default safe paraphrase
  return 'we offer reliable service';
}

// ============================================================================
// BATCH VERIFICATION SUMMARY
// ============================================================================

export interface VerificationSummary {
  totalAtoms: number;
  verified: number;
  unverified: number;
  pending: number;
  verificationRate: number;
}

export function getVerificationSummary(atoms: ProofAtom[]): VerificationSummary {
  const verified = atoms.filter((a) => a.verification === 'verified').length;
  const unverified = atoms.filter((a) => a.verification === 'unverified').length;
  const pending = atoms.filter((a) => a.verification === 'pending' || !a.verification).length;

  return {
    totalAtoms: atoms.length,
    verified,
    unverified,
    pending,
    verificationRate: atoms.length > 0 ? verified / atoms.length : 0,
  };
}
