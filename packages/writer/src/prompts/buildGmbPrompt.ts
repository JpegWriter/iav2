// ============================================================================
// GOOGLE BUSINESS PROFILE (GMB) PROMPT BUILDER
// ============================================================================
// Builds the Google Business Profile post prompt.
// Optimized for local SEO and GMB's constraints.
// ============================================================================

import type { ContextPack, WriterPlan, WriterTask, BrandToneProfile } from '../types';
import { getToneInstructions, getPlatformAdjustment } from '../tones/profiles';

// ============================================================================
// GMB POST TYPES
// ============================================================================

export type GmbPostType = 'update' | 'offer' | 'event' | 'product';

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const OUTPUT_SCHEMA = `{
  "platform": "gmb",
  "postType": "update | offer | event | product",
  "content": "string - 100-300 words (GMB truncates after ~100 words on mobile)",
  "hashtags": [] - GMB doesn't use hashtags,
  "mentionSuggestions": [] - Not applicable,
  "imageRef": "string - Reference to image or PLACEHOLDER:description",
  "schedulingHint": "string - Best posting time/frequency",
  "callToAction": {
    "type": "LEARN_MORE | BOOK | ORDER | CALL | GET_OFFER | GET_DIRECTIONS",
    "url": "string - The CTA link"
  }
}`;

// ============================================================================
// CTA TYPES
// ============================================================================

const GBM_CTA_TYPES = {
  LEARN_MORE: 'Link to article or information page',
  BOOK: 'Link to booking/appointment page',
  ORDER: 'Link to order/purchase page',
  CALL: 'Phone number link',
  GET_OFFER: 'Link to offer/discount page',
  GET_DIRECTIONS: 'Link to Google Maps location',
};

// ============================================================================
// MAIN PROMPT BUILDER
// ============================================================================

export function buildGmbPrompt(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile,
  articleTitle: string,
  articleUrl: string,
  postType: GmbPostType = 'update'
): string {
  const adjustment = getPlatformAdjustment('gmb');
  const toneInstructions = getToneInstructions(tone);

  // Build context
  const businessContext = buildLocalBusinessContext(contextPack);
  const locationContext = buildLocationContext(contextPack);
  const serviceContext = buildServiceContext(contextPack, task);

  return `# ROLE
You are a local SEO specialist creating a Google Business Profile post. You understand:
- GMB posts appear in local search and Maps
- Mobile-first display (first ~100 words visible)
- Local intent signals boost local pack rankings
- CTAs drive direct actions (calls, directions, website visits)

# TASK
Create a ${postType.toUpperCase()} post promoting:
Title: "${articleTitle}"
URL: ${articleUrl}
Post Type: ${postType}

# TONE & VOICE
${toneInstructions.join('\n')}

# GMB-SPECIFIC ADJUSTMENTS
- Character limit: ${adjustment?.characterLimit || 1500} (but first 100 words most important)
- No hashtags on GMB
- Emoji usage: ${adjustment?.emojiAllowed ? 'minimal' : 'none'} (0-1 emojis)
- Formality: Friendly but professional
- Local focus: Essential

# BUSINESS CONTEXT
${businessContext}

# LOCATION SIGNALS (Include These)
${locationContext}

# SERVICE CONTEXT
${serviceContext}

# GMB POST STRUCTURE

## First 100 Words (CRITICAL - Shows on Mobile)
- Lead with location + service/topic
- Mention specific service area or neighborhood
- Include main value proposition
- This is what appears in search results

## Full Post Body (100-300 words)
- Expand on the key benefit
- Include specific local references
- Mention any relevant proof (years in business, customers served)
- Natural mention of article topic

## Call to Action
Available CTA types:
${Object.entries(GBM_CTA_TYPES)
  .map(([type, desc]) => `- ${type}: ${desc}`)
  .join('\n')}

Choose the most appropriate CTA for this content.

# LOCAL SEO REQUIREMENTS

## Must Include:
1. City/area name in first sentence
2. Primary service keyword
3. Local differentiator (years serving area, local knowledge, etc.)

## Should Include:
- Neighborhood or landmark references
- "Near [landmark]" or "serving [area]" phrases
- Local phone number or address mention if relevant

## Avoid:
- Generic content that could apply anywhere
- Over-optimization (keyword stuffing)
- Promotional language that feels spammy
- Multiple CTAs (GMB only shows one)

# POST TYPE SPECIFIC GUIDANCE

${getPostTypeGuidance(postType)}

# OUTPUT FORMAT
Return ONLY valid JSON matching this schema:
${OUTPUT_SCHEMA}

Generate the GMB post now:`;
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

function buildLocalBusinessContext(contextPack: ContextPack): string {
  const biz = contextPack.businessReality;
  if (!biz) {
    return 'Business context not available. Focus on general local service language.';
  }

  const lines = [];

  lines.push(`Business: ${biz.name || 'Local Business'}`);

  if (biz.services && biz.services.length > 0) {
    lines.push(`Services: ${biz.services.slice(0, 5).join(', ')}`);
  }

  if (biz.differentiators && biz.differentiators.length > 0) {
    lines.push(`Differentiators: ${biz.differentiators.slice(0, 3).join(', ')}`);
  }

  return lines.join('\n');
}

function buildLocationContext(contextPack: ContextPack): string {
  const lines = [];
  const local = contextPack.localSignals;

  if (!local) {
    return 'No specific location data. Use general local service language.';
  }

  if (local.locations && local.locations.length > 0) {
    lines.push(`Primary Locations: ${local.locations.join(', ')}`);
  }

  if (local.serviceAreas && local.serviceAreas.length > 0) {
    lines.push(`Service Areas: ${local.serviceAreas.slice(0, 5).join(', ')}`);
  }

  if (local.localPhrasing && local.localPhrasing.length > 0) {
    lines.push(`Local Phrases: ${local.localPhrasing.join(', ')}`);
  }

  if (lines.length === 0) {
    return 'No specific location data. Use general local service language.';
  }

  return lines.join('\n');
}

function buildServiceContext(contextPack: ContextPack, task: WriterTask): string {
  const lines = [];

  lines.push(`Primary Service: ${task.primaryService}`);

  if (task.role) {
    lines.push(`Page Role: ${task.role}`);
  }

  // Add related services if available
  const biz = contextPack.businessReality;
  if (biz?.services) {
    const relatedServices = biz.services
      .filter((s) => s !== task.primaryService)
      .slice(0, 3);
    if (relatedServices.length > 0) {
      lines.push(`Related Services: ${relatedServices.join(', ')}`);
    }
  }

  return lines.join('\n');
}

function getPostTypeGuidance(postType: GmbPostType): string {
  switch (postType) {
    case 'update':
      return `## UPDATE Post
- Share news, tips, or information
- Educational content works well
- Timely/seasonal references boost engagement
- Best CTA: LEARN_MORE or CALL`;

    case 'offer':
      return `## OFFER Post
- Include clear offer details (% off, $ amount, etc.)
- Set urgency with expiration
- Be specific about what's included
- Best CTA: GET_OFFER or BOOK`;

    case 'event':
      return `## EVENT Post
- Include date, time, location
- What attendees will gain
- Registration details if applicable
- Best CTA: BOOK or LEARN_MORE`;

    case 'product':
      return `## PRODUCT Post
- Highlight specific product/service
- Include pricing if appropriate
- Benefits over features
- Best CTA: ORDER or LEARN_MORE`;

    default:
      return '';
  }
}

// ============================================================================
// SPECIALIZED GMB POST BUILDERS
// ============================================================================

/**
 * Build a seasonal/holiday GMB post
 */
export function buildGmbSeasonalPrompt(
  contextPack: ContextPack,
  task: WriterTask,
  tone: BrandToneProfile,
  season: string,
  specialOffer?: string
): string {
  const toneInstructions = getToneInstructions(tone);
  const businessContext = buildLocalBusinessContext(contextPack);
  const locationContext = buildLocationContext(contextPack);

  return `# ROLE
You are creating a seasonal Google Business Profile post for ${season}.

# BUSINESS CONTEXT
${businessContext}

# LOCATION
${locationContext}

# SERVICE
Primary: ${task.primaryService}

# TONE
${toneInstructions.join('\n')}

# SEASONAL ANGLE
Season/Holiday: ${season}
${specialOffer ? `Special Offer: ${specialOffer}` : 'No special offer - focus on seasonal relevance'}

# REQUIREMENTS
- Connect ${task.primaryService} to ${season}
- Include local area name in first sentence
- If offer provided, make it prominent
- Urgency/timeliness messaging

# OUTPUT FORMAT
Return JSON matching GMB post schema with postType: "${specialOffer ? 'offer' : 'update'}"`;
}

/**
 * Build a "problem solver" GMB post
 */
export function buildGmbProblemSolverPrompt(
  contextPack: ContextPack,
  task: WriterTask,
  tone: BrandToneProfile,
  problemStatement: string,
  articleUrl: string
): string {
  const toneInstructions = getToneInstructions(tone);
  const businessContext = buildLocalBusinessContext(contextPack);
  const locationContext = buildLocationContext(contextPack);

  return `# ROLE
You are creating a problem-solution Google Business Profile post.

# PROBLEM TO ADDRESS
"${problemStatement}"

# BUSINESS CONTEXT
${businessContext}

# LOCATION
${locationContext}

# SOLUTION
Primary Service: ${task.primaryService}
Learn More: ${articleUrl}

# TONE
${toneInstructions.join('\n')}

# STRUCTURE
1. Open with the problem (relatable, local if possible)
2. Brief agitation (consequences of not solving)
3. Solution introduction (your service)
4. Local credibility mention
5. CTA to learn more

# OUTPUT FORMAT
Return JSON matching GMB post schema with postType: "update"`;
}

/**
 * Build a review response follow-up GMB post
 */
export function buildGmbReviewFollowUpPrompt(
  contextPack: ContextPack,
  task: WriterTask,
  tone: BrandToneProfile,
  reviewHighlight: string,
  reviewerName?: string
): string {
  const toneInstructions = getToneInstructions(tone);
  const businessContext = buildLocalBusinessContext(contextPack);
  const locationContext = buildLocationContext(contextPack);

  return `# ROLE
You are creating a GMB post that subtly highlights a great review without being too promotional.

# REVIEW TO REFERENCE
"${reviewHighlight}"
${reviewerName ? `- ${reviewerName}` : ''}

# BUSINESS CONTEXT
${businessContext}

# LOCATION
${locationContext}

# SERVICE
${task.primaryService}

# TONE
${toneInstructions.join('\n')}

# APPROACH
- Don't just quote the review directly
- Use it as a jumping-off point
- "Our customers love that we..." or "What matters most to our [Location] clients..."
- Connect to specific service benefit
- Humble, grateful tone

# OUTPUT FORMAT
Return JSON matching GMB post schema with postType: "update"`;
}
