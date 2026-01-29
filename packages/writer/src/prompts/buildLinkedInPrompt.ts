// ============================================================================
// LINKEDIN PROMPT BUILDER
// ============================================================================
// Builds the LinkedIn companion post prompt.
// Optimized for LinkedIn's algorithm and professional audience.
// ============================================================================

import type { ContextPack, WriterPlan, WriterTask, BrandToneProfile } from '../types';
import { getToneInstructions, getPlatformAdjustment } from '../tones/profiles';

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const OUTPUT_SCHEMA = `{
  "platform": "linkedin",
  "content": "string - The full post text (1300-3000 chars for optimal engagement)",
  "hashtags": ["string"] - 3-5 relevant hashtags,
  "mentionSuggestions": ["string"] - Optional accounts to tag,
  "imageRef": "string - Reference to image or PLACEHOLDER:description",
  "schedulingHint": "string - Best time/day recommendation",
  "engagementHook": "string - The opening line that stops the scroll",
  "callToAction": "string - What action you want readers to take"
}`;

// ============================================================================
// MAIN PROMPT BUILDER
// ============================================================================

export function buildLinkedInPrompt(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile,
  articleTitle: string,
  articleUrl: string
): string {
  const adjustment = getPlatformAdjustment('linkedin');
  const toneInstructions = getToneInstructions(tone);

  // Build context
  const businessContext = buildBusinessContext(contextPack);
  const proofSnippets = extractBestProof(contextPack);
  const keyTakeaways = extractKeyTakeaways(plan);

  return `# ROLE
You are a LinkedIn content strategist creating a companion post that promotes a new article. You understand LinkedIn's algorithm rewards:
- Dwell time (longer posts with value)
- Native engagement (comments, shares)
- First 2-3 lines as scroll-stoppers
- Stories and personal insights over corporate speak

# TASK
Create a LinkedIn post promoting this article:
Title: "${articleTitle}"
URL: ${articleUrl}

# TONE & VOICE
${toneInstructions.join('\n')}

# LINKEDIN-SPECIFIC ADJUSTMENTS
- Character limit: ${adjustment?.characterLimit || 3000}
- Hashtags: ${adjustment?.hashtagRange?.[0] || 3}-${adjustment?.hashtagRange?.[1] || 5}
- Emoji usage: ${adjustment?.emojiAllowed ? 'moderate' : 'none'} (1-2 strategic emojis OK)
- Formality: Slightly more professional than article

# BUSINESS CONTEXT
${businessContext}

# KEY ARTICLE TAKEAWAYS (Reference These)
${keyTakeaways}

# AVAILABLE PROOF SNIPPETS (For Social Proof)
${proofSnippets}

# LINKEDIN POST STRUCTURE

## Hook (Lines 1-2) - CRITICAL
- Must stop the scroll
- Pattern interrupt or bold claim
- No "I'm excited to announce..." 
- Consider: question, stat, controversial take, story opener

## Body (Lines 3-15)
- Build on the hook with value
- Use line breaks for readability
- Include ONE specific insight from the article
- Personal perspective adds authenticity
- Weave in proof element if natural

## CTA (Lines 16-18)
- Clear call to action
- Link in comments OR first comment strategy
- Engagement question optional

## Hashtags (End)
- 3-5 hashtags
- Mix of: industry, topic, audience
- One niche, one broad

# FORMATTING RULES
1. Use line breaks between thoughts (LinkedIn favors this)
2. No walls of text
3. First 3 lines show before "see more" - make them count
4. Avoid ALL CAPS except for ONE word emphasis max
5. No emoji spam - 1-2 strategic emojis only
6. Don't put the link in the post body - mention it's in comments

# AVOID THESE LINKEDIN CLICHÉS
- "I'm excited to announce..."
- "Thrilled to share..."
- "Humbled to..."
- "Game-changer"
- "Leveraging synergies"
- "Thought leader"
- Excessive humble-bragging

# OUTPUT FORMAT
Return ONLY valid JSON matching this schema:
${OUTPUT_SCHEMA}

Generate the LinkedIn post now:`;
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

function buildBusinessContext(contextPack: ContextPack): string {
  const biz = contextPack.businessReality;
  if (!biz) {
    return 'Business context not available.';
  }

  return `
Business: ${biz.name || 'N/A'}
Services: ${biz.services?.slice(0, 3).join(', ') || 'N/A'}
Target Audience: ${biz.targetAudience || 'N/A'}
Differentiators: ${biz.differentiators?.slice(0, 2).join(', ') || 'N/A'}
`;
}

function extractBestProof(contextPack: ContextPack): string {
  const proofs: string[] = [];
  const proof = contextPack.proofSummary;

  if (!proof) {
    return 'No specific proof available. Focus on expertise demonstration.';
  }

  // Best review snippet
  if (proof.topQuotes && proof.topQuotes.length > 0) {
    proofs.push(`Customer Quote: "${proof.topQuotes[0].slice(0, 150)}..."`);
  }

  // Credential
  if (proof.credentialsList && proof.credentialsList.length > 0) {
    proofs.push(`Credential: ${proof.credentialsList[0]}`);
  }

  // Case study
  if (proof.caseStudyBullets && proof.caseStudyBullets.length > 0) {
    proofs.push(`Case Study: ${proof.caseStudyBullets[0]}`);
  }

  if (proofs.length === 0) {
    return 'No specific proof available. Focus on expertise demonstration.';
  }

  return proofs.join('\n');
}

function extractKeyTakeaways(plan: WriterPlan): string {
  const takeaways: string[] = [];

  takeaways.push(`Topic: ${plan.h1}`);

  if (plan.sections && plan.sections.length > 0) {
    takeaways.push('\nKey Sections:');
    for (const section of plan.sections.slice(0, 4)) {
      takeaways.push(`- ${section.heading}`);
      if (section.intent) {
        takeaways.push(`  • ${section.intent}`);
      }
    }
  }

  return takeaways.join('\n');
}

// ============================================================================
// VARIANT BUILDERS
// ============================================================================

/**
 * Build a thought leadership variant (personal, insightful)
 */
export function buildLinkedInThoughtLeaderVariant(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile,
  articleTitle: string,
  articleUrl: string
): string {
  const basePrompt = buildLinkedInPrompt(
    contextPack,
    plan,
    task,
    tone,
    articleTitle,
    articleUrl
  );

  return `${basePrompt}

# VARIANT: THOUGHT LEADERSHIP
For this version, emphasize:
- Personal experience or insight related to the topic
- A lesson learned or mistake made
- An industry observation that leads to the article
- More "I" and "we" pronouns
- Vulnerability or authenticity moment

The hook should be personal/story-based, not promotional.`;
}

/**
 * Build a data-driven variant (stats, results)
 */
export function buildLinkedInDataVariant(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile,
  articleTitle: string,
  articleUrl: string
): string {
  const basePrompt = buildLinkedInPrompt(
    contextPack,
    plan,
    task,
    tone,
    articleTitle,
    articleUrl
  );

  return `${basePrompt}

# VARIANT: DATA-DRIVEN
For this version, emphasize:
- Lead with a surprising statistic or metric
- Use numbers and percentages
- Before/after comparisons
- Industry benchmarks
- Results-oriented language

The hook should be a striking data point that makes people stop scrolling.`;
}

/**
 * Build a question-based variant (engagement-focused)
 */
export function buildLinkedInQuestionVariant(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile,
  articleTitle: string,
  articleUrl: string
): string {
  const basePrompt = buildLinkedInPrompt(
    contextPack,
    plan,
    task,
    tone,
    articleTitle,
    articleUrl
  );

  return `${basePrompt}

# VARIANT: QUESTION-BASED
For this version, emphasize:
- Open with a thought-provoking question
- Address a common pain point as a question
- Invite discussion and opposing views
- End with a second question to drive comments
- Make it feel like the start of a conversation

The hook should be a question that your target audience has asked themselves.`;
}

// ============================================================================
// CAROUSEL PROMPT (for LinkedIn document posts)
// ============================================================================

export function buildLinkedInCarouselPrompt(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile,
  articleTitle: string,
  slideCount: number = 8
): string {
  const toneInstructions = getToneInstructions(tone);

  return `# ROLE
You are creating a LinkedIn carousel (document post) that summarizes a article's key points in a scannable, swipe-friendly format.

# ARTICLE BEING SUMMARIZED
Title: "${articleTitle}"
Topic: ${plan.h1}
${plan.sections?.map((s) => `- ${s.heading}`).join('\n')}

# TONE
${toneInstructions.join('\n')}

# CAROUSEL STRUCTURE (${slideCount} slides)

## Slide 1: Hook/Cover
- Bold statement or question
- Article title or topic
- Clear value proposition

## Slides 2-${slideCount - 2}: Content Slides
- One key point per slide
- 3-5 bullet points max
- Large, scannable text
- Include one stat or proof per slide if available

## Slide ${slideCount - 1}: Summary/Recap
- Quick recap of key points
- 3-4 bullets maximum

## Slide ${slideCount}: CTA
- Clear next step
- Where to learn more
- Engagement prompt

# OUTPUT FORMAT
Return JSON with:
{
  "slides": [
    {
      "slideNumber": 1,
      "headline": "string",
      "bullets": ["string"],
      "visualSuggestion": "string - e.g., icon, image placeholder"
    }
  ],
  "postCaption": "string - The post text that accompanies the carousel",
  "hashtags": ["string"]
}

Generate the carousel content now:`;
}
