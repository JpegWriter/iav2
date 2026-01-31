// ============================================================================
// TASK ENRICHMENT WITH RESEARCH
// ============================================================================
// Utility to enrich Growth Tasks with AEO + GEO research packs
// Can be called at plan-time (batch) or brief-time (single task)
// ============================================================================

import { buildResearchPack, type BuildResearchPackOptions } from './buildResearchPack';
import type { ResearchRequest, ResearchPack, PageIntent } from './types';

// ============================================================================
// TYPES - Compatible with growth-planner GrowthTask
// ============================================================================

export interface TaskLike {
  id: string;
  title: string;
  slug: string;
  primaryService: string;
  primaryLocation: string | null;
  searchIntent: 'buy' | 'compare' | 'trust' | 'learn';
  role: 'money' | 'support' | 'trust' | 'authority';
  targetAudience?: string;
  researchPack?: ResearchPack;
}

export interface EnrichTaskOptions extends BuildResearchPackOptions {
  /** Business niche for context */
  niche?: string;
  /** Skip if task already has a researchPack */
  skipIfExists?: boolean;
}

export interface EnrichBatchOptions extends EnrichTaskOptions {
  /** Maximum concurrent research requests (default: 2) */
  concurrency?: number;
  /** Callback for progress updates */
  onProgress?: (completed: number, total: number, currentTask: string) => void;
}

export interface EnrichResult<T extends TaskLike> {
  task: T;
  success: boolean;
  error?: string;
  cached: boolean;
}

// ============================================================================
// SINGLE TASK ENRICHMENT
// ============================================================================

/**
 * Enrich a single task with research pack
 */
export async function enrichTaskWithResearch<T extends TaskLike>(
  task: T,
  options: EnrichTaskOptions = {}
): Promise<EnrichResult<T>> {
  const { skipIfExists = true, niche, ...packOptions } = options;

  // Skip if already has research
  if (skipIfExists && task.researchPack) {
    console.log(`[EnrichTask] Skipping ${task.slug} - already has research`);
    return {
      task,
      success: true,
      cached: true,
    };
  }

  console.log(`[EnrichTask] Enriching: ${task.title}`);

  // Map task intent to research intent
  const intentMap: Record<string, PageIntent> = {
    'buy': 'MONEY',
    'compare': 'SERVICE',
    'trust': 'TRUST',
    'learn': 'INFORMATIONAL',
  };
  const researchIntent = intentMap[task.searchIntent] || 'INFORMATIONAL';

  // Build research request from task
  const request: ResearchRequest = {
    businessName: niche || task.primaryService,
    focusKeyword: task.primaryService,
    service: task.primaryService,
    geoPrimary: task.primaryLocation || undefined,
    intent: researchIntent,
    pageRole: task.role,
  };

  try {
    const pack = await buildResearchPack(request, packOptions);

    // Enrich task with research pack
    const enrichedTask: T = {
      ...task,
      researchPack: pack,
    };

    return {
      task: enrichedTask,
      success: true,
      cached: pack.cache.fromCache,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[EnrichTask] Failed to enrich ${task.slug}:`, errorMessage);

    return {
      task,
      success: false,
      error: errorMessage,
      cached: false,
    };
  }
}

// ============================================================================
// BATCH TASK ENRICHMENT
// ============================================================================

/**
 * Enrich multiple tasks with research packs
 * Respects API rate limits with controlled concurrency
 */
export async function enrichTasksWithResearch<T extends TaskLike>(
  tasks: T[],
  options: EnrichBatchOptions = {}
): Promise<EnrichResult<T>[]> {
  const { concurrency = 2, onProgress, ...taskOptions } = options;

  console.log(`[EnrichTask] Batch enriching ${tasks.length} tasks (concurrency: ${concurrency})`);

  const results: EnrichResult<T>[] = [];
  let completed = 0;

  // Process in batches to respect rate limits
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    
    const batchResults = await Promise.all(
      batch.map(task => enrichTaskWithResearch(task, taskOptions))
    );

    results.push(...batchResults);
    completed += batch.length;

    if (onProgress) {
      const currentTask = batch[batch.length - 1]?.title || '';
      onProgress(completed, tasks.length, currentTask);
    }

    // Small delay between batches to avoid rate limiting
    if (i + concurrency < tasks.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const successCount = results.filter(r => r.success).length;
  const cachedCount = results.filter(r => r.cached).length;

  console.log(`[EnrichTask] Batch complete: ${successCount}/${tasks.length} succeeded, ${cachedCount} from cache`);

  return results;
}

// ============================================================================
// EXTRACT RESEARCH FOR BRIEF
// ============================================================================

/**
 * Extract research pack fields for brief generation
 * Returns a flattened structure suitable for prompt injection
 */
export interface ResearchBriefData {
  // AEO Data
  aeo: {
    paaQuestions: string[];
    questionClusters: Array<{
      type: string;
      questions: string[];
    }>;
    snippetHooks: string[];
    citationTargets: Array<{
      url: string;
      title: string;
      type: string;
    }>;
    misconceptions: Array<{
      misconception: string;
      correction: string;
    }>;
  };
  // GEO Data
  geo: {
    locationSummary: string;
    nearbyAreas: Array<{
      name: string;
      relationship: string;
    }>;
    proximityAnchors: Array<{
      category: string;
      hasPlaces: boolean;
    }>;
    localPhrases: Array<{
      phrase: string;
      type: string;
    }>;
    decisionFactors: Array<{
      factor: string;
      category: string;
      phrasePattern: string;
    }>;
  };
  // Quality
  quality: {
    sourceCount: number;
  };
}

export function extractResearchForBrief(pack: ResearchPack): ResearchBriefData {
  const aeo = pack.aeo;
  const geo = pack.geo;

  return {
    aeo: {
      paaQuestions: aeo.peopleAlsoAsk.map(p => p.question),
      questionClusters: aeo.questionClusters.map(c => ({
        type: c.type,
        questions: c.questions,
      })),
      snippetHooks: aeo.snippetHooks,
      citationTargets: aeo.citationTargets.map(c => ({
        url: c.url,
        title: c.title,
        type: c.type,
      })),
      misconceptions: aeo.misconceptions.map(m => ({
        misconception: m.misconception,
        correction: m.correction,
      })),
    },
    geo: {
      locationSummary: geo.geoSummary,
      nearbyAreas: geo.nearbyAreas.map(a => ({
        name: a.name,
        relationship: a.relationship,
      })),
      proximityAnchors: geo.proximityAnchors.map(p => ({
        category: p.category,
        hasPlaces: p.hasPlaces,
      })),
      localPhrases: geo.localLanguage.map(l => ({
        phrase: l.phrase,
        type: l.type,
      })),
      decisionFactors: geo.localDecisionFactors.map(f => ({
        factor: f.factor,
        category: f.category,
        phrasePattern: f.phrasePattern,
      })),
    },
    quality: {
      sourceCount: pack.sources.length,
    },
  };
}

