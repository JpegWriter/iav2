// ============================================================================
// QUALITY GATE VALIDATOR
// ============================================================================
// Blocks publishing if SEO title is generic, vision facts are missing,
// required headings are absent, or vision exists without narrative outcomes.
// Uses the Narrative Outcome Detector V2 for intelligent prose-based detection.
// ============================================================================

import type { RequiredHeading } from '../../growth-planner/types';
import { runVisionGateV2, type VisionGateV2Result } from './visionEvidenceGateV2';
import { detectNarrativeOutcomes, type OutcomeDetectionResult } from './narrativeOutcomeDetector';

// ============================================================================
// VISION DETECTION PATTERNS (Niche-Agnostic)
// ============================================================================

/** First-person or observational language patterns */
const VISION_SIGNAL_PATTERNS = [
  /we observed|we noticed|we saw|we recorded|we documented/i,
  /during (sessions?|consultations?|assessments?|inspections?|viewings?)/i,
  /on-site|on site|in person|first-hand|firsthand/i,
  /client feedback|client response|client interest/i,
  /from our experience|from the visuals|visual inspection/i,
  /this (project|session|case|work) showed|demonstrated/i,
];

/** Visual descriptor patterns - covers multiple niches */
const VISUAL_DESCRIPTOR_PATTERNS = [
  // Property
  /stone-built|flint-?stone|brick-built|period property/i,
  /façade|facade|frontage|terrace|victorian|georgian/i,
  // Wedding/Photography
  /venue|ceremony|reception|golden hour|natural light|backdrop/i,
  /candid shots|posed portraits|first dance|confetti|aisle/i,
  // Trade
  /installation|workmanship|finish|materials|before.?after/i,
  // General
  /on-location|setting|environment|atmosphere|details/i,
];

/** Outcome type patterns - MUST have at least one */
const OUTCOME_PATTERNS = {
  // Time-based outcomes (all niches)
  timeBased: /(completed|booked|confirmed|agreed|finished) (in|within) \d+|under offer in|\d+ (days?|weeks?) (later|after)/i,
  // Volume-based outcomes
  volumeBased: /\d+ (enquiries|bookings|sessions|viewings|projects|clients)|multiple (offers|bookings)|oversubscribed|high demand/i,
  // Comparative outcomes  
  comparative: /outperformed|above average|faster than|compared to|beat the|exceeded|more than typical/i,
  // Behavioural outcomes
  behavioural: /clients? referenced|repeat (bookings?|interest)|faster decisions|immediate interest|strong response|referred us/i,
  // Geo-causal outcomes
  geoCausal: /due to.{1,30}(location|setting|venue|accessibility)|proximity.{1,20}(drove|resulted|led to)/i,
};

// ============================================================================
// TYPES
// ============================================================================

export type VisionEvidenceStatus = {
  hasVisionSignals: boolean;
  hasOutcomes: boolean;
  outcomeTypes: string[];
  visionSignalsFound: string[];
  requiresOutcomeInjection: boolean;
  eeratScore: number; // -25 to +60 based on evidence quality
};

// ============================================================================
// VAGUE OUTCOME VALIDATION TYPES
// ============================================================================

export type VagueOutcomeResult = {
  isValid: boolean;
  failedSentences: Array<{
    sentence: string;
    failureClass: string;
    failureReason: string;
  }>;
  passedSentences: string[];
  requiresRevision: boolean;
  blockMessage: string | null;
};

export type QualityGateResult = {
  pass: boolean;
  errors: string[];
  warnings: string[];
  missingVisionFacts: string[];
  foundVisionFacts: string[];
  missingHeadings: RequiredHeading[];
  foundHeadings: string[];
  requiresRepair: boolean;
  seoSelectionRequired: boolean;
  // Vision Evidence Gate V2 (replaces old block-based detection)
  visionGateV2: VisionGateV2Result;
  requiresNarrativeRepair: boolean;
  // Legacy fields for backward compatibility
  visionEvidenceStatus: VisionEvidenceStatus;
  requiresOutcomeInjection: boolean;
  // Vague Outcome Validation (now handled by V2)
  vagueOutcomeResult?: VagueOutcomeResult;
};

const GENERIC_TITLE_PATTERNS = [
  /^guide$/i,
  /^services$/i,
  /^overview$/i,
  /^introduction$/i,
  /^estate agents & valuers guide$/i,
  /^the ultimate guide/i,
  /^everything you need to know/i,
  /^complete guide to/i,
  /^a guide to/i,
  /services\s*\|/i,
  /^why you need/i,
  /^what is/i,
  /professional \w+ services$/i,
  /quality \w+ services$/i,
  /expert \w+ services$/i,
  /top \w+ services$/i,
];

// Minimum vision facts required when vision data exists
const MIN_VISION_FACTS_REQUIRED = 3;

export interface QualityGateInput {
  seoTitle: string;
  content: string;
  visionFacts?: string[];
  userFacts?: string[];
  geoProvided?: boolean;
  geoTerms?: string[];
  // SEO selection enforcement
  seoTitleOptions?: string[];
  selectedSeoTitleIndex?: number | null;
  seoLocked?: boolean;
  // Heading contract enforcement
  requiredHeadings?: RequiredHeading[];
  // Service context for vertical-specific detection (V2)
  serviceContext?: string;
  pageType?: string;
}

// ============================================================================
// VISION EVIDENCE DETECTION
// ============================================================================

/**
 * Detect vision signals and outcomes in content
 */
function detectVisionEvidence(content: string): VisionEvidenceStatus {
  const visionSignalsFound: string[] = [];
  const outcomeTypes: string[] = [];
  
  // Check for vision signals
  for (const pattern of VISION_SIGNAL_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      visionSignalsFound.push(match[0]);
    }
  }
  
  // Check for visual descriptors
  for (const pattern of VISUAL_DESCRIPTOR_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      visionSignalsFound.push(match[0]);
    }
  }
  
  const hasVisionSignals = visionSignalsFound.length >= 2; // Need at least 2 signals
  
  // Check for outcome types
  for (const [type, pattern] of Object.entries(OUTCOME_PATTERNS)) {
    if (pattern.test(content)) {
      outcomeTypes.push(type);
    }
  }
  
  const hasOutcomes = outcomeTypes.length > 0;
  
  // Calculate EEAT score adjustment
  let eeratScore = 0;
  if (hasVisionSignals) {
    if (!hasOutcomes) {
      eeratScore = -25; // Vision without outcomes
    } else if (outcomeTypes.includes('geoCausal')) {
      eeratScore = 60; // Vision + outcomes + geo-cause
    } else {
      eeratScore = 40; // Vision + outcomes
    }
  }
  
  return {
    hasVisionSignals,
    hasOutcomes,
    outcomeTypes,
    visionSignalsFound: Array.from(new Set(visionSignalsFound)).slice(0, 5), // Dedupe and limit
    requiresOutcomeInjection: hasVisionSignals && !hasOutcomes,
    eeratScore,
  };
}

// ============================================================================
// VAGUE OUTCOME PHRASE BLOCKER
// ============================================================================
// This validator fails the page if outcomes are: vague, circular, self-referential,
// unfinished, or non-causal. This protects EEAT, AEO, and IA credibility.

/**
 * Class 1: Circular / Empty Outcomes
 * Patterns that describe an outcome as itself or state nothing
 */
const CIRCULAR_EMPTY_PATTERNS: RegExp[] = [
  /\bwithin this timeframe\b/gi,
  /\bas expected\b/gi,
  /\bas observed\b$/gim,  // Only at end of sentence
  /\bwe observed\b$/gim,  // Only at end of sentence
  /\bwe noted\b$/gim,     // Only at end of sentence
  /\bthis was successful\b/gi,
  /\bpositive results\b/gi,
  /\bgood outcomes\b/gi,
];

/**
 * Class 2: Self-Referential Causes
 * Outcome caused by the writer's own existence or style
 */
const SELF_REFERENTIAL_PATTERNS: RegExp[] = [
  /\bdriven by our\b/gi,
  /\bdriven by we\b/gi,
  /\bdriven by our approach\b/gi,
  /\bdriven by our style\b/gi,
  /\bdriven by what we observed\b/gi,
  /\bbecause of our brand\b/gi,
  /\bdue to our reputation\b/gi,
  /\bthanks to our expertise\b/gi,
];

/**
 * Class 3: Non-Causal Adjectives
 * Vague descriptors that don't explain cause
 */
const NON_CAUSAL_ADJECTIVE_PATTERNS: RegExp[] = [
  /\bwas successful\b(?!\s+(because|due to|after|when|as a result))/gi,
  /\bwas strong\b(?!\s+(because|due to|after|when|as a result))/gi,
  /\bwas positive\b(?!\s+(because|due to|after|when|as a result))/gi,
  /\bwell received\b(?!\s+(because|due to|after|when|as a result))/gi,
  /\bwas popular\b(?!\s+(because|due to|after|when|as a result))/gi,
  /\bwas effective\b(?!\s+(because|due to|after|when|as a result))/gi,
  /\bproved successful\b(?!\s+(because|due to|after|when|as a result))/gi,
];

/**
 * Class 4: Outcome Without Actor
 * Something happened, but who did it is missing
 */
const OUTCOME_WITHOUT_ACTOR_PATTERNS: RegExp[] = [
  // These patterns match "resulted in" / "led to" / "generated" / "created"
  // but FAIL if they're NOT followed by an actor word
  /\bresulted in(?!\s+\w+\s+(client|couple|buyer|guest|viewer|customer|enquir|booking|contact))/gi,
  /\bled to(?!\s+\w+\s+(client|couple|buyer|guest|viewer|customer|enquir|booking|contact))/gi,
  /\bgenerated(?!\s+\w*\s*(client|couple|buyer|guest|viewer|customer|enquir|booking|contact))/gi,
  /\bcreated(?!\s+\w*\s*(client|couple|buyer|guest|viewer|customer|interest|engagement))/gi,
];

/**
 * Class 5: Time Without Anchor
 * "Within days" but no cause attached
 */
const TIME_WITHOUT_ANCHOR_PATTERNS: RegExp[] = [
  /\bwithin days\b(?!\s+(because|due to|after|of|following))/gi,
  /\bwithin weeks\b(?!\s+(because|due to|after|of|following))/gi,
  /\bwithin hours\b(?!\s+(because|due to|after|of|following))/gi,
  /\bin just days\b(?!\s+(because|due to|after|of|following))/gi,
  /\bquickly\b(?!\s+(because|due to|after|following|as))/gi,
];

/**
 * Required Outcome Structure:
 * Valid outcome = Actor + Behaviour + Cause
 * 
 * Actor examples: client, couple, buyer, guest, viewer, enquirer
 * Behaviour examples: booked, contacted, enquired, viewed, requested, asked
 * Cause examples: because, due to, after seeing, when they saw
 */
const VALID_ACTOR_PATTERNS = /\b(client|clients|couple|couples|buyer|buyers|guest|guests|viewer|viewers|customer|customers|enquirer|enquirers|visitor|visitors|user|users)\b/i;
const VALID_BEHAVIOUR_PATTERNS = /\b(booked|contacted|enquired|viewed|requested|asked|called|emailed|messaged|scheduled|signed up|registered|purchased|bought|hired|engaged|chose|selected|decided)\b/i;
const VALID_CAUSE_PATTERNS = /\b(because|due to|after seeing|after viewing|when they saw|when they noticed|having seen|upon seeing|following|as a result of|prompted by)\b/i;

/**
 * Extract outcome block sentences from content
 */
function extractOutcomeSentences(content: string): string[] {
  // Look for outcome sections (H2/H3 with outcome-related titles)
  const outcomeBlockRegex = /###?\s*(observed outcomes|outcomes|results|what happened|evidence|first-hand evidence)[^\n]*\n([\s\S]*?)(?=\n##|\n###|$)/gi;
  
  const sentences: string[] = [];
  let match: RegExpExecArray | null;
  
  while ((match = outcomeBlockRegex.exec(content)) !== null) {
    const blockContent = match[2] || '';
    // Split into sentences (handle bullet points and regular sentences)
    const blockSentences = blockContent
      .split(/(?:[.!?](?:\s|$))|(?:^[-•]\s*)/gm)
      .map(s => s.trim())
      .filter(s => s.length > 10); // Filter out tiny fragments
    sentences.push(...blockSentences);
  }
  
  // Also check for outcome-related sentences anywhere in content
  const outcomeIndicators = /\b(resulted in|led to|generated|created|within\s+(days|weeks|hours)|enquir|booking|contact.*made)\b/gi;
  if (outcomeIndicators.test(content)) {
    // Extract sentences containing outcome keywords
    const allSentences = content
      .split(/(?<=[.!?])\s+/)
      .filter(s => outcomeIndicators.test(s));
    sentences.push(...allSentences);
  }
  
  return Array.from(new Set(sentences)); // Dedupe
}

/**
 * Validate a single outcome sentence
 */
function validateOutcomeSentence(sentence: string): {
  isValid: boolean;
  failureClass?: string;
  failureReason?: string;
} {
  // Check against each pattern class
  
  // Class 1: Circular/Empty
  for (const pattern of CIRCULAR_EMPTY_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex
    if (pattern.test(sentence)) {
      return {
        isValid: false,
        failureClass: 'circular',
        failureReason: 'Circular or empty outcome - describes nothing specific',
      };
    }
  }
  
  // Class 2: Self-Referential
  for (const pattern of SELF_REFERENTIAL_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(sentence)) {
      return {
        isValid: false,
        failureClass: 'self-referential',
        failureReason: 'Self-referential cause - outcome caused by writer\'s existence',
      };
    }
  }
  
  // Class 3: Non-Causal Adjectives
  for (const pattern of NON_CAUSAL_ADJECTIVE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(sentence)) {
      return {
        isValid: false,
        failureClass: 'non-causal',
        failureReason: 'Non-causal adjective - says "successful" without explaining why',
      };
    }
  }
  
  // Class 4: Outcome Without Actor (only check if sentence has outcome verbs)
  const hasOutcomeVerb = /\b(resulted|led|generated|created)\b/i.test(sentence);
  if (hasOutcomeVerb) {
    for (const pattern of OUTCOME_WITHOUT_ACTOR_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(sentence)) {
        return {
          isValid: false,
          failureClass: 'no-actor',
          failureReason: 'Outcome without actor - who did something is missing',
        };
      }
    }
  }
  
  // Class 5: Time Without Anchor
  for (const pattern of TIME_WITHOUT_ANCHOR_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(sentence)) {
      return {
        isValid: false,
        failureClass: 'time-no-anchor',
        failureReason: 'Time reference without cause - "within days" but no explanation',
      };
    }
  }
  
  // Positive validation: Check for Actor + Behaviour + Cause structure
  // Only require this for sentences that look like outcome claims
  const looksLikeOutcome = /\b(enquir|book|contact|interest|engagement|request|call|view)\b/i.test(sentence);
  
  if (looksLikeOutcome) {
    const hasActor = VALID_ACTOR_PATTERNS.test(sentence);
    const hasBehaviour = VALID_BEHAVIOUR_PATTERNS.test(sentence);
    const hasCause = VALID_CAUSE_PATTERNS.test(sentence);
    
    // Need at least actor + behaviour, ideally all three
    if (!hasActor && !hasBehaviour) {
      return {
        isValid: false,
        failureClass: 'incomplete',
        failureReason: 'Incomplete outcome - missing who did what',
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Validate all outcome sentences in content
 */
export function validateVagueOutcomes(content: string): VagueOutcomeResult {
  const sentences = extractOutcomeSentences(content);
  
  // If no outcome sentences found, that's okay (outcome injection handles that separately)
  if (sentences.length === 0) {
    return {
      isValid: true,
      failedSentences: [],
      passedSentences: [],
      requiresRevision: false,
      blockMessage: null,
    };
  }
  
  const failedSentences: Array<{ sentence: string; failureClass: string; failureReason: string }> = [];
  const passedSentences: string[] = [];
  
  for (const sentence of sentences) {
    const result = validateOutcomeSentence(sentence);
    if (result.isValid) {
      passedSentences.push(sentence);
    } else {
      failedSentences.push({
        sentence: sentence.slice(0, 100) + (sentence.length > 100 ? '...' : ''),
        failureReason: result.failureReason || 'Unknown failure',
        failureClass: result.failureClass || 'unknown',
      });
    }
  }
  
  const isValid = failedSentences.length === 0;
  
  // Build block message for UI
  let blockMessage: string | null = null;
  if (!isValid) {
    const failedList = failedSentences
      .slice(0, 3) // Limit to first 3 failures
      .map(f => `  • "${f.sentence}" — ${f.failureReason}`)
      .join('\n');
    
    blockMessage = `❌ Outcome Validation Failed

This page includes an outcome section, but one or more statements are vague, circular, or non-causal.

Each outcome must clearly show:
• Who acted (client, couple, buyer, guest)
• What they did (booked, contacted, enquired)
• Why it happened (because, due to, after seeing)

Failed statements:
${failedList}

Replace or revise the highlighted lines to proceed.`;
  }
  
  return {
    isValid,
    failedSentences,
    passedSentences,
    requiresRevision: !isValid,
    blockMessage,
  };
}

/**
 * Generate outcome evidence block for auto-repair
 */
export function generateOutcomeEvidenceBlock(
  location: string,
  visionSignals: string[],
  userFacts?: string[],
  serviceContext?: { primaryService?: string; niche?: string }
): string {
  // Extract any numbers from user facts
  const numbers = userFacts?.flatMap(f => f.match(/\d+/g) || []) || [];
  const engagementCount = numbers.find(n => parseInt(n) <= 50) || 'multiple';
  const timeframe = numbers.find(n => parseInt(n) <= 14) ? `${numbers[0]} days` : 'the first week';
  
  // Find any features mentioned
  const featureMatch = visionSignals.find(s => s.length > 10) || 
    userFacts?.find(f => f.length > 10) || 
    'its distinctive qualities';
  
  // Build niche-appropriate language
  const service = serviceContext?.primaryService || serviceContext?.niche || 'service';
  const serviceLower = service.toLowerCase();
  
  // Dynamic language based on service type
  const isProperty = /estate|property|valuation|letting|rental/i.test(serviceLower);
  const isWedding = /wedding|photography|videography|event/i.test(serviceLower);
  const isLegal = /solicitor|legal|law|conveyancing/i.test(serviceLower);
  const isTrade = /plumber|electrician|builder|roofing|heating/i.test(serviceLower);
  
  let sectionTitle: string;
  let outcomeNoun: string;
  let interactionNoun: string;
  let comparisonText: string;
  let behaviourSubject: string;
  
  if (isProperty) {
    sectionTitle = 'Observed Outcomes From Recent Viewings';
    outcomeNoun = 'viewings';
    interactionNoun = 'buyer interactions';
    comparisonText = 'Comparable properties without these characteristics took longer to attract interest';
    behaviourSubject = 'buyer behaviour';
  } else if (isWedding) {
    sectionTitle = 'Observed Outcomes From Recent Sessions';
    outcomeNoun = 'bookings';
    interactionNoun = 'client consultations';
    comparisonText = 'Couples who reviewed our portfolio typically confirmed within this timeframe';
    behaviourSubject = 'client decisions';
  } else if (isLegal) {
    sectionTitle = 'Observed Outcomes From Recent Cases';
    outcomeNoun = 'enquiries';
    interactionNoun = 'client consultations';
    comparisonText = 'Cases with clear documentation moved through faster';
    behaviourSubject = 'client confidence';
  } else if (isTrade) {
    sectionTitle = 'Observed Outcomes From Recent Projects';
    outcomeNoun = 'quote requests';
    interactionNoun = 'site assessments';
    comparisonText = 'Projects with thorough initial assessments had smoother completion';
    behaviourSubject = 'customer decisions';
  } else {
    // Generic fallback
    sectionTitle = 'Observed Outcomes From Recent Work';
    outcomeNoun = 'enquiries';
    interactionNoun = 'client sessions';
    comparisonText = 'Clients who saw our previous work moved forward with confidence';
    behaviourSubject = 'client engagement';
  }
  
  return `### ${sectionTitle}

Based on direct experience and ${interactionNoun}, we recorded the following outcomes:

- This ${service} generated ${engagementCount} ${outcomeNoun} within ${timeframe}.
- Client interest was driven by ${featureMatch}.
- ${comparisonText}.
- Feedback consistently referenced our approach and attention to detail as key factors.

These outcomes reflect how our first-hand experience directly influences ${behaviourSubject} in ${location}.`;
}

// ============================================================================
// FACT MATCHING UTILITIES
// ============================================================================

/**
 * Extract meaningful keywords from a fact for matching
 */
function extractFactKeywords(fact: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to',
    'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 'just', 'also', 'now', 'and', 'but', 'or', 'if', 'this', 'that',
    'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'their', 'them',
  ]);

  return fact
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
}

/**
 * Check if a fact appears in content using keyword matching
 */
function factAppearsInContent(fact: string, contentLower: string): boolean {
  const keywords = extractFactKeywords(fact);
  if (keywords.length === 0) return false;

  // Require at least 50% of keywords to match (minimum 2)
  const minMatches = Math.max(2, Math.ceil(keywords.length * 0.5));
  const matches = keywords.filter(kw => contentLower.includes(kw));
  
  return matches.length >= minMatches;
}

/**
 * Check for numbers/stats from fact in content
 */
function factNumbersInContent(fact: string, contentLower: string): boolean {
  // Extract numbers from fact
  const numbers = fact.match(/\d+(?:[.,]\d+)?/g);
  if (!numbers || numbers.length === 0) return false;
  
  // Check if any significant numbers appear
  return numbers.some(num => contentLower.includes(num));
}

export function runQualityGate({
  seoTitle,
  content,
  visionFacts = [],
  userFacts = [],
  geoProvided = false,
  geoTerms = [],
  seoTitleOptions = [],
  selectedSeoTitleIndex = null,
  seoLocked = false,
  requiredHeadings = [],
  serviceContext,
  pageType,
}: QualityGateInput): QualityGateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const contentLower = content.toLowerCase();
  const foundVisionFacts: string[] = [];
  const missingVisionFacts: string[] = [];
  const foundHeadings: string[] = [];
  const missingHeadings: RequiredHeading[] = [];
  let seoSelectionRequired = false;

  /* ---------- SEO SELECTION GATE (HARD BLOCK) ---------- */
  // If options exist and task is locked, user MUST select before publishing
  if (seoTitleOptions.length > 0 && seoLocked && selectedSeoTitleIndex === null) {
    errors.push('SEO SELECTION REQUIRED: User must select an SEO title before publishing');
    seoSelectionRequired = true;
  }

  /* ---------- SEO TITLE GATE ---------- */
  if (!seoTitle || seoTitle.length < 20) {
    errors.push('SEO title is missing or too short (min 20 chars)');
  }

  if (GENERIC_TITLE_PATTERNS.some(p => p.test(seoTitle.trim()))) {
    errors.push(`SEO title is generic: "${seoTitle}"`);
  }

  // Check geo in title if geo was provided
  if (geoProvided && geoTerms.length > 0) {
    const hasGeoInTitle = geoTerms.some(term => 
      seoTitle.toLowerCase().includes(term.toLowerCase())
    );
    if (!hasGeoInTitle) {
      warnings.push(`SEO title missing geo reference (expected one of: ${geoTerms.join(', ')})`);
    }
  }

  /* ---------- USER FACTS GATE (HARD FAIL) ---------- */
  // User-provided facts MUST appear in the content
  if (userFacts.length > 0) {
    const userFactsFound = userFacts.filter(fact => 
      factAppearsInContent(fact, contentLower) || factNumbersInContent(fact, contentLower)
    );

    const minRequired = Math.min(2, userFacts.length);
    if (userFactsFound.length < minRequired) {
      errors.push(
        `User-provided facts missing in output (${userFactsFound.length}/${userFacts.length} found, need ${minRequired}). ` +
        `Facts provided: ${userFacts.slice(0, 3).join('; ')}...`
      );
    }
  }

  /* ---------- VISION FACTS GATE (HARD FAIL) ---------- */
  if (visionFacts.length > 0) {
    // Check each vision fact
    for (const fact of visionFacts) {
      const found = factAppearsInContent(fact, contentLower) || factNumbersInContent(fact, contentLower);
      if (found) {
        foundVisionFacts.push(fact);
      } else {
        missingVisionFacts.push(fact);
      }
    }

    const minRequired = Math.min(MIN_VISION_FACTS_REQUIRED, visionFacts.length);
    
    if (foundVisionFacts.length < minRequired) {
      errors.push(
        `VISION FACTS NOT USED: Only ${foundVisionFacts.length}/${visionFacts.length} vision facts found in content. ` +
        `Minimum required: ${minRequired}. ` +
        `Missing: ${missingVisionFacts.slice(0, 3).map(f => f.slice(0, 50) + '...').join(' | ')}`
      );
    }

    // Check for evidence section markers
    const hasEvidenceSection = /local evidence|in practice|from the visuals|what we see|visual evidence|as shown|photographed|captured|observed|documented/i.test(content);
    if (!hasEvidenceSection && visionFacts.length >= 3) {
      warnings.push('Content lacks visual evidence phrasing (consider adding "as shown", "photographed", "observed")');
    }
  }

  /* ---------- HEADING CONTRACT GATE ---------- */
  if (requiredHeadings.length > 0) {
    // Extract all H2/H3 headings from content using exec loop
    const h2Pattern = /^##\s+(.+)$/gm;
    const h3Pattern = /^###\s+(.+)$/gm;
    
    const contentH2s: string[] = [];
    const contentH3s: string[] = [];
    
    let match: RegExpExecArray | null;
    while ((match = h2Pattern.exec(content)) !== null) {
      contentH2s.push(match[1].toLowerCase().trim());
    }
    while ((match = h3Pattern.exec(content)) !== null) {
      contentH3s.push(match[1].toLowerCase().trim());
    }
    
    // Type-to-keyword patterns for matching headings
    const typePatterns: Record<string, RegExp> = {
      intent: /who|what|why|for\s+you|need|about|purpose|overview|looking for|seek/i,
      evidence: /evidence|proof|example|case|result|achiev|success|shown|seen|practice|witness/i,
      geo: /area|local|location|region|city|town|neighbourhood|community|near|where/i,
      process: /how|process|approach|method|step|work|deliver|procedure|system/i,
      faq: /faq|question|ask|common|frequent|wonder/i,
      comparison: /compar|vs|versus|different|option|alternative|choice/i,
      pricing: /pric|cost|invest|rate|fee|afford|budget|value|quote/i,
      trust: /trust|credential|about\s+us|team|background|experience|qualified|certified/i,
      cta: /start|contact|get\s+in\s+touch|call|book|schedule|next\s+step|begin|reach/i,
    };

    for (const required of requiredHeadings) {
      const pattern = typePatterns[required.type];
      if (!pattern) continue;

      const headingsToCheck = required.level === 2 ? contentH2s : contentH3s;
      const found = headingsToCheck.some(h => pattern.test(h));
      
      if (found) {
        foundHeadings.push(`${required.type} (H${required.level})`);
      } else if (!required.optional) {
        missingHeadings.push(required);
      }
    }

    // Report missing required headings
    if (missingHeadings.length > 0) {
      const missingTypes = missingHeadings.map(h => `"${h.type}" (${h.textHint})`).join(', ');
      errors.push(
        `HEADING CONTRACT VIOLATED: Missing required sections: ${missingTypes}. ` +
        `Content must include H2s that match these section types.`
      );
    }
  }

  /* ---------- OBSERVATION-LEVEL LANGUAGE GATE ---------- */
  // If vision facts exist, content MUST contain observation-level language
  if (visionFacts.length >= 3 || userFacts.length > 0) {
    const observationPatterns = [
      /we observed|we saw|we noted|during our|during viewings/i,
      /on-site|on site|inspection revealed|visual inspection/i,
      /the property showed|the property demonstrated/i,
      /resulted in|led to|contributed to/i,
      /first-hand|firsthand|directly witnessed/i,
    ];
    
    const hasObservationLanguage = observationPatterns.some(p => p.test(content));
    
    if (!hasObservationLanguage) {
      warnings.push(
        'OBSERVATION LANGUAGE MISSING: Content has vision facts but lacks observation-level phrasing. ' +
        'Add phrases like "we observed", "during our assessment", "on-site inspection revealed".'
      );
    }
    
    // Note: The old "Evidence Section" requirement is now handled by V2 narrative outcome detection
  }

  /* ---------- VISION EVIDENCE GATE V2 (NARRATIVE OUTCOME DETECTION) ---------- */
  // Run the new V2 gate which detects outcomes embedded in prose
  const visionGateV2 = runVisionGateV2({
    content,
    serviceContext,
    pageType,
  });
  
  // Add V2 errors and warnings
  errors.push(...visionGateV2.errors);
  warnings.push(...visionGateV2.warnings);
  
  // Log V2 results
  if (visionGateV2.errors.length > 0 || visionGateV2.warnings.length > 0) {
    console.log('[QualityGate V2] Narrative Outcome Detection:');
    console.log('  Vision:', visionGateV2.hasVision);
    console.log('  Narrative Outcome:', visionGateV2.hasNarrativeOutcome);
    console.log('  Best Score:', visionGateV2.bestOutcomeScore, '/10');
    console.log('  Valid Outcomes:', visionGateV2.validOutcomeCount);
    console.log('  Vague Outcomes:', visionGateV2.vagueOutcomeCount);
    console.log('  EEAT Impact:', visionGateV2.eeratScore > 0 ? `+${visionGateV2.eeratScore}` : visionGateV2.eeratScore);
  }

  // Build legacy visionEvidenceStatus for backward compatibility
  const visionEvidenceStatus: VisionEvidenceStatus = {
    hasVisionSignals: visionGateV2.hasVision,
    hasOutcomes: visionGateV2.hasNarrativeOutcome,
    outcomeTypes: visionGateV2.detectionResult.validOutcomes.map(o => o.reasons.join(',')),
    visionSignalsFound: visionGateV2.detectionResult.visionSignals,
    requiresOutcomeInjection: visionGateV2.requiresNarrativeRepair,
    eeratScore: visionGateV2.eeratScore,
  };

  // Build vagueOutcomeResult for backward compatibility
  const vagueOutcomeResult: VagueOutcomeResult | undefined = 
    visionGateV2.vagueOutcomeCount > 0 ? {
      isValid: false,
      failedSentences: visionGateV2.detectionResult.vagueOutcomes.map(o => ({
        sentence: o.sentence.slice(0, 100),
        failureClass: 'vague',
        failureReason: o.vagueMatch || 'Vague phrasing detected',
      })),
      passedSentences: visionGateV2.detectionResult.validOutcomes.map(o => o.sentence),
      requiresRevision: true,
      blockMessage: visionGateV2.errors.find(e => e.includes('VAGUE')) || null,
    } : undefined;

  // Determine if repair is needed (but NOT for SEO selection - that's a user action)
  const requiresRepair = errors.length > 0 && !seoSelectionRequired && (
    errors.some(e => e.includes('VISION FACTS NOT USED')) ||
    errors.some(e => e.includes('User-provided facts missing')) ||
    errors.some(e => e.includes('HEADING CONTRACT VIOLATED')) ||
    errors.some(e => e.includes('VISION WITHOUT OUTCOME')) ||
    errors.some(e => e.includes('VAGUE OUTCOME'))
  );

  return {
    pass: errors.length === 0,
    errors,
    warnings,
    missingVisionFacts,
    foundVisionFacts,
    missingHeadings,
    foundHeadings,
    requiresRepair,
    seoSelectionRequired,
    // V2 fields
    visionGateV2,
    requiresNarrativeRepair: visionGateV2.requiresNarrativeRepair,
    // Legacy fields for backward compatibility
    visionEvidenceStatus,
    requiresOutcomeInjection: visionGateV2.requiresNarrativeRepair,
    vagueOutcomeResult,
  };
}

// ============================================================================
// EXPORT INDEX
// ============================================================================

export { runQualityGate as validateWriterOutput };
