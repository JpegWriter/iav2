// ============================================================================
// RESEARCH INTEGRATION SERVICE
// ============================================================================
// Wires AEO + GEO research into the Growth Plan → Writer pipeline
// Triggered after plan generation to enrich tasks with research context
// ============================================================================

import type { GrowthTask, GrowthPlanMonth, BusinessRealityModel } from '../growth-planner/types';

// Type compatible with @iav2/research TaskLike
type ResearchRole = 'money' | 'trust' | 'authority' | 'support';

// Map our PageRole to research-compatible role
function mapToResearchRole(role: string): ResearchRole {
  if (role === 'money' || role === 'trust' || role === 'authority' || role === 'support') {
    return role;
  }
  // Default operational/unknown to support
  return 'support';
}

// ============================================================================
// TYPES
// ============================================================================

export interface ResearchIntegrationOptions {
  /** Run research for all tasks in parallel (respects rate limits) */
  enrichAllTasks?: boolean;
  /** Maximum concurrent research requests */
  concurrency?: number;
  /** Force refresh (skip cache) */
  forceRefresh?: boolean;
  /** Skip if task already has research */
  skipExisting?: boolean;
  /** Progress callback */
  onProgress?: (completed: number, total: number, taskTitle: string) => void;
}

export interface ResearchIntegrationResult {
  success: boolean;
  tasksEnriched: number;
  tasksFailed: number;
  fromCache: number;
  errors: Array<{ taskId: string; error: string }>;
}

// ============================================================================
// RESEARCH INTEGRATION (Live)
// ============================================================================

/**
 * Enrich growth plan tasks with AEO + GEO research
 * Should be called after plan generation
 */
export async function enrichPlanWithResearch(
  months: GrowthPlanMonth[],
  business: BusinessRealityModel,
  options: ResearchIntegrationOptions = {}
): Promise<ResearchIntegrationResult> {
  const { 
    enrichAllTasks = false,
    concurrency = 2,
    forceRefresh = false,
    skipExisting = true,
    onProgress 
  } = options;

  // Check if API keys are available
  const hasSerper = !!process.env.SERPER_API_KEY;
  const hasTavily = !!process.env.TAVILY_API_KEY;
  const hasGeoapify = !!process.env.GEOAPIFY_API_KEY;

  if (!hasSerper && !hasTavily) {
    console.log('[ResearchIntegration] No research API keys configured (SERPER_API_KEY, TAVILY_API_KEY)');
    console.log('[ResearchIntegration] Skipping research enrichment');
    
    const allTasks = months.flatMap(m => m.tasks);
    if (onProgress) {
      onProgress(allTasks.length, allTasks.length, 'Skipped - no API keys');
    }
    
    return {
      success: true,
      tasksEnriched: 0,
      tasksFailed: 0,
      fromCache: 0,
      errors: [],
    };
  }

  console.log(`[ResearchIntegration] Starting research enrichment`);
  console.log(`[ResearchIntegration] APIs available: Serper=${hasSerper}, Tavily=${hasTavily}, Geoapify=${hasGeoapify}`);

  try {
    // Dynamically import the research package
    const research = await import('@iav2/research');
    
    // Get tasks to enrich
    const allTasks: GrowthTask[] = months.flatMap(m => m.tasks);
    const tasksToEnrich = enrichAllTasks 
      ? allTasks 
      : allTasks.filter(t => t.month === 1); // Only first month by default

    // Filter out tasks that already have research
    const filteredTasks = skipExisting
      ? tasksToEnrich.filter(t => !t.researchPack)
      : tasksToEnrich;

    if (filteredTasks.length === 0) {
      console.log('[ResearchIntegration] All tasks already have research, skipping');
      if (onProgress) {
        onProgress(allTasks.length, allTasks.length, 'All cached');
      }
      return {
        success: true,
        tasksEnriched: 0,
        tasksFailed: 0,
        fromCache: tasksToEnrich.length,
        errors: [],
      };
    }

    console.log(`[ResearchIntegration] Enriching ${filteredTasks.length} tasks (${tasksToEnrich.length - filteredTasks.length} cached)`);

    // Get primary service and location from business
    const businessPrimaryService = business.coreServices?.[0] || 'service';
    const businessPrimaryLocation = business.primaryLocations?.[0] || null;

    // Prepare tasks for enrichment - map to TaskLike interface
    const taskLikes = filteredTasks.map(t => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      role: mapToResearchRole(t.role),
      primaryService: t.primaryService || businessPrimaryService,
      primaryLocation: t.primaryLocation || businessPrimaryLocation,
      searchIntent: t.searchIntent,
    }));

    // Enrich tasks with research packs
    const results = await research.enrichTasksWithResearch(
      taskLikes,
      {
        niche: business.niche,
        concurrency,
        skipIfExists: skipExisting,
        onProgress: (completed: number, total: number, taskTitle: string) => {
          console.log(`[ResearchIntegration] Progress: ${completed}/${total} - ${taskTitle}`);
          if (onProgress) {
            onProgress(completed, total, taskTitle);
          }
        },
      }
    );

    // Apply research packs back to the original tasks
    let enrichedCount = 0;
    let failedCount = 0;
    let cachedCount = 0;
    const errors: Array<{ taskId: string; error: string }> = [];

    for (const result of results) {
      // Cast to access researchPack since dynamic import loses type info
      const enrichedTask = result.task as any;
      
      if (result.cached) {
        cachedCount++;
      }
      if (result.success && enrichedTask.researchPack) {
        // Find and update the task in months
        for (const month of months) {
          const task = month.tasks.find(t => t.id === enrichedTask.id);
          if (task) {
            // Assign as any to bypass strict type checking between package types
            task.researchPack = enrichedTask.researchPack;
            enrichedCount++;
            break;
          }
        }
      } else if (!result.success) {
        failedCount++;
        if (result.error) {
          errors.push({ taskId: enrichedTask.id, error: result.error });
        }
      }
    }

    console.log(`[ResearchIntegration] Complete: ${enrichedCount} enriched, ${failedCount} failed, ${cachedCount} cached`);

    return {
      success: true,
      tasksEnriched: enrichedCount,
      tasksFailed: failedCount,
      fromCache: cachedCount,
      errors,
    };

  } catch (error) {
    console.error('[ResearchIntegration] Failed to load research package:', error);
    
    // Fallback: return success without enrichment
    const allTasks = months.flatMap(m => m.tasks);
    if (onProgress) {
      onProgress(allTasks.length, allTasks.length, 'Error - package load failed');
    }
    
    return {
      success: true, // Don't block plan generation
      tasksEnriched: 0,
      tasksFailed: 0,
      fromCache: 0,
      errors: [{ taskId: 'all', error: String(error) }],
    };
  }
}

// ============================================================================
// SINGLE TASK ENRICHMENT
// ============================================================================

/**
 * Enrich a single task with research (for on-demand briefing)
 */
export async function enrichTaskWithResearch(
  task: GrowthTask,
  business: BusinessRealityModel,
  options: Omit<ResearchIntegrationOptions, 'enrichAllTasks' | 'concurrency' | 'onProgress'> = {}
): Promise<GrowthTask> {
  const { skipExisting = true } = options;

  // Skip if already has research
  if (skipExisting && task.researchPack) {
    console.log(`[ResearchIntegration] Task ${task.slug} already has research, skipping`);
    return task;
  }

  // Check API keys
  const hasSerper = !!process.env.SERPER_API_KEY;
  const hasTavily = !!process.env.TAVILY_API_KEY;

  if (!hasSerper && !hasTavily) {
    console.log(`[ResearchIntegration] No API keys for: ${task.title}`);
    return task;
  }

  try {
    const research = await import('@iav2/research');
    
    // Get primary service and location from business
    const businessPrimaryService = business.coreServices?.[0] || 'service';
    const businessPrimaryLocation = business.primaryLocations?.[0] || null;

    // Map task to TaskLike interface
    const taskLike = {
      id: task.id,
      title: task.title,
      slug: task.slug,
      role: mapToResearchRole(task.role),
      primaryService: task.primaryService || businessPrimaryService,
      primaryLocation: task.primaryLocation || businessPrimaryLocation,
      searchIntent: task.searchIntent,
    };

    const result = await research.enrichTaskWithResearch(taskLike, {
      niche: business.niche,
      skipIfExists: skipExisting,
    });

    // Cast to access researchPack since dynamic import loses type info
    const enrichedTask = result.task as any;
    
    if (result.success && enrichedTask.researchPack) {
      console.log(`[ResearchIntegration] Enriched: ${task.title}`);
      return { ...task, researchPack: enrichedTask.researchPack };
    }

    return task;
  } catch (error) {
    console.warn(`[ResearchIntegration] Failed for ${task.title}:`, error);
    return task;
  }
}

// ============================================================================
// DATABASE PERSISTENCE
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Save enriched plan to database
 */
export async function saveEnrichedPlan(
  supabase: SupabaseClient,
  projectId: string,
  months: GrowthPlanMonth[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('growth_plans')
      .update({
        months,
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if plan has been enriched with research
 */
export function isPlanEnriched(months: GrowthPlanMonth[]): {
  isEnriched: boolean;
  enrichedCount: number;
  totalTasks: number;
  coverage: number;
} {
  const allTasks = months.flatMap(m => m.tasks);
  const enrichedTasks = allTasks.filter(t => t.researchPack);
  
  return {
    isEnriched: enrichedTasks.length > 0,
    enrichedCount: enrichedTasks.length,
    totalTasks: allTasks.length,
    coverage: allTasks.length > 0 
      ? Math.round((enrichedTasks.length / allTasks.length) * 100) 
      : 0,
  };
}
