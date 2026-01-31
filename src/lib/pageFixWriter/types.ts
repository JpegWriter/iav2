/**
 * Page Fix Writer Types
 * 
 * This is a SURGICAL rehabilitation engine for existing pages.
 * NOT an article writer - this is an editor that respects existing intent.
 */

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * A fix task from the Fix Planner
 */
export interface FixTask {
  id: string;
  pageId: string;
  url: string;
  role: PageRole;
  priority: 'critical' | 'high' | 'medium' | 'low';
  issues: FixIssue[];
  targetScores: {
    overall: number;
    readability?: number;
    seoStructure?: number;
    keywordOptimization?: number;
    contentDepth?: number;
    eeatSignals?: number;
  };
}

export type PageRole = 'money' | 'trust' | 'support' | 'authority';

export interface FixIssue {
  category: 'readability' | 'seoStructure' | 'keywordOptimization' | 'contentDepth' | 'eeatSignals';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  suggestedAction: string;
}

/**
 * Snapshot of the original page before fixes
 */
export interface PageSnapshot {
  url: string;
  title: string;
  metaDescription: string;
  h1: string;
  headings: { level: number; text: string }[];
  bodyHtml: string;
  bodyText: string;
  wordCount: number;
  images: ImageMetadata[];
  internalLinksIn: string[];
  internalLinksOut: string[];
  capturedAt: string;
}

export interface ImageMetadata {
  src: string;
  alt: string;
  caption?: string;
  filename: string;
  iptc?: {
    title?: string;
    description?: string;
    keywords?: string[];
  };
}

/**
 * Voice profile from onboarding
 */
export interface VoiceProfile {
  id: string;
  name: string;
  formality: 'formal' | 'neutral' | 'informal';
  confidence: 'confident' | 'neutral' | 'humble';
  humourLevel: 'none' | 'subtle' | 'playful';
  sentenceLengthBias: 'short' | 'mixed' | 'long';
  tabooWords: string[];
  persuasionLevel: 'low' | 'medium' | 'high';
  ctaStyle: 'soft' | 'direct' | 'urgent';
}

/**
 * Guardrails that the fix writer must respect
 */
export interface FixGuardrails {
  prohibitedPhrases: string[];
  requireVerifiableClaims: boolean;
  allowOutboundLinks: boolean;
  maxKeywordDensity: number; // e.g., 0.02 = 2%
  preserveImagePositions: boolean;
  preserveExistingLinks: boolean;
}

/**
 * Complete request to the Page Fix Writer
 */
export interface PageFixRequest {
  projectId: string;
  pageId: string;
  url: string;
  pageRole: PageRole;
  
  // The content to fix
  originalSnapshot: PageSnapshot;
  
  // What needs fixing
  fixBrief: {
    currentScore: number;
    targetScore: number;
    priority: 'critical' | 'high' | 'medium' | 'low';
    issues: FixIssue[];
    successCriteria: string[];
  };
  
  // Optional focus keyword (never stuff!)
  focusKeyword?: string;
  
  // Voice and guardrails
  voiceProfile: VoiceProfile;
  guardrails: FixGuardrails;
  
  // Additional context
  businessContext?: {
    businessName: string;
    location?: string;
    yearsInBusiness?: number;
    credentials?: string[];
    specialties?: string[];
  };
  
  // Available internal link targets
  internalLinkOpportunities?: {
    url: string;
    title: string;
    role: PageRole;
    relevance: number;
  }[];
  
  // Growth planner context (what this page supports)
  growthContext?: {
    supportingPages: string[];
    parentTopics: string[];
  };
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/**
 * Structured output from the Page Fix Writer
 * This shape allows diffing, version control, and selective application
 */
export interface PageFixOutput {
  // SEO elements
  title: string;
  metaDescription: string;
  canonical?: string;
  
  // Primary heading
  h1: string;
  
  // Content sections (structured for selective toggles)
  sections: PageFixSection[];
  
  // Internal linking suggestions
  internalLinks: InternalLinkSuggestion[];
  
  // Image improvements
  imageInstructions: ImageInstruction[];
  
  // Author/trust block
  authorBlock?: {
    html: string;
  };
  
  // Transparency notes
  notes: {
    whatChanged: string[];
    whyItMatters: string[];
    claimsToVerify: string[];
  };
  
  // Metadata
  generatedAt: string;
  modelUsed: string;
  tokensUsed: {
    input: number;
    output: number;
  };
}

export type SectionType = 
  | 'intro'
  | 'context'
  | 'experience'
  | 'process_or_benefits'
  | 'faq'
  | 'testimonial'
  | 'cta'
  | 'custom';

export interface PageFixSection {
  type: SectionType;
  heading?: string;
  html: string;
  isNew: boolean; // true if this section didn't exist before
  replacesOriginal?: string; // hash of original section if replacing
}

export interface InternalLinkSuggestion {
  anchor: string;
  targetUrl: string;
  reason: string;
  insertAfterSection?: SectionType;
}

export interface ImageInstruction {
  imageIdOrFilename: string;
  alt: string;
  caption?: string;
  iptc?: {
    title: string;
    description: string;
    keywords: string[];
  };
}

// ============================================================================
// DIFF TYPES
// ============================================================================

/**
 * Diff between original and proposed content
 */
export interface PageFixDiff {
  versionId: string;
  pageId: string;
  url: string;
  
  // High-level changes
  summary: {
    sectionsAdded: number;
    sectionsModified: number;
    sectionsRemoved: number;
    wordsAdded: number;
    wordsRemoved: number;
  };
  
  // Field-level diffs
  fields: {
    title: FieldDiff;
    metaDescription: FieldDiff;
    h1: FieldDiff;
  };
  
  // Section-level diffs
  sectionDiffs: SectionDiff[];
  
  // What changed explanations (user-friendly)
  explanations: {
    category: string;
    before: string;
    after: string;
    reason: string;
  }[];
  
  // Validation warnings
  warnings: ValidationWarning[];
  
  createdAt: string;
}

export interface FieldDiff {
  before: string;
  after: string;
  changed: boolean;
}

export interface SectionDiff {
  type: SectionType;
  operation: 'added' | 'modified' | 'removed' | 'unchanged';
  beforeHtml?: string;
  afterHtml?: string;
  changeDescription?: string;
}

export interface ValidationWarning {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  suggestion?: string;
}

// ============================================================================
// VERSION TYPES
// ============================================================================

export type FixVersionStatus = 'draft' | 'published' | 'reverted';

export interface PageFixVersion {
  id: string;
  pageId: string;
  projectId: string;
  url: string;
  
  status: FixVersionStatus;
  version: number;
  
  originalSnapshot: PageSnapshot;
  proposedOutput: PageFixOutput;
  diffSummary: PageFixDiff;
  
  // Toggle selections (which categories were applied)
  appliedCategories: {
    titleMeta: boolean;
    headings: boolean;
    contentDepth: boolean;
    eeat: boolean;
    internalLinks: boolean;
  };
  
  // Audit trail
  createdAt: string;
  createdBy: string;
  publishedAt?: string;
  revertedAt?: string;
  rollbackOfVersionId?: string;
  
  // Link to task_outputs for WP integration
  taskOutputId?: string;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface PreviewRequest {
  projectId: string;
  pageId: string;
  taskId?: string; // Optional: link to fix planner task
}

export interface PreviewResponse {
  success: boolean;
  versionId: string;
  original: PageSnapshot;
  proposed: PageFixOutput;
  diff: PageFixDiff;
  warnings: ValidationWarning[];
}

export interface PublishRequest {
  versionId: string;
  appliedCategories?: {
    titleMeta: boolean;
    headings: boolean;
    contentDepth: boolean;
    eeat: boolean;
    internalLinks: boolean;
  };
}

export interface PublishResponse {
  success: boolean;
  versionId: string;
  taskOutputId: string; // Links to task_outputs for WP publish
  publishedAt: string;
  summary: {
    fieldsUpdated: string[];
    sectionsModified: number;
  };
}

export interface RevertRequest {
  versionId: string;
}

export interface RevertResponse {
  success: boolean;
  versionId: string;
  revertedToVersion: number;
  revertedAt: string;
}
