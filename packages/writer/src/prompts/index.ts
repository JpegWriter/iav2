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
