// ============================================================================
// PROMPTS MODULE INDEX
// ============================================================================

export {
  buildArticlePrompt,
  buildRewritePrompt,
  buildSectionPrompt,
} from './buildArticlePrompt';

export {
  buildLinkedInPrompt,
  buildLinkedInThoughtLeaderVariant,
  buildLinkedInDataVariant,
  buildLinkedInQuestionVariant,
  buildLinkedInCarouselPrompt,
} from './buildLinkedInPrompt';

export {
  buildGmbPrompt,
  buildGmbSeasonalPrompt,
  buildGmbProblemSolverPrompt,
  buildGmbReviewFollowUpPrompt,
  type GmbPostType,
} from './buildGmbPrompt';

export {
  buildRedditPrompt,
  buildRedditAmaPrompt,
  buildRedditTilPrompt,
  buildRedditGuidePrompt,
  buildRedditDiscussionPrompt,
  REDDIT_COMMENT_TEMPLATES,
  type SubredditCategory,
} from './buildRedditPrompt';

export {
  buildExpandPassPrompt,
  type ExpandPassContext,
} from './expandPass';

export {
  getSystemPrompt,
  getPromptFromFile,
  DEFAULT_PROMPT_PROFILE,
  MASTER_AUTHORITY_WRITER_PROMPT_V1,
  UNIVERSAL_UPGRADE_PROMPT_V1,
  EXPAND_PASS_V1,
  type SystemPromptId,
} from './promptRegistry';
