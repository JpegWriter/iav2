// ============================================================================
// SERP / AEO AUDIT GATE - TYPES
// ============================================================================

import { PageRole } from '@/types';

// ============================================================================
// GATE INPUT TYPES
// ============================================================================

export type SearchIntent = 'buy' | 'compare' | 'learn' | 'trust';

export interface TaskContext {
  role: PageRole;
  intent: SearchIntent;
  supportsPage?: string;
  primaryService: string;
  location?: string;
}

export interface SiteContext {
  sitemap: string[];
  existingPages: Array<{
    path: string;
    title: string;
    role: PageRole;
  }>;
  internalLinkGraph: Map<string, string[]>;
  competitors?: string[];
}

export interface UserContext {
  brandTone: {
    personality: string;
    formality: 'casual' | 'professional' | 'formal';
    confidence: 'humble' | 'confident' | 'authoritative';
    localFlavour?: string;
  };
  USPs: string[];
  reviews: Array<{
    theme: string;
    snippet: string;
  }>;
  experience: {
    years?: number;
    volume?: string;
    specialties?: string[];
  };
  credentials: string[];
  beads: string[];
  localSignals: string[];
}

export interface VisionEvidencePack {
  heroImage?: {
    imageId: string;
    description: string;
    rationale: string;
    suggestedAlt: string;
  };
  inlineImages?: Array<{
    imageId: string;
    description: string;
    placementHint: string;
    suggestedAlt: string;
  }>;
  evidenceStrength: 'strong' | 'moderate' | 'weak' | 'none';
}

export interface ProposedContent {
  title: string;
  headings: string[];
  keyphrase: string;
  metaDescription: string;
}

export interface AuditGateInput {
  taskContext: TaskContext;
  siteContext: SiteContext;
  userContext: UserContext;
  visionContext?: VisionEvidencePack;
  proposed: ProposedContent;
}

// ============================================================================
// GATE OUTPUT TYPES
// ============================================================================

export interface OutlineSection {
  h2: string;
  intent: string;
  h3s?: string[];
}

export interface ApprovedOutline {
  h1: string;
  sections: OutlineSection[];
}

export interface AuditScores {
  /** How well the title/content would perform in SERP (0-100) */
  serpStrength: number;
  /** Coverage of AEO question types (0-100) */
  aeoCoverage: number;
  /** EEAT credibility signals present (0-100) */
  credibility: number;
  /** How well content matches declared intent (0-100) */
  intentMatch: number;
  /** Risk level - higher = more risky claims (0-100) */
  risk: number;
}

export interface ContentIntelGateResult {
  /** Whether content passed the gate */
  approved: boolean;
  
  /** Rewritten title (always provided, may be same as input) */
  rewrittenTitle: string;
  
  /** Approved outline with AEO coverage */
  approvedOutline: ApprovedOutline;
  
  /** Approved focus keyphrase */
  approvedKeyphrase: string;
  
  /** Approved meta description */
  metaDescription: string;
  
  /** Quality scores across dimensions */
  scores: AuditScores;
  
  /** Non-blocking issues to address */
  warnings: string[];
  
  /** Blocking issues - must be resolved before writing */
  blockers: string[];
  
  /** Suggested improvements */
  suggestions: string[];
  
  /** Credibility elements to inject */
  credibilityInjections: CredibilityInjection[];
  
  /** Compliance requirements */
  compliance: ComplianceResult;
}

export interface CredibilityInjection {
  type: 'experience' | 'proof' | 'local' | 'process' | 'visual';
  content: string;
  placementHint: string;
}

export interface ComplianceResult {
  requiresDisclaimer: boolean;
  disclaimers: string[];
  restrictedClaims: string[];
  riskCategory?: 'legal' | 'medical' | 'finance' | 'children' | 'general';
}

// ============================================================================
// TITLE PATTERN TYPES
// ============================================================================

export interface TitlePattern {
  pattern: string;
  example: string;
  bestFor: SearchIntent[];
}

export const GOOD_TITLE_PATTERNS: TitlePattern[] = [
  {
    pattern: 'How to [action] in [location] ([costs/mistakes/timeline])',
    example: 'How to Choose a Wedding Photographer in Sydney (Costs, Mistakes, Timeline)',
    bestFor: ['learn', 'compare'],
  },
  {
    pattern: '[X] vs [Y]: What Actually Matters for [audience]',
    example: 'Studio vs Outdoor Portraits: What Actually Matters for Family Photos',
    bestFor: ['compare'],
  },
  {
    pattern: 'When You Need [service] in [location] — Signs, Costs, Next Steps',
    example: 'When You Need Professional Headshots in Melbourne — Signs, Costs, Next Steps',
    bestFor: ['buy', 'learn'],
  },
  {
    pattern: '[Number] [Things] to [Know/Avoid] Before [Action]',
    example: '7 Things to Know Before Booking a Newborn Photographer',
    bestFor: ['learn'],
  },
  {
    pattern: '[Service] for [Audience]: [Outcome] in [Location]',
    example: 'Corporate Photography for Law Firms: Professional Images in Sydney CBD',
    bestFor: ['buy'],
  },
  {
    pattern: 'Why [Audience] [Choose/Trust] [Service] in [Location]',
    example: 'Why Sydney Families Trust New Age for Milestone Photography',
    bestFor: ['trust'],
  },
];

// ============================================================================
// BAD TITLE PATTERNS (TO REJECT)
// ============================================================================

export const BAD_TITLE_PATTERNS: RegExp[] = [
  /\bcomplete guide\b/i,
  /\bindustry insights?\b/i,
  /\boverview\b/i,
  /\bprovider\b/i,
  /\bsolutions?\b/i,
  /\bservices?\s*$/i, // ends with just "services"
  /\bexpertise\b/i,
  /\bour\s+(approach|philosophy|mission)\b/i,
  /\bwhat we (do|offer)\b/i,
  /\blearn more about\b/i,
  /\bdiscover\b/i,
  /\bunlock(ing)?\b/i,
  /\beverything you need to know\b/i,
  /\bultimate\b/i,
  /\bdefinitive\b/i,
  /\bcomprehensive\b/i,
];

// ============================================================================
// AEO QUESTION COVERAGE
// ============================================================================

export const AEO_QUESTIONS = [
  { id: 'what', question: 'What is this?', required: true },
  { id: 'who', question: 'Who is it for?', required: true },
  { id: 'when', question: 'When do I need it?', required: true },
  { id: 'how', question: 'How does it work?', required: true },
  { id: 'cost', question: 'What does it cost / involve?', required: false },
  { id: 'mistakes', question: 'What mistakes should I avoid?', required: false },
  { id: 'next', question: 'What should I do next?', required: true },
] as const;

export type AEOQuestionId = typeof AEO_QUESTIONS[number]['id'];

// ============================================================================
// INTENT REQUIREMENTS
// ============================================================================

export const INTENT_REQUIREMENTS: Record<SearchIntent, string[]> = {
  buy: ['CTA logic', 'process explanation', 'next step clarity', 'pricing context'],
  compare: ['criteria for comparison', 'alternatives listed', 'pros/cons', 'recommendation'],
  learn: ['clear explanations', 'examples', 'definitions', 'step-by-step'],
  trust: ['experience signals', 'proof elements', 'reassurance', 'transparency'],
};

// ============================================================================
// RISK KEYWORDS
// ============================================================================

export const RISK_KEYWORDS: Record<string, string[]> = {
  legal: ['lawsuit', 'sue', 'court', 'legal action', 'attorney', 'lawyer', 'contract', 'liability'],
  medical: ['diagnose', 'treat', 'cure', 'heal', 'medical', 'health condition', 'symptom', 'prescription'],
  finance: ['invest', 'return', 'profit', 'guaranteed', 'income', 'tax advice', 'financial advice'],
  children: ['child', 'minor', 'underage', 'kid', 'baby', 'newborn', 'infant', 'toddler'],
  guarantees: ['guarantee', 'promise', 'always', 'never fail', '100%', 'certain', 'definitely'],
};
