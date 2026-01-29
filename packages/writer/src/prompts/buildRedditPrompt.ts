// ============================================================================
// REDDIT PROMPT BUILDER
// ============================================================================
// Builds the Reddit companion post prompt.
// Optimized for Reddit's community-first, anti-promotional culture.
// ============================================================================

import type { ContextPack, WriterPlan, WriterTask, BrandToneProfile } from '../types';
import { getToneInstructions, getPlatformAdjustment } from '../tones/profiles';

// ============================================================================
// SUBREDDIT CATEGORIES
// ============================================================================

export type SubredditCategory = 
  | 'industry' // e.g., r/marketing, r/webdev
  | 'local' // e.g., r/Denver, r/LosAngeles
  | 'niche' // e.g., r/smallbusiness, r/entrepreneur
  | 'help' // e.g., r/HomeImprovement, r/legaladvice
  | 'general'; // e.g., r/todayilearned

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const OUTPUT_SCHEMA = `{
  "platform": "reddit",
  "content": "string - The self-post text (value-first, not promotional)",
  "title": "string - Post title (compelling but not clickbaity)",
  "hashtags": [] - Reddit doesn't use hashtags,
  "mentionSuggestions": [] - Not applicable,
  "imageRef": "string or null - Optional image/infographic reference",
  "schedulingHint": "string - Best time/day for this subreddit type",
  "subredditSuggestions": [
    {
      "subreddit": "string - e.g., r/smallbusiness",
      "category": "industry | local | niche | help | general",
      "postType": "self | link | image",
      "customTitle": "string - Subreddit-specific title if different",
      "customContent": "string - Subreddit-specific content if needed"
    }
  ],
  "commentStrategy": "string - How to naturally mention the article in comments"
}`;

// ============================================================================
// MAIN PROMPT BUILDER
// ============================================================================

export function buildRedditPrompt(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile,
  articleTitle: string,
  articleUrl: string,
  targetSubreddits?: string[]
): string {
  const adjustment = getPlatformAdjustment('reddit');
  const toneInstructions = getToneInstructions(tone);

  // Build context
  const businessContext = buildBusinessContext(contextPack);
  const topicContext = buildTopicContext(plan, task);
  const subredditGuidance = buildSubredditGuidance(targetSubreddits);

  return `# ROLE
You are a Reddit content strategist. You deeply understand Reddit's culture:
- Community-first, value-first content
- EXTREME allergy to anything promotional
- Authenticity and expertise valued
- Helping others is the currency
- Self-deprecation and humility work well
- Never directly promote your business in the post

# TASK
Create a Reddit post that PROVIDES VALUE while subtly relating to this article:
Article: "${articleTitle}"
URL: ${articleUrl}

The article link should NEVER appear in the main post. It goes in comments ONLY, and only if genuinely helpful.

# TONE & VOICE
${toneInstructions.join('\n')}

# REDDIT-SPECIFIC ADJUSTMENTS
- Formality: ${adjustment?.characterLimit ? 'Very casual' : 'Casual but expert'}
- No hashtags ever
- No emojis (maybe one max)
- No corporate speak whatsoever
- Be a helpful community member, not a marketer

# BUSINESS CONTEXT (Use Subtly If At All)
${businessContext}

# TOPIC CONTEXT
${topicContext}

# TARGET SUBREDDITS
${subredditGuidance}

# REDDIT POST STRATEGY

## Title Guidelines
- Specific, not vague
- Questions work well in help subreddits
- "How I..." or "Guide to..." for educational
- Avoid clickbait (Reddit hates it)
- No ALL CAPS or excessive punctuation!!!

## Post Body Structure

### For HELP/EDUCATIONAL Posts:
1. Brief context (why you're qualified to share this)
2. The actual helpful content (80% of the post)
3. Personal experience or lesson learned
4. Open question to encourage discussion

### For DISCUSSION Posts:
1. Share an observation or question
2. Your perspective with reasoning
3. Acknowledge alternative views
4. Invite others to share experiences

### For LOCAL Subreddits:
1. Local connection/context first
2. Genuinely helpful local info
3. Ask for community input
4. Never promote, just participate

## What NEVER to Do
- Link to your website in the post body
- Mention your business name prominently
- Sound like a press release
- Use marketing language
- Say "I'm an expert" without proving it
- Cross-post promotionally

## Comment Strategy
The article link ONLY goes in comments, and ONLY:
- When someone specifically asks for resources
- When it genuinely answers a question
- After you've established credibility in the thread
- Phrased as: "I actually wrote about this recently: [link]"

# OUTPUT FORMAT
Return ONLY valid JSON matching this schema:
${OUTPUT_SCHEMA}

Generate the Reddit content strategy now:`;
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

function buildBusinessContext(contextPack: ContextPack): string {
  const biz = contextPack.businessReality;
  if (!biz) {
    return 'No business context. Present as an individual with relevant expertise.';
  }

  const lines = [];

  // Don't include business name - Reddit hates that
  if (biz.services && biz.services.length > 0) {
    lines.push(`Expertise Areas: ${biz.services.slice(0, 3).join(', ')}`);
  }

  if (biz.differentiators && biz.differentiators.length > 0) {
    lines.push(`Unique Knowledge: ${biz.differentiators.slice(0, 2).join(', ')}`);
  }

  // Location for local subreddits
  const local = contextPack.localSignals;
  if (local?.locations && local.locations.length > 0) {
    lines.push(`Location: ${local.locations[0]}`);
  }

  lines.push('\nNOTE: Never mention the business name in the Reddit post. Present as an individual professional sharing knowledge.');

  return lines.join('\n');
}

function buildTopicContext(plan: WriterPlan, task: WriterTask): string {
  const lines = [];

  lines.push(`Main Topic: ${plan.h1}`);

  if (plan.sections && plan.sections.length > 0) {
    lines.push('\nKey Points Covered:');
    for (const section of plan.sections.slice(0, 5)) {
      lines.push(`- ${section.heading}`);
      if (section.intent) {
        lines.push(`  • ${section.intent}`);
      }
    }
  }

  lines.push(`\nPrimary Service/Topic: ${task.primaryService}`);
  lines.push(`Target Audience: People interested in ${task.primaryService.toLowerCase()}`);

  return lines.join('\n');
}

function buildSubredditGuidance(targetSubreddits?: string[]): string {
  if (targetSubreddits && targetSubreddits.length > 0) {
    return `Target Subreddits (adapt content for each):
${targetSubreddits.map((s) => `- ${s}`).join('\n')}`;
  }

  return `No specific subreddits provided. Suggest 3-5 relevant subreddits based on:
1. Industry/topic subreddits
2. Local subreddits if business is location-based
3. General advice/help subreddits where topic fits`;
}

// ============================================================================
// SPECIALIZED REDDIT POST BUILDERS
// ============================================================================

/**
 * Build an AMA (Ask Me Anything) style post
 */
export function buildRedditAmaPrompt(
  contextPack: ContextPack,
  task: WriterTask,
  tone: BrandToneProfile,
  expertise: string,
  credentials: string[]
): string {
  const toneInstructions = getToneInstructions(tone);

  return `# ROLE
You are preparing an AMA (Ask Me Anything) post for Reddit.

# EXPERTISE TO SHARE
${expertise}

# CREDENTIALS (Use Humbly)
${credentials.map((c) => `- ${c}`).join('\n')}

# TONE
${toneInstructions.join('\n')}

# AMA STRUCTURE

## Title Format
"I'm a [profession] with [X years/credentials]. AMA about [specific topic]"

## Post Body
1. Brief intro (who you are, 2-3 sentences)
2. Why you're doing this AMA (genuinely want to help)
3. What you can answer (your expertise)
4. What you can't/won't answer (set boundaries)
5. Proof hints (how mods could verify if needed)
6. Availability window

## Ground Rules
- Never promote your business/website
- Answer questions genuinely and thoroughly
- Admit when you don't know something
- Be conversational and accessible
- Thank people for good questions

# OUTPUT FORMAT
Return JSON with:
{
  "title": "string",
  "content": "string",
  "subredditSuggestions": ["string"],
  "anticipatedQuestions": ["string"],
  "proofStrategy": "string"
}`;
}

/**
 * Build a "Today I Learned" (TIL) style educational post
 */
export function buildRedditTilPrompt(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile,
  interestingFact: string
): string {
  const toneInstructions = getToneInstructions(tone);

  return `# ROLE
You are creating a TIL (Today I Learned) style educational post.

# INTERESTING FACT TO SHARE
${interestingFact}

# RELATED TOPIC
${plan.h1}
${task.primaryService}

# TONE
${toneInstructions.join('\n')}

# TIL REQUIREMENTS
- Must be genuinely interesting/surprising
- Verifiable (cite source in comments)
- Concise - one interesting fact
- Can spark discussion

# OUTPUT FORMAT
Return JSON with:
{
  "title": "TIL [interesting fact]",
  "content": "string - Expanded explanation",
  "subredditSuggestions": ["r/todayilearned", "other relevant subs"],
  "sourceForComments": "string - Where fact comes from"
}`;
}

/**
 * Build a "Guide" or "How To" post
 */
export function buildRedditGuidePrompt(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile
): string {
  const toneInstructions = getToneInstructions(tone);

  const keyPoints = plan.sections?.map((s) => s.heading).slice(0, 6) || [];

  return `# ROLE
You are creating a comprehensive guide post for Reddit that provides genuine value.

# GUIDE TOPIC
${plan.h1}

# KEY POINTS TO COVER
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

# TONE
${toneInstructions.join('\n')}

# GUIDE STRUCTURE

## Title
"[Guide] How to [specific outcome]" or "Complete guide to [topic]"

## Post Body
1. Why this guide (what problem it solves)
2. Your experience with this topic (briefly)
3. The actual guide content:
   - Clear numbered steps or sections
   - Specific, actionable advice
   - Common mistakes to avoid
   - Formatting with headers/bullets
4. TLDR summary at end
5. "Happy to answer questions in comments"

## Formatting
- Use Reddit markdown: ## for headers, ** for bold, * for bullets
- Include TLDR for long posts
- Number steps clearly
- Add context for each step

# OUTPUT FORMAT
Return JSON with:
{
  "title": "string",
  "content": "string - Full formatted guide using Reddit markdown",
  "subredditSuggestions": [
    {
      "subreddit": "string",
      "customTitle": "string if needed"
    }
  ],
  "tldr": "string - 2-3 sentence summary"
}`;
}

/**
 * Build a question/discussion post
 */
export function buildRedditDiscussionPrompt(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile,
  discussionAngle: string
): string {
  const toneInstructions = getToneInstructions(tone);

  return `# ROLE
You are creating a discussion post to start a genuine conversation on Reddit.

# DISCUSSION ANGLE
${discussionAngle}

# RELATED TOPIC
${plan.h1}

# TONE
${toneInstructions.join('\n')}

# DISCUSSION POST STRUCTURE

## Title
Question format works best:
- "What's your experience with [topic]?"
- "Am I wrong to think that [position]?"
- "Why does everyone recommend [thing] when [alternative] works better?"

## Post Body
1. Context for your question
2. Your current thinking/experience
3. Why you're asking (genuine curiosity)
4. Specific aspects you want discussed
5. "Would love to hear different perspectives"

## Goals
- Genuinely learn from community
- Spark interesting discussion
- Position yourself as curious learner
- Later contribute your expertise in comments

# OUTPUT FORMAT
Return JSON with:
{
  "title": "string",
  "content": "string",
  "subredditSuggestions": ["string"],
  "followUpComments": ["string - Points you could add in comments once discussion starts"]
}`;
}

// ============================================================================
// COMMENT TEMPLATES
// ============================================================================

export const REDDIT_COMMENT_TEMPLATES = {
  resourceShare: `Not OP but I wrote something about this recently that might help: [link]

Let me know if you have questions - happy to clarify anything.`,

  experienceShare: `In my experience doing [X] for [Y years], I've found that...

[Detailed helpful answer]

I actually put together a more detailed breakdown here if anyone wants to dive deeper: [link]`,

  questionAnswer: `Great question! The short answer is [X].

The longer answer is...

[Detailed explanation]

I wrote up my full process here: [link] but the TL;DR is above.`,

  humbleExpert: `[Expertise] here. This is something I deal with a lot.

[Genuinely helpful answer that solves the problem]

If you want the deep dive, I wrote about this: [link]. But honestly the above should be enough for your situation.`,
};
