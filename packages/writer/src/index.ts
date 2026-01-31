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
  // New unified types
  UnifiedContextPack,
  UnifiedMasterProfile,
  UnifiedWriterBrief,
  UnifiedWriterJobConfig,
  UnifiedProofAtom,
  UnifiedPageSummary,
  UnifiedInternalLinkTarget,
  UnifiedImagePlan,
  UnifiedRewriteContext,
  // Upgrade rules types
  ImagePolicy,
  UpgradeRules,
  PromptProfile,
  InputContract,
} from './types';

// Orchestrator
export {
  runWriterOrchestrator,
  runUnifiedWriterOrchestrator,
  buildContextPack,
  generateWriterPlan,
  createDefaultPlan,
  adaptUnifiedContextPack,
  adaptUnifiedToLegacyJob,
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
  validateRewriteContext,
  validateComplianceRules,
  generateContentHash,
  type ValidationResult,
  type InputValidationResult,
  type RewriteValidationResult,
} from './validators/wpValidator';

// Quality Gate (PASS/FAIL validation)
export {
  runQualityGate,
  createDefaultRequirements,
  type GateCode,
  type GateViolation,
  type GateResult,
  type ValidationInput,
} from './validators/qualityGate';

// Expand Pass
export {
  runExpandPass,
  EXPAND_PASS_PROMPT_TEMPLATE,
  type LLMClient,
  type ExpandPassInput,
  type IntentType,
  type WordPressOutput as ExpandPassWordPressOutput,
  type WPBlock as ExpandPassWPBlock,
} from './runExpandPass';

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

// Vision Facts Binding
export {
  bindVisionFacts,
  validateVisionBinding,
  extractVisionFactsFromPack,
  EVIDENCE_MARKERS,
  type BindVisionFactsInput,
  type BindVisionFactsResult,
} from './vision';
