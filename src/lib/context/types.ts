// ============================================================================
// MASTER PROFILE & CONTEXT PACK TYPES
// ============================================================================
// Canonical types for the unified context system.
// These types define what the writer orchestrator receives.
// ============================================================================

// ============================================================================
// SERVICE INFERENCE RESULT
// ============================================================================

export interface ServiceInferenceResult {
  primaryService: string | null;
  allServices: string[];
  confidence: 'high' | 'med' | 'low';
  quarantined: boolean;
  quarantineReason?: string;
}

// ============================================================================
// TRUTH LAYER (Single source of truth for writers)
// ============================================================================

export interface TruthLayer {
  /** Claims that have been verified and can be used freely */
  verifiedClaims: string[];
  /** Claims that are risky/unverified and should not be used */
  restrictedClaims: string[];
  /** Items that need manual confirmation before use */
  unknownsToConfirm: string[];
  /** The verified business entity name */
  primaryEntity: string;
  /** Whether the niche has been locked (prevents cross-niche pollution) */
  nicheLocked: boolean;
  /** The locked niche value */
  lockedNiche?: string;
}

// ============================================================================
// LOCKS (Prevent inference drift)
// ============================================================================

export interface ProfileLocks {
  /** Whether the niche is locked and should not be overridden */
  nicheLocked: boolean;
  /** The locked niche value */
  lockedNiche?: string;
  /** Service inference mode: 'conservative' quarantines low-confidence, 'aggressive' guesses */
  serviceInferenceMode: 'conservative' | 'aggressive';
  /** Whether to trust inferred services or require manual confirmation */
  servicesConfirmed: boolean;
}

// ============================================================================
// PAGE ESSENCE (Key Page Summaries)
// ============================================================================

export interface PageEssence {
  url: string;
  title?: string;
  role: 'money' | 'trust' | 'support' | 'authority' | 'portfolio' | 'operational' | 'unknown';
  oneLiner: string;
  servicesMentioned: string[];
  locationsMentioned: string[];
  ctas: Array<{
    label: string;
    type: 'call' | 'whatsapp' | 'quote' | 'contact' | 'book' | 'other';
    url?: string;
  }>;
  proofMentions: string[];
  toneSignals: string[];
  complianceNotes: string[];
  extractedSignals: {
    phoneNumbers: string[];
    emails: string[];
    whatsappLinks: string[];
    addressSnippets: string[];
  };
}

export interface SiteContentDigest {
  inferredPrimaryService: string | null;  // null if quarantined
  inferredAllServices: string[];
  inferredUSPs: string[];
  inferredCTAs: Array<{ type: string; text: string; url?: string }>;
  inferredContactMethods: string[];
  riskyClaimsFound: string[];
  safeClaimsFound: string[];
  serviceInferenceQuarantined: boolean;
  serviceInferenceReason?: string;
  contradictions: Array<{
    topic: string;
    pages: string[];
    details: string;
  }>;
}

export interface WriterSnapshot {
  oneLiner: string;
  geoPack: {
    primaryLocation: string;
    serviceAreas: string[];
    localPhrasing: string[];
  };
  eeatPack: {
    claimsAllowed: string[];
    claimsRestricted: string[];
  };
  linkTargets: {
    contactUrl: string;
    topMoneyPages: Array<{ url: string; title: string; anchor: string }>;
    quoteUrl?: string;
  };
}

export interface ProfileConfidence {
  services: 'high' | 'med' | 'low';
  roles: 'high' | 'med' | 'low';
  reviews: 'high' | 'med' | 'low';
  linkGraph: 'high' | 'med' | 'low';
}

export interface ProfileCompleteness {
  blocked: boolean;
  blockers: string[];
  actionRequired: string[];
  completenessScore: number;
}

// ============================================================================
// MASTER PROFILE
// ============================================================================

export interface MasterProfile {
  // Versioning
  id: string;
  projectId: string;
  version: number;
  profileHash: string;
  generatedAt: string;

  // Business Identity
  business: {
    name: string;
    niche: string;
    yearsInBusiness?: number;
    locations: string[];
    primaryService: string;
    allServices: string[];
    usps: string[];
    websiteUrl: string;
  };

  // Target Audience
  audience: {
    primary: string;
    secondary?: string[];
    painPoints: string[];
    objections: string[];
    buyingTriggers: string[];
    languagePreferences?: string[];
  };

  // Brand Voice
  brandVoice: {
    toneProfileId: string;
    toneOverrides?: Partial<ToneOverrides>;
    tabooWords: string[];
    complianceNotes: string[];
    mustSay: string[];      // Phrases that MUST appear
    mustNotSay: string[];   // Phrases that MUST NOT appear
  };

  // Proof Atoms (from beads)
  proofAtoms: ProofAtom[];

  // Review Intelligence
  reviews: {
    totalCount: number;
    averageRating: number;
    themes: ReviewTheme[];
    topSnippets: ReviewSnippet[];  // Consented quotes only
    lastUpdated?: string;
  };

  // Site Structure Summary
  siteMap: {
    totalPages: number;
    moneyPages: PageSummary[];
    trustPages: PageSummary[];
    supportPages: PageSummary[];
    authorityPages: PageSummary[];
    portfolioPages: PageSummary[];
    orphanedPages: number;
    internalLinkingHealth: 'poor' | 'fair' | 'good' | 'excellent';
  };

  // Local Signals (optional)
  localSignals?: {
    gbpConnected: boolean;
    napConsistent: boolean;
    serviceAreas: string[];
    businessHours?: string;
    primaryPhone?: string;
    primaryAddress?: string;
  };

  // Page Essence - summaries of key pages
  pageEssence?: {
    home?: PageEssence;
    about?: PageEssence;
    services?: PageEssence;
    contact?: PageEssence;
    moneyPages?: PageEssence[];
    sourceCoverage: {
      pagesSummarised: number;
      pagesAttempted: number;
      missing: string[];
    };
  };

  // Site Content Digest - aggregated insights
  siteContentDigest?: SiteContentDigest;

  // Writer Snapshot - ready-to-use writer context
  writerSnapshot?: WriterSnapshot;

  // Confidence Scoring
  confidence?: ProfileConfidence;

  // Completeness & Blockers
  completeness?: ProfileCompleteness;

  // Truth Layer - single source of verified facts for writers
  truthLayer?: TruthLayer;

  // Locks - prevent inference drift
  locks?: ProfileLocks;
}

export interface ToneOverrides {
  formality: 'formal' | 'neutral' | 'informal';
  confidence: 'confident' | 'neutral' | 'humble';
  humourLevel: 'none' | 'subtle' | 'playful';
  sentenceLengthBias: 'short' | 'mixed' | 'long';
  persuasionLevel: 'low' | 'medium' | 'high';
  ctaStyle: 'soft' | 'direct' | 'urgent';
}

export interface ProofAtom {
  id: string;
  type: 'proof' | 'authority' | 'process' | 'differentiator' | 'offer' | 'local';
  label: string;
  value: string;
  priority: number;
  channels: string[];  // ['wp', 'gmb', 'li']
  claimsPolicy: {
    mustBeVerifiable: boolean;
    allowedParaphrases: string[];
    forbiddenPhrases: string[];
  };
  // Verification fields
  verification?: 'verified' | 'unverified' | 'pending';
  verificationSource?: string;
  safeParaphrase?: string;
}

export interface ReviewTheme {
  theme: string;
  count: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  recommendedUses: string[];
}

export interface ReviewSnippet {
  text: string;
  author?: string;
  rating: number;
  source: string;
  hasConsent: boolean;
}

export interface PageSummary {
  url: string;
  title: string;
  role: 'money' | 'trust' | 'support' | 'authority' | 'portfolio' | 'operational';
  priorityScore: number;
  priorityRank: number;
  internalLinksIn: number;
  internalLinksOut: number;
}

// ============================================================================
// TASK CONTEXT PACK
// ============================================================================

export interface TaskContextPack {
  // Identifiers
  id: string;
  projectId: string;
  taskId: string;
  contextHash: string;
  generatedAt: string;

  // Mode
  mode: 'create' | 'update';

  // Master Profile Reference
  masterProfileId: string;
  masterProfileVersion: number;
  masterProfile: MasterProfile;

  // Task Brief (from planner)
  writerBrief: WriterBrief;

  // Internal Linking Plan
  internalLinking: {
    upLinks: InternalLinkTarget[];    // Links TO money/parent pages
    downLinks: InternalLinkTarget[];  // Links TO child/support pages
    sideLinks: InternalLinkTarget[];  // Related content links
    requiredAnchors: string[];
  };

  // Proof Requirements
  proofRequirements: {
    requiredProofElements: ProofElementType[];
    requiredEEATSignals: EEATSignalType[];
    selectedProofAtoms: ProofAtom[];  // Filtered for this task
  };

  // Vision/Image Context
  visionContext?: {
    packId: string;
    packNarrative: string;
    heroImage?: ImagePlan;
    inlineImages: ImagePlan[];
    crossImageThemes: string[];
  };

  // Rewrite Context (mode = 'update' only)
  rewriteContext?: RewriteContext;
}

export interface WriterBrief {
  slug: string;
  role: 'money' | 'support' | 'trust' | 'authority' | 'operational';
  intent: 'buy' | 'compare' | 'trust' | 'learn';
  primaryService: string;
  location?: string;
  targetAudience: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  estimatedWords: number;
  toneProfileId: string;
  ctaType: string;
  ctaTarget: string;
  // SEO drafts from plan-time refinement (source of truth for SEO fields)
  seoDrafts?: {
    seoTitleDraft: string;
    h1Draft: string;
    metaDescriptionDraft: string;
  };
  // Vision facts from image analysis (must be woven into content)
  visionFacts?: string[];
  // Whether SEO drafts should be enforced (default: true)
  enforceSeoDrafts?: boolean;
}

export interface InternalLinkTarget {
  url: string;
  title: string;
  role: string;
  priorityScore: number;
  anchorSuggestion?: string;
  required: boolean;
  context: string;  // Why this link matters
}

export type ProofElementType =
  | 'review_quote'
  | 'statistic'
  | 'case_study_reference'
  | 'before_after'
  | 'testimonial'
  | 'award_mention'
  | 'certification_badge'
  | 'guarantee';

export type EEATSignalType =
  | 'years_active'
  | 'credentials'
  | 'certifications'
  | 'awards'
  | 'case_studies'
  | 'client_count'
  | 'projects_completed'
  | 'local_presence'
  | 'industry_memberships'
  | 'media_mentions'
  | 'speaking_engagements'
  | 'publications';

export interface ImagePlan {
  imageId: string;
  imageUrl: string;
  placement: 'hero' | 'section' | 'inline';
  sectionHint?: string;  // "After section 2" or "Before FAQ"
  alt: string;
  caption?: string;
  title: string;
  suggestedFilename: string;
  technicalScore: number;
  emotionalScore: number;
}

export interface RewriteContext {
  originalUrl: string;
  originalTitle: string;
  originalH1: string;
  originalMeta?: string;
  originalContent: string;  // Cleaned text, not HTML
  originalWordCount: number;
  
  // From crawl graph
  internalLinksIn: number;
  internalLinksOut: number;
  incomingLinkAnchors: string[];
  
  // Preservation rules
  preserveElements: string[];   // "keep pricing section", "keep legal disclaimer"
  removeElements: string[];     // "remove outdated promo", "remove broken widget"
  
  // Page health context
  currentHealthScore?: number;
  currentIssues: string[];
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

export interface MasterProfileRow {
  id: string;
  project_id: string;
  version: number;
  profile_hash: string;
  profile_json: MasterProfile;
  generated_at: string;
}

export interface TaskContextPackRow {
  id: string;
  project_id: string;
  task_id: string;
  mode: 'create' | 'update';
  original_url: string | null;
  original_content: string | null;
  context_json: TaskContextPack;
  context_hash: string;
  master_profile_id: string;
  generated_at: string;
}

// ============================================================================
// WRITER JOB CONFIG (Updated)
// ============================================================================

export interface WriterJobConfig {
  // Task definition
  task: WriterBrief;
  
  // Context references
  masterProfileId: string;
  masterProfileVersion: number;
  masterProfileSnapshot: MasterProfile;
  
  taskContextPackId: string;
  taskContextPackSnapshot: TaskContextPack;
  
  // Tone configuration
  toneProfileId: string;
  toneOverrides?: Partial<ToneOverrides>;
  
  // Output targets
  targets: {
    wordpress: boolean;
    linkedin: boolean;
    gmb: boolean;
    reddit: boolean;
  };
  
  // Processing options
  options?: {
    skipValidation?: boolean;
    verbose?: boolean;
    maxRetries?: number;
  };
}
