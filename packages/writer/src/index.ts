// ============================================================================
// WRITER PACKAGE - MAIN ENTRY POINT
// ============================================================================
// Ultimate Writer: Converts Growth Planner tasks + briefs into:
// - WordPress-safe articles (block-editor JSON)
// - Hero image + inline image placements
// - Platform-specific companion posts (LinkedIn, GMB, Reddit)
// ============================================================================

// Core types
export type {
  WritingJob,
  WritingOutput,
  WriterTask,
  WriterPlan,
  ContextPack,
  WordPressOutput,
  WPBlock,
  SocialOutput,
  AuditOutput,
  ImagePlacement,
  SEOPackage,
  ValidationWarning,
  ValidationSeverity,
  PageRole,
  PageIntent,
  SupportType,
  ImageUse,
  EEATSignalType,
  ProofElementType,
  VisionAnalysis,
  UserContext,
  SiteContext,
  ProofContext,
  BrandToneProfile,
  SectionPlan,
  LinkedInPost,
  GMBPost,
  RedditPost,
  SelectedImage,
  VisionContext,
} from './types';

// Orchestrator
export {
  runWriterOrchestrator,
  buildContextPack,
  generateWriterPlan,
  createDefaultPlan,
  type OrchestratorOptions,
  type OrchestratorResult,
} from './orchestrator';

// Tone system
export {
  getToneProfile,
  mergeToneProfile,
  getPlatformAdjustment,
  getToneInstructions,
  TONE_PROFILES,
  PLATFORM_ADJUSTMENTS,
  type ToneProfile,
  type PlatformToneAdjustment,
} from './tones/profiles';

// Media planner
export {
  selectHeroImage,
  planInlineImages,
  createImageBlock,
  createImagePlaceholderBlock,
  generateImageMetadata,
  scoreImageForHero,
  type HeroSelection,
} from './media/mediaPlanner';

// Validators
export {
  validateWordPressOutput,
  validateWriterTaskInputs,
  generateContentHash,
  type ValidationResult,
  type InputValidationResult,
} from './validators/wpValidator';

// Prompt builders
export {
  buildArticlePrompt,
  buildRewritePrompt,
  buildSectionPrompt,
  buildLinkedInPrompt,
  buildLinkedInThoughtLeaderVariant,
  buildLinkedInDataVariant,
  buildLinkedInQuestionVariant,
  buildLinkedInCarouselPrompt,
  buildGmbPrompt,
  buildGmbSeasonalPrompt,
  buildGmbProblemSolverPrompt,
  buildGmbReviewFollowUpPrompt,
  buildRedditPrompt,
  buildRedditAmaPrompt,
  buildRedditTilPrompt,
  buildRedditGuidePrompt,
  buildRedditDiscussionPrompt,
  REDDIT_COMMENT_TEMPLATES,
  type GmbPostType,
  type SubredditCategory,
} from './prompts';
