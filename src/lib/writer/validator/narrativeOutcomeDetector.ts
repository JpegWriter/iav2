// ============================================================================
// NARRATIVE OUTCOME DETECTOR
// ============================================================================
// Detects outcome evidence embedded naturally in prose (copywriter style).
// Replaces the rigid "Observed Outcomes" block requirement with intelligent
// sentence-level scoring that can find outcomes anywhere in the content.

import { getVerticalConfig, type VerticalConfig } from './verticalConfigs';

// ============================================================================
// TYPES
// ============================================================================

export type OutcomeSpan = {
  start: number;
  end: number;
  sentence: string;
  score: number;
  reasons: string[];
  isVague: boolean;
  vagueMatch?: string;
};

export type OutcomeDetectionResult = {
  hasVision: boolean;
  hasNarrativeOutcome: boolean;
  visionSignals: string[];
  outcomeSpans: OutcomeSpan[];
  validOutcomes: OutcomeSpan[];
  vagueOutcomes: OutcomeSpan[];
  bestScore: number;
  failures: string[];
  warnings: string[];
  recommendedFixes: Array<{
    type: 'add-outcome' | 'fix-vague' | 'add-cause' | 'add-actor';
    message: string;
    insertAfterIndex?: number;
    targetSentence?: string;
  }>;
};

// ============================================================================
// VISION DETECTION PATTERNS
// ============================================================================

// First-person observation phrases
const FIRST_PERSON_OBSERVATION_PATTERNS: RegExp[] = [
  /\b(I|we|my|our)\s+(observed|noticed|saw|captured|photographed|documented|recorded|witnessed)/i,
  /\bduring (the|our|my)\s+(shoot|session|visit|assessment|viewing|inspection)/i,
  /\bon (the|that) day\b/i,
  /\bwhen (I|we) (arrived|visited|met|saw)/i,
  /\b(I|we) (found|discovered|realised|realized|noted)\b/i,
];

// Visual/scene descriptor patterns
const VISUAL_DESCRIPTOR_PATTERNS: RegExp[] = [
  /\b(natural light|golden hour|soft light|harsh light|diffused|backlit|silhouette)/i,
  /\b(architecture|facade|interior|exterior|layout|floorplan|garden|grounds)/i,
  /\b(ceremony|reception|venue|location|setting|backdrop|scene)/i,
  /\b(dress|suit|bouquet|flowers|decor|table|chairs|furniture)/i,
  /\b(weather|sunshine|rain|clouds|wind|morning|afternoon|evening)/i,
  /\b(street|road|neighbourhood|area|district|town|village|city)/i,
  /\b(kitchen|bathroom|bedroom|living room|lounge|dining|hallway)/i,
];

// Scene anchor patterns (specific details that prove presence)
const SCENE_ANCHOR_PATTERNS: RegExp[] = [
  /\b(at|near|by|overlooking|facing)\s+[A-Z][a-z]+/i, // Near Specific Place
  /\b[A-Z][a-z]+('s|s)?\s+(barn|hall|manor|house|hotel|church|venue|garden)/i, // Named venue
  /\b(in|around)\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i,
  /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
  /\b\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)/i,
];

// ============================================================================
// SENTENCE EXTRACTION
// ============================================================================

/**
 * Split content into sentences, handling abbreviations and edge cases
 */
function splitIntoSentences(content: string): Array<{ text: string; start: number; end: number }> {
  // Normalize content - strip markdown headings but preserve structure
  const normalized = content
    .replace(/^#{1,6}\s+.+$/gm, '') // Remove headings
    .replace(/^\s*[-*]\s+/gm, '') // Remove bullet points
    .replace(/\n{2,}/g, '\n') // Collapse multiple newlines
    .trim();

  const sentences: Array<{ text: string; start: number; end: number }> = [];
  
  // Protect abbreviations from sentence splitting
  const protectedText = normalized
    .replace(/Mr\./g, 'Mr⦁')
    .replace(/Mrs\./g, 'Mrs⦁')
    .replace(/Ms\./g, 'Ms⦁')
    .replace(/Dr\./g, 'Dr⦁')
    .replace(/St\./g, 'St⦁')
    .replace(/etc\./g, 'etc⦁')
    .replace(/e\.g\./g, 'e⦁g⦁')
    .replace(/i\.e\./g, 'i⦁e⦁')
    .replace(/(\d)\./g, '$1⦁'); // Protect numbers like "5."

  // Split on sentence boundaries
  const parts = protectedText.split(/(?<=[.!?])\s+/);
  
  let currentIndex = 0;
  for (const part of parts) {
    const text = part
      .replace(/⦁/g, '.') // Restore protected periods
      .trim();
    
    if (text.length > 10) { // Ignore very short fragments
      const start = normalized.indexOf(text.replace(/\./g, '.'), currentIndex);
      sentences.push({
        text,
        start: start >= 0 ? start : currentIndex,
        end: (start >= 0 ? start : currentIndex) + text.length,
      });
    }
    currentIndex += part.length + 1;
  }
  
  return sentences;
}

// ============================================================================
// VISION DETECTION
// ============================================================================

/**
 * Detect if content has vision signals (first-hand observation evidence)
 */
function detectVision(content: string): { hasVision: boolean; signals: string[] } {
  const signals: string[] = [];
  const contentLower = content.toLowerCase();
  
  // Check first-person observation phrases
  for (const pattern of FIRST_PERSON_OBSERVATION_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      signals.push(match[0]);
    }
  }
  
  // Check visual descriptors (need at least 2)
  let visualDescriptorCount = 0;
  for (const pattern of VISUAL_DESCRIPTOR_PATTERNS) {
    if (pattern.test(content)) {
      visualDescriptorCount++;
      const match = content.match(pattern);
      if (match && signals.length < 10) {
        signals.push(match[0]);
      }
    }
  }
  
  // Check scene anchors
  for (const pattern of SCENE_ANCHOR_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      signals.push(match[0]);
    }
  }
  
  // Has vision if:
  // - Any first-person observation phrase, OR
  // - 2+ visual descriptors, OR
  // - 3+ total signals
  const hasVision = signals.length >= 3 || 
    FIRST_PERSON_OBSERVATION_PATTERNS.some(p => p.test(content)) ||
    visualDescriptorCount >= 2;
  
  return {
    hasVision,
    signals: Array.from(new Set(signals)).slice(0, 8), // Dedupe and limit
  };
}

// ============================================================================
// SENTENCE SCORING
// ============================================================================

/**
 * Score a single sentence for narrative outcome quality (0-10)
 */
function scoreSentence(
  sentence: string,
  config: VerticalConfig
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const sentenceLower = sentence.toLowerCase();
  
  // +2 Actor present
  const hasActor = config.actorKeywords.some(actor => 
    new RegExp(`\\b${actor}\\b`, 'i').test(sentence)
  );
  if (hasActor) {
    score += 2;
    reasons.push('actor');
  }
  
  // +2 Impact verb present
  const hasImpact = config.impactVerbs.some(verb => 
    new RegExp(`\\b${verb}\\b`, 'i').test(sentence)
  );
  if (hasImpact) {
    score += 2;
    reasons.push('impact');
  }
  
  // +2 Cause anchor present
  const hasCause = config.causeAnchors.some(anchor => 
    sentenceLower.includes(anchor.toLowerCase())
  );
  if (hasCause) {
    score += 2;
    reasons.push('cause');
  }
  
  // +1 Evidence qualifier (time, count, comparative)
  const hasQualifier = config.evidenceQualifiers.some(q => 
    sentenceLower.includes(q.toLowerCase())
  ) || /\d+/.test(sentence); // Numbers count as evidence
  if (hasQualifier) {
    score += 1;
    reasons.push('qualifier');
  }
  
  // +1 First-person (I/we/our) OR direct quote
  const hasFirstPerson = /\b(I|we|our|my)\b/i.test(sentence);
  const hasDirectQuote = /'[^']{10,}'|"[^"]{10,}"/i.test(sentence);
  if (hasFirstPerson || hasDirectQuote) {
    score += 1;
    reasons.push(hasDirectQuote ? 'quote' : 'first-person');
  }
  
  // +2 Domain-specific proof words
  const hasProofWord = config.proofWords.some(word => 
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sentence)
  );
  if (hasProofWord) {
    score += 2;
    reasons.push('proof-word');
  }
  
  return { score, reasons };
}

/**
 * Check if a sentence matches vague outcome patterns
 */
function checkVaguePatterns(
  sentence: string,
  config: VerticalConfig
): { isVague: boolean; matchedPattern?: string } {
  for (const pattern of config.vagueOutcomeRegexes) {
    pattern.lastIndex = 0; // Reset regex state
    const match = sentence.match(pattern);
    if (match) {
      return { isVague: true, matchedPattern: match[0] };
    }
  }
  return { isVague: false };
}

// ============================================================================
// MAIN DETECTOR
// ============================================================================

/**
 * Detect narrative outcomes in content
 * 
 * @param content - The article content to analyze
 * @param serviceContext - Service type for vertical-specific detection
 * @param pageType - Type of page (affects thresholds)
 */
export function detectNarrativeOutcomes(
  content: string,
  serviceContext?: string,
  pageType?: string
): OutcomeDetectionResult {
  const config = getVerticalConfig(serviceContext);
  const sentences = splitIntoSentences(content);
  const visionResult = detectVision(content);
  
  const outcomeSpans: OutcomeSpan[] = [];
  const validOutcomes: OutcomeSpan[] = [];
  const vagueOutcomes: OutcomeSpan[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  const recommendedFixes: OutcomeDetectionResult['recommendedFixes'] = [];
  
  let bestScore = 0;
  
  // Analyze each sentence
  for (const { text, start, end } of sentences) {
    const { score, reasons } = scoreSentence(text, config);
    const { isVague, matchedPattern } = checkVaguePatterns(text, config);
    
    // Only consider sentences that look like outcomes (score >= 4)
    if (score >= 4) {
      const span: OutcomeSpan = {
        start,
        end,
        sentence: text,
        score,
        reasons,
        isVague,
        vagueMatch: matchedPattern,
      };
      
      outcomeSpans.push(span);
      
      if (score > bestScore) {
        bestScore = score;
      }
      
      // Score >= 6 AND not vague = valid outcome
      if (score >= 6 && !isVague) {
        validOutcomes.push(span);
      }
      // Score >= 6 but vague = problematic (needs fixing)
      else if (score >= 6 && isVague) {
        vagueOutcomes.push(span);
        recommendedFixes.push({
          type: 'fix-vague',
          message: `Rewrite to remove vague phrasing "${matchedPattern}". Add specific actor + impact + cause.`,
          targetSentence: text.slice(0, 80) + '...',
        });
      }
      // Score 4-5 = weak outcome (warning)
      else if (score >= 4 && score < 6) {
        if (!reasons.includes('cause')) {
          recommendedFixes.push({
            type: 'add-cause',
            message: `Add a cause anchor (because, due to, which meant) to strengthen: "${text.slice(0, 60)}..."`,
            targetSentence: text.slice(0, 80) + '...',
          });
        }
        if (!reasons.includes('actor')) {
          recommendedFixes.push({
            type: 'add-actor',
            message: `Add who acted (client, couple, buyer) to: "${text.slice(0, 60)}..."`,
            targetSentence: text.slice(0, 80) + '...',
          });
        }
      }
    }
    // Check for vague sentences that don't even score high enough
    else if (isVague) {
      vagueOutcomes.push({
        start,
        end,
        sentence: text,
        score,
        reasons,
        isVague: true,
        vagueMatch: matchedPattern,
      });
    }
  }
  
  const hasNarrativeOutcome = validOutcomes.length > 0;
  
  // Determine failures and warnings
  
  // FAIL: Vision present but no narrative outcomes
  if (visionResult.hasVision && !hasNarrativeOutcome) {
    failures.push(
      'VISION WITHOUT OUTCOME: This page includes first-hand observation but no narrative outcomes. ' +
      'Add at least one sentence showing who acted, what they did, and why (actor + impact + cause).'
    );
    
    // Find first vision paragraph for fix suggestion
    const firstVisionIndex = content.indexOf(visionResult.signals[0] || '');
    recommendedFixes.push({
      type: 'add-outcome',
      message: 'Add a narrative outcome after your first observation. Example: "Because [cause], [actor] [impact]—and that [consequence]."',
      insertAfterIndex: firstVisionIndex > 0 ? firstVisionIndex + 100 : 0,
    });
  }
  
  // FAIL: Any vague outcomes that scored >= 6 (they're trying to be outcomes but failing)
  if (vagueOutcomes.some(v => v.score >= 6)) {
    const vagueList = vagueOutcomes
      .filter(v => v.score >= 6)
      .slice(0, 3)
      .map(v => `"${v.vagueMatch}"`)
      .join(', ');
    
    failures.push(
      `VAGUE OUTCOME DETECTED: Outcome sentences use vague phrasing (${vagueList}). ` +
      'Rewrite with specific actor + impact verb + cause anchor.'
    );
  }
  
  // FAIL: Case study pages need higher bar
  const isCaseStudy = /case.?study|what we (saw|observed|captured)|local.?case/i.test(pageType || '');
  if (isCaseStudy && bestScore < 7) {
    failures.push(
      'CASE STUDY THRESHOLD: Case study pages require at least one high-quality outcome (score 7+). ' +
      'Current best: ' + bestScore + '/10. Add more evidence qualifiers and cause anchors.'
    );
  }
  
  // WARN: Outcomes exist but lack cause anchors (soft warning for non-case-study)
  const outcomesWithoutCause = validOutcomes.filter(o => !o.reasons.includes('cause'));
  if (outcomesWithoutCause.length > 0 && !isCaseStudy) {
    warnings.push(
      `WEAK CAUSATION: ${outcomesWithoutCause.length} outcome(s) lack cause anchors. ` +
      'Consider adding "because", "due to", or "which meant" for stronger EEAT signals.'
    );
  }
  
  // WARN: Low vision signal but attempting outcomes
  if (!visionResult.hasVision && validOutcomes.length > 0) {
    warnings.push(
      'OUTCOME WITHOUT VISION: Outcome statements found but no first-hand observation signals. ' +
      'Consider adding "we observed", "during the session", or specific scene details.'
    );
  }
  
  return {
    hasVision: visionResult.hasVision,
    hasNarrativeOutcome,
    visionSignals: visionResult.signals,
    outcomeSpans,
    validOutcomes,
    vagueOutcomes,
    bestScore,
    failures,
    warnings,
    recommendedFixes,
  };
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export { getVerticalConfig, type VerticalConfig } from './verticalConfigs';
