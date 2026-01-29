// ============================================================================
// UNIQUE IDENTIFIER VALIDATION
// ============================================================================
// 
// Ensures global uniqueness for task IDs and slugs within a plan run.
// Also checks for collisions with existing site pages.
// ============================================================================

import { GrowthTask, GrowthPlanMonth, PageContentContext } from './types';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface UniqueIdentifierBlocker {
  type: 'DUPLICATE_TASK_ID' | 'DUPLICATE_SLUG' | 'SLUG_COLLIDES_EXISTING_PAGE';
  taskId: string;
  taskTitle: string;
  conflictsWith: string;
  details: string;
  suggestion: string;
  autoRepaired?: boolean;
}

export interface UniqueIdentifierResult {
  isValid: boolean;
  blockers: UniqueIdentifierBlocker[];
  warnings: string[];
  repairedTasks: string[]; // IDs of tasks that were auto-repaired
  repairedIds: string[];   // List of task IDs that had ID collisions repaired
  repairedSlugs: string[]; // List of task slugs that had slug collisions repaired
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate and optionally auto-repair unique identifiers across all tasks
 * 
 * @param months - All plan months with tasks
 * @param existingPages - Existing pages from the site
 * @param autoRepair - If true, attempt to fix duplicates where safe
 * @returns Validation result with blockers and any auto-repairs made
 */
export function validateUniqueIdentifiers(
  months: GrowthPlanMonth[],
  existingPages: PageContentContext[],
  autoRepair: boolean = true
): UniqueIdentifierResult {
  const blockers: UniqueIdentifierBlocker[] = [];
  const warnings: string[] = [];
  const repairedTasks: string[] = [];

  // Build sets for tracking
  const seenIds = new Map<string, { taskId: string; title: string }>();
  const seenSlugs = new Map<string, { taskId: string; title: string; pageType: string }>();
  const repairedIds: string[] = [];
  const repairedSlugs: string[] = [];

  // Build existing page slug set
  const existingPageSlugs = new Set(
    existingPages.map(p => normalizeSlug(p.path))
  );

  // Process all tasks
  for (const month of months) {
    for (const task of month.tasks) {
      // ========================================
      // CHECK 1: Duplicate Task ID
      // ========================================
      const normalizedId = task.id.toLowerCase();
      
      if (seenIds.has(normalizedId)) {
        const existing = seenIds.get(normalizedId)!;
        
        if (autoRepair) {
          // Auto-repair: Generate new ID
          const oldId = task.id;
          task.id = uuid();
          repairedTasks.push(task.id);
          repairedIds.push(oldId);
          warnings.push(`AUTO_REPAIRED_DUPLICATE_ID: Task "${task.title}" had duplicate ID "${oldId}", assigned new ID "${task.id}"`);
        } else {
          blockers.push({
            type: 'DUPLICATE_TASK_ID',
            taskId: task.id,
            taskTitle: task.title,
            conflictsWith: existing.taskId,
            details: `ID "${task.id}" already used by "${existing.title}"`,
            suggestion: `Task "${task.title}" has same ID as "${existing.title}". Regenerate ID.`,
          });
        }
      } else {
        seenIds.set(normalizedId, { taskId: task.id, title: task.title });
      }

      // ========================================
      // CHECK 2: Duplicate Slug within Plan
      // ========================================
      const normalizedSlug = normalizeSlug(task.slug);
      
      if (seenSlugs.has(normalizedSlug)) {
        const existing = seenSlugs.get(normalizedSlug)!;
        
        if (autoRepair && task.role !== existing.pageType) {
          // Auto-repair: Append suffix based on page type
          const oldSlug = task.slug;
          const suffix = getSlugSuffix(task.role, task.searchIntent);
          task.slug = appendSlugSuffix(task.slug, suffix);
          repairedTasks.push(task.id);
          repairedSlugs.push(oldSlug);
          warnings.push(`AUTO_REPAIRED_DUPLICATE_SLUG: Task "${task.title}" had duplicate slug "${oldSlug}", changed to "${task.slug}"`);
          
          // Add the repaired slug to seen set
          seenSlugs.set(normalizeSlug(task.slug), { 
            taskId: task.id, 
            title: task.title, 
            pageType: task.role 
          });
        } else {
          // Same page type = true cannibalisation, cannot auto-repair
          blockers.push({
            type: 'DUPLICATE_SLUG',
            taskId: task.id,
            taskTitle: task.title,
            conflictsWith: existing.taskId,
            details: `Slug "${task.slug}" already used by "${existing.title}" with same page type`,
            suggestion: `Task "${task.title}" has same slug "${task.slug}" as "${existing.title}". This is likely cannibalisation.`,
          });
        }
      } else {
        seenSlugs.set(normalizedSlug, { taskId: task.id, title: task.title, pageType: task.role });
      }

      // ========================================
      // CHECK 3: Slug Collides with Existing Page
      // ========================================
      // Only block if not a refresh/fix action (which updates existing pages)
      const isUpdateAction = task.action === 'fix' || task.action === 'refresh';
      if (existingPageSlugs.has(normalizedSlug) && !isUpdateAction) {
        blockers.push({
          type: 'SLUG_COLLIDES_EXISTING_PAGE',
          taskId: task.id,
          taskTitle: task.title,
          conflictsWith: task.slug,
          details: `Slug "${task.slug}" already exists as an existing page`,
          suggestion: `Task "${task.title}" would create a page at "${task.slug}" which already exists. Change action to "fix" or "refresh" to update existing page, or use a different slug.`,
        });
      }
    }
  }

  return {
    isValid: blockers.length === 0,
    blockers,
    warnings,
    repairedTasks,
    repairedIds,
    repairedSlugs,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
    .replace(/\/+/g, '/'); // Collapse multiple slashes
}

function getSlugSuffix(role: string, intent: string): string {
  switch (role) {
    case 'trust':
      return '-case-study';
    case 'support':
      if (intent === 'learn') return '-guide';
      if (intent === 'compare') return '-comparison';
      return '-info';
    case 'authority':
      return '-insights';
    default:
      return `-${role}`;
  }
}

function appendSlugSuffix(slug: string, suffix: string): string {
  // Remove trailing slash if present
  const cleanSlug = slug.replace(/\/$/, '');
  
  // Don't double-append suffix
  if (cleanSlug.endsWith(suffix)) {
    return cleanSlug;
  }
  
  return cleanSlug + suffix;
}
