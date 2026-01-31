// ============================================================================
// SEO HEADING SCORER
// ============================================================================
// Scores SEO Title / H1 / Meta options on a 0-100 scale.
// Provides tier classifications, human-readable reasons, and warning flags.
// Run immediately after IA generates options to rank and recommend.

export type HeadingType = "title" | "h1" | "meta";

export type ScoreResult = {
  text: string;
  score: number;        // 0–100
  tier: "best" | "good" | "ok" | "risky";
  reasons: string[];    // human-readable rationale for UI
  flags: string[];      // warnings for UI badges
};

export type ScoreInputs = {
  focusKeyword: string;     // e.g. "engagement photography buckinghamshire"
  location: string;         // e.g. "Buckinghamshire"
  brand?: string;           // e.g. "Damion Mower"
  headingType: HeadingType; // title | h1 | meta
  intent?: PageIntent;      // Auto-detected if not provided
};

export type ScoredHeadingSet = {
  results: ScoreResult[];
  best: ScoreResult | null;
  recommended: string | null;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "your", "our", "by"
]);

const COMMERCIAL_VERBS = [
  "book", "get", "hire", "contact", "enquire", "reserve", "schedule", "call", "request", "compare",
  "discover", "find", "explore", "choose", "start", "begin", "try", "experience"
];

const HYPE_WORDS = [
  "best", "top", "ultimate", "amazing", "stunning", "unforgettable", "perfect",
  "incredible", "exceptional", "outstanding", "unrivaled", "unmatched"
];

// Emotional-only phrases that lack ranking intent (bad for money pages)
const EMOTIONAL_ONLY_PHRASES = [
  "capture the magic", "cherish forever", "love story", "dream come true",
  "once in a lifetime", "special moments", "precious memories", "timeless beauty",
  "magical moments", "heartfelt", "unforgettable journey", "celebrate love",
  "fairy tale", "happily ever after", "treasure forever", "moments that matter"
];

// ============================================================================
// PAGE INTENT DETECTION
// ============================================================================

export type PageIntent = "money" | "service" | "informational" | "case-study" | "comparison";

// Patterns for intent detection
const MONEY_PATTERNS = /\b(book|get|hire|pricing|photographer|photography services|packages?)\b/i;
const SERVICE_PATTERNS = /\b(services|photography in|based in|covering)\b/i;
const INFORMATIONAL_PATTERNS = /\b(trends?|guide|insights?|tips|how to|what is|why|202[0-9]|ideas?|inspiration|planning|checklist)\b/i;
const CASE_STUDY_PATTERNS = /\b(case study|real wedding|we captured|we observed|featured|gallery|portfolio)\b/i;
const COMPARISON_PATTERNS = /\b(vs|versus|compared?|difference|alternative|which)\b/i;

/**
 * Detect page intent from title text
 */
export function detectPageIntent(title: string): PageIntent {
  const t = title.toLowerCase();
  
  // Order matters - check most specific first
  if (CASE_STUDY_PATTERNS.test(t)) return "case-study";
  if (COMPARISON_PATTERNS.test(t)) return "comparison";
  if (MONEY_PATTERNS.test(t)) return "money";
  if (SERVICE_PATTERNS.test(t)) return "service";
  if (INFORMATIONAL_PATTERNS.test(t)) return "informational";
  
  // Default to service for local business pages
  return "service";
}

// ============================================================================
// INTENT-AWARE SCORING WEIGHTS
// ============================================================================

type ScoringWeights = {
  locationPresent: number;
  locationMissing: number;
  topicClarity: number;
  yearModifier: number;
  expertiseCue: number;
  transactionalVerb: number;
  missingTransactionalVerb: number;
  brand: number;
  questionFormat: number;
  hypePenalty: number;
  emotionalOnlyPenalty: number;
  contiguousPhrase: number;
  frontLoading: number;
};

const WEIGHT_PROFILES: Record<PageIntent, ScoringWeights> = {
  money: {
    locationPresent: 30,
    locationMissing: -40,
    topicClarity: 10,
    yearModifier: 5,
    expertiseCue: 5,
    transactionalVerb: 15,
    missingTransactionalVerb: -8,
    brand: 10,
    questionFormat: -20,
    hypePenalty: -10,
    emotionalOnlyPenalty: -30,
    contiguousPhrase: 18,
    frontLoading: 5,
  },
  service: {
    locationPresent: 30,
    locationMissing: -35,
    topicClarity: 15,
    yearModifier: 5,
    expertiseCue: 10,
    transactionalVerb: 12,
    missingTransactionalVerb: -5,
    brand: 10,
    questionFormat: -15,
    hypePenalty: -10,
    emotionalOnlyPenalty: -25,
    contiguousPhrase: 15,
    frontLoading: 5,
  },
  informational: {
    locationPresent: 10,    // Optional boost, not required
    locationMissing: 0,     // NO PENALTY for informational
    topicClarity: 40,       // HIGH importance
    yearModifier: 20,       // HIGH importance
    expertiseCue: 15,       // HIGH importance
    transactionalVerb: 5,   // LOW importance
    missingTransactionalVerb: 0, // NO PENALTY
    brand: 8,
    questionFormat: -10,    // Mild penalty only
    hypePenalty: -5,
    emotionalOnlyPenalty: -10,
    contiguousPhrase: 10,
    frontLoading: 3,
  },
  "case-study": {
    locationPresent: 15,
    locationMissing: -10,   // Mild penalty
    topicClarity: 25,
    yearModifier: 5,
    expertiseCue: 20,
    transactionalVerb: 5,
    missingTransactionalVerb: 0,
    brand: 15,              // Brand matters for case studies
    questionFormat: -5,
    hypePenalty: -5,
    emotionalOnlyPenalty: 0, // Emotional OK for case studies
    contiguousPhrase: 10,
    frontLoading: 5,
  },
  comparison: {
    locationPresent: 20,
    locationMissing: -20,
    topicClarity: 30,
    yearModifier: 10,
    expertiseCue: 15,
    transactionalVerb: 10,
    missingTransactionalVerb: 0,
    brand: 5,
    questionFormat: 0,      // Questions OK for comparisons
    hypePenalty: -15,
    emotionalOnlyPenalty: -20,
    contiguousPhrase: 12,
    frontLoading: 5,
  },
};

// ============================================================================
// SCORE FLOORS - Minimum scores per intent (prevents trust-destroying 0s)
// ============================================================================

const SCORE_FLOORS: Record<PageIntent, number> = {
  money: 35,           // Money pages need more signals, but never 0
  service: 40,         // Service pages have floor
  informational: 55,   // Informational content meets basic correctness easily
  "case-study": 45,    // Case studies have natural floor
  comparison: 45,      // Comparisons have natural floor
};

// ============================================================================
// INTENT-AWARE MESSAGING
// ============================================================================

const LOCATION_MESSAGES: Record<PageIntent, { missing: string; boost: string }> = {
  money: {
    missing: "Location required for local ranking",
    boost: "Location present (+{score})",
  },
  service: {
    missing: "Location required for local ranking", 
    boost: "Location present (+{score})",
  },
  informational: {
    missing: "Location optional — adding it may improve local relevance",
    boost: "Location boost (+{score})",
  },
  "case-study": {
    missing: "Location recommended for local context",
    boost: "Location context (+{score})",
  },
  comparison: {
    missing: "Location helpful for local comparison",
    boost: "Location present (+{score})",
  },
};

// Expertise cue phrases
const EXPERTISE_CUES = [
  "expert", "professional", "award", "years", "experienced", "specialist",
  "trusted", "recommended", "featured", "published", "based on", "insights from",
  "from a local", "real weddings", "our experience"
];

// Topic clarity keywords (for informational content)
const TOPIC_CLARITY_WORDS = [
  "trends", "guide", "tips", "ideas", "inspiration", "planning", "checklist",
  "what to expect", "how to", "complete guide", "everything you need"
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s|-]/g, " ") // keep letters/numbers/space/|/-
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

function hasWord(text: string, word: string): boolean {
  return normalize(text).includes(normalize(word));
}

function isQuestion(text: string): boolean {
  return /\?\s*$/.test(text.trim());
}

function countMatches(haystackTokens: string[], needleTokens: string[]): number {
  const set = new Set(haystackTokens);
  let matched = 0;
  for (const t of needleTokens) {
    if (set.has(t)) matched++;
  }
  return matched;
}

/**
 * Contiguous phrase match (strong signal)
 */
function hasContiguousPhrase(text: string, phrase: string): boolean {
  return normalize(text).includes(normalize(phrase));
}

/**
 * Length scoring based on heading type
 */
function lengthScore(text: string, headingType: HeadingType): number {
  const len = text.trim().length;

  if (headingType === "title") {
    // Sweet spot 45–60 chars
    if (len >= 45 && len <= 60) return 12;
    if (len >= 35 && len <= 70) return 8;
    if (len < 25) return 2;
    if (len > 75) return 3;
    return 6;
  }

  if (headingType === "h1") {
    // Sweet spot 35–75 chars
    if (len >= 35 && len <= 75) return 10;
    if (len >= 25 && len <= 90) return 7;
    if (len < 20) return 2;
    return 5;
  }

  // Meta: sweet spot 120–160 chars
  if (len >= 120 && len <= 160) return 10;
  if (len >= 90 && len <= 180) return 7;
  if (len < 70) return 2;
  return 4;
}

/**
 * Convert score to tier classification
 */
function tierFromScore(score: number): ScoreResult["tier"] {
  if (score >= 85) return "best";
  if (score >= 72) return "good";
  if (score >= 58) return "ok";
  return "risky";
}

// ============================================================================
// MAIN SCORING FUNCTION (INTENT-AWARE)
// ============================================================================

/**
 * Score a single heading option with intent-aware weights
 */
export function scoreHeadingOption(text: string, inputs: ScoreInputs): ScoreResult {
  const reasons: string[] = [];
  const flags: string[] = [];
  let score = 0;

  const t = text.trim();
  const tokens = tokenize(t);

  const fk = inputs.focusKeyword.trim();
  const fkTokensRaw = tokenize(fk).filter(w => !STOPWORDS.has(w));
  const location = inputs.location.trim();
  const brand = inputs.brand?.trim();

  // Detect intent if not provided
  const intent = inputs.intent || detectPageIntent(t);
  const weights = WEIGHT_PROFILES[intent];
  const locationMessages = LOCATION_MESSAGES[intent];
  const floor = SCORE_FLOORS[intent];

  reasons.push(`Intent: ${intent}`);

  // -------------------------------------------------------------------------
  // 1) Location presence - INTENT-AWARE with proper messaging
  // -------------------------------------------------------------------------
  const hasLocation = location && hasWord(t, location);
  
  if (hasLocation) {
    if (weights.locationPresent > 0) {
      score += weights.locationPresent;
      reasons.push(locationMessages.boost.replace("{score}", String(weights.locationPresent)));
    }
  } else if (inputs.headingType !== "meta") {
    // Apply penalty only for intents that require location
    if (weights.locationMissing < 0) {
      score += weights.locationMissing;
      // Use intent-aware messaging
      if (intent === "money" || intent === "service") {
        flags.push(`❌ ${locationMessages.missing}`);
      } else {
        // Softer messaging for informational/case-study
        reasons.push(`ℹ️ ${locationMessages.missing}`);
      }
    }
    // No penalty case (informational) - just note it's optional
    else if (intent === "informational") {
      reasons.push(`ℹ️ ${locationMessages.missing}`);
    }
  }

  // -------------------------------------------------------------------------
  // 2) Topic Clarity (important for informational content)
  // -------------------------------------------------------------------------
  const hasTopicClarity = TOPIC_CLARITY_WORDS.some(w => hasWord(t, w));
  if (hasTopicClarity && weights.topicClarity > 0) {
    score += weights.topicClarity;
    reasons.push(`Clear topic focus (+${weights.topicClarity})`);
  }

  // -------------------------------------------------------------------------
  // 3) Year modifier (important for trends/guides)
  // -------------------------------------------------------------------------
  const hasYearModifier = /202[4-9]|203[0-9]/.test(t);
  if (hasYearModifier && weights.yearModifier > 0) {
    score += weights.yearModifier;
    reasons.push(`Year modifier (+${weights.yearModifier})`);
  }

  // -------------------------------------------------------------------------
  // 4) Expertise cues
  // -------------------------------------------------------------------------
  const hasExpertiseCue = EXPERTISE_CUES.some(cue => hasContiguousPhrase(t, cue));
  if (hasExpertiseCue && weights.expertiseCue > 0) {
    score += weights.expertiseCue;
    reasons.push(`Expertise signal (+${weights.expertiseCue})`);
  }

  // -------------------------------------------------------------------------
  // 5) Focus keyword coverage (bag-of-words)
  // -------------------------------------------------------------------------
  const matched = countMatches(tokens, fkTokensRaw);
  const coverage = fkTokensRaw.length ? matched / fkTokensRaw.length : 0;

  if (coverage >= 0.9) {
    const coverageBonus = inputs.headingType === "title" ? 20 : 16;
    score += coverageBonus;
    reasons.push(`Strong keyword coverage (+${coverageBonus})`);
  } else if (coverage >= 0.6) {
    const coverageBonus = inputs.headingType === "title" ? 12 : 8;
    score += coverageBonus;
    reasons.push(`Good keyword coverage (+${coverageBonus})`);
  } else if (coverage >= 0.35) {
    score += 5;
    reasons.push("Partial keyword coverage (+5)");
  } else if (intent === "money" || intent === "service") {
    // Only penalize weak coverage for money/service pages
    score -= 8;
    flags.push("Weak keyword coverage (-8)");
  }

  // -------------------------------------------------------------------------
  // 6) Contiguous phrase bonus
  // -------------------------------------------------------------------------
  const phraseCandidate = fkTokensRaw.join(" ");
  if (phraseCandidate && hasContiguousPhrase(t, phraseCandidate)) {
    score += weights.contiguousPhrase;
    reasons.push(`Contiguous keyphrase (+${weights.contiguousPhrase})`);
  }

  // -------------------------------------------------------------------------
  // 7) Transactional / Commercial intent verbs - INTENT-AWARE
  // -------------------------------------------------------------------------
  const hasCommercialVerb = COMMERCIAL_VERBS.some(v => hasWord(t, v));
  if (hasCommercialVerb && weights.transactionalVerb > 0) {
    score += weights.transactionalVerb;
    reasons.push(`Transactional verb (+${weights.transactionalVerb})`);
  } else if (inputs.headingType === "h1" && weights.missingTransactionalVerb !== 0) {
    // Only penalize for money/service pages
    if (intent === "money" || intent === "service") {
      score += weights.missingTransactionalVerb;
      flags.push(`❌ H1 lacks action verb (${weights.missingTransactionalVerb})`);
    }
  } else if (intent === "informational" && !hasCommercialVerb) {
    // For informational, note it's OK
    reasons.push("ℹ️ Transactional verb not required for informational");
  }

  // -------------------------------------------------------------------------
  // 8) Brand presence - INTENT-AWARE
  // -------------------------------------------------------------------------
  if (brand && hasWord(t, brand) && weights.brand > 0) {
    score += weights.brand;
    reasons.push(`Includes brand (+${weights.brand})`);
  }

  // -------------------------------------------------------------------------
  // 9) Question penalty - INTENT-AWARE
  // -------------------------------------------------------------------------
  if (isQuestion(t) && weights.questionFormat !== 0) {
    score += weights.questionFormat;
    if (weights.questionFormat < -10) {
      flags.push(`Question format (${weights.questionFormat})`);
    } else if (weights.questionFormat < 0) {
      reasons.push(`Question format (${weights.questionFormat})`);
    }
  }

  // -------------------------------------------------------------------------
  // 10) Hype/waffle penalties - INTENT-AWARE
  // -------------------------------------------------------------------------
  const hypeCount = HYPE_WORDS.filter(w => hasWord(t, w)).length;
  if (hypeCount >= 2 && weights.hypePenalty !== 0) {
    score += weights.hypePenalty;
    flags.push(`Too salesy (${weights.hypePenalty})`);
  }

  // -------------------------------------------------------------------------
  // 11) Emotional-only phrasing penalty - INTENT-AWARE
  // -------------------------------------------------------------------------
  const hasEmotionalOnly = EMOTIONAL_ONLY_PHRASES.some(p => hasContiguousPhrase(t, p));
  if (hasEmotionalOnly && weights.emotionalOnlyPenalty !== 0) {
    score += weights.emotionalOnlyPenalty;
    if (weights.emotionalOnlyPenalty < -15) {
      flags.push(`Emotional-only phrasing (${weights.emotionalOnlyPenalty})`);
    }
  }

  // -------------------------------------------------------------------------
  // 12) Length score
  // -------------------------------------------------------------------------
  const ls = lengthScore(t, inputs.headingType);
  score += ls;
  reasons.push(`Length fit (+${ls})`);

  // -------------------------------------------------------------------------
  // 13) Front-loading bonus - INTENT-AWARE
  // -------------------------------------------------------------------------
  const firstToken = tokens[0];
  if (firstToken && fkTokensRaw.includes(firstToken) && weights.frontLoading > 0) {
    score += weights.frontLoading;
    reasons.push(`Keyword front-loaded (+${weights.frontLoading})`);
  }

  // -------------------------------------------------------------------------
  // 14) Apply intent floor and safety clamp
  // -------------------------------------------------------------------------
  // Apply floor - content meeting basic intent correctness never scores 0
  if (score < floor) {
    score = floor;
    reasons.push(`Intent floor applied (min ${floor})`);
  }
  
  // Cap at 100
  if (score > 100) score = 100;

  return {
    text: t,
    score,
    tier: tierFromScore(score),
    reasons,
    flags
  };
}

/**
 * Score a set of heading options and return ranked results
 */
export function scoreHeadingSet(
  options: string[],
  inputs: ScoreInputs
): ScoredHeadingSet {
  const results = options
    .filter(Boolean)
    .map(o => scoreHeadingOption(o, inputs))
    .sort((a, b) => b.score - a.score);

  const best = results[0] ?? null;

  return {
    results,
    best,
    recommended: best?.text ?? null
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a selected option has critical warnings (for guardrail UI)
 */
export function hasLocationWarning(result: ScoreResult): boolean {
  return result.flags.includes("Missing location");
}

/**
 * Check if selection is risky (for confirmation dialog)
 */
export function isRiskySelection(result: ScoreResult): boolean {
  return result.tier === "risky" || result.flags.includes("Missing location");
}

/**
 * Get warning message for risky selection
 */
export function getRiskySelectionWarning(result: ScoreResult): string | null {
  if (result.flags.includes("Missing location")) {
    return "This option is missing your location. This will reduce local ranking strength. Confirm anyway?";
  }
  if (result.tier === "risky") {
    return "This option scores poorly for SEO. Consider choosing a higher-ranked option. Confirm anyway?";
  }
  return null;
}

/**
 * Get tier badge color classes
 */
export function getTierColorClasses(tier: ScoreResult["tier"]): string {
  switch (tier) {
    case "best":
      return "bg-green-100 text-green-800";
    case "good":
      return "bg-blue-100 text-blue-800";
    case "ok":
      return "bg-yellow-100 text-yellow-800";
    case "risky":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

/**
 * Get tier badge label
 */
export function getTierLabel(tier: ScoreResult["tier"]): string {
  switch (tier) {
    case "best":
      return "Best for ranking";
    case "good":
      return "Strong";
    case "ok":
      return "OK";
    case "risky":
      return "Risky";
    default:
      return "Unknown";
  }
}

// ============================================================================
// SEO TITLE ↔ H1 ALIGNMENT VALIDATOR
// ============================================================================

export type AlignmentResult = {
  aligned: boolean;
  warning: string | null;
  suggestedH1: string | null;
};

/**
 * Check if SEO Title and H1 are aligned on ranking intent (service + location).
 * If title contains {Primary Service + Location} but H1 does not → flag misalignment.
 */
export function validateTitleH1Alignment(
  seoTitle: string,
  h1: string,
  primaryService: string,
  location: string
): AlignmentResult {
  const titleNorm = normalize(seoTitle);
  const h1Norm = normalize(h1);
  const serviceNorm = normalize(primaryService);
  const locationNorm = normalize(location);

  // Build the ranking phrase (service + location)
  const rankingPhrase = `${serviceNorm} ${locationNorm}`.trim();

  // Check if title contains the service
  const titleHasService = hasContiguousPhrase(titleNorm, serviceNorm) || 
    tokenize(titleNorm).filter(t => tokenize(serviceNorm).includes(t)).length >= 
    Math.ceil(tokenize(serviceNorm).length * 0.7);

  // Check if title contains the location
  const titleHasLocation = locationNorm && hasWord(titleNorm, locationNorm);

  // If title doesn't have both, no alignment check needed
  if (!titleHasService || !titleHasLocation) {
    return { aligned: true, warning: null, suggestedH1: null };
  }

  // Now check H1 for the same
  const h1HasService = hasContiguousPhrase(h1Norm, serviceNorm) ||
    tokenize(h1Norm).filter(t => tokenize(serviceNorm).includes(t)).length >= 
    Math.ceil(tokenize(serviceNorm).length * 0.7);

  const h1HasLocation = locationNorm && hasWord(h1Norm, locationNorm);

  if (h1HasService && h1HasLocation) {
    return { aligned: true, warning: null, suggestedH1: null };
  }

  // Misalignment detected - generate warning and suggestion
  const missingParts: string[] = [];
  if (!h1HasService) missingParts.push("service");
  if (!h1HasLocation) missingParts.push("location");

  const warning = `H1 misaligned with ranking intent: missing ${missingParts.join(" and ")} that SEO title contains`;

  // Generate suggested H1
  let suggestedH1: string;
  if (!h1HasService && !h1HasLocation) {
    // H1 is completely different - suggest service + location format
    suggestedH1 = `${capitalize(primaryService)} in ${capitalize(location)}`;
  } else if (!h1HasLocation) {
    // Add location to existing H1
    suggestedH1 = `${h1.trim()} in ${capitalize(location)}`;
  } else {
    // Add service context
    suggestedH1 = `${capitalize(primaryService)} – ${h1.trim()}`;
  }

  return {
    aligned: false,
    warning,
    suggestedH1
  };
}

/**
 * Capitalize first letter of each word
 */
function capitalize(s: string): string {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Score H1 with alignment penalty if misaligned with selected SEO title
 */
export function scoreH1WithAlignment(
  h1Text: string,
  seoTitle: string,
  inputs: ScoreInputs & { primaryService: string }
): ScoreResult {
  const baseResult = scoreHeadingOption(h1Text, { ...inputs, headingType: "h1" });
  
  const alignment = validateTitleH1Alignment(
    seoTitle,
    h1Text,
    inputs.primaryService,
    inputs.location
  );

  if (!alignment.aligned) {
    baseResult.score = Math.max(0, baseResult.score - 25);
    baseResult.flags.push("Misaligned with SEO title");
    if (alignment.suggestedH1) {
      baseResult.reasons.push(`Suggested: "${alignment.suggestedH1}"`);
    }
    baseResult.tier = tierFromScore(baseResult.score);
  }

  return baseResult;
}

// Re-export tierFromScore for external use
export { tierFromScore };

// Export score floors and intent detection for UI use
export { SCORE_FLOORS, LOCATION_MESSAGES };
