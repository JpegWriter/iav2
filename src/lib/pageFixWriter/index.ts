/**
 * Page Fix Writer Module
 * 
 * Surgical page rehabilitation engine for Infinite Authority.
 * This is NOT an article writer - it's an editor that respects existing intent.
 */

// Types
export type {
  FixTask,
  FixIssue,
  PageRole,
  PageSnapshot,
  ImageMetadata,
  VoiceProfile,
  FixGuardrails,
  PageFixRequest,
  PageFixOutput,
  PageFixSection,
  SectionType,
  InternalLinkSuggestion,
  ImageInstruction,
  PageFixDiff,
  FieldDiff,
  SectionDiff,
  ValidationWarning,
  FixVersionStatus,
  PageFixVersion,
  PreviewRequest,
  PreviewResponse,
  PublishRequest,
  PublishResponse,
  RevertRequest,
  RevertResponse,
} from './types';

// Prompt building
export {
  buildPageFixPrompt,
  buildRepairPrompt,
  DEFAULT_GUARDRAILS,
  DEFAULT_VOICE_PROFILE,
} from './prompt';

// Validation
export {
  validatePageFixOutput,
  parsePageFixOutput,
  type ValidationResult,
} from './validators';

// Diff generation
export {
  generatePageFixDiff,
  hashContent,
} from './diff';

// Runner
export {
  runPageFix,
  buildPageSnapshot,
  buildPageFixVersion,
  type PageFixRunnerResult,
} from './runner';
