// ============================================================================
// GROWTH PLANNER TYPES
// ============================================================================

import { PageRole, Channel, BrandTone } from '@/types';

// ============================================================================
// HEADING CONTRACT TYPES
// ============================================================================

/** Heading type for content structure contracts */
export type HeadingType = 'intent' | 'evidence' | 'geo' | 'process' | 'faq' | 'comparison' | 'pricing' | 'trust' | 'cta';

/** Required heading in the content structure */
export interface RequiredHeading {
  /** Heading level (2 = H2, 3 = H3) */
  level: 2 | 3;
  /** Semantic type of the heading */
  type: HeadingType;
  /** Hint text for what this section should cover */
  textHint: string;
  /** Whether this heading is optional (default: required) */
  optional?: boolean;
}

// ============================================================================
// RESEARCH PACK TYPES (duplicated from @iav2/research for decoupling)
// ============================================================================

export interface AeoPack {
  queryCluster: string[];
  paaQuestions: string[];
  answerShapes: string[];
  citations: string[];
  misconceptions: string[];
}

export interface GeoPack {
  coordinates?: { lat: number; lng: number };
  nearbyPlaces: Array<{
    name: string;
    type: string;
    distance: number;
  }>;
  proximityAnchors: string[];
  localLanguage: string[];
}

export interface ResearchPack {
  aeo: AeoPack;
  geo: GeoPack;
  generatedAt: string;
  cacheKey: string;
}

// ============================================================================
// SERVICE REALITY LOCK - FORBIDDEN GENERIC TERMS
// ============================================================================

export const FORBIDDEN_SERVICE_TERMS = [
  'expertise',
  'service',
  'services',
  'professional services',
  'general',
  'main service',
  'our work',
  'what we do',
  'solutions',
] as const;

/**
 * Check if a service term is a forbidden generic placeholder
 */
export function isGenericService(service: string): boolean {
  const normalized = service.toLowerCase().trim();
  return FORBIDDEN_SERVICE_TERMS.some(
    (term) => normalized === term || normalized.includes(term)
  );
}

/**
 * Validate and filter services to only real, specific ones
 */
export function validateServices(services: string[]): {
  validServices: string[];
  rejectedServices: string[];
} {
  const validServices: string[] = [];
  const rejectedServices: string[] = [];

  for (const service of services) {
    if (isGenericService(service)) {
      rejectedServices.push(service);
    } else {
      validServices.push(service);
    }
  }

  return { validServices, rejectedServices };
}

// ============================================================================
// FOUNDATION SCORE THRESHOLDS
// ============================================================================

export const FOUNDATION_THRESHOLDS = {
  /** Below this: ONLY foundation tasks allowed */
  critical: 30,
  /** Below this: No authority/seasonal content allowed */
  minimum: 50,
  /** Above this: Full plan unlocked */
  healthy: 70,
} as const;

/**
 * Calculate foundation score from site structure and gaps
 */
export function calculateFoundationScore(
  siteStructure: SiteStructureContext,
  gapAnalysis: GapAnalysis
): number {
  let score = 100;

  // Deduct for missing money pages (critical)
  const criticalMoneyGaps = gapAnalysis.moneyPageGaps.filter(
    (g) => g.priority === 'critical'
  ).length;
  score -= criticalMoneyGaps * 15;

  // Deduct for conversion blockers (critical)
  score -= gapAnalysis.conversionBlockers.length * 10;

  // Deduct for structural issues
  score -= gapAnalysis.structuralIssues.length * 5;

  // Deduct for orphaned content
  score -= Math.min(20, siteStructure.orphanPages * 2);

  // Deduct for missing trust pages
  const trustGaps = gapAnalysis.trustGaps.filter(
    (g) => g.priority === 'critical' || g.priority === 'high'
  ).length;
  score -= trustGaps * 8;

  // Deduct for low page role coverage
  if (siteStructure.pagesByRole.money === 0) score -= 20;
  if (siteStructure.pagesByRole.trust === 0) score -= 10;

  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// CONTEXT MODELS (Phase 0)
// ============================================================================

export interface SiteStructureContext {
  siteUrl: string;
  totalPages: number;
  indexablePages: number;
  orphanPages: number;
  avgWordCount: number;
  pagesByRole: {
    money: number;
    trust: number;
    support: number;
    authority: number;
  };
  internalLinkDensity: number; // avg links per page
  topLinkedPages: Array<{
    path: string;
    title: string;
    linksIn: number;
  }>;
  orphanedContent: Array<{
    path: string;
    title: string;
  }>;
}

export interface PageContentContext {
  path: string;
  url: string;
  title: string | null;
  h1: string | null;
  role: PageRole;
  wordCount: number;
  primaryTopic: string | null;
  serviceMentions: string[];
  locationMentions: string[];
  hasConversionElements: boolean;
  internalLinksIn: number;
  internalLinksOut: number;
  healthScore: number;
  issues: string[];
}

export interface BusinessRealityModel {
  // From project & user_context
  name: string;
  domain: string;
  niche: string;
  primaryGoal: string;
  primaryCTA: string;
  
  // Services
  coreServices: string[];
  serviceHierarchy: Array<{
    service: string;
    isPrimary: boolean;
    relatedServices: string[];
  }>;
  pricePositioning: 'budget' | 'mid' | 'premium';
  
  // Location
  primaryLocations: string[];
  serviceAreaKm: number;
  localPhrasing: string[];
  
  // Experience & proof
  yearsActive: number | null;
  volumeIndicators: string[]; // "500+ sessions", "100+ families"
  differentiators: string[];
  guarantees: string[];
  
  // Scenario-based proof (NOT generic "years experience")
  scenarioProof: ScenarioProof[];
  
  // Brand
  tone: BrandTone[];
  doNotSay: string[];
  
  // Trust signals
  reviewThemes: Array<{
    theme: string;
    count: number;
    snippets: string[];
  }>;
  proofAssets: string[]; // case studies, awards, certifications
}

/**
 * Scenario-based proof element - shows what experience ENABLES or PREVENTS
 * NOT generic "22+ years experience" but specific outcomes
 */
export interface ScenarioProof {
  type: 'outcome' | 'volume' | 'complexity' | 'speed' | 'prevention';
  service: string;
  statement: string;
  // Examples:
  // { type: 'volume', service: 'Trademark Protection', statement: 'Handled 500+ trademark applications' }
  // { type: 'complexity', service: 'E-Money Licensing', statement: 'Navigated 12 cross-border regulatory frameworks' }
  // { type: 'prevention', service: 'GDPR', statement: 'Prevented €2M+ in potential fines for clients' }
}

// ============================================================================
// PAGE GAP ANALYSIS (Phase 1)
// ============================================================================

export type GapAction = 'fix' | 'rebuild' | 'expand' | 'create' | 'stabilise' | 'refresh';

export interface PageGap {
  path: string | null; // null for CREATE
  existingTitle: string | null;
  action: GapAction;
  reason: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  targetRole: PageRole;
  targetService: string | null;
  targetLocation: string | null;
  blocksConversion: boolean;
  suggestedTitle: string;
}

export interface GapAnalysis {
  moneyPageGaps: PageGap[];
  trustGaps: PageGap[];
  supportGaps: PageGap[];
  structuralIssues: Array<{
    type: 'duplicate_intent' | 'topic_bleed' | 'orphan' | 'cannibalisation' | 'thin_content';
    pages: string[];
    recommendation: string;
  }>;
  conversionBlockers: Array<{
    page: string;
    blocker: string;
    fixAction: string;
  }>;
}

// ============================================================================
// GROWTH PLAN TASKS (Phase 2)
// ============================================================================

export type SupportType = 
  | 'pre-sell' 
  | 'objection' 
  | 'trust' 
  | 'education' 
  | 'comparison'
  | 'local-proof';

export interface GrowthTask {
  id: string;
  month: number;
  
  // Task definition
  title: string;
  slug: string;
  action: GapAction;
  
  // Page role & mapping
  role: PageRole;
  supportsPage: string | null; // path to money page this supports
  supportType: SupportType | null;
  
  // Context anchoring
  primaryService: string;
  primaryLocation: string | null;
  targetAudience: string;
  
  // Cannibalisation prevention - page ownership
  ownershipKey?: string; // ${service}::${location}::${intent}
  primaryQuestion?: string; // The primary question this page answers
  
  // Content specifications
  searchIntent: 'buy' | 'compare' | 'trust' | 'learn';
  estimatedWords: number;
  channel: Channel;
  
  // CADENCE SCHEDULING
  /** Which week of the month (1-4) this task is scheduled */
  cadenceWeek?: 1 | 2 | 3 | 4;
  /** The cadence slot: money, support, case-study, authority */
  cadenceSlot?: 'money' | 'support' | 'case-study' | 'authority';
  /** ISO date string for when this should be published */
  publishAt?: string;
  
  // Status
  status: 'planned' | 'briefed' | 'writing' | 'review' | 'published';
  briefId: string | null;
  
  // HEADING CONTRACT - Structure requirements for the page
  /** Page intent determines required structure */
  pageIntent?: 'money' | 'service' | 'support' | 'geo' | 'trust';
  /** Primary target keyword for the page */
  primaryKeyword?: string;
  /** Geographic targets for geo-intent pages */
  geoTargets?: string[];
  /** Required H2 sections - writer MUST include all */
  requiredHeadings?: RequiredHeading[];
  /** Whether vision evidence is required for this page */
  visionRequired?: boolean;
  /** Minimum number of vision/user facts that must appear in content */
  mustIncludeFactsMin?: number;
  
  // SEO DRAFTS - Source of truth for writer (generated at plan-time)
  /** Refined SEO title tag - writer MUST use this exactly */
  seoTitleDraft?: string;
  /** Refined H1 headline - writer MUST use this exactly */
  h1Draft?: string;
  /** Refined meta description - writer MUST use this exactly */
  metaDescriptionDraft?: string;
  
  // SEO OPTIONS - User selects from these (highest leverage copy)
  /** 3 CTR-focused SEO title options for user selection */
  seoTitleOptions?: string[];
  /** 2 natural H1 options (not keyword-stuffed) */
  h1Options?: string[];
  /** 2 meta description options */
  metaDescriptionOptions?: string[];
  /** SEO scores for title options (parallel array, sorted DESC) */
  seoTitleScores?: number[];
  /** SEO scores for H1 options (parallel array, sorted DESC) */
  h1Scores?: number[];
  /** Best title score for quality gating */
  bestTitleScore?: number;
  /** Best H1 score for quality gating */
  bestH1Score?: number;
  /** Detected intent used for scoring context */
  detectedIntent?: 'money' | 'service' | 'informational' | 'case-study' | 'comparison';
  /** Index of user-selected SEO title (0-2), null = not selected */
  selectedSeoTitleIndex?: number | null;
  /** Index of user-selected H1 (0-1), null = not selected */
  selectedH1Index?: number | null;
  /** Index of user-selected meta description (0-1), null = not selected */
  selectedMetaIndex?: number | null;
  /** Locked for publishing - can't publish until SEO selections made */
  seoLocked?: boolean;
  
  // Personalization proof
  localAnchoring: string | null;
  experienceRequired: string[];
  proofElements: string[];
  reviewThemesToUse: string[];
  
  // Linking
  internalLinksUp: string[]; // links TO money pages
  internalLinksDown: string[]; // optional support links
  
  // CTA
  conversionPath: string;
  
  // VISION EVIDENCE
  /** Vision evidence pack ID if images uploaded */
  imagePackId?: string;
  /** Number of images in the pack */
  imageCount?: number;
  /** Extracted vision facts for writer to use */
  visionFacts?: string[];
  
  // OUTCOME EVIDENCE TRACKING
  /** Whether this task requires outcome evidence (vision present but outcomes missing) */
  requiresOutcomeEvidence?: boolean;
  /** Status of outcome evidence: 'missing' | 'auto-injected' | 'user-reviewed' | 'complete' */
  outcomeEvidenceStatus?: 'missing' | 'auto-injected' | 'user-reviewed' | 'complete';
  
  // RESEARCH PACK (AEO + GEO)
  /** Combined research pack from Serper/Tavily/Geoapify */
  researchPack?: ResearchPack;
}

export interface GrowthPlanMonth {
  month: number;
  theme: string;
  focus: 'foundation' | 'depth' | 'expansion' | 'authority' | 'optimization';
  tasks: GrowthTask[];
  monthlyGoal: string;
  kpis: string[];
}

export interface PersonalizedGrowthPlan {
  projectId: string;
  projectName: string;
  generatedAt: string;
  
  // Context used
  businessContext: BusinessRealityModel;
  siteContext: SiteStructureContext;
  gapAnalysis: GapAnalysis;
  
  // Foundation health (controls phase pacing)
  foundationScore: number;
  
  // Confirmed services (filtered for generics)
  confirmedPrimaryServices: string[];
  
  // Cannibalisation prevention
  ownershipMap: Array<{
    ownershipKey: string;
    service: string;
    location: string;
    intent: string;
    canonicalPage: string;
    supportPages: string[];
  }>;
  cannibalisationReport: {
    isValid: boolean;
    warnings: number;
    blockers: number;
    droppedTasks: string[];
    mergedTasks: Array<{ into: string; merged: string[] }>;
  };

  // Unique identifier validation report
  uniqueIdentifierReport?: {
    isValid: boolean;
    blockers: number;
    repairedIds: string[];
    repairedSlugs: string[];
  };

  // Service ownership validation report
  serviceOwnershipReport?: {
    isValid: boolean;
    blockers: number;
    validatedTasks: number;
    rejectedTasks: number;
    warnings: string[];
  };

  // Enhanced cannibalisation report (Jaccard similarity)
  enhancedCannibalisationReport?: {
    isValid: boolean;
    blockers: number;
    semanticDuplicates: number;
    warnings: string[];
  };

  // SERP/AEO Audit Gate results
  auditGateReport?: {
    tasksAudited: number;
    titlesRewritten: number;
    averageScores: {
      title: number;
      intent: number;
      aeo: number;
      credibility: number;
    };
    taskResults: Array<{
      taskId: string;
      originalTitle: string;
      approved: boolean;
      rewrittenTitle?: string;
      scores: Record<string, number>;
      warnings: string[];
    }>;
  };

  // CADENCE VALIDATION
  cadenceReport?: {
    /** Plan start date for scheduling */
    planStartDate: string;
    /** Whether all months have complete 4-post cadence */
    isValid: boolean;
    /** Number of months with all 4 slots filled */
    completeMonths: number;
    /** Number of months missing slots */
    incompleteMonths: number;
    /** Total posts scheduled */
    totalPosts: number;
    /** Posts by cadence slot */
    bySlot: {
      money: number;
      support: number;
      'case-study': number;
      authority: number;
    };
    /** Warnings about cadence issues */
    warnings: string[];
  };
  
  // The plan
  months: GrowthPlanMonth[];
  totalTasks: number;
  
  // FAIL-FAST: Plan blockers (if any, plan should not be executed)
  blocked: boolean;
  blockers: Array<{
    phase: string;
    type: string;
    message: string;
    suggestion: string;
  }>;
  
  // Quality scores
  qualityScore: {
    personalization: number;
    conversionAlignment: number;
    localRelevance: number;
    trustStrength: number;
    taskUniqueness: number;
    overall: number;
  };
  
  // Flags
  assumptions: string[];
  missingInputs: string[];
  warnings: string[];
}

// ============================================================================
// WRITER BRIEF (Phase 4) - ENHANCED
// ============================================================================

export interface BriefImagePlan {
  heroImagePrompt: string;
  inlineImagePrompts: string[];
  requiredAltTextPatterns: string[];
}

export interface BriefPublishingSpec {
  wpBlocksSafe: boolean;
  maxParagraphWords: number;
  includeTableEvery: number; // sections
}

export interface ChannelDerivative {
  text: string;
  hashtags: string[];
  linkBackSlug: string;
  cta: string;
}

export interface GmbDerivative extends ChannelDerivative {
  callToActionType: 'BOOK' | 'CALL' | 'LEARN_MORE' | 'GET_OFFER';
}

export interface RedditDerivative {
  title: string;
  body: string;
  subredditSuggestions: string[];
  linkBackSlug: string;
  disclosureLine: string;
}

// ============================================================================
// CANONICAL WRITER BRIEF SCHEMA
// ============================================================================
// This is the single most important object in the system.
// It is:
// - Emitted by the planner
// - Enriched by the audit gate
// - Consumed by the writer
// - Reused for LinkedIn / GMB / Reddit
// ============================================================================

export interface WriterBrief {
  id: string;
  taskId: string;

  // ========================================
  // PAGE ROLE & INTENT
  // ========================================
  role: PageRole;
  intent: 'buy' | 'compare' | 'learn' | 'trust';

  // ========================================
  // CORE SEO
  // ========================================
  primaryTopic: string;
  approvedTitle: string;
  slug: string;
  focusKeyphrase: string;
  synonyms: string[];
  metaDescription: string;

  // ========================================
  // STRUCTURE (AEO-first)
  // ========================================
  outline: {
    h1: string;
    sections: Array<{
      h2: string;
      intent: string;
      h3s?: string[];
    }>;
  };

  // ========================================
  // AUTHORITY & CREDIBILITY
  // ========================================
  authorityAngle: string;
  experienceSignals: string[];
  proofElements: {
    reviews?: string[];
    caseStudies?: string[];
    stats?: string[];
  };

  // ========================================
  // VISUAL INTELLIGENCE
  // ========================================
  images?: {
    hero?: {
      imageId: string;
      rationale: string;
      suggestedAlt: string;
      caption?: string;
    };
    inline?: Array<{
      imageId: string;
      placementHint: string;
      suggestedAlt: string;
      caption?: string;
    }>;
  };

  // ========================================
  // INTERNAL LINKING
  // ========================================
  internalLinks: Array<{
    anchorText: string;
    targetUrl: string;
    reason: string;
  }>;

  // ========================================
  // CONVERSION LOGIC
  // ========================================
  CTA: {
    primary: string;
    secondary?: string;
    placement: 'inline' | 'end' | 'sticky';
  };

  // ========================================
  // TONE & VOICE
  // ========================================
  brandTone: {
    personality: string;
    formality: 'casual' | 'professional' | 'formal';
    confidence: 'humble' | 'confident' | 'authoritative';
    localFlavour?: string;
  };

  // ========================================
  // OUTPUT CONTROLS
  // ========================================
  wordCountTarget: number;
  wordpressSafe: boolean;
  formattingRules: {
    maxParagraphWords: number;
    useLists: boolean;
    avoidTables?: boolean;
  };

  // ========================================
  // CHANNEL VARIANTS (SYNDICATION)
  // ========================================
  syndication: {
    linkedIn: {
      hook: string;
      post: string;
      CTA: string;
    };
    gmb: {
      headline: string;
      description: string;
      CTA: string;
    };
    reddit: {
      subreddit: string;
      angle: string;
      post: string;
    };
  };

  // ========================================
  // GUARDRAILS
  // ========================================
  compliance: {
    disclaimers?: string[];
    restrictedClaims?: string[];
  };

  // ========================================
  // RESEARCH INTELLIGENCE (AEO + GEO)
  // ========================================
  /** AEO research: PAA, question clusters, answer shapes, citations */
  aeo?: AeoPack;
  /** GEO research: location context, nearby areas, local patterns */
  geo?: GeoPack;
  /** Full research pack (includes both AEO and GEO) */
  researchPack?: ResearchPack;
}

// ============================================================================
// ENHANCED BRIEF TYPES (Support for canonical brief building)
// ============================================================================

export interface BriefImagePlan {
  heroImagePrompt: string;
  inlineImagePrompts: string[];
  requiredAltTextPatterns: string[];
}

export interface BriefPublishingSpec {
  wpBlocksSafe: boolean;
  maxParagraphWords: number;
  includeTableEvery: number;
}

// Legacy alias for backwards compatibility
export interface LegacyWriterBrief {
  taskId: string;
  slug: string;
  pageTitle: string;
  h1Intent: string;
  role: PageRole;
  primaryService: string;
  primaryLocation: string | null;
  targetAudience: string;
  searchIntent: 'buy' | 'compare' | 'trust' | 'learn';
  estimatedWords: number;
  sections: Array<{
    heading: string;
    purpose: string;
    keyPoints: string[];
  }>;
  keyObjections: string[];
  proofRequired: string[];
  reviewThemesToIncorporate: string[];
  imageGuidance: {
    count: number;
    types: string[];
    mustProve: string[];
  };
  mandatoryInternalLinks: Array<{
    path: string;
    anchorSuggestion: string;
    direction: 'up' | 'down' | 'lateral';
  }>;
  toneGuidance: string[];
  whatNotToDo: string[];
  ctaDirection: string;
  conversionElement: string;
  seoTitle: string;
  metaDescription: string;
  focusKeyword: string;
  secondaryKeywords: string[];
  
  // RESEARCH INTELLIGENCE (AEO + GEO)
  /** AEO research: PAA, question clusters, answer shapes, citations */
  aeo?: AeoPack;
  /** GEO research: location context, nearby areas, local patterns */
  geo?: GeoPack;
  /** Full research pack (includes both AEO and GEO) */
  researchPack?: ResearchPack;
}

// ============================================================================
// HARD RULES VALIDATION (NEW)
// ============================================================================

export const SLUG_MAX_LENGTH = 70;
export const TITLE_SOFT_MAX_LENGTH = 85;
export const TITLE_HARD_MAX_LENGTH = 110;

export type HardRuleCode =
  | 'SLUG_TOO_LONG'
  | 'SLUG_SENTENCE'
  | 'SLUG_NOT_KEBAB'
  | 'SLUG_MISSING_KEYWORD'
  | 'TITLE_TOO_LONG_SOFT'
  | 'TITLE_TOO_LONG_HARD'
  | 'TITLE_VERBATIM_OFFER'
  | 'TITLE_GENERIC_PATTERN'
  | 'TITLE_TOO_SHORT'
  | 'TITLE_LACKS_ENGAGEMENT'
  | 'MISSING_REVIEW_THEME'
  | 'MISSING_EXPERIENCE_PROOF'
  | 'MISSING_LOCAL_ANCHORING'
  | 'MISSING_INTERNAL_LINKS_DOWN'
  | 'MISSING_INTERNAL_LINKS_UP';

export interface HardRuleViolation {
  code: HardRuleCode;
  severity: 'error' | 'warning';
  field: string;
  message: string;
  currentValue: string;
  suggestion?: string;
}

export interface TaskValidationReport {
  taskId: string;
  isValid: boolean;
  violations: HardRuleViolation[];
  wasAutoFixed: boolean;
  autoFixActions: string[];
}

export interface PlanValidationReport {
  isValid: boolean;
  totalTasks: number;
  validTasks: number;
  invalidTasks: number;
  totalViolations: number;
  autoFixable: number;
  taskReports: TaskValidationReport[];
  warnings: string[];
  errors: string[];
}

// ============================================================================
// ENHANCED GROWTH PLAN OUTPUT
// ============================================================================

export interface EnhancedGrowthPlanOutput {
  plan: PersonalizedGrowthPlan;
  briefs: WriterBrief[];
  validationReport: PlanValidationReport;
}

// ============================================================================
// HARD GATE VALIDATION (Phase 0)
// ============================================================================

export interface ContextValidation {
  isValid: boolean;
  criticalMissing: string[];
  warnings: string[];
  canProceed: boolean;
  requiresUserInput: boolean;
  questionsForUser: string[];
}

export const CRITICAL_INPUTS = [
  'coreServices',
  'domain',
  'niche',
] as const;

export const RECOMMENDED_INPUTS = [
  'primaryLocations',
  'yearsActive',
  'primaryGoal',
  'primaryCTA',
  'targetAudience',
] as const;

// ============================================================================
// PAGE ROLE CLASSIFICATION (Phase 2)
// ============================================================================

export interface PageClassification {
  path: string;
  title: string | null;
  currentRole: PageRole;
  detectedRole: PageRole;
  confidence: 'high' | 'medium' | 'low';
  issues: PageRoleIssue[];
}

export interface PageRoleIssue {
  type: 
    | 'duplicate_intent' 
    | 'wrong_role' 
    | 'multi_role' 
    | 'orphan' 
    | 'cannibalisation'
    | 'missing_conversion'
    | 'missing_trust'
    | 'no_support_links';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  recommendation: string;
}

export interface PageRoleReport {
  classifications: PageClassification[];
  summary: {
    money: number;
    support: number;
    trust: number;
    authority: number;
    operational: number;
    unclassified: number;
  };
  issues: {
    missingRoles: PageRole[];
    duplicatedIntent: string[][];
    orphanedPages: string[];
    multiRolePages: string[];
  };
}

// ============================================================================
// TASK VALIDATION (Phase 5)
// ============================================================================

export interface TaskValidation {
  taskId: string;
  isValid: boolean;
  violations: TaskViolation[];
}

export interface TaskViolation {
  rule: 
    | 'missing_role'
    | 'missing_support_mapping'
    | 'missing_audience'
    | 'missing_proof'
    | 'missing_cta'
    | 'orphan_links'
    | 'mixed_cta'
    | 'generic_content'
    | 'generic_service'      // NEW: Service Reality Lock violation
    | 'generic_proof'        // NEW: Proof is self-referential, not scenario-based
    | 'foundation_blocked';  // NEW: Task blocked due to low foundation score
  severity: 'error' | 'warning';
  description: string;
}

// ============================================================================
// QUALITY THRESHOLD
// ============================================================================

export const QUALITY_THRESHOLDS = {
  minimum: 50,      // Plan below this won't be returned
  acceptable: 65,   // Plan needs review but can proceed
  good: 80,         // Plan is solid
  excellent: 90,    // Plan is highly personalized
} as const;

// ============================================================================
// ENGINE OPTIONS
// ============================================================================

export interface GrowthPlannerOptions {
  includeDevMode?: boolean;
  maxMonths?: number;
  focusServices?: string[];
  focusLocations?: string[];
  skipPhases?: ('gap_analysis' | 'brief_generation')[];
  qualityThreshold?: number;
  strictMode?: boolean; // If true, fail on any validation errors
  
  // Cadence options
  /** ISO date string or Date for when the plan should start (default: first day of next month) */
  startDate?: string | Date;
  
  // Research integration options
  useResearch?: boolean; // If true, merge research gaps into gap analysis
  researchReportId?: string; // Use a specific research report
  runFreshResearch?: boolean; // Run new research before planning
  openaiApiKey?: string; // For AI-powered research gap analysis
}
