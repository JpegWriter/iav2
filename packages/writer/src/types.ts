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
}

export interface WriterTask {
  slug: string;
  role: PageRole;
  primaryService: string;
  location?: string;
  intent: PageIntent;
  /** Required for support pages - which money page this supports */
  supportsPage?: string;
  supportType?: SupportType;
  targetAudience: string;
  /** Proof elements to include */
  requiredProofElements: ProofElementType[];
  /** EEAT signals to incorporate */
  requiredEEATSignals: EEATSignalType[];
  internalLinks: InternalLinkRequirements;
  mediaRequirements: MediaRequirements;
  wordpress: WordPressConstraints;
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
