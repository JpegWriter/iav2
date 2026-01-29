// ============================================================================
// CANNIBALISATION GUARD - Page Ownership & Intent Deduplication
// ============================================================================
// 
// This module enforces strict rules to prevent keyword cannibalisation,
// intent duplication, and page ownership conflicts.
//
// RULES:
// 1. One money page per ownershipKey (service + location + intent)
// 2. Support pages MUST reference a canonical money page
// 3. No two pages can answer the same primary question
// 4. One FAQ hub per service (no scattered FAQs)
// 5. Seasonal/offer pages must be children of money pages
//
// ENHANCED DETECTION (v2):
// - Slug collision detection
// - Jaccard semantic similarity (threshold 0.82)
// - Intent overlap signature matching
// - Auto-repair where safe
// ============================================================================

import { GrowthTask, GrowthPlanMonth, BusinessRealityModel, PageContentContext, SupportType as TaskSupportType } from './types';
import { PageRole } from '@/types';

// ============================================================================
// JACCARD SEMANTIC SIMILARITY
// ============================================================================

/**
 * Tokenize text into words for Jaccard comparison
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\säöüß]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2) // Ignore short words
  );
}

/**
 * Compute Jaccard similarity between two texts
 * Returns a value between 0 and 1
 */
export function computeJaccardSimilarity(text1: string, text2: string): number {
  const set1 = tokenize(text1);
  const set2 = tokenize(text2);
  
  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;
  
  let intersection = 0;
  set1.forEach(word => {
    if (set2.has(word)) intersection++;
  });
  
  const union = set1.size + set2.size - intersection;
  return intersection / union;
}

/**
 * Check if two questions/titles are semantically duplicate
 * using Jaccard similarity with 0.82 threshold
 */
export function areSemanticallyDuplicate(
  text1: string,
  text2: string,
  threshold: number = 0.82
): boolean {
  const similarity = computeJaccardSimilarity(text1, text2);
  return similarity >= threshold;
}

// ============================================================================
// INTENT OVERLAP SIGNATURE
// ============================================================================

/**
 * Generate an intent overlap signature from task properties
 * Tasks with same signature are competing for same intent
 */
export function generateIntentSignature(
  service: string,
  role: string,
  searchIntent: string,
  supportType?: string | null
): string {
  const normalizedService = normalizeForKey(service);
  const parts = [normalizedService, role, searchIntent];
  if (supportType) parts.push(supportType);
  return parts.join('::');
}

/**
 * Check if two tasks have overlapping intent signatures
 */
export function hasIntentOverlap(task1: GrowthTask, task2: GrowthTask): boolean {
  const sig1 = generateIntentSignature(
    task1.primaryService,
    task1.role,
    task1.searchIntent,
    task1.supportType || undefined
  );
  const sig2 = generateIntentSignature(
    task2.primaryService,
    task2.role,
    task2.searchIntent,
    task2.supportType || undefined
  );
  return sig1 === sig2;
}

// ============================================================================
// TYPES
// ============================================================================

export interface OwnershipKey {
  service: string;
  location: string; // "global" if no location
  intent: 'buy' | 'compare' | 'trust' | 'learn';
}

export interface CanonicalPage {
  ownershipKey: string;
  keyParts: OwnershipKey;
  title: string;
  slug: string;
  role: PageRole;
  source: 'existing' | 'planned';
  primaryQuestion: string;
  supportPages: string[]; // slugs of pages that support this
}

export interface CannibalisationWarning {
  type: 
    | 'duplicate_money_page'
    | 'orphan_support_page'
    | 'duplicate_question'
    | 'duplicate_faq'
    | 'competing_seasonal'
    | 'unsafe_comparison'
    | 'missing_support_target'
    | 'intent_overlap';
  severity: 'blocker' | 'warning';
  taskTitle: string;
  taskSlug: string;
  conflictsWith?: string;
  resolution: 'merge' | 'reframe' | 'drop' | 'consolidate';
  suggestion: string;
}

export interface CannibalisationReport {
  isValid: boolean;
  canonicalPages: Map<string, CanonicalPage>;
  warnings: CannibalisationWarning[];
  blockers: CannibalisationWarning[];
  resolvedTasks: GrowthTask[];
  droppedTasks: GrowthTask[];
  mergedTasks: Array<{ into: string; merged: string[] }>;
}

export interface SupportClassification {
  type: 'faq' | 'process' | 'objection' | 'comparison' | 'trust' | 'case-study' | 'guide' | 'education' | 'pre-sell';
  primaryQuestion: string;
}

// ============================================================================
// OWNERSHIP KEY GENERATION
// ============================================================================

/**
 * Generate a unique ownership key for a page/task
 */
export function generateOwnershipKey(
  service: string,
  location: string | null,
  intent: 'buy' | 'compare' | 'trust' | 'learn'
): string {
  const normalizedService = normalizeForKey(service);
  const normalizedLocation = location ? normalizeForKey(location) : 'global';
  return `${normalizedService}::${normalizedLocation}::${intent}`;
}

function normalizeForKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9äöüß]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parse an ownership key back into its parts
 */
export function parseOwnershipKey(key: string): OwnershipKey {
  const [service, location, intent] = key.split('::');
  return {
    service: service || 'unknown',
    location: location || 'global',
    intent: (intent as OwnershipKey['intent']) || 'buy',
  };
}

// ============================================================================
// PRIMARY QUESTION DERIVATION
// ============================================================================

/**
 * Derive the primary question a page/task answers
 * This is critical for intent deduplication
 */
export function derivePrimaryQuestion(
  task: GrowthTask,
  business: BusinessRealityModel
): string {
  const service = task.primaryService;
  const location = task.primaryLocation;
  const locationPhrase = location ? ` in ${location}` : '';

  // Money pages
  if (task.role === 'money') {
    switch (task.searchIntent) {
      case 'buy':
        return `Where can I get professional ${service}${locationPhrase}?`;
      case 'compare':
        return `What are my ${service} options${locationPhrase}?`;
      default:
        return `How do I book ${service}${locationPhrase}?`;
    }
  }

  // Support pages - derive from support type and title
  const titleLower = task.title.toLowerCase();
  
  // FAQ
  if (titleLower.includes('faq') || titleLower.includes('question')) {
    return `What questions do people ask about ${service}?`;
  }
  
  // Process
  if (titleLower.includes('process') || titleLower.includes('how') && titleLower.includes('work')) {
    return `What happens after I contact ${business.name} for ${service}?`;
  }
  
  // What's included
  if (titleLower.includes('included') || titleLower.includes('what you get')) {
    return `What exactly do I get with ${service}?`;
  }
  
  // Guide / How to choose
  if (titleLower.includes('guide') || titleLower.includes('choosing') || titleLower.includes('look for')) {
    return `How do I choose a ${service} provider?`;
  }
  
  // Cost / Pricing
  if (titleLower.includes('cost') || titleLower.includes('price') || titleLower.includes('investment')) {
    return `How much does ${service} cost${locationPhrase}?`;
  }
  
  // Case study
  if (titleLower.includes('case study') || titleLower.includes('success')) {
    return `What results has ${business.name} achieved with ${service}?`;
  }
  
  // Comparison
  if (titleLower.includes('vs') || titleLower.includes('compare') || titleLower.includes('difference')) {
    return `How do different ${service} approaches compare?`;
  }
  
  // Benefits / Why
  if (titleLower.includes('benefit') || titleLower.includes('why')) {
    return `What are the benefits of ${service}?`;
  }
  
  // Checklist / Preparation
  if (titleLower.includes('checklist') || titleLower.includes('prepar')) {
    return `How do I prepare for ${service}?`;
  }
  
  // Seasonal
  if (titleLower.includes('seasonal') || titleLower.includes('offer') || titleLower.includes('special')) {
    return `What ${service} offers are currently available?`;
  }

  // Default
  return `What should I know about ${service}${locationPhrase}?`;
}

// ============================================================================
// SUPPORT TYPE CLASSIFICATION
// ============================================================================

/**
 * Classify the support type of a task
 */
export function classifySupportType(task: GrowthTask): SupportClassification['type'] {
  const titleLower = task.title.toLowerCase();
  
  if (titleLower.includes('faq') || titleLower.includes('question')) return 'faq';
  if (titleLower.includes('process') || titleLower.includes('how') && titleLower.includes('work')) return 'process';
  if (titleLower.includes('case study') || titleLower.includes('success')) return 'case-study';
  if (titleLower.includes('vs') || titleLower.includes('compare')) return 'comparison';
  if (titleLower.includes('trust') || titleLower.includes('testimonial')) return 'trust';
  if (titleLower.includes('guide') || titleLower.includes('complete')) return 'guide';
  
  // Map task.supportType to our classification (handle local-proof -> trust)
  if (task.supportType) {
    if (task.supportType === 'local-proof') return 'trust';
    // Other values should map directly
    if (['faq', 'process', 'objection', 'comparison', 'trust', 'case-study', 'guide', 'education', 'pre-sell'].includes(task.supportType)) {
      return task.supportType as SupportClassification['type'];
    }
  }
  
  return 'education';
}

// ============================================================================
// CANNIBALISATION DETECTION
// ============================================================================

/**
 * Build a canonical page index from existing pages
 */
export function buildCanonicalIndex(
  existingPages: PageContentContext[],
  business: BusinessRealityModel
): Map<string, CanonicalPage> {
  const index = new Map<string, CanonicalPage>();
  
  for (const page of existingPages) {
    if (page.role !== 'money') continue;
    
    // Find which service this page is for
    const service = page.serviceMentions[0] || business.coreServices[0] || 'service';
    const location = page.locationMentions[0] || null;
    const intent: OwnershipKey['intent'] = 'buy'; // Money pages are always buy intent
    
    const ownershipKey = generateOwnershipKey(service, location, intent);
    
    // Only add if not already present (first one wins - it's canonical)
    if (!index.has(ownershipKey)) {
      index.set(ownershipKey, {
        ownershipKey,
        keyParts: parseOwnershipKey(ownershipKey),
        title: page.title || page.path,
        slug: page.path,
        role: 'money',
        source: 'existing',
        primaryQuestion: `Where can I get professional ${service}${location ? ` in ${location}` : ''}?`,
        supportPages: [],
      });
    }
  }
  
  return index;
}

/**
 * Run full cannibalisation check on planned tasks
 */
export function runCannibalisationCheck(
  plannedMonths: GrowthPlanMonth[],
  existingPages: PageContentContext[],
  business: BusinessRealityModel
): CannibalisationReport {
  const warnings: CannibalisationWarning[] = [];
  const blockers: CannibalisationWarning[] = [];
  const resolvedTasks: GrowthTask[] = [];
  const droppedTasks: GrowthTask[] = [];
  const mergedTasks: Array<{ into: string; merged: string[] }> = [];
  
  // Build canonical index from existing pages
  const canonicalPages = buildCanonicalIndex(existingPages, business);
  
  // Track planned money pages to detect duplicates within the plan
  const plannedMoneyKeys = new Map<string, GrowthTask>();
  
  // Track questions to detect duplicates
  const questionIndex = new Map<string, { task: GrowthTask; source: string }>();
  
  // Track FAQ pages per service
  const faqIndex = new Map<string, GrowthTask[]>();
  
  // Process all tasks
  for (const month of plannedMonths) {
    for (const task of month.tasks) {
      const ownershipKey = generateOwnershipKey(
        task.primaryService,
        task.primaryLocation,
        task.searchIntent
      );
      
      const primaryQuestion = derivePrimaryQuestion(task, business);
      const normalizedQuestion = normalizeForKey(primaryQuestion);
      
      // ========================================
      // CHECK 1: Duplicate Money Page
      // ========================================
      if (task.role === 'money') {
        // Check against existing pages
        if (canonicalPages.has(ownershipKey)) {
          const existing = canonicalPages.get(ownershipKey)!;
          blockers.push({
            type: 'duplicate_money_page',
            severity: 'blocker',
            taskTitle: task.title,
            taskSlug: task.slug,
            conflictsWith: existing.slug,
            resolution: 'merge',
            suggestion: `Merge content into existing page "${existing.title}" or reframe as support page`,
          });
          droppedTasks.push(task);
          continue;
        }
        
        // Check against other planned money pages
        if (plannedMoneyKeys.has(ownershipKey)) {
          const existing = plannedMoneyKeys.get(ownershipKey)!;
          blockers.push({
            type: 'duplicate_money_page',
            severity: 'blocker',
            taskTitle: task.title,
            taskSlug: task.slug,
            conflictsWith: existing.slug,
            resolution: 'merge',
            suggestion: `Duplicate planned money page. Keep "${existing.title}" and merge this content into it.`,
          });
          droppedTasks.push(task);
          continue;
        }
        
        // Register this as canonical
        plannedMoneyKeys.set(ownershipKey, task);
        canonicalPages.set(ownershipKey, {
          ownershipKey,
          keyParts: parseOwnershipKey(ownershipKey),
          title: task.title,
          slug: task.slug,
          role: 'money',
          source: 'planned',
          primaryQuestion,
          supportPages: [],
        });
      }
      
      // ========================================
      // CHECK 2: Support Page Must Have Target
      // ========================================
      if (task.role === 'support' || task.role === 'trust') {
        if (!task.supportsPage) {
          // Try to auto-assign to a canonical money page
          const serviceKey = generateOwnershipKey(task.primaryService, task.primaryLocation, 'buy');
          const globalKey = generateOwnershipKey(task.primaryService, null, 'buy');
          
          const targetPage = canonicalPages.get(serviceKey) || canonicalPages.get(globalKey);
          
          if (targetPage) {
            // Auto-fix: assign to canonical page
            task.supportsPage = targetPage.slug;
            targetPage.supportPages.push(task.slug);
          } else {
            blockers.push({
              type: 'orphan_support_page',
              severity: 'blocker',
              taskTitle: task.title,
              taskSlug: task.slug,
              resolution: 'drop',
              suggestion: `No canonical money page exists for ${task.primaryService}. Create money page first or drop this task.`,
            });
            droppedTasks.push(task);
            continue;
          }
        }
      }
      
      // ========================================
      // CHECK 3: Duplicate Question
      // ========================================
      if (questionIndex.has(normalizedQuestion)) {
        const existing = questionIndex.get(normalizedQuestion)!;
        
        // Same question = content overlap
        warnings.push({
          type: 'duplicate_question',
          severity: 'warning',
          taskTitle: task.title,
          taskSlug: task.slug,
          conflictsWith: existing.task.slug,
          resolution: 'merge',
          suggestion: `Both pages answer: "${primaryQuestion}". Consolidate into ${existing.task.title}.`,
        });
        
        // If both are support pages, merge
        if (task.role !== 'money' && existing.task.role !== 'money') {
          droppedTasks.push(task);
          mergedTasks.push({
            into: existing.task.slug,
            merged: [task.slug],
          });
          continue;
        }
      } else {
        questionIndex.set(normalizedQuestion, { task, source: 'planned' });
      }
      
      // ========================================
      // CHECK 4: FAQ Consolidation
      // ========================================
      const supportType = classifySupportType(task);
      if (supportType === 'faq') {
        const serviceKey = normalizeForKey(task.primaryService);
        const existingFaqs = faqIndex.get(serviceKey) || [];
        
        if (existingFaqs.length > 0) {
          warnings.push({
            type: 'duplicate_faq',
            severity: 'warning',
            taskTitle: task.title,
            taskSlug: task.slug,
            conflictsWith: existingFaqs[0].slug,
            resolution: 'consolidate',
            suggestion: `Multiple FAQ pages for ${task.primaryService}. Consolidate into one FAQ hub.`,
          });
          
          // Drop duplicate FAQ
          droppedTasks.push(task);
          mergedTasks.push({
            into: existingFaqs[0].slug,
            merged: [task.slug],
          });
          continue;
        }
        
        existingFaqs.push(task);
        faqIndex.set(serviceKey, existingFaqs);
      }
      
      // ========================================
      // CHECK 5: Seasonal/Offer Page Rules
      // ========================================
      const isSeasonalOrOffer = 
        task.title.toLowerCase().includes('seasonal') ||
        task.title.toLowerCase().includes('offer') ||
        task.title.toLowerCase().includes('special') ||
        task.slug.includes('/offers/');
        
      if (isSeasonalOrOffer && task.role === 'money') {
        // Seasonal pages should not compete with core money pages
        const coreKey = generateOwnershipKey(task.primaryService, task.primaryLocation, 'buy');
        
        if (canonicalPages.has(coreKey)) {
          const existing = canonicalPages.get(coreKey)!;
          if (existing.source === 'existing' || !existing.slug.includes('/offers/')) {
            warnings.push({
              type: 'competing_seasonal',
              severity: 'warning',
              taskTitle: task.title,
              taskSlug: task.slug,
              conflictsWith: existing.slug,
              resolution: 'reframe',
              suggestion: `Seasonal page competes with core money page. Make it a child of "${existing.title}" or mark noindex.`,
            });
            
            // Reframe as support page
            task.role = 'support';
            task.supportsPage = existing.slug;
            task.supportType = 'pre-sell';
          }
        }
      }
      
      // ========================================
      // CHECK 6: Comparison Page Safety
      // ========================================
      if (supportType === 'comparison') {
        const titleLower = task.title.toLowerCase();
        
        // Block unsafe comparison patterns
        const unsafePatterns = [
          'vs other providers',
          'best provider',
          'vs competitors',
          'vs the rest',
          'vs everyone',
        ];
        
        if (unsafePatterns.some(p => titleLower.includes(p))) {
          blockers.push({
            type: 'unsafe_comparison',
            severity: 'blocker',
            taskTitle: task.title,
            taskSlug: task.slug,
            resolution: 'reframe',
            suggestion: 'Comparison must be neutral (approaches, criteria, decision factors). Reframe or drop.',
          });
          droppedTasks.push(task);
          continue;
        }
        
        // Ensure comparison supports a money page
        if (!task.supportsPage) {
          const serviceKey = generateOwnershipKey(task.primaryService, null, 'buy');
          const targetPage = canonicalPages.get(serviceKey);
          
          if (targetPage) {
            task.supportsPage = targetPage.slug;
          } else {
            warnings.push({
              type: 'missing_support_target',
              severity: 'warning',
              taskTitle: task.title,
              taskSlug: task.slug,
              resolution: 'reframe',
              suggestion: 'Comparison page should support a money page. Assign supportsPage.',
            });
          }
        }
      }
      
      // ========================================
      // CHECK 7: Intent Overlap Detection
      // ========================================
      if (task.role === 'support' && task.searchIntent === 'buy') {
        // Support pages should not have buy intent
        warnings.push({
          type: 'intent_overlap',
          severity: 'warning',
          taskTitle: task.title,
          taskSlug: task.slug,
          resolution: 'reframe',
          suggestion: 'Support page has "buy" intent which competes with money page. Change to "learn" intent.',
        });
        
        // Auto-fix
        task.searchIntent = 'learn';
      }
      
      // ========================================
      // ENRICH: Add ownership data to task
      // ========================================
      task.ownershipKey = ownershipKey;
      task.primaryQuestion = primaryQuestion;
      
      // Task passed all checks
      resolvedTasks.push(task);
    }
  }
  
  const isValid = blockers.length === 0;
  
  return {
    isValid,
    canonicalPages,
    warnings,
    blockers,
    resolvedTasks,
    droppedTasks,
    mergedTasks,
  };
}

// ============================================================================
// PLAN RESOLUTION
// ============================================================================

/**
 * Resolve cannibalisation issues and return clean plan
 */
export function resolveCannibalisation(
  plannedMonths: GrowthPlanMonth[],
  existingPages: PageContentContext[],
  business: BusinessRealityModel
): {
  resolvedPlan: GrowthPlanMonth[];
  report: CannibalisationReport;
} {
  const report = runCannibalisationCheck(plannedMonths, existingPages, business);
  
  // Build set of dropped task IDs
  const droppedIds = new Set(report.droppedTasks.map(t => t.id));
  
  // Filter months to remove dropped tasks
  const resolvedPlan = plannedMonths.map(month => ({
    ...month,
    tasks: month.tasks.filter(t => !droppedIds.has(t.id)),
  })).filter(month => month.tasks.length > 0);
  
  // Log resolution summary
  console.log(`[Cannibalisation] Check complete:
    - Valid: ${report.isValid}
    - Canonical pages: ${report.canonicalPages.size}
    - Warnings: ${report.warnings.length}
    - Blockers: ${report.blockers.length}
    - Tasks resolved: ${report.resolvedTasks.length}
    - Tasks dropped: ${report.droppedTasks.length}
    - Tasks merged: ${report.mergedTasks.length}
  `);
  
  if (!report.isValid) {
    console.log('[Cannibalisation] BLOCKERS:');
    for (const blocker of report.blockers) {
      console.log(`  - ${blocker.type}: ${blocker.taskTitle} → ${blocker.suggestion}`);
    }
  }
  
  return { resolvedPlan, report };
}

// ============================================================================
// OWNERSHIP MAP EXPORT
// ============================================================================

/**
 * Export ownership map for plan output
 */
export function exportOwnershipMap(
  canonicalPages: Map<string, CanonicalPage>
): Array<{
  ownershipKey: string;
  service: string;
  location: string;
  intent: string;
  canonicalPage: string;
  supportPages: string[];
}> {
  const output: Array<{
    ownershipKey: string;
    service: string;
    location: string;
    intent: string;
    canonicalPage: string;
    supportPages: string[];
  }> = [];
  
  for (const [key, page] of Array.from(canonicalPages.entries())) {
    output.push({
      ownershipKey: key,
      service: page.keyParts.service,
      location: page.keyParts.location,
      intent: page.keyParts.intent,
      canonicalPage: page.slug,
      supportPages: page.supportPages,
    });
  }
  
  return output.sort((a, b) => a.service.localeCompare(b.service));
}

// ============================================================================
// TASK ENRICHMENT
// ============================================================================

/**
 * Enrich task with cannibalisation prevention metadata
 */
export function enrichTaskWithOwnership(
  task: GrowthTask,
  business: BusinessRealityModel
): GrowthTask & {
  ownershipKey: string;
  primaryQuestion: string;
  supportTypeClassified: SupportClassification['type'];
} {
  return {
    ...task,
    ownershipKey: generateOwnershipKey(
      task.primaryService,
      task.primaryLocation,
      task.searchIntent
    ),
    primaryQuestion: derivePrimaryQuestion(task, business),
    supportTypeClassified: classifySupportType(task),
  };
}

// ============================================================================
// ENHANCED CANNIBALISATION DETECTOR (v2)
// ============================================================================
// Implements:
// - Slug collision detection
// - Jaccard semantic similarity (threshold 0.82)
// - Intent overlap signature matching
// - Ownership collision for money pages
// ============================================================================

export interface CannibalisationBlocker {
  type:
    | 'SLUG_COLLISION'
    | 'SEMANTIC_DUPLICATE'
    | 'INTENT_OVERLAP'
    | 'OWNERSHIP_COLLISION';
  taskId: string;
  taskTitle: string;
  conflictsWithId: string;
  conflictsWithTitle: string;
  details: string;
  suggestion: string;
  jaccardScore?: number;
}

export interface EnhancedCannibalisationResult {
  isValid: boolean;
  blockers: CannibalisationBlocker[];
  warnings: string[];
  semanticDuplicates: Array<{
    task1Id: string;
    task2Id: string;
    score: number;
  }>;
}

/**
 * Enhanced cannibalisation detection with Jaccard similarity
 * This runs BEFORE save to catch issues early
 */
export function detectEnhancedCannibalisation(
  months: GrowthPlanMonth[],
  existingPages: PageContentContext[],
  jaccardThreshold: number = 0.82
): EnhancedCannibalisationResult {
  const blockers: CannibalisationBlocker[] = [];
  const warnings: string[] = [];
  const semanticDuplicates: Array<{
    task1Id: string;
    task2Id: string;
    score: number;
  }> = [];

  // Collect all tasks
  const allTasks: GrowthTask[] = [];
  for (const month of months) {
    allTasks.push(...month.tasks);
  }

  // Build existing page maps
  const existingSlugs = new Map<string, PageContentContext>();
  const existingQuestions = new Map<string, PageContentContext>();
  
  for (const page of existingPages) {
    const normalizedSlug = page.path.toLowerCase().replace(/^\/|\/$/g, '');
    existingSlugs.set(normalizedSlug, page);
    if (page.h1) {
      existingQuestions.set(page.h1.toLowerCase(), page);
    }
  }

  // Track planned items
  const plannedSlugs = new Map<string, GrowthTask>();
  const plannedQuestions = new Map<string, GrowthTask>();
  const plannedOwnership = new Map<string, GrowthTask>();

  for (const task of allTasks) {
    const normalizedSlug = task.slug.toLowerCase().replace(/^\/|\/$/g, '');
    
    // ========================================
    // CHECK 1: Slug Collision with Existing
    // ========================================
    if (existingSlugs.has(normalizedSlug)) {
      const existing = existingSlugs.get(normalizedSlug)!;
      blockers.push({
        type: 'SLUG_COLLISION',
        taskId: task.id,
        taskTitle: task.title,
        conflictsWithId: existing.path, // Use path as ID since pageId doesn't exist
        conflictsWithTitle: existing.title || existing.path,
        details: `Slug "${task.slug}" already exists as an existing page`,
        suggestion: `Rename this task's slug or update the existing page instead`,
      });
      continue;
    }

    // ========================================
    // CHECK 2: Slug Collision with Planned
    // ========================================
    if (plannedSlugs.has(normalizedSlug)) {
      const existing = plannedSlugs.get(normalizedSlug)!;
      blockers.push({
        type: 'SLUG_COLLISION',
        taskId: task.id,
        taskTitle: task.title,
        conflictsWithId: existing.id,
        conflictsWithTitle: existing.title,
        details: `Slug "${task.slug}" already used by another planned task`,
        suggestion: `Merge these tasks or differentiate their slugs`,
      });
      continue;
    }

    // ========================================
    // CHECK 3: Semantic Duplicate (Jaccard)
    // ========================================
    const taskQuestion = task.primaryQuestion || task.title;
    
    // Check against existing pages
    existingQuestions.forEach((page, existingQ) => {
      const score = computeJaccardSimilarity(taskQuestion, existingQ);
      if (score >= jaccardThreshold) {
        blockers.push({
          type: 'SEMANTIC_DUPLICATE',
          taskId: task.id,
          taskTitle: task.title,
          conflictsWithId: page.path,
          conflictsWithTitle: page.title || page.path,
          details: `Question "${taskQuestion}" is semantically similar to existing "${existingQ}"`,
          suggestion: `Differentiate the topic or update the existing page instead`,
          jaccardScore: score,
        });
        semanticDuplicates.push({
          task1Id: task.id,
          task2Id: page.path,
          score,
        });
      }
    });

    // Check against other planned tasks
    plannedQuestions.forEach((otherTask, plannedQ) => {
      const score = computeJaccardSimilarity(taskQuestion, plannedQ);
      if (score >= jaccardThreshold) {
        blockers.push({
          type: 'SEMANTIC_DUPLICATE',
          taskId: task.id,
          taskTitle: task.title,
          conflictsWithId: otherTask.id,
          conflictsWithTitle: otherTask.title,
          details: `Question "${taskQuestion}" is semantically similar to planned "${plannedQ}"`,
          suggestion: `Merge these tasks or significantly differentiate their questions`,
          jaccardScore: score,
        });
        semanticDuplicates.push({
          task1Id: task.id,
          task2Id: otherTask.id,
          score,
        });
      }
    });

    // ========================================
    // CHECK 4: Ownership Collision (Money Pages)
    // ========================================
    if (task.role === 'money') {
      const ownershipKey = generateOwnershipKey(
        task.primaryService,
        task.primaryLocation,
        task.searchIntent
      );

      if (plannedOwnership.has(ownershipKey)) {
        const existing = plannedOwnership.get(ownershipKey)!;
        blockers.push({
          type: 'OWNERSHIP_COLLISION',
          taskId: task.id,
          taskTitle: task.title,
          conflictsWithId: existing.id,
          conflictsWithTitle: existing.title,
          details: `Ownership key "${ownershipKey}" already claimed by another money page`,
          suggestion: `Only one money page per service/location/intent. Merge or differentiate.`,
        });
        continue;
      }

      plannedOwnership.set(ownershipKey, task);
    }

    // ========================================
    // CHECK 5: Intent Overlap Detection
    // ========================================
    plannedSlugs.forEach((otherTask) => {
      if (otherTask.id === task.id) return;
      
      if (hasIntentOverlap(task, otherTask)) {
        // Same intent signature - potential cannibalisation
        const score = computeJaccardSimilarity(
          task.primaryQuestion || task.title,
          otherTask.primaryQuestion || otherTask.title
        );
        
        if (score > 0.5) {
          // High intent overlap + moderate content overlap = warning
          warnings.push(
            `Intent overlap detected: "${task.title}" and "${otherTask.title}" ` +
            `have same intent signature and ${Math.round(score * 100)}% content similarity`
          );
        }
      }
    });

    // Register this task
    plannedSlugs.set(normalizedSlug, task);
    plannedQuestions.set(taskQuestion.toLowerCase(), task);
  }

  return {
    isValid: blockers.length === 0,
    blockers,
    warnings,
    semanticDuplicates,
  };
}

