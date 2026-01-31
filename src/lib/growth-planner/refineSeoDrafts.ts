// ============================================================================
// REFINE SEO DRAFTS FOR GROWTH PLAN
// ============================================================================
// At plan-build time, generates refined SEO titles, H1s, meta descriptions,
// and heading contracts for each task. These become the source of truth for the writer.
//
// CRITICAL: All SEO options are SCORED at generation time, sorted by score DESC,
// and the best option is auto-selected as default. The Growth Planner never
// emits unranked SEO options.
// ============================================================================

import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import type { GrowthTask, GrowthPlanMonth, PersonalizedGrowthPlan, RequiredHeading, HeadingType } from './types';
import { 
  detectPageIntent, 
  scoreHeadingSet, 
  SCORE_FLOORS,
  type PageIntent as ScorerPageIntent,
  type ScoredHeadingSet,
  type ScoreInputs 
} from '../writer/seoHeadingScorer';

// ============================================================================
// TYPES
// ============================================================================

export interface SeoDrafts {
  seoTitleDraft: string;
  h1Draft: string;
  metaDescriptionDraft: string;
}

export interface SeoOptions {
  /** 3 CTR-focused SEO title options - SORTED BY SCORE DESC */
  seoTitleOptions: string[];
  /** Scores for each title option (parallel array) */
  seoTitleScores?: number[];
  /** 2 natural H1 options - SORTED BY SCORE DESC */
  h1Options: string[];
  /** Scores for each H1 option (parallel array) */
  h1Scores?: number[];
  /** 2 meta description options */
  metaDescriptionOptions: string[];
  /** Default draft (BEST scored option, not just first) */
  seoTitleDraft: string;
  h1Draft: string;
  metaDescriptionDraft: string;
  /** Locked until user selects */
  seoLocked: boolean;
  /** Detected page intent for scoring context */
  detectedIntent?: ScorerPageIntent;
  /** Best title score (for quality gate) */
  bestTitleScore?: number;
  /** Best H1 score (for quality gate) */
  bestH1Score?: number;
}

export type PageIntent = 'money' | 'service' | 'support' | 'geo' | 'trust';

export interface HeadingContract {
  pageIntent: PageIntent;
  primaryKeyword: string;
  geoTargets: string[];
  requiredHeadings: RequiredHeading[];
  visionRequired: boolean;
  mustIncludeFactsMin: number;
}

export interface RefineSeoDraftsInput {
  /** Either a full plan or just months array */
  plan?: PersonalizedGrowthPlan;
  months?: GrowthPlanMonth[];
  businessName: string;
  geo?: string;
  openaiApiKey?: string;
}

// ============================================================================
// PROMPT LOADER
// ============================================================================

function loadPrompt(): string {
  const promptPath = path.join(__dirname, 'prompts', 'seo-drafts.prompt.md');
  try {
    return fs.readFileSync(promptPath, 'utf8');
  } catch {
    // Fallback if file not found (e.g., in bundled environments)
    return getInlinePrompt();
  }
}

function getInlinePrompt(): string {
  return `Return JSON with MULTIPLE OPTIONS for user selection:
{
  "seoTitleOptions": ["...", "...", "..."],
  "h1Options": ["...", "..."],
  "metaDescriptionOptions": ["...", "..."]
}

RULES FOR SEO TITLES (generate 3 distinct options):
- Max 60 chars each
- Include focusKeyword and geo
- Reflect intent (money=buy words, support=learn words)
- End with | BrandName
- Option 1: Direct/transactional ("Get X in Location")
- Option 2: Question-based ("Looking for X in Location?")
- Option 3: Benefit-led ("Expert X That Does Y | Brand")
- NO generic patterns: "Services", "Guide to", "Ultimate", "Everything"

RULES FOR H1s (generate 2 distinct options):
- Max 70 chars each
- Include focusKeyword naturally
- Different from SEO title
- NOT keyword-stuffed
- Option 1: Statement format
- Option 2: Action/benefit format

RULES FOR META DESCRIPTIONS (generate 2 options):
- 120-155 chars each
- Include focusKeyword EXACTLY
- Include CTA and geo
- Option 1: Feature-focused
- Option 2: Outcome-focused

Do NOT invent facts.`;
}

// ============================================================================
// SEO DRAFTS GENERATOR
// ============================================================================

export async function refineSeoDraftsForTask(
  task: GrowthTask,
  businessName: string,
  geo: string | undefined,
  openai: OpenAI
): Promise<SeoOptions> {
  const promptTemplate = loadPrompt();
  
  // Map task role/intent to prompt intent
  const intent = mapTaskToIntent(task);
  
  const input = {
    businessName,
    intent,
    pageRole: task.role,
    focusKeyword: task.title, // Using title as primary keyword for now
    geo: geo || task.primaryLocation,
    url: task.slug,
    titleCurrent: task.title,
    searchIntent: task.searchIntent,
    action: task.action,
  };

  const prompt = `${promptTemplate}\n\n### INPUT (JSON)\n${JSON.stringify(input, null, 2)}\n`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an SEO specialist. Return only valid JSON. No markdown, no explanation.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5, // Slightly higher for variety in options
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    // Handle both old format (single drafts) and new format (options arrays)
    const rawOptions: SeoOptions = normalizeToSeoOptions(parsed, businessName);
    
    // CRITICAL: Score and sort options before returning
    // This ensures Growth Planner never emits unranked SEO options
    const scoredOptions = scoreAndSortOptions(rawOptions, task, geo);
    
    console.log(`[RefineSeoDrafts] Task "${task.title}" scored: title=${scoredOptions.bestTitleScore}, h1=${scoredOptions.bestH1Score}`);
    
    return scoredOptions;
  } catch (error) {
    console.error('[RefineSeoDrafts] Error generating drafts for task:', task.id, error);
    
    // Fallback: generate basic drafts from task data (also scored)
    const fallback = generateFallbackOptions(task, businessName, geo);
    return scoreAndSortOptions(fallback, task, geo);
  }
}

/**
 * Normalize response to SeoOptions format (handles both old and new formats)
 */
function normalizeToSeoOptions(parsed: any, businessName: string): SeoOptions {
  // If new format with options arrays
  if (parsed.seoTitleOptions && Array.isArray(parsed.seoTitleOptions)) {
    const seoTitleOptions = parsed.seoTitleOptions.slice(0, 3);
    const h1Options = parsed.h1Options?.slice(0, 2) || [seoTitleOptions[0]];
    const metaDescriptionOptions = parsed.metaDescriptionOptions?.slice(0, 2) || [];
    
    // Ensure we have at least the minimum options
    while (seoTitleOptions.length < 3) {
      seoTitleOptions.push(seoTitleOptions[0] || 'Untitled');
    }
    while (h1Options.length < 2) {
      h1Options.push(h1Options[0] || seoTitleOptions[0]);
    }
    while (metaDescriptionOptions.length < 2) {
      metaDescriptionOptions.push(metaDescriptionOptions[0] || '');
    }
    
    return {
      seoTitleOptions,
      h1Options,
      metaDescriptionOptions,
      seoTitleDraft: seoTitleOptions[0],
      h1Draft: h1Options[0],
      metaDescriptionDraft: metaDescriptionOptions[0],
      seoLocked: true, // Locked until user selects
    };
  }
  
  // Old format with single drafts - convert to options
  const seoTitleDraft = parsed.seoTitleDraft || parsed.seoTitle || 'Untitled';
  const h1Draft = parsed.h1Draft || parsed.h1 || seoTitleDraft;
  const metaDescriptionDraft = parsed.metaDescriptionDraft || parsed.metaDescription || '';
  
  return {
    seoTitleOptions: [seoTitleDraft, seoTitleDraft, seoTitleDraft],
    h1Options: [h1Draft, h1Draft],
    metaDescriptionOptions: [metaDescriptionDraft, metaDescriptionDraft],
    seoTitleDraft,
    h1Draft,
    metaDescriptionDraft,
    seoLocked: true,
  };
}

function mapTaskToIntent(task: GrowthTask): string {
  if (task.role === 'money') return 'MONEY';
  if (task.role === 'trust') return 'TRUST';
  if (task.searchIntent === 'compare') return 'COMPARE';
  if (task.searchIntent === 'learn') return 'LEARN';
  return 'INFORMATIONAL';
}

// ============================================================================
// SCORING & SORTING - CRITICAL QUALITY GATE
// ============================================================================
// Every heading list is scored at generation time, sorted by score DESC,
// and the best option is auto-selected. Low-quality options trigger warnings.
// ============================================================================

const MINIMUM_SCORE_THRESHOLD = 58; // Below this, log warning (not hard fail for now)

interface ScoredOption {
  text: string;
  score: number;
}

/**
 * Score and sort SEO options. This is THE critical step that ensures
 * Growth Planner never emits unranked, unvalidated SEO options.
 * 
 * GUARANTEES:
 * 1. Options are sorted by score DESC
 * 2. Best option is auto-selected as the draft
 * 3. Scores are attached for UI display
 * 4. Low scores trigger console warnings
 */
function scoreAndSortOptions(
  options: SeoOptions, 
  task: GrowthTask,
  geo: string | undefined
): SeoOptions {
  // Use the best available source for keyword context
  const keyword = task.primaryKeyword || task.title;
  const location = geo || task.primaryLocation || '';
  
  // Detect intent from the first title option
  const sampleTitle = options.seoTitleOptions[0] || keyword;
  const detectedIntent = detectPageIntent(sampleTitle);
  
  console.log(`[SEO Scorer] Task "${task.title}" → intent: ${detectedIntent}`);
  
  // Build ScoreInputs for titles
  const titleInputs: ScoreInputs = {
    focusKeyword: keyword,
    location,
    headingType: 'title',
    intent: detectedIntent,
  };
  
  // Build ScoreInputs for H1s
  const h1Inputs: ScoreInputs = {
    focusKeyword: keyword,
    location,
    headingType: 'h1',
    intent: detectedIntent,
  };
  
  // Score titles - returns ScoredHeadingSet with sorted results
  const scoredTitles: ScoredHeadingSet = scoreHeadingSet(
    options.seoTitleOptions,
    titleInputs
  );
  
  // Score H1s
  const scoredH1s: ScoredHeadingSet = scoreHeadingSet(
    options.h1Options,
    h1Inputs
  );
  
  // Results are already sorted by score DESC in scoreHeadingSet
  const seoTitleOptions = scoredTitles.results.map(r => r.text);
  const seoTitleScores = scoredTitles.results.map(r => r.score);
  const h1Options = scoredH1s.results.map(r => r.text);
  const h1Scores = scoredH1s.results.map(r => r.score);
  
  // Best scores (first in sorted array)
  const bestTitleScore = scoredTitles.best?.score || 0;
  const bestH1Score = scoredH1s.best?.score || 0;
  
  // Quality gate logging (warning, not hard fail for MVP)
  if (bestTitleScore < MINIMUM_SCORE_THRESHOLD) {
    console.warn(
      `[SEO Scorer] ⚠️ Task "${task.title}" best title score ${bestTitleScore} < ${MINIMUM_SCORE_THRESHOLD}. ` +
      `Intent: ${detectedIntent}. Options may need improvement.`
    );
  }
  if (bestH1Score < MINIMUM_SCORE_THRESHOLD) {
    console.warn(
      `[SEO Scorer] ⚠️ Task "${task.title}" best H1 score ${bestH1Score} < ${MINIMUM_SCORE_THRESHOLD}. ` +
      `Intent: ${detectedIntent}. Options may need improvement.`
    );
  }
  
  // Return scored, sorted options with best as draft
  return {
    ...options,
    seoTitleOptions,
    seoTitleScores,
    h1Options,
    h1Scores,
    // Best option is now the draft (index 0 after sort)
    seoTitleDraft: scoredTitles.recommended || options.seoTitleDraft,
    h1Draft: scoredH1s.recommended || options.h1Draft,
    // Keep meta description as-is (scored separately in UI if needed)
    metaDescriptionDraft: options.metaDescriptionOptions[0] || options.metaDescriptionDraft,
    seoLocked: true,
    detectedIntent,
    bestTitleScore,
    bestH1Score,
  };
}

/**
 * Map task role/intent to PageIntent for heading contract
 */
function mapTaskToPageIntent(task: GrowthTask): PageIntent {
  if (task.role === 'money') return 'money';
  if (task.role === 'trust') return 'trust';
  if (task.searchIntent === 'compare') return 'service';
  if (task.primaryLocation) return 'geo';
  return 'support';
}

/**
 * Generate required headings based on page intent
 */
function generateRequiredHeadings(pageIntent: PageIntent, hasVision: boolean): RequiredHeading[] {
  const baseHeadings: Record<PageIntent, RequiredHeading[]> = {
    money: [
      { level: 2, type: 'intent', textHint: 'Who this is for and what problem it solves' },
      { level: 2, type: 'evidence', textHint: 'What we\'ve seen in practice (real examples)' },
      { level: 2, type: 'process', textHint: 'How it works / our approach' },
      { level: 2, type: 'pricing', textHint: 'Investment / pricing factors', optional: true },
      { level: 2, type: 'faq', textHint: 'Frequently Asked Questions' },
      { level: 2, type: 'cta', textHint: 'Next steps / how to get started' },
    ],
    service: [
      { level: 2, type: 'intent', textHint: 'What this service covers' },
      { level: 2, type: 'comparison', textHint: 'How it compares / what to consider' },
      { level: 2, type: 'evidence', textHint: 'Results we\'ve achieved' },
      { level: 2, type: 'process', textHint: 'How we deliver this service' },
      { level: 2, type: 'faq', textHint: 'Common questions answered' },
    ],
    support: [
      { level: 2, type: 'intent', textHint: 'What you\'ll learn in this guide' },
      { level: 2, type: 'process', textHint: 'Step-by-step breakdown' },
      { level: 2, type: 'evidence', textHint: 'Examples from our experience', optional: true },
      { level: 2, type: 'faq', textHint: 'Related questions' },
    ],
    geo: [
      { level: 2, type: 'geo', textHint: 'Why location matters for this service' },
      { level: 2, type: 'intent', textHint: 'What we offer in this area' },
      { level: 2, type: 'evidence', textHint: 'Local examples and case studies' },
      { level: 2, type: 'process', textHint: 'How we work in this area' },
      { level: 2, type: 'faq', textHint: 'Local FAQs' },
    ],
    trust: [
      { level: 2, type: 'trust', textHint: 'Our background and credentials' },
      { level: 2, type: 'evidence', textHint: 'Track record and achievements' },
      { level: 2, type: 'process', textHint: 'How we work with clients' },
      { level: 2, type: 'cta', textHint: 'Get in touch' },
    ],
  };

  const headings = [...baseHeadings[pageIntent]];
  
  // If vision evidence is expected, ensure evidence section is required (not optional)
  if (hasVision) {
    const evidenceIdx = headings.findIndex(h => h.type === 'evidence');
    if (evidenceIdx >= 0) {
      headings[evidenceIdx] = { ...headings[evidenceIdx], optional: false };
    }
  }

  return headings;
}

/**
 * Generate heading contract for a task
 */
export function generateHeadingContract(
  task: GrowthTask,
  geo?: string
): HeadingContract {
  const pageIntent = mapTaskToPageIntent(task);
  const hasVision = Boolean(task.imagePackId || task.visionFacts?.length);
  
  // Extract geo targets
  const geoTargets: string[] = [];
  if (geo) geoTargets.push(geo);
  if (task.primaryLocation && !geoTargets.includes(task.primaryLocation)) {
    geoTargets.push(task.primaryLocation);
  }
  
  // Generate required headings based on intent
  const requiredHeadings = generateRequiredHeadings(pageIntent, hasVision);
  
  // Determine vision requirement based on page type
  const visionRequired = pageIntent === 'money' || pageIntent === 'trust' || hasVision;
  
  // Set minimum facts based on vision availability
  const mustIncludeFactsMin = hasVision ? 3 : 0;

  return {
    pageIntent,
    primaryKeyword: task.primaryService || task.title,
    geoTargets,
    requiredHeadings,
    visionRequired,
    mustIncludeFactsMin,
  };
}

function generateFallbackOptions(
  task: GrowthTask,
  businessName: string,
  geo: string | undefined
): SeoOptions {
  const location = geo || task.primaryLocation || '';
  const locationSuffix = location ? ` in ${location}` : '';
  
  // Generate based on role
  let titlePrefix = '';
  let h1Prefix = '';
  
  switch (task.role) {
    case 'money':
      titlePrefix = task.primaryService || task.title;
      h1Prefix = `Professional ${task.primaryService || task.title}`;
      break;
    case 'trust':
      titlePrefix = task.title;
      h1Prefix = task.title;
      break;
    default:
      titlePrefix = task.title;
      h1Prefix = task.title;
  }

  const seoTitle1 = `${titlePrefix}${locationSuffix} | ${businessName}`.slice(0, 60);
  const seoTitle2 = `Get ${titlePrefix}${locationSuffix} | ${businessName}`.slice(0, 60);
  const seoTitle3 = `Expert ${titlePrefix}${locationSuffix} | ${businessName}`.slice(0, 60);
  
  const h1_1 = `${h1Prefix}${locationSuffix}`.slice(0, 70);
  const h1_2 = `Your ${h1Prefix}${locationSuffix}`.slice(0, 70);
  
  const meta1 = `${task.title}${locationSuffix}. ${task.conversionPath || 'Contact us today.'}`.slice(0, 155);
  const meta2 = `Looking for ${task.title.toLowerCase()}${locationSuffix}? ${task.conversionPath || 'Get in touch.'}`.slice(0, 155);

  return {
    seoTitleOptions: [seoTitle1, seoTitle2, seoTitle3],
    h1Options: [h1_1, h1_2],
    metaDescriptionOptions: [meta1, meta2],
    seoTitleDraft: seoTitle1,
    h1Draft: h1_1,
    metaDescriptionDraft: meta1,
    seoLocked: true,
  };
}

// ============================================================================
// BATCH PROCESSOR
// ============================================================================

/**
 * Refine SEO drafts for a plan or months array
 * Returns refined months array (not full plan)
 */
export async function refineSeoDraftsForPlan(
  input: RefineSeoDraftsInput
): Promise<GrowthPlanMonth[]> {
  const { plan, months: inputMonths, businessName, geo, openaiApiKey } = input;
  
  // Support both plan.months and direct months array
  const months = plan?.months || inputMonths;
  if (!months || months.length === 0) {
    console.warn('[RefineSeoDrafts] No months to process');
    return [];
  }
  
  const openai = new OpenAI({
    apiKey: openaiApiKey || process.env.OPENAI_API_KEY,
  });

  console.log('[RefineSeoDrafts] Processing', 
    months.reduce((acc, m) => acc + m.tasks.length, 0), 'tasks');

  // Process all months and tasks
  const refinedMonths = await Promise.all(
    months.map(async (month) => {
      const refinedTasks = await Promise.all(
        month.tasks.map(async (task) => {
          // Skip if already has SCORED options AND heading contract
          // (bestTitleScore presence indicates scoring was done)
          if (task.seoTitleOptions && 
              task.seoTitleOptions.length >= 3 && 
              task.requiredHeadings &&
              typeof task.bestTitleScore === 'number') {
            return task;
          }
          
          // Generate SEO options (unless already present)
          let options: SeoOptions;
          
          if (!task.seoTitleOptions || task.seoTitleOptions.length < 3) {
            // Generate fresh options (scoring is done inside refineSeoDraftsForTask)
            options = await refineSeoDraftsForTask(task, businessName, geo, openai);
          } else {
            // Options exist but aren't scored yet - score them now
            const rawOptions: SeoOptions = {
              seoTitleOptions: task.seoTitleOptions,
              h1Options: task.h1Options || [],
              metaDescriptionOptions: task.metaDescriptionOptions || [],
              seoTitleDraft: task.seoTitleDraft || task.seoTitleOptions[0] || '',
              h1Draft: task.h1Draft || (task.h1Options?.[0]) || '',
              metaDescriptionDraft: task.metaDescriptionDraft || (task.metaDescriptionOptions?.[0]) || '',
              seoLocked: task.seoLocked ?? true,
            };
            options = scoreAndSortOptions(rawOptions, task, geo);
          }
          
          // Generate heading contract
          const headingContract = generateHeadingContract(task, geo);
          
          return {
            ...task,
            // Spread scored SEO options (includes scores, sorted arrays, detected intent)
            ...options,
            // Heading contract fields
            pageIntent: headingContract.pageIntent,
            primaryKeyword: headingContract.primaryKeyword,
            geoTargets: headingContract.geoTargets,
            requiredHeadings: headingContract.requiredHeadings,
            visionRequired: headingContract.visionRequired,
            mustIncludeFactsMin: headingContract.mustIncludeFactsMin,
            // Initialize selection state (preserve existing or default to best = index 0)
            selectedSeoTitleIndex: task.selectedSeoTitleIndex ?? 0,
            selectedH1Index: task.selectedH1Index ?? 0,
            selectedMetaIndex: task.selectedMetaIndex ?? 0,
          };
        })
      );

      return {
        ...month,
        tasks: refinedTasks,
      };
    })
  );

  console.log('[RefineSeoDrafts] Completed SEO draft refinement with heading contracts');

  return refinedMonths;
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateSeoDrafts(task: GrowthTask): {
  valid: boolean;
  missing: string[];
  selectionRequired: boolean;
} {
  const missing: string[] = [];
  
  if (!task.seoTitleDraft && (!task.seoTitleOptions || task.seoTitleOptions.length === 0)) {
    missing.push('seoTitleDraft or seoTitleOptions');
  }
  if (!task.h1Draft && (!task.h1Options || task.h1Options.length === 0)) {
    missing.push('h1Draft or h1Options');
  }
  if (!task.metaDescriptionDraft && (!task.metaDescriptionOptions || task.metaDescriptionOptions.length === 0)) {
    missing.push('metaDescriptionDraft or metaDescriptionOptions');
  }

  // Check if selection is required (options exist but not selected)
  const selectionRequired = Boolean(
    task.seoTitleOptions && 
    task.seoTitleOptions.length > 0 && 
    task.selectedSeoTitleIndex === null
  );

  return {
    valid: missing.length === 0,
    missing,
    selectionRequired,
  };
}

/**
 * Get the effective SEO values (selected or default)
 */
export function getEffectiveSeoValues(task: GrowthTask): {
  seoTitle: string;
  h1: string;
  metaDescription: string;
} {
  // If options exist and selection made, use selected
  const seoTitle = typeof task.selectedSeoTitleIndex === 'number' && task.seoTitleOptions
    ? task.seoTitleOptions[task.selectedSeoTitleIndex] || task.seoTitleDraft || ''
    : task.seoTitleDraft || '';
    
  const h1 = typeof task.selectedH1Index === 'number' && task.h1Options
    ? task.h1Options[task.selectedH1Index] || task.h1Draft || ''
    : task.h1Draft || '';
    
  const metaDescription = typeof task.selectedMetaIndex === 'number' && task.metaDescriptionOptions
    ? task.metaDescriptionOptions[task.selectedMetaIndex] || task.metaDescriptionDraft || ''
    : task.metaDescriptionDraft || '';

  return { seoTitle, h1, metaDescription };
}
