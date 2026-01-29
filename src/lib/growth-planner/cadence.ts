// ============================================================================
// CADENCE ENGINE - Perfect 4-Post Monthly Publishing Schedule
// ============================================================================
//
// THE PERFECT IA CONTENT CADENCE (4 POSTS / MONTH)
// 
// Core principle (non-negotiable):
// Every month must advance authority AND revenue — not just "publish content."
//
// Monthly Structure (Always 4 Pieces):
// Week 1 - MONEY page (revenue ownership)
// Week 2 - SUPPORT page (decision assist)
// Week 3 - CASE STUDY (trust + proof) - MANDATORY
// Week 4 - AUTHORITY page (AEO + topical authority)
//
// This cadence is:
// - Safe from cannibalisation
// - Realistic for any business
// - SEO + AEO aligned
// - Authority-building without content bloat
// ============================================================================

import { GrowthTask, GrowthPlanMonth, BusinessRealityModel, isGenericService } from './types';
import { PageRole } from '@/types';
import { v4 as uuid } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export type CadenceWeek = 1 | 2 | 3 | 4;

export type CadenceSlot = 'money' | 'support' | 'case-study' | 'authority';

export interface CadenceTask extends GrowthTask {
  /** Which week of the month this task belongs to */
  cadenceWeek: CadenceWeek;
  /** The cadence slot this task fills */
  cadenceSlot: CadenceSlot;
  /** The scheduled publishing date */
  publishAt: string; // ISO date string
}

export interface MonthCadence {
  month: number;
  startDate: string; // ISO date of month start
  slots: {
    money: CadenceTask | null;
    support: CadenceTask | null;
    'case-study': CadenceTask | null;
    authority: CadenceTask | null;
  };
  isComplete: boolean;
  missingSlots: CadenceSlot[];
}

export interface CadenceValidation {
  isValid: boolean;
  monthsProcessed: number;
  completeMonths: number;
  incompleteMonths: number;
  issues: CadenceIssue[];
  warnings: string[];
}

export interface CadenceIssue {
  month: number;
  slot: CadenceSlot;
  issue: 'missing' | 'wrong_role' | 'no_dependency' | 'no_publish_date';
  message: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Publishing day offsets from month start
 */
export const PUBLISH_DAY_OFFSETS: Record<CadenceWeek, number> = {
  1: 3,   // Week 1: Day 3-4 (money page)
  2: 10,  // Week 2: Day 10-11 (support page)
  3: 17,  // Week 3: Day 17-18 (case study)
  4: 24,  // Week 4: Day 24-25 (authority page)
};

/**
 * Required role for each cadence slot
 */
export const SLOT_ROLES: Record<CadenceSlot, PageRole[]> = {
  'money': ['money'],
  'support': ['support'],
  'case-study': ['trust'], // Case studies are trust pages
  'authority': ['authority'],
};

/**
 * Required search intent for each cadence slot
 */
export const SLOT_INTENTS: Record<CadenceSlot, GrowthTask['searchIntent'][]> = {
  'money': ['buy', 'compare'],
  'support': ['learn', 'compare'],
  'case-study': ['trust'],
  'authority': ['learn'],
};

// ============================================================================
// PUBLISHING DATE CALCULATION
// ============================================================================

/**
 * Calculate the publishing date for a cadence week
 */
export function calculatePublishDate(
  planStartDate: Date,
  month: number,
  week: CadenceWeek
): Date {
  // Calculate the start of the target month
  const monthStart = new Date(planStartDate);
  monthStart.setMonth(monthStart.getMonth() + (month - 1));
  monthStart.setDate(1);
  monthStart.setHours(9, 0, 0, 0); // 9 AM publish time
  
  // Add the day offset for this week
  const publishDate = new Date(monthStart);
  publishDate.setDate(publishDate.getDate() + PUBLISH_DAY_OFFSETS[week]);
  
  // If it falls on a weekend, move to Monday
  const dayOfWeek = publishDate.getDay();
  if (dayOfWeek === 0) { // Sunday
    publishDate.setDate(publishDate.getDate() + 1);
  } else if (dayOfWeek === 6) { // Saturday
    publishDate.setDate(publishDate.getDate() + 2);
  }
  
  return publishDate;
}

/**
 * Generate publishing dates for all 4 weeks of a month
 */
export function generateMonthPublishDates(
  planStartDate: Date,
  month: number
): Record<CadenceWeek, string> {
  return {
    1: calculatePublishDate(planStartDate, month, 1).toISOString(),
    2: calculatePublishDate(planStartDate, month, 2).toISOString(),
    3: calculatePublishDate(planStartDate, month, 3).toISOString(),
    4: calculatePublishDate(planStartDate, month, 4).toISOString(),
  };
}

// ============================================================================
// TASK CLASSIFICATION
// ============================================================================

/**
 * Determine which cadence slot a task should fill based on its properties
 */
export function classifyTaskSlot(task: GrowthTask): CadenceSlot | null {
  const titleLower = task.title.toLowerCase();
  
  // Case study detection (highest priority - mandatory slot)
  if (
    task.role === 'trust' ||
    titleLower.includes('case study') ||
    titleLower.includes('case-study') ||
    titleLower.includes('success story') ||
    titleLower.includes('client story') ||
    titleLower.includes('project story') ||
    titleLower.includes('how we helped') ||
    titleLower.includes('behind the scenes') ||
    titleLower.includes('real project')
  ) {
    return 'case-study';
  }
  
  // Money page detection
  if (task.role === 'money') {
    return 'money';
  }
  
  // Authority page detection
  if (task.role === 'authority') {
    return 'authority';
  }
  
  // Support page detection
  if (task.role === 'support') {
    return 'support';
  }
  
  // Unknown - can't classify
  return null;
}

/**
 * Check if a task matches a specific cadence slot
 */
export function taskMatchesSlot(task: GrowthTask, slot: CadenceSlot): boolean {
  const taskSlot = classifyTaskSlot(task);
  return taskSlot === slot;
}

// ============================================================================
// DEPENDENCY ENFORCEMENT
// ============================================================================

/**
 * Ensure support tasks properly reference the money page
 */
export function enforceSupportDependency(
  supportTask: CadenceTask,
  moneyTask: CadenceTask
): CadenceTask {
  return {
    ...supportTask,
    supportsPage: moneyTask.slug,
    internalLinksUp: [moneyTask.slug],
  };
}

/**
 * Ensure case study properly references the money page
 */
export function enforceCaseStudyDependency(
  caseStudyTask: CadenceTask,
  moneyTask: CadenceTask
): CadenceTask {
  return {
    ...caseStudyTask,
    supportsPage: moneyTask.slug,
    primaryService: moneyTask.primaryService,
    internalLinksUp: [moneyTask.slug],
  };
}

/**
 * Ensure authority page links to the money page
 * Authority pages should also reference the money page they support
 */
export function enforceAuthorityDependency(
  authorityTask: CadenceTask,
  moneyTask: CadenceTask
): CadenceTask {
  return {
    ...authorityTask,
    // Authority pages must support the money page (required by spec)
    supportsPage: moneyTask.slug,
    internalLinksUp: [moneyTask.slug, ...(authorityTask.internalLinksUp || [])].filter((v, i, a) => a.indexOf(v) === i),
  };
}

// ============================================================================
// MONTH ORGANIZATION
// ============================================================================

/**
 * Organize tasks into their cadence slots for a single month
 */
export function organizeMonthCadence(
  tasks: GrowthTask[],
  month: number,
  planStartDate: Date
): MonthCadence {
  const publishDates = generateMonthPublishDates(planStartDate, month);
  
  const slots: MonthCadence['slots'] = {
    money: null,
    support: null,
    'case-study': null,
    authority: null,
  };
  
  // Sort tasks to prioritize explicit classifications
  const sortedTasks = [...tasks].sort((a, b) => {
    // Trust pages first (for case study detection)
    if (a.role === 'trust' && b.role !== 'trust') return -1;
    if (b.role === 'trust' && a.role !== 'trust') return 1;
    // Money pages second
    if (a.role === 'money' && b.role !== 'money') return -1;
    if (b.role === 'money' && a.role !== 'money') return 1;
    return 0;
  });
  
  // Assign tasks to slots
  for (const task of sortedTasks) {
    const slot = classifyTaskSlot(task);
    if (slot && !slots[slot]) {
      const week = getWeekForSlot(slot);
      const cadenceTask: CadenceTask = {
        ...task,
        cadenceWeek: week,
        cadenceSlot: slot,
        publishAt: publishDates[week],
      };
      slots[slot] = cadenceTask;
    }
  }
  
  // Find missing slots
  const missingSlots: CadenceSlot[] = [];
  for (const slotName of Object.keys(slots) as CadenceSlot[]) {
    if (!slots[slotName]) {
      missingSlots.push(slotName);
    }
  }
  
  return {
    month,
    startDate: planStartDate.toISOString(),
    slots,
    isComplete: missingSlots.length === 0,
    missingSlots,
  };
}

/**
 * Get the week number for a cadence slot
 */
function getWeekForSlot(slot: CadenceSlot): CadenceWeek {
  switch (slot) {
    case 'money': return 1;
    case 'support': return 2;
    case 'case-study': return 3;
    case 'authority': return 4;
  }
}

// ============================================================================
// CASE STUDY GENERATION
// ============================================================================

/**
 * Generate a case study task when one is missing
 * Case studies are MANDATORY every month
 */
export function generateCaseStudyTask(
  month: number,
  moneyTask: CadenceTask | null,
  business: BusinessRealityModel,
  publishAt: string
): CadenceTask {
  const service = moneyTask?.primaryService || business.coreServices[0] || 'our service';
  const location = moneyTask?.primaryLocation || business.primaryLocations[0] || null;
  
  // Generate case study title based on business context
  const titleVariants = [
    `How We Helped a ${location || 'Local'} Client with ${service}`,
    `${service} Success Story: A Real Project${location ? ` in ${location}` : ''}`,
    `Behind the Scenes: Our ${service} Process in Action`,
    `Client Results: What ${service} Really Looks Like`,
    `A Real ${service} Project – From Start to Finish`,
  ];
  
  // Rotate through variants based on month
  const title = titleVariants[(month - 1) % titleVariants.length];
  
  const slugBase = service.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  
  return {
    id: `task-${month}-case-study-${Date.now()}`,
    month,
    title,
    slug: `/${slugBase}-case-study-${month}`,
    action: 'create',
    role: 'trust',
    supportsPage: moneyTask?.slug || null,
    supportType: 'trust',
    primaryService: service,
    primaryLocation: location,
    targetAudience: business.niche || 'potential clients',
    searchIntent: 'trust',
    estimatedWords: 1200,
    channel: 'wp',
    status: 'planned',
    briefId: null,
    localAnchoring: location,
    experienceRequired: ['Real project examples', 'Client outcomes', 'Process details'],
    proofElements: business.scenarioProof?.map(p => p.statement) || [],
    reviewThemesToUse: business.reviewThemes?.slice(0, 2).map(r => r.theme) || [],
    internalLinksUp: moneyTask ? [moneyTask.slug] : [],
    internalLinksDown: [],
    conversionPath: `See how we can help you with ${service}`,
    // Cadence fields
    cadenceWeek: 3,
    cadenceSlot: 'case-study',
    publishAt,
  };
}

/**
 * Get service for a specific month - ROTATES through all services
 */
function getServiceForMonth(month: number, business: BusinessRealityModel): string {
  const validServices = business.coreServices.filter(s => !isGenericService(s));
  if (validServices.length === 0) {
    return business.coreServices[0] || 'services';
  }
  return validServices[(month - 1) % validServices.length];
}

/**
 * Generate a MONEY page task when one is missing
 */
export function generateMoneyTask(
  month: number,
  business: BusinessRealityModel,
  publishAt: string
): CadenceTask {
  const service = getServiceForMonth(month, business);
  const location = business.primaryLocations[(month - 1) % Math.max(1, business.primaryLocations.length)] || null;
  
  // Intelligent money page title variants
  const titleVariants = [
    `${service}${location ? ` in ${location}` : ''}: What to Expect & How to Book`,
    `Professional ${service}${location ? ` for ${location}` : ''} | ${business.name}`,
    `${service} Services: Process, Investment & Results`,
    `Expert ${service}${location ? ` in ${location}` : ''} – Get Started Today`,
    `${service}: How ${business.name} Delivers Results`,
  ];
  
  const title = titleVariants[(month - 1) % titleVariants.length];
  const slugBase = service.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const locationSlug = location ? `-${location.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
  
  return {
    id: uuid(),
    month,
    title,
    slug: `/${slugBase}${locationSlug}`,
    action: 'create',
    role: 'money',
    supportsPage: null,
    supportType: null,
    primaryService: service,
    primaryLocation: location,
    targetAudience: `${business.niche} clients seeking ${service}${location ? ` in ${location}` : ''}`,
    searchIntent: 'buy',
    estimatedWords: 1500,
    channel: 'wp',
    status: 'planned',
    briefId: null,
    localAnchoring: location ? `Content specifically for ${location} area` : null,
    experienceRequired: [
      business.yearsActive ? `${business.yearsActive}+ years of ${service} experience` : `Expert ${service} knowledge`,
      ...(business.proofAssets?.slice(0, 2) || []),
    ],
    proofElements: business.scenarioProof?.map(p => p.statement) || [],
    reviewThemesToUse: business.reviewThemes?.slice(0, 2).map(r => r.theme) || [],
    internalLinksUp: [],
    internalLinksDown: [],
    conversionPath: `Book ${service}${location ? ` in ${location}` : ''}`,
    // Cadence fields
    cadenceWeek: 1,
    cadenceSlot: 'money',
    publishAt,
  };
}

/**
 * Generate a SUPPORT page task when one is missing
 */
export function generateSupportTask(
  month: number,
  moneyTask: CadenceTask | null,
  business: BusinessRealityModel,
  publishAt: string
): CadenceTask {
  const service = moneyTask?.primaryService || getServiceForMonth(month, business);
  const location = moneyTask?.primaryLocation || business.primaryLocations[0] || null;
  
  // Rotate through different support content types
  const supportTypes: Array<{ type: 'faq' | 'process' | 'benefits' | 'checklist' | 'cost'; title: string }> = [
    { type: 'faq', title: `${service} Questions Answered: What You Need to Know${location ? ` in ${location}` : ''}` },
    { type: 'process', title: `What to Expect: Your ${service} Journey Step-by-Step` },
    { type: 'benefits', title: `Why ${service}? Benefits That Matter${location ? ` for ${location} Clients` : ''}` },
    { type: 'checklist', title: `${service} Preparation: Your Complete Checklist` },
    { type: 'cost', title: `${service} Investment Guide: What to Budget${location ? ` in ${location}` : ''}` },
  ];
  
  const selected = supportTypes[(month - 1) % supportTypes.length];
  const slugBase = service.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  
  return {
    id: uuid(),
    month,
    title: selected.title,
    slug: `/${slugBase}-${selected.type}`,
    action: 'create',
    role: 'support',
    supportsPage: moneyTask?.slug || null,
    supportType: 'education',
    primaryService: service,
    primaryLocation: location,
    targetAudience: `${business.niche} clients seeking ${service} information`,
    searchIntent: 'learn',
    estimatedWords: 1200,
    channel: 'wp',
    status: 'planned',
    briefId: null,
    localAnchoring: location ? `Content specifically for ${location} area` : null,
    experienceRequired: [
      business.yearsActive ? `${business.yearsActive}+ years of ${service} experience` : `Expert ${service} knowledge`,
      ...(business.proofAssets?.slice(0, 1) || []),
    ],
    proofElements: [],
    reviewThemesToUse: business.reviewThemes?.filter(r => 
      r.theme.toLowerCase().includes('helpful') || 
      r.theme.toLowerCase().includes('clear') ||
      r.theme.toLowerCase().includes('responsive')
    ).slice(0, 2).map(r => r.theme) || [],
    internalLinksUp: moneyTask ? [moneyTask.slug, '/contact'] : ['/contact'],
    internalLinksDown: [],
    conversionPath: `Guide to next step for ${service}`,
    // Cadence fields
    cadenceWeek: 2,
    cadenceSlot: 'support',
    publishAt,
  };
}

/**
 * Generate an AUTHORITY page task when one is missing
 */
export function generateAuthorityTask(
  month: number,
  moneyTask: CadenceTask | null,
  business: BusinessRealityModel,
  publishAt: string
): CadenceTask {
  const service = moneyTask?.primaryService || getServiceForMonth(month, business);
  const year = new Date().getFullYear();
  
  // Rotate through different authority content types
  const authorityTypes: Array<{ title: string; slug: string }> = [
    { 
      title: `The Complete ${service} Guide for ${year}`, 
      slug: `/${service.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-guide-${year}` 
    },
    { 
      title: `When Do You Actually Need ${service}?`, 
      slug: `/${service.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-when-needed` 
    },
    { 
      title: `${service} vs DIY: What's Right for You?`, 
      slug: `/${service.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-vs-diy` 
    },
    { 
      title: `How to Choose the Right ${service} Provider`, 
      slug: `/choosing-${service.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-provider` 
    },
    { 
      title: `${service} Trends & Insights for ${year}`, 
      slug: `/${service.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-trends-${year}` 
    },
    { 
      title: `Common ${service} Mistakes to Avoid`, 
      slug: `/${service.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-mistakes-avoid` 
    },
  ];
  
  const selected = authorityTypes[(month - 1) % authorityTypes.length];
  
  return {
    id: uuid(),
    month,
    title: selected.title,
    slug: selected.slug,
    action: 'create',
    role: 'authority',
    supportsPage: null,
    supportType: null,
    primaryService: service,
    primaryLocation: null,
    targetAudience: `${business.niche} researchers and prospects`,
    searchIntent: 'learn',
    estimatedWords: 2000,
    channel: 'wp',
    status: 'planned',
    briefId: null,
    localAnchoring: null,
    experienceRequired: [
      business.yearsActive ? `${business.yearsActive}+ years of ${service} experience` : `Expert ${service} knowledge`,
      'Industry insights and expertise',
    ],
    proofElements: business.scenarioProof?.slice(0, 2).map(p => p.statement) || [],
    reviewThemesToUse: business.reviewThemes?.filter(r => 
      r.theme.toLowerCase().includes('expert') || 
      r.theme.toLowerCase().includes('knowledge') ||
      r.theme.toLowerCase().includes('professional')
    ).slice(0, 2).map(r => r.theme) || [],
    internalLinksUp: moneyTask ? [moneyTask.slug] : [],
    internalLinksDown: [],
    conversionPath: `Learn more, then contact ${business.name}`,
    // Cadence fields
    cadenceWeek: 4,
    cadenceSlot: 'authority',
    publishAt,
  };
}

// ============================================================================
// CADENCE ENFORCEMENT
// ============================================================================

/**
 * Enforce the 4-post cadence on a month's tasks
 * Returns exactly 4 tasks with proper slots, dates, and dependencies
 */
export function enforceCadence(
  monthData: GrowthPlanMonth,
  planStartDate: Date,
  business: BusinessRealityModel
): {
  tasks: CadenceTask[];
  warnings: string[];
  wasModified: boolean;
} {
  const { month, tasks } = monthData;
  const warnings: string[] = [];
  let wasModified = false;
  
  // First, organize what we have
  const organized = organizeMonthCadence(tasks, month, planStartDate);
  
  // Collect the 4 tasks (generating missing ones if needed)
  const finalTasks: CadenceTask[] = [];
  const publishDates = generateMonthPublishDates(planStartDate, month);
  
  // 1. MONEY PAGE (Week 1) - Required - ALWAYS generate if missing
  if (organized.slots.money) {
    finalTasks.push(organized.slots.money);
  } else {
    // Try to find any money-like task
    const anyMoneyTask = tasks.find(t => t.role === 'money' || t.searchIntent === 'buy');
    if (anyMoneyTask) {
      const moneyTask: CadenceTask = {
        ...anyMoneyTask,
        role: 'money',
        cadenceWeek: 1,
        cadenceSlot: 'money',
        publishAt: publishDates[1],
      };
      finalTasks.push(moneyTask);
      wasModified = true;
    } else {
      // GENERATE a money page - don't leave empty
      console.log(`[Cadence] Month ${month}: Generating money page`);
      const generatedMoney = generateMoneyTask(month, business, publishDates[1]);
      finalTasks.push(generatedMoney);
      wasModified = true;
      warnings.push(`Month ${month}: Money page auto-generated`);
    }
  }
  
  // Get the money task for dependencies
  const moneyTask = finalTasks.find(t => t.cadenceSlot === 'money') || null;
  
  // 2. SUPPORT PAGE (Week 2) - Required - ALWAYS generate if missing
  if (organized.slots.support) {
    const supportTask = moneyTask 
      ? enforceSupportDependency(organized.slots.support, moneyTask)
      : organized.slots.support;
    finalTasks.push(supportTask);
  } else {
    // Try to find any support-like task
    const anySupportTask = tasks.find(t => 
      t.role === 'support' || 
      t.searchIntent === 'learn' ||
      t.title.toLowerCase().includes('how to') ||
      t.title.toLowerCase().includes('guide')
    );
    if (anySupportTask && !finalTasks.find(t => t.id === anySupportTask.id)) {
      let supportTask: CadenceTask = {
        ...anySupportTask,
        role: 'support',
        cadenceWeek: 2,
        cadenceSlot: 'support',
        publishAt: publishDates[2],
      };
      if (moneyTask) {
        supportTask = enforceSupportDependency(supportTask, moneyTask);
      }
      finalTasks.push(supportTask);
      wasModified = true;
    } else {
      // GENERATE a support page - don't leave empty
      console.log(`[Cadence] Month ${month}: Generating support page`);
      const generatedSupport = generateSupportTask(month, moneyTask, business, publishDates[2]);
      finalTasks.push(generatedSupport);
      wasModified = true;
      warnings.push(`Month ${month}: Support page auto-generated`);
    }
  }
  
  // 3. CASE STUDY (Week 3) - MANDATORY
  if (organized.slots['case-study']) {
    const caseStudyTask = moneyTask
      ? enforceCaseStudyDependency(organized.slots['case-study'], moneyTask)
      : organized.slots['case-study'];
    finalTasks.push(caseStudyTask);
  } else {
    // Generate a case study - this is mandatory
    console.log(`[Cadence] Month ${month}: Generating mandatory case study`);
    const generatedCaseStudy = generateCaseStudyTask(month, moneyTask, business, publishDates[3]);
    finalTasks.push(generatedCaseStudy);
    wasModified = true;
    warnings.push(`Month ${month}: Case study auto-generated (consider adding real project details)`);
  }
  
  // 4. AUTHORITY PAGE (Week 4) - Required - ALWAYS generate if missing
  if (organized.slots.authority) {
    const authorityTask = moneyTask
      ? enforceAuthorityDependency(organized.slots.authority, moneyTask)
      : organized.slots.authority;
    finalTasks.push(authorityTask);
  } else {
    // Try to find any authority-like task
    const anyAuthorityTask = tasks.find(t => 
      t.role === 'authority' ||
      t.title.toLowerCase().includes('when do') ||
      t.title.toLowerCase().includes('vs') ||
      t.title.toLowerCase().includes('compare')
    );
    if (anyAuthorityTask && !finalTasks.find(t => t.id === anyAuthorityTask.id)) {
      let authorityTask: CadenceTask = {
        ...anyAuthorityTask,
        role: 'authority',
        cadenceWeek: 4,
        cadenceSlot: 'authority',
        publishAt: publishDates[4],
      };
      if (moneyTask) {
        authorityTask = enforceAuthorityDependency(authorityTask, moneyTask);
      }
      finalTasks.push(authorityTask);
      wasModified = true;
    } else {
      // GENERATE an authority page - don't leave empty
      console.log(`[Cadence] Month ${month}: Generating authority page`);
      const generatedAuthority = generateAuthorityTask(month, moneyTask, business, publishDates[4]);
      finalTasks.push(generatedAuthority);
      wasModified = true;
      warnings.push(`Month ${month}: Authority page auto-generated`);
    }
  }
  
  // Sort by week
  finalTasks.sort((a, b) => a.cadenceWeek - b.cadenceWeek);
  
  // ========================================
  // FINAL VALIDATION: All non-money tasks MUST have supportsPage
  // ========================================
  for (const task of finalTasks) {
    if (task.cadenceSlot !== 'money' && !task.supportsPage) {
      // This is a blocker - every non-money task must support a money page
      if (moneyTask) {
        // Auto-fix: assign to the month's money task
        task.supportsPage = moneyTask.slug;
        task.internalLinksUp = [moneyTask.slug, ...(task.internalLinksUp || [])].filter((v, i, a) => a.indexOf(v) === i);
        warnings.push(`Month ${month}: ${task.cadenceSlot} page was orphaned - assigned to money page`);
        wasModified = true;
      } else {
        warnings.push(`Month ${month}: ${task.cadenceSlot} page has no supportsPage (blocker)`);
      }
    }
  }
  
  return {
    tasks: finalTasks,
    warnings,
    wasModified,
  };
}

// ============================================================================
// FULL PLAN CADENCE ENFORCEMENT
// ============================================================================

/**
 * Apply cadence to an entire growth plan
 * Ensures every month has exactly 4 posts with proper scheduling
 * IMPORTANT: This function CREATES missing months - all 12 months will be in output
 */
export function applyPlanCadence(
  months: GrowthPlanMonth[],
  planStartDate: Date,
  business: BusinessRealityModel
): {
  months: GrowthPlanMonth[];
  validation: CadenceValidation;
} {
  const processedMonths: GrowthPlanMonth[] = [];
  const allWarnings: string[] = [];
  const issues: CadenceIssue[] = [];
  let completeMonths = 0;
  let incompleteMonths = 0;
  
  // Create a map of existing months for quick lookup
  const monthMap = new Map<number, GrowthPlanMonth>();
  for (const monthData of months) {
    monthMap.set(monthData.month, monthData);
  }
  
  // ALWAYS process all 12 months, generating missing ones
  for (let monthNum = 1; monthNum <= 12; monthNum++) {
    // Get existing month data or create empty one with all required fields
    const existingMonth = monthMap.get(monthNum);
    const monthData: GrowthPlanMonth = existingMonth || {
      month: monthNum,
      theme: `Month ${monthNum} focus`,
      focus: monthNum <= 3 ? 'foundation' : monthNum <= 6 ? 'depth' : monthNum <= 9 ? 'expansion' : 'authority',
      tasks: [],
      monthlyGoal: `Establish ${getServiceForMonth(monthNum, business)} presence`,
      kpis: ['Publish 4 posts', 'Cover all cadence slots'],
    };
    
    if (!existingMonth) {
      console.log(`[Cadence] Month ${monthNum}: Creating missing month`);
      allWarnings.push(`Month ${monthNum}: Was missing - generated all content`);
    }
    
    const { tasks, warnings, wasModified } = enforceCadence(monthData, planStartDate, business);
    
    allWarnings.push(...warnings);
    
    // Check if month is complete (all 4 slots filled)
    const hasAllSlots = 
      tasks.some(t => t.cadenceSlot === 'money') &&
      tasks.some(t => t.cadenceSlot === 'support') &&
      tasks.some(t => t.cadenceSlot === 'case-study') &&
      tasks.some(t => t.cadenceSlot === 'authority');
    
    if (hasAllSlots) {
      completeMonths++;
    } else {
      incompleteMonths++;
      
      // Record specific missing slots
      const slots: CadenceSlot[] = ['money', 'support', 'case-study', 'authority'];
      for (const slot of slots) {
        if (!tasks.some(t => t.cadenceSlot === slot)) {
          issues.push({
            month: monthNum,
            slot,
            issue: 'missing',
            message: `Month ${monthNum} is missing a ${slot} page`,
          });
        }
      }
    }
    
    // Build the processed month
    processedMonths.push({
      ...monthData,
      tasks: tasks as GrowthTask[], // CadenceTask extends GrowthTask
    });
  }
  
  const validation: CadenceValidation = {
    isValid: incompleteMonths === 0,
    monthsProcessed: 12, // Always process all 12 months
    completeMonths,
    incompleteMonths,
    issues,
    warnings: allWarnings,
  };
  
  return {
    months: processedMonths,
    validation,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate a plan's cadence without modifying it
 */
export function validateCadence(
  months: GrowthPlanMonth[],
  planStartDate: Date
): CadenceValidation {
  const issues: CadenceIssue[] = [];
  const warnings: string[] = [];
  let completeMonths = 0;
  let incompleteMonths = 0;
  
  for (const monthData of months) {
    const organized = organizeMonthCadence(monthData.tasks, monthData.month, planStartDate);
    
    if (organized.isComplete) {
      completeMonths++;
      
      // Validate dependencies
      const moneyTask = organized.slots.money;
      const supportTask = organized.slots.support;
      const caseStudyTask = organized.slots['case-study'];
      const authorityTask = organized.slots.authority;
      
      if (supportTask && moneyTask && supportTask.supportsPage !== moneyTask.slug) {
        warnings.push(`Month ${monthData.month}: Support page doesn't reference money page`);
      }
      
      if (caseStudyTask && moneyTask && caseStudyTask.supportsPage !== moneyTask.slug) {
        warnings.push(`Month ${monthData.month}: Case study doesn't reference money page`);
      }
      
      // Check publish dates exist
      for (const slot of Object.keys(organized.slots) as CadenceSlot[]) {
        const task = organized.slots[slot];
        if (task && !task.publishAt) {
          issues.push({
            month: monthData.month,
            slot,
            issue: 'no_publish_date',
            message: `Month ${monthData.month} ${slot} task has no publish date`,
          });
        }
      }
    } else {
      incompleteMonths++;
      
      for (const slot of organized.missingSlots) {
        issues.push({
          month: monthData.month,
          slot,
          issue: 'missing',
          message: `Month ${monthData.month} is missing a ${slot} page`,
        });
      }
    }
  }
  
  return {
    isValid: incompleteMonths === 0 && issues.length === 0,
    monthsProcessed: months.length,
    completeMonths,
    incompleteMonths,
    issues,
    warnings,
  };
}

// ============================================================================
// EXPORT HELPERS
// ============================================================================

/**
 * Get a human-readable schedule from cadence tasks
 */
export function formatPublishingSchedule(
  months: GrowthPlanMonth[]
): Array<{
  month: number;
  schedule: Array<{
    week: number;
    slot: string;
    title: string;
    publishDate: string;
    role: PageRole;
  }>;
}> {
  return months.map(m => ({
    month: m.month,
    schedule: m.tasks
      .filter((t): t is CadenceTask => 'cadenceWeek' in t)
      .sort((a, b) => a.cadenceWeek - b.cadenceWeek)
      .map(t => ({
        week: t.cadenceWeek,
        slot: t.cadenceSlot,
        title: t.title,
        publishDate: new Date(t.publishAt).toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        role: t.role,
      })),
  }));
}

/**
 * Get total content counts by role across the plan
 */
export function getCadenceStats(
  months: GrowthPlanMonth[]
): {
  totalPosts: number;
  bySlot: Record<CadenceSlot, number>;
  byMonth: Array<{ month: number; postCount: number; isComplete: boolean }>;
  averagePostsPerMonth: number;
} {
  const bySlot: Record<CadenceSlot, number> = {
    'money': 0,
    'support': 0,
    'case-study': 0,
    'authority': 0,
  };
  
  const byMonth = months.map(m => {
    const cadenceTasks = m.tasks.filter((t): t is CadenceTask => 'cadenceSlot' in t);
    
    for (const task of cadenceTasks) {
      bySlot[task.cadenceSlot]++;
    }
    
    return {
      month: m.month,
      postCount: cadenceTasks.length,
      isComplete: cadenceTasks.length === 4,
    };
  });
  
  const totalPosts = Object.values(bySlot).reduce((a, b) => a + b, 0);
  
  return {
    totalPosts,
    bySlot,
    byMonth,
    averagePostsPerMonth: months.length > 0 ? totalPosts / months.length : 0,
  };
}
