// ============================================================================
// CORE TYPES - SiteFix Planner
// ============================================================================

// ============================================================================
// ENUMS
// ============================================================================

export type PageRole = 'money' | 'trust' | 'authority' | 'support' | 'operational' | 'unknown';

export type BeadType = 
  | 'proof' 
  | 'authority' 
  | 'process' 
  | 'differentiator' 
  | 'offer' 
  | 'local';

export type Channel = 'wp' | 'gmb' | 'li';

export type ProjectGoal = 'leads' | 'ecommerce' | 'bookings' | 'local';

export type BrandTone = 
  | 'friendly' 
  | 'premium' 
  | 'blunt' 
  | 'playful' 
  | 'formal' 
  | 'confident' 
  | 'human' 
  | 'clear';

export type TaskType = 'fix' | 'growth';

export type TaskStatus = 
  | 'queued' 
  | 'assigned' 
  | 'draft_ready' 
  | 'review_ready' 
  | 'publish_ready' 
  | 'published';

export type CrawlStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed';

export type AuditSeverity = 'critical' | 'warning' | 'info';

export type AuditCategory = 
  | 'seo' 
  | 'content' 
  | 'conversion' 
  | 'technical' 
  | 'aeo' 
  | 'trust';

// ============================================================================
// PROJECT & SETTINGS
// ============================================================================

export interface ProjectSettings {
  respectRobotsTxt: boolean;
  includeSubdomains: boolean;
  languages: string[];
  primaryGoal: ProjectGoal;
  maxPages: number;
  maxDepth: number;
}

export interface Project {
  id: string;
  userId: string;
  rootUrl: string;
  name: string;
  settings: ProjectSettings;
  status: 'onboarding' | 'crawling' | 'auditing' | 'ready' | 'planning';
  foundationScore: number;
  growthPlannerUnlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// USER CONTEXT (Deep Profile)
// ============================================================================

export interface BusinessContext {
  name: string;
  website: string;
  niche: string;
  primaryGoal: ProjectGoal;
  primaryCTA: string;
  locations: string[];
  serviceAreaKm: number;
  languages: string[];
}

export interface OffersContext {
  coreServices: string[];
  pricePositioning: 'budget' | 'mid' | 'premium';
  startingFrom: string;
  packages: Array<{
    name: string;
    price: string;
    includes: string[];
  }>;
  guarantees: string[];
  differentiators: string[];
}

export interface AudienceContext {
  segments: string[];
  topPainPoints: string[];
  topObjections: string[];
}

export interface BrandVoice {
  tone: BrandTone[];
  styleRules: string[];
  avoid: string[];
}

export interface ComplianceContext {
  doNotSay: string[];
  legalNotes: string[];
}

export interface UserContext {
  id: string;
  projectId: string;
  business: BusinessContext;
  offers: OffersContext;
  audience: AudienceContext;
  brandVoice: BrandVoice;
  assets: {
    logo: string | null;
    imageLibrary: string[];
  };
  compliance: ComplianceContext;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// BEADS (Truth Atoms)
// ============================================================================

export interface BeadClaimsPolicy {
  mustBeVerifiable: boolean;
  allowedParaphrases: string[];
  forbiddenPhrases: string[];
}

export interface BeadLocalSignals {
  locations: string[];
  serviceAreaKm: number;
  landmarks: string[];
}

export interface BeadSource {
  kind: 'manual' | 'gbp_reviews' | 'website' | 'csv_import';
  ref: string | null;
  lastVerifiedAt: string;
}

export interface Bead {
  id: string;
  projectId: string;
  type: BeadType;
  label: string;
  value: string;
  priority: number;
  channels: Channel[];
  whereToUse: string[];
  tone: BrandTone[];
  claimsPolicy: BeadClaimsPolicy;
  localSignals: BeadLocalSignals | null;
  source: BeadSource;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// REVIEWS & THEMES
// ============================================================================

export interface ReviewConsent {
  allowedToRepublish: boolean;
  notes: string;
}

export interface Review {
  id: string;
  projectId: string;
  source: 'gbp' | 'website' | 'csv' | 'manual';
  rating: number;
  author: string;
  date: string;
  text: string;
  url: string | null;
  consent: ReviewConsent;
  createdAt: string;
}

export interface ReviewTheme {
  id: string;
  projectId: string;
  theme: string;
  count: number;
  supportingSnippets: string[];
  recommendedUses: string[];
  createdAt: string;
}

// ============================================================================
// CRAWL
// ============================================================================

export interface CrawlRun {
  id: string;
  projectId: string;
  status: CrawlStatus;
  startedAt: string;
  endedAt: string | null;
  pagesFound: number;
  pagesCrawled: number;
  errors: string[];
  limits: {
    maxPages: number;
    maxDepth: number;
  };
}

// ============================================================================
// PAGES
// ============================================================================

export interface Page {
  id: string;
  projectId: string;
  url: string;
  path: string;
  statusCode: number;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  canonical: string | null;
  lang: string | null;
  wordCount: number;
  textHash: string;
  cleanedText: string;
  role: PageRole;
  priorityScore: number;
  priorityRank: number;
  healthScore: number;
  internalLinksIn: number;
  internalLinksOut: number;
  isOrphan: boolean;
  crawledAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageLink {
  id: string;
  projectId: string;
  fromUrl: string;
  toUrl: string;
  anchorText: string;
  isNav: boolean;
  isFooter: boolean;
  createdAt: string;
}

// ============================================================================
// AUDITS & FIX ITEMS
// ============================================================================

export interface AuditCheck {
  id: string;
  category: AuditCategory;
  name: string;
  passed: boolean;
  severity: AuditSeverity;
  message: string;
  details: Record<string, unknown>;
}

export interface Audit {
  id: string;
  pageId: string;
  checks: AuditCheck[];
  healthScore: number;
  technicalScore: number;
  contentScore: number;
  trustScore: number;
  linkingScore: number;
  createdAt: string;
}

export interface FixItem {
  id: string;
  pageId: string;
  auditId: string;
  severity: AuditSeverity;
  category: AuditCategory;
  title: string;
  description: string;
  whyItMatters: string;
  fixActions: string[];
  acceptanceCriteria: string[];
  effortEstimate: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'fixed' | 'ignored';
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// BRIEFS
// ============================================================================

export interface InputsNeeded {
  images: number;
  notes: string[];
}

export interface VisionEvidenceRef {
  evidencePackId: string;
  selectedImageIds: string[];
  imagePlacements: Array<{
    imageId: string;
    placement: 'hero' | 'inline' | 'gallery' | 'thumbnail';
    suggestedPosition: number;
  }>;
}

export interface Brief {
  id: string;
  pageId: string;
  taskId: string | null;
  humanBriefMd: string;
  gptBriefMd: string;
  inputsNeeded: InputsNeeded;
  beadsToInclude: string[]; // bead IDs
  internalLinksToAdd: string[];
  reviewThemesToUse: string[];
  visionEvidence: VisionEvidenceRef | null; // Vision evidence pack reference
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// WRITERS
// ============================================================================

export interface Writer {
  id: string;
  userId: string | null; // null for external freelancers
  name: string;
  email: string;
  role: 'internal' | 'freelancer' | 'ai';
  rate: number | null;
  niches: string[];
  isActive: boolean;
  createdAt: string;
}

export interface Assignment {
  id: string;
  taskId: string;
  writerId: string;
  status: 'assigned' | 'in_progress' | 'submitted' | 'approved' | 'rejected';
  dueDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// TASKS & PLANNER
// ============================================================================

export interface Task {
  id: string;
  projectId: string;
  pageId: string | null;
  type: TaskType;
  priorityRank: number;
  status: TaskStatus;
  scheduledFor: string | null;
  inputsNeeded: InputsNeeded;
  briefId: string | null;
  requiredChannels: Channel[];
  acceptanceCriteria: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskOutput {
  id: string;
  taskId: string;
  channel: Channel;
  contentMd: string;
  seoFields: {
    title: string;
    metaDescription: string;
    focusKeyword: string;
  } | null;
  imageRefs: string[];
  status: 'draft' | 'ready' | 'published';
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// CHANNEL PAYLOADS
// ============================================================================

export interface WPPayload {
  type: 'page' | 'post';
  status: 'draft' | 'publish';
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  featuredImage: string | null;
  categories: string[];
  tags: string[];
  seo: {
    metaDescription: string;
    focusKeyword: string;
  };
}

export interface GMBPayload {
  summary: string;
  callToAction: 'BOOK' | 'CALL' | 'LEARN_MORE' | 'SIGN_UP';
  url: string;
  media: string[];
}

export interface LinkedInPayload {
  postText: string;
  hashtags: string[];
  media: string[];
  link: string;
}

export type ChannelPayload = 
  | { channel: 'wp'; wp: WPPayload }
  | { channel: 'gmb'; gmb: GMBPayload }
  | { channel: 'li'; li: LinkedInPayload };

// ============================================================================
// CHANNEL CONNECTIONS
// ============================================================================

export interface ChannelConnection {
  id: string;
  projectId: string;
  channel: Channel;
  name: string;
  config: {
    // WordPress
    wpUrl?: string;
    wpUser?: string;
    wpAppPassword?: string;
    // GMB
    gbpLocationId?: string;
    gbpAccessToken?: string;
    gbpRefreshToken?: string;
    // LinkedIn
    liAccessToken?: string;
    liRefreshToken?: string;
    liOrganizationId?: string;
  };
  status: 'connected' | 'disconnected' | 'error';
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PUBLISHING
// ============================================================================

export interface Publish {
  id: string;
  taskId: string;
  taskOutputId: string;
  channel: Channel;
  payload: ChannelPayload;
  publishedUrl: string | null;
  externalId: string | null;
  status: 'pending' | 'success' | 'failed';
  logs: Array<{
    timestamp: string;
    level: 'info' | 'error';
    message: string;
  }>;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// GROWTH PLANNER
// ============================================================================

export interface GrowthPlanMonth {
  month: number;
  goal: string;
  deliverables: Array<{
    type: 'pillar' | 'support_post' | 'case_study' | 'qa_hub' | 'money_page_upgrade';
    title: string;
    targetQuery: string;
    intent: string;
    briefId: string | null;
  }>;
  kpi: string;
}

export interface GrowthPlan {
  id: string;
  projectId: string;
  months: GrowthPlanMonth[];
  generatedAt: string;
  createdAt: string;
}

// ============================================================================
// EXPORTS
// ============================================================================

export interface Export {
  id: string;
  projectId: string;
  type: 'sitemap' | 'audit_report' | 'briefs' | 'planner' | 'growth_plan';
  format: 'json' | 'csv' | 'md' | 'html';
  payload: Record<string, unknown>;
  fileUrl: string | null;
  createdAt: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// FORM TYPES (for onboarding)
// ============================================================================

export interface OnboardingStep1 {
  websiteUrl: string;
  name: string;
  primaryGoal: ProjectGoal;
  locations: string[];
  languages: string[];
  respectRobotsTxt: boolean;
  includeSubdomains: boolean;
}

export interface OnboardingStep2 {
  niche: string;
  coreServices: string[];
  pricePositioning: 'budget' | 'mid' | 'premium';
  differentiators: string[];
  doNotSay: string[];
}

export interface OnboardingStep3 {
  beads: Omit<Bead, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>[];
}

export interface OnboardingStep4 {
  reviews: Omit<Review, 'id' | 'projectId' | 'createdAt'>[];
}

export interface OnboardingStep5 {
  logo: File | null;
  images: File[];
  socialLinks: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
  };
}

export interface OnboardingData {
  step1: OnboardingStep1;
  step2: OnboardingStep2;
  step3: OnboardingStep3;
  step4: OnboardingStep4;
  step5: OnboardingStep5;
}
