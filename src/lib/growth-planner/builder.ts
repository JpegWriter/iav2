// ============================================================================
// GROWTH PLANNER ENGINE - PLAN BUILDER (Phase 2)
// ============================================================================

import { v4 as uuid } from 'uuid';
import {
  BusinessRealityModel,
  GapAnalysis,
  PageGap,
  GrowthTask,
  GrowthPlanMonth,
  SupportType,
  GapAction,
  SiteStructureContext,
  calculateFoundationScore,
  FOUNDATION_THRESHOLDS,
  isGenericService,
} from './types';
import { PageRole, Channel } from '@/types';

// ============================================================================
// INTELLIGENT TITLE GENERATOR
// ============================================================================

type ContentType = 'faq' | 'process' | 'benefits' | 'checklist' | 'cost' | 'comparison' | 
                   'case-study' | 'guide' | 'tips' | 'location' | 'seasonal';

/**
 * Generate intelligent, SEO-optimized titles based on business context
 * These titles are designed to:
 * 1. Match user search intent
 * 2. Include relevant keywords naturally
 * 3. Be specific to the business niche
 * 4. Drive clicks and conversions
 */
function generateIntelligentTitle(
  service: string,
  contentType: ContentType,
  business: BusinessRealityModel,
  options: {
    location?: string | null;
    year?: number;
    season?: string;
  } = {}
): string {
  const { location, year = new Date().getFullYear(), season } = options;
  const locationSuffix = location ? ` in ${location}` : '';
  const niche = business.niche !== 'General' ? business.niche : '';
  
  // Get a differentiator if available
  const diff = business.differentiators[0] || '';
  const yearsExp = business.yearsActive ? `${business.yearsActive}+ Years` : '';
  
  // Build title templates optimized for search and conversion
  const templates: Record<ContentType, string[]> = {
    'faq': [
      `${service} Questions Answered: What You Need to Know${locationSuffix}`,
      `Your ${service} Questions Answered by ${niche || 'Industry'} Experts`,
      `${service} FAQ: Honest Answers from${yearsExp ? ` ${yearsExp} Experience` : ' Experts'}`,
    ],
    'process': [
      `What to Expect: Your ${service} Journey Step-by-Step`,
      `How ${service} Works: From First Contact to Results`,
      `The ${business.name} ${service} Process Explained`,
    ],
    'benefits': [
      `Why ${service}? ${diff ? `${diff}` : 'Benefits That Matter'}${locationSuffix}`,
      `${service} Benefits: What You Actually Get${locationSuffix}`,
      `Transform Your ${niche || 'Business'} with Professional ${service}`,
    ],
    'checklist': [
      `${service} Preparation: Your Complete Checklist`,
      `Get Ready for ${service}: Essential Steps${locationSuffix}`,
      `Before Your ${service}: What to Prepare`,
    ],
    'cost': [
      `${service} Investment Guide: What to Budget${locationSuffix}`,
      `Understanding ${service} Costs: Transparent Pricing${locationSuffix}`,
      `${service} Pricing: What Drives the Investment`,
    ],
    'comparison': [
      `Choosing ${service}: What Sets Quality Apart`,
      `${service} Options Compared: Making the Right Choice`,
      `What to Look for in ${niche || 'a'} ${service} Provider`,
    ],
    'case-study': [
      `${service} Success Story: Real Results for Real Clients`,
      `How We Delivered ${service} Results: A Case Study`,
      `${service} in Action: Client Success${locationSuffix}`,
    ],
    'guide': [
      `The Complete ${service} Guide for ${year}`,
      `${service} Explained: Everything You Need to Know`,
      `Your ${service} Handbook: Expert Insights${locationSuffix}`,
    ],
    'tips': [
      `${service} Tips: Expert Advice That Works`,
      `Get More from Your ${service}: Pro Tips`,
      `${service} Best Practices: What the Experts Know`,
    ],
    'location': [
      `${service}${locationSuffix}: Local Expertise, Proven Results`,
      `Your ${location || 'Local'} ${service} Specialists`,
      `${service}${locationSuffix} by ${business.name}`,
    ],
    'seasonal': [
      `${season || 'Seasonal'} ${service}: Special Offers${locationSuffix}`,
      `${service} for ${season || 'the Season'}: Limited Time`,
      `${season || 'This Season'}'s ${service} Opportunities`,
    ],
  };

  // Select the best template based on what context we have
  const options_list = templates[contentType];
  
  // Prefer templates that use available context
  if (diff && options_list.some(t => t.includes(diff))) {
    return options_list.find(t => t.includes(diff)) || options_list[0];
  }
  if (yearsExp && options_list.some(t => t.includes(yearsExp))) {
    return options_list.find(t => t.includes(yearsExp)) || options_list[0];
  }
  if (location && options_list.some(t => t.includes(location))) {
    return options_list.find(t => t.includes(location)) || options_list[0];
  }
  
  return options_list[0];
}

// ============================================================================
// TOPIC SELECTION ENRICHER (Personalization Engine)
// ============================================================================

/**
 * Topic derivation sources in priority order:
 * 1. Gaps in sitemap (missing pages for services/locations)
 * 2. Weak pages (existing pages that need expansion)
 * 3. Location demand (cities/areas to target)
 * 4. Review themes (what customers actually talk about)
 * 5. Service variants (specific offerings within core services)
 * 
 * NEVER pick topics that don't map to a real service or local demand.
 */
export interface TopicSource {
  source: 'gap' | 'weak-page' | 'location' | 'review-theme' | 'service-variant';
  topic: string;
  relevantService: string;
  relevantLocation?: string;
  priority: 'high' | 'medium' | 'low';
  rationale: string;
}

/**
 * Derive personalized topics from business reality.
 * Each topic must trace back to a real service or demand signal.
 */
export function deriveTopicsFromReality(
  business: BusinessRealityModel,
  gaps: GapAnalysis
): TopicSource[] {
  const topics: TopicSource[] = [];

  // 1. Gaps in sitemap (HIGHEST PRIORITY - missing pages for known services/locations)
  for (const gap of gaps.moneyPageGaps) {
    if (gap.targetService && !isGenericService(gap.targetService)) {
      topics.push({
        source: 'gap',
        topic: gap.suggestedTitle,
        relevantService: gap.targetService,
        relevantLocation: gap.targetLocation || undefined,
        priority: gap.priority === 'critical' ? 'high' : gap.priority === 'high' ? 'high' : 'medium',
        rationale: gap.reason,
      });
    }
  }

  for (const gap of gaps.trustGaps) {
    topics.push({
      source: 'gap',
      topic: gap.suggestedTitle,
      relevantService: business.coreServices[0] || 'General',
      priority: 'high',
      rationale: gap.reason,
    });
  }

  for (const gap of gaps.supportGaps) {
    const service = gap.targetService || business.coreServices[0];
    if (service && !isGenericService(service)) {
      topics.push({
        source: 'gap',
        topic: gap.suggestedTitle,
        relevantService: service,
        priority: 'medium',
        rationale: gap.reason,
      });
    }
  }

  // 2. Location demand (expand services to new locations)
  for (const location of business.primaryLocations) {
    for (const service of business.coreServices.filter(s => !isGenericService(s))) {
      // Check if we already have a location+service page
      const hasPage = gaps.moneyPageGaps.some(
        g => g.targetService === service && g.targetLocation === location
      );
      if (!hasPage) {
        topics.push({
          source: 'location',
          topic: `${service} in ${location}`,
          relevantService: service,
          relevantLocation: location,
          priority: 'high',
          rationale: `Expand ${service} visibility in ${location} area`,
        });
      }
    }
  }

  // 3. Review themes (what customers actually talk about - great for support content)
  for (const theme of business.reviewThemes) {
    if (theme.count >= 2) {
      // Find which service this theme relates to
      const relatedService = business.coreServices.find(
        s => theme.theme.toLowerCase().includes(s.toLowerCase()) ||
             s.toLowerCase().includes(theme.theme.split(' ')[0].toLowerCase())
      ) || business.coreServices[0];

      if (relatedService && !isGenericService(relatedService)) {
        topics.push({
          source: 'review-theme',
          topic: `${theme.theme} - What ${business.name} Clients Say`,
          relevantService: relatedService,
          priority: 'medium',
          rationale: `${theme.count} reviews mention "${theme.theme}" - proven customer interest`,
        });
      }
    }
  }

  // 4. Service variants (drilling deeper into core services)
  // This requires knowledge of common variants - use differentiators as hints
  for (const diff of business.differentiators) {
    const relatedService = business.coreServices[0];
    if (relatedService && !isGenericService(relatedService)) {
      topics.push({
        source: 'service-variant',
        topic: `${relatedService}: ${diff}`,
        relevantService: relatedService,
        priority: 'low',
        rationale: `Highlight differentiator: ${diff}`,
      });
    }
  }

  return topics;
}

/**
 * Filter and rank topics based on personalization requirements.
 * Rejects any topic that:
 * - Maps to a generic service
 * - Has no clear service connection
 * - Is pure fluff (e.g., "Tips for Success")
 */
export function rankTopics(topics: TopicSource[]): TopicSource[] {
  // Filter out any remaining generics
  const validTopics = topics.filter(t => {
    if (isGenericService(t.relevantService)) return false;
    if (t.topic.length < 10) return false; // Too vague
    if (/^(tips|guide|how to|what is)$/i.test(t.topic)) return false; // Pure generic
    return true;
  });

  // Sort by priority: high > medium > low
  // Within same priority, prefer gaps over other sources
  return validTopics.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sourceOrder = { gap: 0, 'weak-page': 1, location: 2, 'review-theme': 3, 'service-variant': 4 };
    
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    return sourceOrder[a.source] - sourceOrder[b.source];
  });
}

/**
 * Select topics for a specific month phase.
 * Returns topics appropriate for the phase (foundation/depth/authority).
 */
export function selectTopicsForPhase(
  rankedTopics: TopicSource[],
  phase: 'foundation' | 'depth' | 'expansion' | 'authority' | 'optimization',
  count: number
): TopicSource[] {
  const phaseSourceMap: Record<typeof phase, TopicSource['source'][]> = {
    foundation: ['gap'],
    depth: ['gap', 'location'],
    expansion: ['location', 'review-theme', 'service-variant'],
    authority: ['review-theme', 'service-variant'],
    optimization: ['weak-page', 'service-variant'],
  };

  const preferredSources = phaseSourceMap[phase];
  
  // First, get topics matching preferred sources
  const preferred = rankedTopics.filter(t => preferredSources.includes(t.source));
  
  // If not enough, fall back to any valid topic
  const result = [...preferred];
  if (result.length < count) {
    const remaining = rankedTopics.filter(t => !preferred.includes(t));
    result.push(...remaining.slice(0, count - result.length));
  }

  return result.slice(0, count);
}

// ============================================================================
// GAP TRACKER - Prevents duplicate gap usage across months
// ============================================================================

/**
 * Tracks which gaps have been consumed during plan building.
 * This ensures each month gets fresh content instead of duplicates.
 */
class GapTracker {
  private usedMoneyGapPaths: Set<string> = new Set();
  private usedTrustGapTitles: Set<string> = new Set();
  private usedSupportGapTitles: Set<string> = new Set();
  private usedBlockerPages: Set<string> = new Set();

  constructor(private gaps: GapAnalysis) {}

  /** Get unconsumed conversion blockers */
  getBlockers(limit: number): typeof this.gaps.conversionBlockers {
    const available = this.gaps.conversionBlockers.filter(
      (b) => !this.usedBlockerPages.has(b.page)
    );
    const selected = available.slice(0, limit);
    selected.forEach((b) => this.usedBlockerPages.add(b.page));
    return selected;
  }

  /** Get unconsumed money page gaps by priority */
  getMoneyGaps(priority: 'critical' | 'high' | 'medium', limit: number): PageGap[] {
    const available = this.gaps.moneyPageGaps.filter(
      (g) => g.priority === priority && !this.usedMoneyGapPaths.has(g.path || g.suggestedTitle)
    );
    const selected = available.slice(0, limit);
    selected.forEach((g) => this.usedMoneyGapPaths.add(g.path || g.suggestedTitle));
    return selected;
  }

  /** Get all unconsumed money page gaps regardless of priority */
  getAllMoneyGaps(limit: number): PageGap[] {
    const available = this.gaps.moneyPageGaps.filter(
      (g) => !this.usedMoneyGapPaths.has(g.path || g.suggestedTitle)
    );
    const selected = available.slice(0, limit);
    selected.forEach((g) => this.usedMoneyGapPaths.add(g.path || g.suggestedTitle));
    return selected;
  }

  /** Get unconsumed trust gaps */
  getTrustGaps(limit: number): PageGap[] {
    const available = this.gaps.trustGaps.filter(
      (g) => !this.usedTrustGapTitles.has(g.suggestedTitle)
    );
    const selected = available.slice(0, limit);
    selected.forEach((g) => this.usedTrustGapTitles.add(g.suggestedTitle));
    return selected;
  }

  /** Get the About page gap if not already used */
  getAboutGap(): PageGap | undefined {
    const aboutGap = this.gaps.trustGaps.find(
      (g) => g.suggestedTitle.toLowerCase().includes('about') && 
             !this.usedTrustGapTitles.has(g.suggestedTitle)
    );
    if (aboutGap) {
      this.usedTrustGapTitles.add(aboutGap.suggestedTitle);
    }
    return aboutGap;
  }

  /** Get unconsumed support gaps */
  getSupportGaps(limit: number): PageGap[] {
    const available = this.gaps.supportGaps.filter(
      (g) => !this.usedSupportGapTitles.has(g.suggestedTitle)
    );
    const selected = available.slice(0, limit);
    selected.forEach((g) => this.usedSupportGapTitles.add(g.suggestedTitle));
    return selected;
  }

  /** Get remaining gap counts for logging */
  getRemainingCounts(): { money: number; trust: number; support: number; blockers: number } {
    return {
      money: this.gaps.moneyPageGaps.filter((g) => !this.usedMoneyGapPaths.has(g.path || g.suggestedTitle)).length,
      trust: this.gaps.trustGaps.filter((g) => !this.usedTrustGapTitles.has(g.suggestedTitle)).length,
      support: this.gaps.supportGaps.filter((g) => !this.usedSupportGapTitles.has(g.suggestedTitle)).length,
      blockers: this.gaps.conversionBlockers.filter((b) => !this.usedBlockerPages.has(b.page)).length,
    };
  }
}

// ============================================================================
// MAIN PLAN BUILDER
// ============================================================================

/**
 * Build a personalized 12-month growth plan from gaps and context.
 * 
 * CRITICAL RULES:
 * 1. Foundation score controls pacing - low score = extended foundation phase
 * 2. No generic services allowed - all tasks use real service names
 * 3. Support pages MUST have supportsPage mapping
 * 4. Authority/seasonal content blocked until foundation is solid
 * 5. Gaps are tracked and consumed - no duplicates across months
 * 6. DEV MODE: All phases unlocked for testing
 */
export function buildGrowthPlan(
  gapAnalysis: GapAnalysis,
  businessReality: BusinessRealityModel,
  siteStructure?: SiteStructureContext,
  options?: { devMode?: boolean }
): GrowthPlanMonth[] {
  const months: GrowthPlanMonth[] = [];
  const isDev = options?.devMode ?? (process.env.NODE_ENV === 'development');

  // Create gap tracker to prevent duplicate gap usage
  const gapTracker = new GapTracker(gapAnalysis);

  // Calculate foundation score to control pacing
  const foundationScore = siteStructure 
    ? calculateFoundationScore(siteStructure, gapAnalysis)
    : estimateFoundationScore(gapAnalysis);

  console.log(`[Builder] Foundation score: ${foundationScore}/100 (devMode: ${isDev})`);

  // Get validated services (no generics)
  const validServices = getValidServices(businessReality);
  if (validServices.length === 0) {
    console.warn('[Builder] WARNING: No valid services found, plan quality will be limited');
  }

  // Determine phase unlocks based on foundation score
  // In DEV MODE, all phases are unlocked for testing
  const unlocks = isDev ? {
    depth: true,
    support: true,
    authority: true,
    seasonal: true,
    optimization: true,
  } : {
    depth: foundationScore >= FOUNDATION_THRESHOLDS.critical,
    support: foundationScore >= FOUNDATION_THRESHOLDS.critical,
    authority: foundationScore >= FOUNDATION_THRESHOLDS.minimum,
    seasonal: foundationScore >= FOUNDATION_THRESHOLDS.minimum,
    optimization: foundationScore >= FOUNDATION_THRESHOLDS.healthy,
  };

  console.log(`[Builder] Phase unlocks: ${JSON.stringify(unlocks)}`);

  // Phase 1 (Month 1-2): Foundation fixes - ALWAYS RUN
  months.push(buildFoundationMonth(1, gapTracker, gapAnalysis, businessReality, validServices));
  
  // If foundation score is critical AND not in dev mode, extend foundation phase
  if (!isDev && foundationScore < FOUNDATION_THRESHOLDS.critical) {
    console.log('[Builder] Foundation score critical - extending foundation phase');
    months.push(buildFoundationMonth(2, gapTracker, gapAnalysis, businessReality, validServices, true));
    months.push(buildFoundationMonth(3, gapTracker, gapAnalysis, businessReality, validServices, true));
  } else {
    // Normal progression (or dev mode)
    months.push(buildServiceDepthMonth(2, gapTracker, gapAnalysis, businessReality, validServices));
  }

  // Phase 2 (Month 3-6): Support content - only if foundation is acceptable (or dev mode)
  if (unlocks.support) {
    const startMonth = (!isDev && foundationScore < FOUNDATION_THRESHOLDS.critical) ? 4 : 3;
    for (let m = startMonth; m <= 6; m++) {
      months.push(buildSupportMonth(m, gapTracker, gapAnalysis, businessReality, validServices));
    }
  } else {
    // Continue foundation work - use remaining gaps
    for (let m = 4; m <= 6; m++) {
      months.push(buildFoundationMonth(m, gapTracker, gapAnalysis, businessReality, validServices, true));
    }
  }

  // Log remaining gaps after foundation phase
  console.log(`[Builder] After foundation phase, remaining gaps: ${JSON.stringify(gapTracker.getRemainingCounts())}`);

  // Phase 3 (Month 7-10): Authority expansion - ONLY if foundation score allows (or dev mode)
  if (unlocks.authority) {
    for (let m = 7; m <= 10; m++) {
      months.push(buildAuthorityMonth(m, gapTracker, gapAnalysis, businessReality, validServices));
    }
  } else {
    console.log(`[Builder] Foundation score (${foundationScore}) too low for authority content - blocked`);
    // Build more support content instead
    for (let m = 7; m <= 10; m++) {
      months.push(buildSupportMonth(m, gapTracker, gapAnalysis, businessReality, validServices));
    }
  }

  // Phase 4 (Month 11-12): Optimization
  months.push(buildOptimizationMonth(11, businessReality, validServices));
  months.push(buildOptimizationMonth(12, businessReality, validServices));

  // Ensure no duplicate tasks across months (belt and suspenders)
  deduplicateTasks(months);

  // Final validation: remove any tasks with generic services
  sanitizeTasks(months);

  // Log final task counts
  const totalTasks = months.reduce((sum, m) => sum + m.tasks.length, 0);
  console.log(`[Builder] Plan built: ${months.length} months, ${totalTasks} tasks`);

  return months;
}

/**
 * Estimate foundation score when site structure isn't available
 */
function estimateFoundationScore(gaps: GapAnalysis): number {
  let score = 70; // Assume decent baseline

  const criticalGaps = gaps.moneyPageGaps.filter((g) => g.priority === 'critical').length;
  score -= criticalGaps * 15;

  score -= gaps.conversionBlockers.length * 10;
  score -= gaps.structuralIssues.length * 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Get validated services (filter out generics)
 */
function getValidServices(business: BusinessRealityModel): string[] {
  return business.coreServices.filter((s) => !isGenericService(s));
}

/**
 * Remove tasks with invalid/generic services
 */
function sanitizeTasks(months: GrowthPlanMonth[]): void {
  for (const month of months) {
    month.tasks = month.tasks.filter((task) => {
      if (isGenericService(task.primaryService)) {
        console.warn(`[Builder] Removed task with generic service: ${task.title}`);
        return false;
      }
      // Support pages MUST have supportsPage
      if (task.role === 'support' && !task.supportsPage) {
        console.warn(`[Builder] Removed orphan support task: ${task.title}`);
        return false;
      }
      return true;
    });
  }
}

/**
 * Month 1: Foundation - Fix critical issues first
 * Uses GapTracker to consume gaps and prevent duplicates.
 */
function buildFoundationMonth(
  month: number,
  gapTracker: GapTracker,
  gaps: GapAnalysis,
  business: BusinessRealityModel,
  validServices: string[],
  isExtended: boolean = false
): GrowthPlanMonth {
  const tasks: GrowthTask[] = [];
  const primaryService = validServices[0] || business.coreServices[0];

  if (!primaryService) {
    console.warn('[Builder] No primary service available for foundation month');
  }

  // Priority 1: Fix conversion blockers (tracked via GapTracker)
  const blockerLimit = isExtended ? 3 : 2;
  const blockers = gapTracker.getBlockers(blockerLimit);
  for (const blocker of blockers) {
    if (primaryService) {
      tasks.push(
        createTask({
          month,
          title: `Fix: ${blocker.blocker}`,
          slug: blocker.page,
          action: 'fix',
          role: 'money',
          primaryService,
          primaryLocation: business.primaryLocations[0] || null,
          searchIntent: 'buy',
          channel: 'wp',
          business,
          conversionPath: blocker.fixAction,
        })
      );
    }
  }

  // Priority 2: Critical money page gaps (tracked via GapTracker)
  const gapLimit = isExtended ? 3 : 2;
  const criticalMoneyGaps = gapTracker.getMoneyGaps('critical', gapLimit);
  for (const gap of criticalMoneyGaps) {
    tasks.push(createTaskFromGap(month, gap, business, validServices));
  }

  // Priority 3: Missing essential trust page (About) - only on first foundation month
  if (month === 1) {
    const aboutGap = gapTracker.getAboutGap();
    if (aboutGap) {
      tasks.push(createTaskFromGap(month, aboutGap, business, validServices));
    }
  }

  // If extended foundation, also address high-priority money gaps
  if (isExtended) {
    const remainingSlots = 5 - tasks.length;
    if (remainingSlots > 0) {
      const highMoneyGaps = gapTracker.getMoneyGaps('high', remainingSlots);
      for (const gap of highMoneyGaps) {
        tasks.push(createTaskFromGap(month, gap, business, validServices));
      }
    }
    
    // If still have room, grab any remaining money gaps
    const stillRemainingSlots = 5 - tasks.length;
    if (stillRemainingSlots > 0) {
      const anyGaps = gapTracker.getAllMoneyGaps(stillRemainingSlots);
      for (const gap of anyGaps) {
        tasks.push(createTaskFromGap(month, gap, business, validServices));
      }
    }
    
    // If still have room, add trust gaps
    const finalSlots = 5 - tasks.length;
    if (finalSlots > 0) {
      const trustGaps = gapTracker.getTrustGaps(finalSlots);
      for (const gap of trustGaps) {
        tasks.push(createTaskFromGap(month, gap, business, validServices));
      }
    }
    
    // If still have room, add support gaps
    const supportSlots = 5 - tasks.length;
    if (supportSlots > 0) {
      const supportGaps = gapTracker.getSupportGaps(supportSlots);
      for (const gap of supportGaps) {
        const task = createTaskFromGap(month, gap, business, validServices);
        // Ensure support mapping
        if (!task.supportsPage && primaryService) {
          task.supportsPage = `/${slugify(primaryService)}`;
          task.supportType = 'education';
        }
        tasks.push(task);
      }
    }
  }

  // FALLBACK: If still no tasks (all gaps exhausted), generate essential content
  if (tasks.length === 0 && primaryService) {
    // Generate based on month number - diversify the content type
    const fallbackContent = getFallbackFoundationContent(month, primaryService, business, validServices);
    tasks.push(...fallbackContent.slice(0, 2));
  }

  const maxTasks = isExtended ? 5 : 4;
  console.log(`[Builder] Foundation month ${month}: ${tasks.length} tasks created (limit: ${maxTasks})`);

  return {
    month,
    theme: isExtended ? 'Extended Foundation Fixes' : 'Foundation & Conversion Fixes',
    focus: 'foundation',
    tasks: tasks.slice(0, maxTasks),
    monthlyGoal: 'Establish clear identity and remove conversion blockers',
    kpis: [
      'All money pages have clear CTAs',
      'About page live and linked',
      'Contact information prominent',
    ],
  };
}

/**
 * Get fallback content when all gaps are exhausted but we still need tasks
 */
function getFallbackFoundationContent(
  month: number,
  primaryService: string,
  business: BusinessRealityModel,
  validServices: string[]
): GrowthTask[] {
  const tasks: GrowthTask[] = [];
  const serviceForMonth = validServices[(month - 1) % validServices.length] || primaryService;
  const location = business.primaryLocations[0] || null;
  
  // Different content types based on month to ensure variety - using intelligent titles
  const contentTypes: Array<{ type: ContentType; role: PageRole }> = [
    { type: 'faq', role: 'support' },
    { type: 'process', role: 'support' },
    { type: 'benefits', role: 'money' },
    { type: 'checklist', role: 'support' },
    { type: 'cost', role: 'money' },
    { type: 'comparison', role: 'support' },
  ];
  
  // Get 2 content types based on month
  const startIdx = ((month - 1) * 2) % contentTypes.length;
  const selectedTypes = [
    contentTypes[startIdx],
    contentTypes[(startIdx + 1) % contentTypes.length],
  ];
  
  for (const content of selectedTypes) {
    // Generate intelligent, SEO-optimized title
    const title = generateIntelligentTitle(serviceForMonth, content.type, business, { location });
    
    tasks.push(
      createTask({
        month,
        title,
        slug: `/${slugify(serviceForMonth)}-${content.type}`,
        action: 'create',
        role: content.role,
        primaryService: serviceForMonth,
        primaryLocation: location,
        searchIntent: content.role === 'money' ? 'buy' : 'learn',
        channel: 'wp',
        business,
        supportsPage: content.role === 'support' ? `/${slugify(serviceForMonth)}` : undefined,
        supportType: content.role === 'support' ? 'education' : undefined,
        conversionPath: content.role === 'money' 
          ? `Book ${serviceForMonth}` 
          : `Learn more, then book ${serviceForMonth}`,
      })
    );
  }
  
  return tasks;
}

/**
 * Month 2: Core service depth
 * Uses GapTracker to consume gaps and prevent duplicates.
 */
function buildServiceDepthMonth(
  month: number,
  gapTracker: GapTracker,
  gaps: GapAnalysis,
  business: BusinessRealityModel,
  validServices: string[]
): GrowthPlanMonth {
  const tasks: GrowthTask[] = [];
  const primaryService = validServices[0] || business.coreServices[0];

  // Remaining critical/high money page gaps (using tracker)
  const moneyGaps = [
    ...gapTracker.getMoneyGaps('critical', 2),
    ...gapTracker.getMoneyGaps('high', 2),
  ].slice(0, 2);
  for (const gap of moneyGaps) {
    tasks.push(createTaskFromGap(month, gap, business, validServices));
  }

  // Trust gaps (testimonials, case studies, etc)
  const trustGaps = gapTracker.getTrustGaps(2);
  for (const gap of trustGaps) {
    if (tasks.length < 4) {
      tasks.push(createTaskFromGap(month, gap, business, validServices));
    }
  }

  // First GMB post - weekly tips (only if we have a real service and room)
  if (tasks.length < 4 && primaryService) {
    tasks.push(
      createTask({
        month,
        title: `GMB Post: ${primaryService} Tips of the Week`,
        slug: '/gmb/weekly-tips',
        action: 'create',
        role: 'trust',
        primaryService,
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'trust',
        channel: 'gmb',
        business,
        conversionPath: 'Build local visibility',
        supportsPage: '/',
        supportType: 'trust',
      })
    );
  }

  console.log(`[Builder] Service depth month ${month}: ${tasks.length} tasks created`);

  return {
    month,
    theme: 'Core Service Depth & Trust',
    focus: 'depth',
    tasks: tasks.slice(0, 4),
    monthlyGoal: 'Strengthen core service pages with proof and depth',
    kpis: [
      'Primary service pages exceed 1000 words',
      'Testimonials page live',
      'First GMB post published',
    ],
  };
}

/**
 * Months 3-6: Support content building
 * CRITICAL: Every support page MUST have supportsPage mapping
 * Uses GapTracker to consume support gaps.
 */
function buildSupportMonth(
  month: number,
  gapTracker: GapTracker,
  gaps: GapAnalysis,
  business: BusinessRealityModel,
  validServices: string[]
): GrowthPlanMonth {
  const tasks: GrowthTask[] = [];
  const themes = [
    { theme: 'FAQ & Objection Handling', focus: 'support' as const },
    { theme: 'Process & Transparency', focus: 'support' as const },
    { theme: 'Local SEO & Case Studies', focus: 'trust' as const },
    { theme: 'Content Expansion', focus: 'expansion' as const },
  ];
  const themeData = themes[(month - 3) % themes.length];

  // Get the target service for this month (rotate through services)
  const serviceIndex = (month - 3) % validServices.length;
  const targetService = validServices[serviceIndex] || validServices[0];
  
  if (!targetService) {
    console.warn(`[Builder] No valid service for support month ${month}`);
    return {
      month,
      theme: themeData.theme,
      focus: themeData.focus as any,
      tasks: [],
      monthlyGoal: 'Blocked: No valid services defined',
      kpis: [],
    };
  }

  // The money page this support content will link to
  const targetMoneyPage = `/${slugify(targetService)}`;

  // Add support gaps (tracked via GapTracker)
  const supportGaps = gapTracker.getSupportGaps(2);
  for (const gap of supportGaps) {
    const task = createTaskFromGap(month, gap, business, validServices);
    // Ensure support mapping
    if (!task.supportsPage) {
      task.supportsPage = targetMoneyPage;
      task.supportType = 'education';
      task.internalLinksUp = [targetMoneyPage, '/contact'];
    }
    tasks.push(task);
  }

  if (month === 3) {
    // FAQ page - ALWAYS links to money page
    tasks.push(
      createTask({
        month,
        title: generateIntelligentTitle(targetService, 'faq', business, { location: business.primaryLocations[0] }),
        slug: `/${slugify(targetService)}-faq`,
        action: 'create',
        role: 'support',
        primaryService: targetService,
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'learn',
        channel: 'wp',
        business,
        supportsPage: targetMoneyPage, // MANDATORY
        supportType: 'objection',
        conversionPath: 'Link to booking after FAQ resolution',
      })
    );
  }

  if (month === 4) {
    // Process page - ALWAYS links to money page
    tasks.push(
      createTask({
        month,
        title: generateIntelligentTitle(targetService, 'process', business),
        slug: `/${slugify(targetService)}-process`,
        action: 'create',
        role: 'support',
        primaryService: targetService,
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'learn',
        channel: 'wp',
        business,
        supportsPage: targetMoneyPage, // MANDATORY
        supportType: 'education',
        conversionPath: 'CTA: Ready to start? Contact us',
      })
    );

    // LinkedIn thought leadership (authority, not support - no mapping needed)
    tasks.push(
      createTask({
        month,
        title: `LinkedIn: ${business.niche} Industry Insights`,
        slug: '/linkedin/industry-insights',
        action: 'create',
        role: 'authority',
        primaryService: targetService,
        primaryLocation: null,
        searchIntent: 'trust',
        channel: 'li',
        business,
        conversionPath: 'Drive traffic to website',
      })
    );
  }

  if (month === 5) {
    // Case study
    tasks.push(
      createTask({
        month,
        title: generateIntelligentTitle(targetService, 'case-study', business, { location: business.primaryLocations[0] }),
        slug: `/case-studies/${slugify(targetService)}-success`,
        action: 'create',
        role: 'trust',
        primaryService: targetService,
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'trust',
        channel: 'wp',
        business,
        supportsPage: `/${slugify(targetService)}`,
        supportType: 'trust',
        conversionPath: 'Get similar results - contact us',
      })
    );

    // Location page if multiple locations
    if (business.primaryLocations.length > 1) {
      const secondLocation = business.primaryLocations[1];
      tasks.push(
        createTask({
          month,
          title: `${targetService} in ${secondLocation}`,
          slug: `/${slugify(targetService)}-${slugify(secondLocation)}`,
          action: 'create',
          role: 'money',
          primaryService: targetService,
          primaryLocation: secondLocation,
          searchIntent: 'buy',
          channel: 'wp',
          business,
          conversionPath: `Book ${targetService} in ${secondLocation}`,
        })
      );
    }
  }

  if (month === 6) {
    // Comparison content
    tasks.push(
      createTask({
        month,
        title: generateIntelligentTitle(business.coreServices[0] || 'Service', 'comparison', business),
        slug: `/guides/choosing-${slugify(business.niche)}`,
        action: 'create',
        role: 'support',
        primaryService: business.coreServices[0] || 'Service',
        primaryLocation: null,
        searchIntent: 'compare',
        channel: 'wp',
        business,
        supportsPage: '/',
        supportType: 'pre-sell',
        conversionPath: 'Why we stand out - see our approach',
      })
    );

    // GMB update
    tasks.push(
      createTask({
        month,
        title: `GMB: Mid-Year Highlight Reel`,
        slug: '/gmb/mid-year-highlights',
        action: 'create',
        role: 'trust',
        primaryService: business.coreServices[0] || 'Service',
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'trust',
        channel: 'gmb',
        business,
        conversionPath: 'Showcase recent work',
      })
    );
  }

  return {
    month,
    theme: themeData.theme,
    focus: themeData.focus as any,
    tasks: tasks.slice(0, 4),
    monthlyGoal: `Strengthen money pages through ${themeData.theme.toLowerCase()}`,
    kpis: [
      `${tasks.length} new support content pieces`,
      'Internal links added to money pages',
      'Reduced bounce rate on service pages',
    ],
  };
}

/**
 * Months 7-10: Authority expansion
 * ONLY runs if foundation score >= FOUNDATION_THRESHOLDS.minimum
 * Uses GapTracker for any remaining gaps.
 */
function buildAuthorityMonth(
  month: number,
  gapTracker: GapTracker,
  gaps: GapAnalysis,
  business: BusinessRealityModel,
  validServices: string[]
): GrowthPlanMonth {
  const tasks: GrowthTask[] = [];
  const themes = [
    { theme: 'Authority & Expertise', focus: 'authority' as const },
    { theme: 'Seasonal Campaigns', focus: 'expansion' as const },
    { theme: 'Comparison & Alternatives', focus: 'authority' as const },
    { theme: 'Community & Engagement', focus: 'authority' as const },
  ];
  const themeData = themes[(month - 7) % themes.length];

  const serviceIndex = (month - 3) % validServices.length;
  const targetService = validServices[serviceIndex] || validServices[0];
  
  if (!targetService) {
    console.warn(`[Builder] No valid service for authority month ${month}`);
    return {
      month,
      theme: themeData.theme,
      focus: themeData.focus as any,
      tasks: [],
      monthlyGoal: 'Blocked: No valid services defined',
      kpis: [],
    };
  }

  // The money page authority content should ultimately support
  const targetMoneyPage = `/${slugify(targetService)}`;

  if (month === 7) {
    // Expert guide - links to money page
    tasks.push(
      createTask({
        month,
        title: generateIntelligentTitle(targetService, 'guide', business, { year: new Date().getFullYear() }),
        slug: `/guides/${slugify(targetService)}-complete-guide`,
        action: 'create',
        role: 'authority',
        primaryService: targetService,
        primaryLocation: null,
        searchIntent: 'learn',
        channel: 'wp',
        business,
        conversionPath: 'Ready to get started? Talk to us',
        estimatedWords: 3000,
        supportsPage: targetMoneyPage, // Authority content supports money pages
        supportType: 'education',
      })
    );

    // LinkedIn expertise post
    if (business.yearsActive && business.yearsActive > 0) {
      tasks.push(
        createTask({
          month,
          title: `LinkedIn: ${business.yearsActive} Years of ${business.niche} Experience`,
          slug: '/linkedin/expertise-post',
          action: 'create',
          role: 'authority',
          primaryService: targetService,
          primaryLocation: null,
          searchIntent: 'trust',
          channel: 'li',
          business,
          conversionPath: 'Position as industry expert',
        })
      );
    }
  }

  if (month === 8) {
    // Seasonal content - ONLY if justified
    const season = getSeason();
    tasks.push(
      createTask({
        month,
        title: generateIntelligentTitle(targetService, 'seasonal', business, { season, location: business.primaryLocations[0] }),
        slug: `/offers/${slugify(season)}-${slugify(targetService)}`,
        action: 'create',
        role: 'money',
        primaryService: targetService,
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'buy',
        channel: 'wp',
        business,
        conversionPath: 'Book seasonal offer',
      })
    );

    // GMB seasonal post
    tasks.push(
      createTask({
        month,
        title: `GMB: ${season} Booking Alert`,
        slug: '/gmb/seasonal-booking',
        action: 'create',
        role: 'money',
        primaryService: targetService,
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'buy',
        channel: 'gmb',
        business,
        conversionPath: 'Drive seasonal bookings',
      })
    );
  }

  if (month === 9) {
    // Comparison content - links to money page
    tasks.push(
      createTask({
        month,
        title: `${business.name} vs Other ${business.niche} Providers`,
        slug: '/why-us/comparison',
        action: 'create',
        role: 'support',
        primaryService: business.coreServices[0] || 'Service',
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'compare',
        channel: 'wp',
        business,
        supportsPage: '/',
        supportType: 'comparison',
        conversionPath: 'See why clients choose us',
      })
    );

    // Feature/benefit breakdown
    tasks.push(
      createTask({
        month,
        title: `What's Included in Our ${targetService}`,
        slug: `/${slugify(targetService)}-whats-included`,
        action: 'create',
        role: 'support',
        primaryService: targetService,
        primaryLocation: null,
        searchIntent: 'learn',
        channel: 'wp',
        business,
        supportsPage: `/${slugify(targetService)}`,
        supportType: 'pre-sell',
        conversionPath: 'Get started today',
      })
    );
  }

  if (month === 10) {
    // Client appreciation / year review prep
    tasks.push(
      createTask({
        month,
        title: `Client Appreciation: Thank You for ${new Date().getFullYear()}`,
        slug: `/news/client-appreciation-${new Date().getFullYear()}`,
        action: 'create',
        role: 'trust',
        primaryService: business.coreServices[0] || 'Service',
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'trust',
        channel: 'wp',
        business,
        conversionPath: 'Strengthen client relationships',
      })
    );

    // Referral program page
    tasks.push(
      createTask({
        month,
        title: `Refer a Friend - ${business.name} Referral Program`,
        slug: '/referral-program',
        action: 'create',
        role: 'support',
        primaryService: business.coreServices[0] || 'Service',
        primaryLocation: null,
        searchIntent: 'learn',
        channel: 'wp',
        business,
        conversionPath: 'Encourage referrals',
      })
    );
  }

  return {
    month,
    theme: themeData.theme,
    focus: themeData.focus,
    tasks: tasks.slice(0, 4),
    monthlyGoal: `Build ${themeData.theme.toLowerCase()} to attract new audiences`,
    kpis: [
      'Organic traffic growth',
      'Backlink acquisition',
      'Social engagement increase',
    ],
  };
}

/**
 * Months 11-12: Optimization & planning
 */
function buildOptimizationMonth(
  month: number,
  business: BusinessRealityModel,
  validServices: string[]
): GrowthPlanMonth {
  const tasks: GrowthTask[] = [];
  const primaryService = validServices[0] || business.coreServices[0];

  if (!primaryService) {
    return {
      month,
      theme: month === 11 ? 'Year-End Push & Optimization' : 'Review & Planning',
      focus: 'optimization',
      tasks: [],
      monthlyGoal: 'Blocked: No valid services defined',
      kpis: [],
    };
  }

  if (month === 11) {
    // Year-end push
    tasks.push(
      createTask({
        month,
        title: `End of Year ${primaryService} Promotion`,
        slug: '/offers/year-end-special',
        action: 'create',
        role: 'money',
        primaryService,
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'buy',
        channel: 'wp',
        business,
        conversionPath: 'Book before year end',
      })
    );

    // Content audit
    tasks.push(
      createTask({
        month,
        title: 'Content Audit: Refresh Top Performing Pages',
        slug: '/internal/content-audit',
        action: 'refresh',
        role: 'money',
        primaryService,
        primaryLocation: null,
        searchIntent: 'buy',
        channel: 'wp',
        business,
        conversionPath: 'Optimize existing content',
      })
    );
  }

  if (month === 12) {
    // Year in review
    tasks.push(
      createTask({
        month,
        title: `${new Date().getFullYear()} Year in Review`,
        slug: `/news/year-review-${new Date().getFullYear()}`,
        action: 'create',
        role: 'trust',
        primaryService,
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'trust',
        channel: 'wp',
        business,
        conversionPath: 'Celebrate achievements',
      })
    );

    // Next year planning
    tasks.push(
      createTask({
        month,
        title: `What's Coming in ${new Date().getFullYear() + 1}`,
        slug: `/news/preview-${new Date().getFullYear() + 1}`,
        action: 'create',
        role: 'trust',
        primaryService,
        primaryLocation: null,
        searchIntent: 'trust',
        channel: 'wp',
        business,
        conversionPath: 'Build anticipation',
      })
    );

    // GMB year wrap
    tasks.push(
      createTask({
        month,
        title: 'GMB: Thank You & Happy New Year',
        slug: '/gmb/year-end-thanks',
        action: 'create',
        role: 'trust',
        primaryService,
        primaryLocation: business.primaryLocations[0] || null,
        searchIntent: 'trust',
        channel: 'gmb',
        business,
        conversionPath: 'Maintain local presence',
      })
    );
  }

  return {
    month,
    theme: month === 11 ? 'Year-End Push & Optimization' : 'Review & Planning',
    focus: 'optimization',
    tasks: tasks.slice(0, 4),
    monthlyGoal: month === 11 ? 'Maximize year-end conversions' : 'Reflect and plan for next year',
    kpis: [
      'Conversion rate improvement',
      'Content freshness score',
      'Annual goal completion',
    ],
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface CreateTaskOptions {
  month: number;
  title: string;
  slug: string;
  action: GapAction;
  role: PageRole;
  primaryService: string;
  primaryLocation: string | null;
  searchIntent: 'buy' | 'compare' | 'trust' | 'learn';
  channel: Channel;
  business: BusinessRealityModel;
  supportsPage?: string;
  supportType?: SupportType;
  conversionPath: string;
  estimatedWords?: number;
}

function createTask(options: CreateTaskOptions): GrowthTask {
  const {
    month,
    title,
    slug,
    action,
    role,
    primaryService,
    primaryLocation,
    searchIntent,
    channel,
    business,
    supportsPage,
    supportType,
    conversionPath,
    estimatedWords,
  } = options;

  // Determine word count based on role and channel
  const wordCount = estimatedWords || getEstimatedWords(role, channel, action);

  // Build proof requirements
  const proofElements = buildProofElements(role, business);

  // Get review themes to use - be more lenient with the filter
  // Include ANY themes, sorted by count, even if count is low
  const reviewThemesToUse = business.reviewThemes.length > 0
    ? business.reviewThemes
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((rt) => rt.theme)
    : buildDefaultReviewThemes(primaryService, role);
  
  // Build experience requirements from all available sources
  const experienceRequired = buildExperienceRequired(business, primaryService);

  // Build internal links
  const internalLinksUp: string[] = [];
  if (supportsPage) {
    internalLinksUp.push(supportsPage);
  }
  if (role !== 'money') {
    // All support content should link to contact
    internalLinksUp.push('/contact');
  }

  return {
    id: uuid(),
    month,
    title,
    slug,
    action,
    role,
    supportsPage: supportsPage || null,
    supportType: supportType || null,
    primaryService,
    primaryLocation,
    targetAudience: buildTargetAudience(primaryService, primaryLocation, business),
    searchIntent,
    estimatedWords: wordCount,
    channel,
    status: 'planned',
    briefId: null,
    localAnchoring: primaryLocation
      ? `Content specifically for ${primaryLocation} area`
      : null,
    experienceRequired,
    proofElements,
    reviewThemesToUse,
    internalLinksUp,
    internalLinksDown: [],
    conversionPath,
  };
}

/**
 * Build default review themes when none exist
 * These are common themes that work for most service businesses
 */
function buildDefaultReviewThemes(service: string, role: PageRole): string[] {
  const commonThemes: Record<PageRole, string[]> = {
    money: ['professional service', 'value for money', 'reliable results'],
    trust: ['trustworthy', 'experienced team', 'customer care'],
    support: ['helpful guidance', 'clear communication', 'responsive'],
    authority: ['expert knowledge', 'industry insight', 'thought leadership'],
    operational: ['efficient process', 'well-organized', 'timely delivery'],
    unknown: ['quality service', 'professional approach', 'customer satisfaction'],
  };
  return commonThemes[role] || ['quality service', 'professional approach'];
}

/**
 * Build experience requirements from all available business context
 * This should NEVER return empty for an established business
 */
function buildExperienceRequired(
  business: BusinessRealityModel,
  primaryService: string
): string[] {
  const experience: string[] = [];
  
  // 1. Years active
  if (business.yearsActive && business.yearsActive > 0) {
    experience.push(`${business.yearsActive}+ years of ${primaryService} experience`);
  }
  
  // 2. Volume indicators (e.g., "500+ cases handled")
  for (const indicator of business.volumeIndicators?.slice(0, 2) || []) {
    if (!experience.includes(indicator)) {
      experience.push(indicator);
    }
  }
  
  // 3. Scenario-based proof
  for (const proof of business.scenarioProof?.slice(0, 2) || []) {
    if (proof.statement && !experience.some(e => e.includes(proof.statement))) {
      experience.push(proof.statement);
    }
  }
  
  // 4. Differentiators that imply experience
  for (const diff of business.differentiators?.slice(0, 2) || []) {
    if (/specialist|expert|certified|accredited|award|leading/i.test(diff)) {
      if (!experience.some(e => e.toLowerCase().includes(diff.toLowerCase()))) {
        experience.push(diff);
      }
    }
  }
  
  // 5. Fallback: If still empty, derive from niche
  if (experience.length === 0 && business.niche) {
    experience.push(`Established ${business.niche} expertise`);
  }
  
  return experience.slice(0, 4); // Max 4 experience points
}

function createTaskFromGap(
  month: number,
  gap: PageGap,
  business: BusinessRealityModel,
  validServices: string[]
): GrowthTask {
  // Use valid service from gap, or first valid service, or fallback
  let primaryService = gap.targetService;
  
  if (!primaryService || isGenericService(primaryService)) {
    primaryService = validServices[0] || business.coreServices[0];
  }
  
  // Determine support page for support/trust roles
  let supportsPage: string | undefined;
  let supportType: SupportType | undefined;
  
  if (gap.targetRole === 'support' || gap.targetRole === 'trust') {
    // Support pages MUST link to a money page
    supportsPage = primaryService ? `/${slugify(primaryService)}` : '/';
    supportType = gap.targetRole === 'trust' ? 'trust' : 'education';
  }

  return createTask({
    month,
    title: gap.suggestedTitle,
    slug: gap.path || `/${slugify(gap.suggestedTitle)}`,
    action: gap.action,
    role: gap.targetRole,
    primaryService: primaryService || 'Unknown Service', // Flag if still missing
    primaryLocation: gap.targetLocation,
    searchIntent: gap.targetRole === 'money' ? 'buy' : 'learn',
    channel: 'wp',
    business,
    supportsPage,
    supportType,
    conversionPath: gap.blocksConversion
      ? `Add clear CTA: ${business.primaryCTA}`
      : 'Guide to next step',
  });
}

function getEstimatedWords(
  role: PageRole,
  channel: Channel,
  action: GapAction
): number {
  if (channel === 'gmb') return 300;
  if (channel === 'li') return 600;

  const baseWords: Record<PageRole, number> = {
    money: 1500,
    trust: 1000,
    support: 1200,
    authority: 2000,
    operational: 500,
    unknown: 800,
  };

  const multipliers: Record<GapAction, number> = {
    create: 1,
    rebuild: 1,
    expand: 1.3,
    fix: 0.5,
    stabilise: 0.3,
    refresh: 0.4,
  };

  return Math.round(baseWords[role] * multipliers[action]);
}

/**
 * Build SCENARIO-BASED proof elements - NOT generic "years experience"
 * Proof should show what experience ENABLES or PREVENTS
 */
function buildProofElements(
  role: PageRole,
  business: BusinessRealityModel
): string[] {
  const elements: string[] = [];

  // Priority 1: Use scenario-based proof if available
  if (business.scenarioProof && business.scenarioProof.length > 0) {
    for (const proof of business.scenarioProof.slice(0, 3)) {
      elements.push(proof.statement);
    }
    return elements;
  }

  // Priority 2: Build scenario-like statements from available data
  // Volume indicators are inherently scenario-based ("500+ sessions completed")
  if (business.volumeIndicators.length > 0) {
    elements.push(business.volumeIndicators[0]);
  }

  // Differentiators often show capability
  if (business.differentiators.length > 0) {
    elements.push(business.differentiators[0]);
  }

  // Review themes show proven outcomes (scenario: client experienced X)
  if (role === 'trust' && business.reviewThemes.length > 0) {
    const theme = business.reviewThemes[0];
    if (theme.snippets.length > 0) {
      elements.push(`Client outcome: "${theme.snippets[0]}"`);
    } else {
      elements.push(`Clients consistently mention: ${theme.theme}`);
    }
  }

  // Guarantees show commitment (scenario: if X doesn't happen, we do Y)
  if (business.guarantees.length > 0) {
    elements.push(business.guarantees[0]);
  }

  // Only use years experience if we have nothing else - and frame it as capability
  if (elements.length === 0 && business.yearsActive) {
    // Frame years as capability, not just a number
    if (business.yearsActive >= 20) {
      elements.push(`Two decades of navigating ${business.niche} challenges`);
    } else if (business.yearsActive >= 10) {
      elements.push(`Over a decade solving complex ${business.niche} problems`);
    } else {
      elements.push(`${business.yearsActive}+ years of hands-on ${business.niche} experience`);
    }
  }

  return elements;
}

/**
 * Build target audience - MUST be specific, not "People looking for Expertise"
 */
function buildTargetAudience(
  service: string,
  location: string | null,
  business: BusinessRealityModel
): string {
  // Check for generic service
  if (isGenericService(service)) {
    return `Potential clients in ${business.niche}${location ? ` (${location} area)` : ''}`;
  }

  // Build specific audience
  const locationPart = location ? ` in ${location}` : '';
  
  // Use niche to make it more specific
  const nicheContext = business.niche !== 'General' ? `${business.niche} ` : '';
  
  return `${nicheContext}clients seeking ${service}${locationPart}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Autumn';
  return 'Winter';
}

function deduplicateTasks(months: GrowthPlanMonth[]): void {
  const seenSlugs = new Set<string>();

  for (const month of months) {
    month.tasks = month.tasks.filter((task) => {
      if (seenSlugs.has(task.slug)) {
        return false;
      }
      seenSlugs.add(task.slug);
      return true;
    });
  }
}

// ============================================================================
// VISION EVIDENCE TASK GENERATION
// ============================================================================

/**
 * Patterns that indicate vision/observation-based content requiring outcome evidence
 * Designed to be niche-agnostic across property, wedding, trades, legal, etc.
 */
const VISION_TRIGGER_PATTERNS = [
  /what we (observed|noticed|found|saw|documented|captured)/i,
  /during (sessions?|consultations?|viewings?|inspections?|visits?|our assessment)/i,
  /when we (arrived|visited|assessed|reviewed|inspected|photographed|filmed)/i,
  /case study|client story|before.?after|portfolio|recent work/i,
  /local (area )?analysis|area (guide|overview)/i,
  /on[- ]?site (review|assessment|inspection|session)/i,
  /first[- ]?hand (observation|experience|assessment|account)/i,
];

/**
 * Detect if a task requires vision evidence based on its content type and signals
 */
function taskRequiresVisionEvidence(task: GrowthTask): boolean {
  // Check explicit fields
  if (task.imagePackId || (task.visionFacts && task.visionFacts.length > 0)) {
    return true;
  }
  
  // Check page role - money and trust pages often need vision
  if (task.role === 'money' || task.role === 'trust') {
    // Case studies always need vision evidence
    if (task.slug?.includes('case-study') || task.title?.toLowerCase().includes('case study')) {
      return true;
    }
  }
  
  // Check title for vision signals
  const titleText = task.title || '';
  for (const pattern of VISION_TRIGGER_PATTERNS) {
    if (pattern.test(titleText)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Scan growth plan tasks and flag those requiring vision → outcome evidence.
 * Sets requiresOutcomeEvidence flag and outcomeEvidenceStatus on applicable tasks.
 * 
 * This is called AFTER the plan is built to ensure all vision-required pages
 * have proper tracking for the Vision Evidence Gate.
 */
export function flagVisionEvidenceTasks(months: GrowthPlanMonth[]): {
  flaggedCount: number;
  flaggedTasks: string[];
} {
  const flaggedTasks: string[] = [];
  
  for (const month of months) {
    for (const task of month.tasks) {
      if (taskRequiresVisionEvidence(task)) {
        task.requiresOutcomeEvidence = true;
        task.outcomeEvidenceStatus = 'missing';
        flaggedTasks.push(task.title);
      }
    }
  }
  
  return {
    flaggedCount: flaggedTasks.length,
    flaggedTasks,
  };
}
