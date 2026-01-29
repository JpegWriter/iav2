// ============================================================================
// VISION EVIDENCE TYPES - Image Analysis for Growth Planner
// ============================================================================

import type { BrandTone } from './index';

// ============================================================================
// ENTITY & EXPRESSION TYPES
// ============================================================================

export interface DetectedEntity {
  name: string;
  type: 'person' | 'object' | 'location' | 'equipment' | 'vehicle' | 'product' | 'material' | 'animal' | 'other';
  confidence: number; // 0-100
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes?: Record<string, string>; // e.g., { "color": "blue", "brand": "Makita" }
}

export interface DetectedExpression {
  emotion: 'happy' | 'focused' | 'confident' | 'satisfied' | 'neutral' | 'determined' | 'collaborative';
  confidence: number;
  personIndex?: number; // Which person in the image
}

// ============================================================================
// STORY ANGLES
// ============================================================================

export interface StoryAngle {
  angle: string; // e.g., "Behind-the-scenes craftsmanship"
  applicableContentTypes: ('blog' | 'social' | 'gmb' | 'case_study' | 'testimonial')[];
  suggestedHook: string; // Opening line suggestion
  emotionalAppeal: string; // What emotion this angle targets
}

// ============================================================================
// TECHNICAL FLAGS
// ============================================================================

export interface TechnicalFlags {
  resolution: 'low' | 'medium' | 'high' | 'excellent';
  aspectRatio: string; // e.g., "16:9", "4:3", "1:1"
  lighting: 'poor' | 'acceptable' | 'good' | 'professional';
  blur: 'none' | 'slight' | 'moderate' | 'severe';
  noise: 'none' | 'slight' | 'moderate' | 'severe';
  composition: 'poor' | 'acceptable' | 'good' | 'excellent';
  webOptimized: boolean;
  estimatedFileSizeMB: number;
  colorProfile: 'sRGB' | 'Adobe RGB' | 'ProPhoto RGB' | 'unknown';
  hasTransparency: boolean;
  warnings: string[]; // e.g., ["Image is underexposed", "Faces are partially obscured"]
}

// ============================================================================
// COMPLIANCE & LEGAL
// ============================================================================

export interface ComplianceNotes {
  hasIdentifiableFaces: boolean;
  hasMinors: boolean;
  hasLicensePlates: boolean;
  hasBrandLogos: string[]; // List of detected brand logos
  hasText: string[]; // Text detected in image
  potentialIssues: string[]; // e.g., ["Third-party logo visible", "Identifiable customer face"]
  recommendedActions: string[]; // e.g., ["Obtain model release", "Blur license plate"]
  usageRisk: 'low' | 'medium' | 'high';
}

// ============================================================================
// VISION EVIDENCE (Per-Image Analysis)
// ============================================================================

export interface VisionEvidence {
  // Core scene understanding
  sceneSummary: string; // 2-3 sentence description
  sceneType: 'work_in_progress' | 'completed_project' | 'team_at_work' | 'equipment' | 'before_after' | 'customer_interaction' | 'facility' | 'product' | 'other';
  
  // Extracted elements
  entities: DetectedEntity[];
  expressions: DetectedExpression[];
  
  // Content strategy
  storyAngles: StoryAngle[];
  heroSuitabilityScore: number; // 0-100, how suitable for hero/featured image
  
  // Quality assessment
  technicalFlags: TechnicalFlags;
  
  // SEO & accessibility
  suggestedAlt: string; // Screen-reader friendly, factual
  suggestedCaption: string; // Engaging, branded
  suggestedKeywords: string[]; // For internal tagging
  suggestedHashtags: string[]; // For social media
  
  // Compliance
  complianceNotes: ComplianceNotes;
  
  // Raw data
  rawAnalysisJson: Record<string, unknown>; // Full Vision API response
}

// ============================================================================
// VISION EVIDENCE IMAGE
// ============================================================================

export interface VisionEvidenceImage {
  id: string;
  packId: string;
  imageUrl: string; // Storage URL
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  evidence: VisionEvidence;
  orderIndex: number; // For multiple images, 0 = primary
  createdAt: string;
}

// ============================================================================
// CONTEXT SNAPSHOT (Frozen at analysis time)
// ============================================================================

export interface VisionContextSnapshot {
  topic: string;
  primaryService: string;
  location: string | null;
  brandTone: BrandTone[];
  targetAudience: string;
  contentIntent: 'showcase' | 'explain' | 'prove' | 'inspire' | 'inform';
}

// ============================================================================
// VISION EVIDENCE PACK (Grouped analysis for a writing job)
// ============================================================================

export interface VisionEvidencePack {
  id: string;
  projectId: string;
  contextSnapshot: VisionContextSnapshot;
  images: VisionEvidenceImage[];
  
  // Pack-level summaries
  combinedNarrative: string; // How the images work together
  primaryHeroImageId: string | null; // Best image for hero use
  crossImageThemes: string[]; // Themes that appear across multiple images
  
  // Usage tracking
  usedInBriefIds: string[];
  usedInTaskIds: string[];
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface VisionAnalysisRequest {
  projectId: string;
  taskId?: string; // Link pack to a specific task
  images: Array<{
    base64?: string; // Base64 encoded image
    url?: string; // Or URL to existing image
    filename: string;
  }>;
  context: VisionContextSnapshot;
}

export interface VisionAnalysisResponse {
  success: boolean;
  pack?: VisionEvidencePack;
  error?: string;
}

// ============================================================================
// METADATA EMBEDDING TYPES
// ============================================================================

export interface MetadataEmbedRequest {
  imageId: string; // VisionEvidenceImage ID
  fields: {
    title?: string;
    description?: string;
    copyright?: string;
    creator?: string;
    keywords?: string[];
    altText?: string;
    caption?: string;
    // IPTC fields
    headline?: string;
    city?: string;
    country?: string;
    creditLine?: string;
    // Custom XMP
    customXmp?: Record<string, string>;
  };
  outputFormat: 'jpeg' | 'png' | 'webp';
  preserveOriginal: boolean;
}

export interface MetadataEmbedResponse {
  success: boolean;
  embeddedImageUrl?: string;
  embeddedFields: string[];
  warnings?: string[];
  error?: string;
}

// ============================================================================
// WRITING JOB INTEGRATION
// ============================================================================

export interface WritingJobEvidenceRef {
  evidencePackId: string;
  selectedImageIds: string[]; // Which images from pack to use
  imagePlacements: Array<{
    imageId: string;
    placement: 'hero' | 'inline' | 'gallery' | 'thumbnail';
    suggestedPosition: number; // Paragraph number for inline
  }>;
}
