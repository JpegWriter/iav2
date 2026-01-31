// ============================================================================
// ULTIMATE WRITER - CANONICAL TYPES
// ============================================================================
// Niche-agnostic data models for the Writer pipeline.
// These types define the complete input/output contract.
// ============================================================================

// ============================================================================
// ENUMS & LITERALS
// ============================================================================

export type PageRole = 'money' | 'support' | 'trust' | 'authority' | 'operational';
export type PageIntent = 'buy' | 'compare' | 'trust' | 'learn';
export type SupportType = 'faq' | 'how-to' | 'glossary' | 'resource' | 'tool';
export type ImageUse = 'hero' | 'section' | 'inline' | 'gallery';
export type PublishStatus = 'draft' | 'publish' | 'pending' | 'private';

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

export type ProofElementType =
  | 'review_quote'
  | 'statistic'
  | 'case_study_reference'
  | 'before_after'
  | 'testimonial'
  | 'award_mention'
  | 'certification_badge'
  | 'guarantee';

// ============================================================================
// TASK DEFINITION (FROM GROWTH PLANNER)
// ============================================================================

export interface InternalLinkRequirements {
  /** Links to parent/money pages (mandatory for support pages) */
  upLinks: Array<{
    targetUrl: string;
    targetTitle: string;
    anchorSuggestion?: string;
    required: boolean;
  }>;
  /** Links to child/related support pages */
  downLinks: Array<{
    targetUrl: string;
    targetTitle: string;
    anchorSuggestion?: string;
  }>;
  /** Specific anchor texts that must appear */
  requiredAnchors: string[];
}

export interface MediaRequirements {
  heroRequired: boolean;
  inlineImagesMin: number;
  inlineImagesMax: number;
  videoAllowed?: boolean;
  infographicSuggested?: boolean;
}

export interface WordPressConstraints {
  /** Maximum number of blocks allowed */
  maxBlocks: number;
  /** Maximum HTML bytes for the entire content */
  maxHtmlBytes: number;
  /** Excerpt length in characters */
  excerptLength: number;
  /** Target reading time in minutes */
  readingTimeTarget: number;
  /** Maximum H2 headings */
  maxH2Count?: number;
  /** Maximum table rows before splitting */
  maxTableRows?: number;
  /** Image block handling policy */
  imagePolicy?: ImagePolicy;
}

export interface ImagePolicy {
  /** Whether image blocks are allowed */
  allowImageBlocks: boolean;
  /** Require valid URL or PLACEHOLDER: prefix */
  requireValidImageUrlOrPlaceholder: boolean;
  /** Prefix for placeholder images */
  placeholderPrefix: string;
}

// ============================================================================
// UPGRADE RULES (FOR AUTHORITY CONTENT UPGRADE)
// ============================================================================

export interface UpgradeRules {
  preserveTopic: boolean;
  preserveInternalLinksExactly: boolean;
  allowAddInternalLinksIfSitemapProvided: boolean;
  maxAdditionalInternalLinks: number;
  
  mustInclude: {
    decisionChecklist: boolean;
    comparisonTable: boolean;
    aeoQASection: {
      enabled: boolean;
      titlePattern: string;
      minQuestions: number;
      maxQuestions: number;
    };
  };
  
  style: {
    tone: 'calm_experienced_professional' | 'friendly_expert' | 'authoritative_formal';
    noHypeClaims: boolean;
    maxParagraphWords: number;
    scannableFormatting: boolean;
  };
  
  seoFields: {
    enforceFocusKeywordInFirst150Words: boolean;
    enforceFocusKeywordInMetaDescription: boolean;
    titleTagShouldInclude: string[];
  };
  
  sitemapBoundaries: {
    respectPageRole: boolean;
    avoidTopicBleed: boolean;
    avoidCannibalisingAdjacentPages: boolean;
  };
  
  vision: {
    useAsFirstPartyEvidenceWhenProvided: boolean;
    forbidSpeculationBeyondObservations: boolean;
    visionDoesNotRequireImageBlock: boolean;
  };
}

// ============================================================================
// PROMPT PROFILE (CONFIGURABLE PROMPT SELECTION)
// ============================================================================

export interface PromptProfile {
  systemPromptId: 'MASTER_AUTHORITY_WRITER_PROMPT_V1' | 'UNIVERSAL_UPGRADE_PROMPT_V1' | 'EXPAND_PASS_V1';
  expandPassPromptId: string;
  temperature: number;
}

// ============================================================================
// INPUT CONTRACT (EXPECTED INPUTS/OUTPUTS)
// ============================================================================

export interface InputContract {
  expects: string[];
  outputFormat: 'WordPressOutputJSON' | 'MarkdownText';
}

export interface WriterTask {
  slug: string;
  role: PageRole;
  primaryService: string;
  location?: string;
  intent: PageIntent;
  /** Intent mode for content generation - determines content focus */
  intentMode?: 'MONEY' | 'SERVICE' | 'INFORMATIONAL' | 'TRUST';
  /** Required for support pages - which money page this supports */
  supportsPage?: string;
  supportType?: SupportType;
  targetAudience: string;
  
  // =========================================================================
  // WORD COUNT TARGETS
  // =========================================================================
  
  /** Target word count range for the article */
  targetWords?: {
    min: number; // Default: 1500
    max: number; // Default: 1800
  };
  /** Backwards compat: Target word count for the article (default: 1500) */
  targetWordCount?: number;
  /** FAQ answer word count range */
  faqAnswerWords?: {
    min: number; // Default: 80
    max: number; // Default: 120
  };
  /** Target reading time in minutes (default: 7) */
  readingTimeTarget?: number;
  
  // =========================================================================
  // EEAT & VISION GATES
  // =========================================================================
  
  /** Minimum EEAT score required (0-100, default: 70) */
  minEEATScore?: number;
  /** Whether vision analysis usage is required (error if not used) */
  requiresVisionUsage?: boolean;
  /** Whether vision analysis was provided */
  visionProvided?: boolean;
  /** Whether geographic context was provided */
  geoProvided?: boolean;
  /** Vision analysis data if images were analyzed */
  visionAnalysis?: VisionAnalysisContext;
  /** Extracted vision facts to incorporate into content */
  visionFacts?: string[];
  
  // =========================================================================
  // SEO DRAFTS (From plan-time refinement - source of truth)
  // =========================================================================
  
  /** Plan-time SEO drafts that writer MUST use */
  seoDrafts?: {
    /** Refined SEO title tag - writer MUST use this exactly */
    seoTitleDraft: string;
    /** Refined H1 headline - writer MUST use this exactly */
    h1Draft: string;
    /** Refined meta description - writer MUST use this exactly */
    metaDescriptionDraft: string;
  };
  /** Whether SEO drafts enforcement is enabled */
  enforceSeoDrafts?: boolean;
  
  // =========================================================================
  // CONTENT REQUIREMENTS
  // =========================================================================
  
  /** Proof elements to include */
  requiredProofElements: ProofElementType[];
  /** EEAT signals to incorporate */
  requiredEEATSignals: EEATSignalType[];
  internalLinks: InternalLinkRequirements;
  mediaRequirements: MediaRequirements;
  wordpress: WordPressConstraints;
  
  // =========================================================================
  // UPGRADE RULES (OPTIONAL - FOR AUTHORITY UPGRADE TASKS)
  // =========================================================================
  
  /** Rules for upgrading/improving content */
  upgradeRules?: UpgradeRules;
  
  /** Prompt configuration for this task */
  promptProfile?: PromptProfile;
  
  /** Expected inputs and output format */
  inputContract?: InputContract;
}

// ============================================================================
// VISION ANALYSIS CONTEXT (FOR EEAT)
// ============================================================================

export interface VisionAnalysisContext {
  /** Summary of all visual observations */
  summary?: string;
  /** Common visual themes identified */
  themes?: string[];
  /** Key observations from image analysis */
  observations?: string[];
  /** Quality indicators observed */
  qualityIndicators?: Record<string, string | number>;
  /** Repeated patterns across images */
  patterns?: string[];
  /** Environmental/situational context */
  environmentContext?: string;
  /** Workflow or process indicators */
  workflowIndicators?: string;
  /** Individual image analyses */
  images?: Array<{
    url?: string;
    description?: string;
    analysis?: string;
  }>;
}

// ============================================================================
// USER CONTEXT (FROM ONBOARDING)
// ============================================================================

export interface BrandBead {
  id: string;
  type: 'proof' | 'authority' | 'process' | 'differentiator' | 'offer' | 'local';
  label: string;
  value: string;
  priority: number;
}

export interface BrandToneProfile {
  id: string;
  name: string;
  voice: {
    formality: 'formal' | 'neutral' | 'informal';
    confidence: 'confident' | 'neutral' | 'humble';
    humourLevel: 'none' | 'subtle' | 'playful';
    sentenceLengthBias: 'short' | 'mixed' | 'long';
  };
  tabooWords: string[];
  persuasionLevel: 'low' | 'medium' | 'high';
  ctaStyle: 'soft' | 'direct' | 'urgent';
  readingLevel: 'simple' | 'standard' | 'advanced';
}

export interface UserContext {
  businessName: string;
  website: string;
  locales: string[];
  serviceAreas: string[];
  services: string[];
  products: string[];
  uspDifferentiators: string[];
  beads: BrandBead[];
  brandToneProfile: BrandToneProfile;
  complianceNotes: string[];
}

// ============================================================================
// SITE CONTEXT
// ============================================================================

export interface PageGraphNode {
  url: string;
  title: string;
  role: PageRole;
  priorityScore: number;
}

export interface RewriteContext {
  originalUrl: string;
  originalHtml?: string;
  extractedHeadings: string[];
  extractedFAQs: Array<{ question: string; answer: string }>;
  extractedKeyPoints: string[];
  preserveElements: string[];
  removeElements: string[];
}

export interface SiteContext {
  /** Summary of sitemap structure */
  sitemapSummary: {
    totalPages: number;
    moneyPages: number;
    supportPages: number;
    authorityPages: number;
  };
  /** Top money pages for internal linking */
  pageGraph: PageGraphNode[];
  /** Rewrite context if updating existing page */
  rewrite?: RewriteContext;
}

// ============================================================================
// PROOF CONTEXT
// ============================================================================

export interface ReviewEntry {
  source: 'google' | 'yelp' | 'trustpilot' | 'facebook' | 'website' | 'other';
  rating: number;
  text: string;
  date: string;
  author?: string;
  themes?: string[];
}

export interface ProofAssets {
  caseStudies: Array<{
    title: string;
    summary: string;
    outcome: string;
    metrics?: string[];
  }>;
  awards: Array<{
    name: string;
    year: string;
    issuer: string;
  }>;
  certifications: Array<{
    name: string;
    issuer: string;
    validUntil?: string;
  }>;
  guarantees: string[];
}

export interface ProofContext {
  reviews: ReviewEntry[];
  reviewThemes: Array<{
    theme: string;
    count: number;
    snippets: string[];
  }>;
  proofAssets: ProofAssets;
}

// ============================================================================
// VISION CONTEXT (IMAGE INTELLIGENCE)
// ============================================================================

export interface VisionAnalysis {
  subjects: string[];
  expressions: Array<{
    type: 'smile' | 'neutral' | 'focused' | 'happy' | 'serious' | 'frown';
    confidence: number;
  }>;
  scene: string;
  technicalScore: number;
  emotionalImpact: 'high' | 'medium' | 'low';
  colorDominant?: string;
  composition?: 'excellent' | 'good' | 'acceptable' | 'poor';
}

export interface SelectedImage {
  imageId: string;
  filePath?: string;
  url?: string;
  vision: VisionAnalysis;
  tags: string[];
  suggestedAlt: string;
  suggestedCaption: string;
  intendedUse: ImageUse;
}

export interface VisionContext {
  selectedImages: SelectedImage[];
  heroCandidate?: string; // imageId of best hero candidate
}

// ============================================================================
// PUBLISHING TARGETS
// ============================================================================

export interface WordPressTarget {
  siteId: string;
  category?: string;
  tags?: string[];
  author?: string;
  status: PublishStatus;
  canonicalUrl?: string;
}

export interface LinkedInTarget {
  enabled: boolean;
  companyPageId?: string;
  toneOverride?: Partial<BrandToneProfile>;
}

export interface GMBTarget {
  enabled: boolean;
  locationId?: string;
  toneOverride?: Partial<BrandToneProfile>;
}

export interface RedditTarget {
  enabled: boolean;
  subredditTargets: string[];
  toneOverride?: Partial<BrandToneProfile>;
  rulesSummary?: string;
}

export interface PublishingTargets {
  wordpress: WordPressTarget;
  linkedin: LinkedInTarget;
  gmb: GMBTarget;
  reddit: RedditTarget;
}

// ============================================================================
// WRITING JOB (CANONICAL INPUT)
// ============================================================================

export interface WritingJob {
  jobId: string;
  userId: string;
  projectId: string;
  task: WriterTask;
  userContext: UserContext;
  siteContext: SiteContext;
  proofContext: ProofContext;
  visionContext: VisionContext;
  publishingTargets: PublishingTargets;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// WORDPRESS BLOCK OUTPUT
// ============================================================================

export type WPBlockType =
  | 'core/heading'
  | 'core/paragraph'
  | 'core/list'
  | 'core/quote'
  | 'core/table'
  | 'core/image'
  | 'core/separator'
  | 'core/buttons'
  | 'core/button'
  | 'core/group'
  | 'core/columns'
  | 'core/column'
  | 'core/html'
  | 'core/freeform';

export interface WPBlock {
  blockName: WPBlockType;
  attrs: Record<string, unknown>;
  innerBlocks?: WPBlock[];
  innerHTML: string;
  innerContent: string[];
  /** Stable anchor for idempotent updates */
  anchor?: string;
}

export interface ImagePlacement {
  imageId: string;
  alt: string;
  caption: string;
  filename: string;
  placement: 'hero' | 'after-intro' | 'section-break' | 'inline';
  sectionIndex?: number;
  url?: string;
  width?: number;
  height?: number;
}

export interface SEOPackage {
  seoTitle: string;
  metaDescription: string;
  focusKeyphrase: string;
  schemaJsonLd?: Record<string, unknown>;
  ogTitle?: string;
  ogDescription?: string;
}

export interface WordPressOutput {
  title: string;
  slug: string;
  excerpt: string;
  blocks: WPBlock[];
  seo: SEOPackage;
  images: {
    hero?: ImagePlacement;
    inline: ImagePlacement[];
  };
  internalLinksUsed: Array<{
    url: string;
    anchor: string;
    sectionIndex: number;
  }>;
  /** Deterministic hash for change detection */
  contentHash: string;
}

// ============================================================================
// SOCIAL OUTPUT
// ============================================================================

export interface LinkedInPost {
  text: string;
  hashtags: string[];
  suggestedImageId?: string;
  hookInsight: string;
  cta: string;
}

export interface GMBPost {
  text: string;
  cta: string;
  hashtags?: string[];
  suggestedImageId?: string;
  callToActionUrl?: string;
}

export interface RedditPost {
  title: string;
  body: string;
  subredditSuggestions: string[];
  disclosureLine: string;
  flairSuggestion?: string;
}

export interface SocialOutput {
  linkedinPost: LinkedInPost;
  gmbPost: GMBPost;
  redditPost: RedditPost;
}

// ============================================================================
// AUDIT OUTPUT
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationWarning {
  code: string;
  message: string;
  severity: ValidationSeverity;
  field?: string;
  suggestion?: string;
}

export interface AuditOutput {
  contextUsed: {
    businessContext: boolean;
    localSignals: boolean;
    reviews: boolean;
    proofAssets: boolean;
    rewriteContext: boolean;
    visionContext: boolean;
  };
  eeatSignalsUsed: EEATSignalType[];
  reviewThemesUsed: string[];
  proofElementsUsed: ProofElementType[];
  tokenCostEstimate: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
  safetyNotes: string[];
  validationWarnings: ValidationWarning[];
  wordCount: number;
  readingTimeMinutes: number;
  blockCount: number;
  htmlBytes: number;
  /** Pass/Fail checklist for quality gates */
  checklist?: Array<{
    item: string;
    pass: boolean;
    detail: string;
  }>;
}

// ============================================================================
// WRITING OUTPUT (CANONICAL OUTPUT)
// ============================================================================

export interface WritingOutput {
  jobId: string;
  wordpress: WordPressOutput;
  social: SocialOutput;
  audit: AuditOutput;
  generatedAt: string;
  version: number;
}

// ============================================================================
// WRITER PLAN (INTERMEDIATE)
// ============================================================================

export interface SectionPlan {
  id: string;
  heading: string;
  level: 1 | 2 | 3;
  intent: string;
  objectionAddressed?: string;
  proofToInclude?: string;
  imageSlot?: {
    required: boolean;
    description: string;
    suggestedImageId?: string;
  };
  internalLinkSlot?: {
    targetUrl: string;
    anchorText: string;
  };
  estimatedWordCount: number;
}

export interface WriterPlan {
  h1: string;
  sections: SectionPlan[];
  ctaPlacement: 'after-intro' | 'mid-content' | 'end' | 'multiple';
  heroImageId?: string;
  totalEstimatedWords: number;
  keyphraseOccurrences: number;
}

// ============================================================================
// CONTEXT PACK (RANKED, DEDUPED SUMMARIES)
// ============================================================================

export interface ContextPack {
  businessReality: {
    name: string;
    services: string[];
    differentiators: string[];
    beadsSummary: string;
    targetAudience: string;
  };
  localSignals: {
    locations: string[];
    serviceAreas: string[];
    localPhrasing: string[];
  };
  proofSummary: {
    reviewThemes: string[];
    topQuotes: string[];
    caseStudyBullets: string[];
    credentialsList: string[];
  };
  rewriteSummary?: {
    keepHeadings: string[];
    keepFAQs: Array<{ question: string; answer: string }>;
    keyPointsToPreserve: string[];
    elementsToRemove: string[];
  };
  visionSummary: {
    heroCandidate?: SelectedImage;
    inlineCandidates: SelectedImage[];
    emotionalCues: string[];
  };
  // ========================================
  // RESEARCH INTELLIGENCE (AEO + GEO)
  // ========================================
  researchSummary?: {
    /** AEO: People Also Ask questions from SERP */
    paaQuestions: string[];
    /** AEO: Grouped questions by type (how, cost, best, etc.) */
    questionClusters: Array<{
      type: string;
      questions: string[];
    }>;
    /** AEO: Lead sentences for featured snippet targeting */
    snippetHooks: Array<{
      hook: string;
      wordCount: number;
    }>;
    /** AEO: Authoritative domains to cite */
    citationTargets: string[];
    /** AEO: Common myths to address */
    misconceptions: Array<{
      myth: string;
      truth: string;
    }>;
    /** GEO: Location context summary */
    locationSummary: string;
    /** GEO: Nearby areas for local SEO */
    nearbyAreas: string[];
    /** GEO: Proximity anchors (landmarks, stations) */
    proximityAnchors: Array<{
      name: string;
      distance: string;
    }>;
    /** GEO: Local language patterns */
    localPhrases: string[];
    /** GEO: Local decision factors */
    decisionFactors: Array<{
      factor: string;
      tip: string;
    }>;
    /** Quality scores */
    quality: {
      aeoScore: number;
      geoScore: number;
      overallScore: number;
    };
  };
}

// ============================================================================
// UNIFIED CONTEXT PACK (NEW FORMAT - from @/lib/context)
// ============================================================================
// This is the new format that includes master profile + task-specific context

export interface UnifiedContextPack {
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
  masterProfile: UnifiedMasterProfile;

  // Task Brief
  writerBrief: UnifiedWriterBrief;

  // Internal Linking Plan
  internalLinking: {
    upLinks: UnifiedInternalLinkTarget[];
    downLinks: UnifiedInternalLinkTarget[];
    sideLinks: UnifiedInternalLinkTarget[];
    requiredAnchors: string[];
  };

  // Proof Requirements
  proofRequirements: {
    requiredProofElements: string[];
    requiredEEATSignals: string[];
    selectedProofAtoms: UnifiedProofAtom[];
  };

  // Vision/Image Context
  visionContext?: {
    packId: string;
    packNarrative: string;
    heroImage?: UnifiedImagePlan;
    inlineImages: UnifiedImagePlan[];
    crossImageThemes: string[];
  };

  // Rewrite Context (mode = 'update' only)
  rewriteContext?: UnifiedRewriteContext;
}

export interface UnifiedMasterProfile {
  id: string;
  projectId: string;
  version: number;
  profileHash: string;
  generatedAt: string;

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

  audience: {
    primary: string;
    secondary?: string[];
    painPoints: string[];
    objections: string[];
    buyingTriggers: string[];
  };

  brandVoice: {
    toneProfileId: string;
    toneOverrides?: Partial<BrandToneProfile>;
    tabooWords: string[];
    complianceNotes: string[];
    mustSay: string[];
    mustNotSay: string[];
  };

  proofAtoms: UnifiedProofAtom[];

  reviews: {
    totalCount: number;
    averageRating: number;
    themes: Array<{
      theme: string;
      count: number;
      sentiment: 'positive' | 'neutral' | 'negative';
      recommendedUses: string[];
    }>;
    topSnippets: Array<{
      text: string;
      author?: string;
      rating: number;
      source: string;
      hasConsent: boolean;
    }>;
  };

  siteMap: {
    totalPages: number;
    moneyPages: UnifiedPageSummary[];
    trustPages: UnifiedPageSummary[];
    supportPages: UnifiedPageSummary[];
    authorityPages: UnifiedPageSummary[];
    orphanedPages: number;
    internalLinkingHealth: 'poor' | 'fair' | 'good' | 'excellent';
  };

  localSignals?: {
    gbpConnected: boolean;
    napConsistent: boolean;
    serviceAreas: string[];
    businessHours?: string;
    primaryPhone?: string;
    primaryAddress?: string;
  };
}

export interface UnifiedProofAtom {
  id: string;
  type: 'proof' | 'authority' | 'process' | 'differentiator' | 'offer' | 'local';
  label: string;
  value: string;
  priority: number;
  channels: string[];
  claimsPolicy: {
    mustBeVerifiable: boolean;
    allowedParaphrases: string[];
    forbiddenPhrases: string[];
  };
}

export interface UnifiedPageSummary {
  url: string;
  title: string;
  role: string;
  priorityScore: number;
  priorityRank: number;
  internalLinksIn: number;
  internalLinksOut: number;
}

export interface UnifiedWriterBrief {
  slug: string;
  role: PageRole;
  intent: PageIntent;
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

export interface UnifiedInternalLinkTarget {
  url: string;
  title: string;
  role: string;
  priorityScore: number;
  anchorSuggestion?: string;
  required: boolean;
  context: string;
}

export interface UnifiedImagePlan {
  imageId: string;
  imageUrl: string;
  placement: 'hero' | 'section' | 'inline';
  sectionHint?: string;
  alt: string;
  caption?: string;
  title: string;
  suggestedFilename: string;
  technicalScore: number;
  emotionalScore: number;
}

export interface UnifiedRewriteContext {
  originalUrl: string;
  originalTitle: string;
  originalH1: string;
  originalMeta?: string;
  originalContent: string;
  originalWordCount: number;
  internalLinksIn: number;
  internalLinksOut: number;
  incomingLinkAnchors: string[];
  preserveElements: string[];
  removeElements: string[];
  currentHealthScore?: number;
  currentIssues: string[];
}

// ============================================================================
// UNIFIED WRITER JOB CONFIG (NEW FORMAT)
// ============================================================================

export interface UnifiedWriterJobConfig {
  task: UnifiedWriterBrief;
  masterProfileId: string;
  masterProfileVersion: number;
  masterProfileSnapshot: UnifiedMasterProfile;
  taskContextPackId: string;
  taskContextPackSnapshot: UnifiedContextPack;
  toneProfileId: string;
  toneOverrides?: Partial<BrandToneProfile>;
  targets: {
    wordpress: boolean;
    linkedin: boolean;
    gmb: boolean;
    reddit: boolean;
  };
  options?: {
    skipValidation?: boolean;
    verbose?: boolean;
    maxRetries?: number;
  };
}

// ============================================================================
// ORCHESTRATOR STATUS
// ============================================================================

export type JobStatus =
  | 'pending'
  | 'validating'
  | 'building_context'
  | 'planning'
  | 'generating'
  | 'validating_output'
  | 'completed'
  | 'failed';

export interface JobRun {
  runId: string;
  jobId: string;
  status: JobStatus;
  contextPack?: ContextPack;
  writerPlan?: WriterPlan;
  output?: WritingOutput;
  error?: string;
  startedAt: string;
  completedAt?: string;
}
