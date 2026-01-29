// ============================================================================
// GROWTH PLANNER ENGINE - VALIDATION & HARD GATE
// ============================================================================

import {
  BusinessRealityModel,
  PageContentContext,
  SiteStructureContext,
  ContextValidation,
  PageClassification,
  PageRoleReport,
  PageRoleIssue,
  GrowthTask,
  GrowthPlanMonth,
  TaskValidation,
  TaskViolation,
  GapAnalysis,
  CRITICAL_INPUTS,
  RECOMMENDED_INPUTS,
  QUALITY_THRESHOLDS,
  FOUNDATION_THRESHOLDS,
  isGenericService,
  validateServices,
  calculateFoundationScore,
} from './types';
import { PageRole } from '@/types';

// ============================================================================
// PHASE 0: HARD GATE VALIDATION
// ============================================================================

/**
 * Validate that we have sufficient context to generate a personalized plan.
 * This is the HARD GATE - if critical inputs are missing, we STOP.
 */
export function validateContext(
  business: BusinessRealityModel,
  pages: PageContentContext[]
): ContextValidation {
  const criticalMissing: string[] = [];
  const warnings: string[] = [];
  const questionsForUser: string[] = [];

  // Check critical inputs
  if (!business.coreServices || business.coreServices.length === 0) {
    criticalMissing.push('coreServices');
    questionsForUser.push('What are your main services or products? (List your top 3-5)');
  } else {
    // SERVICE REALITY LOCK: Check for generic service terms
    const { validServices, rejectedServices } = validateServices(business.coreServices);
    
    if (rejectedServices.length > 0) {
      warnings.push(`Generic service terms detected and blocked: ${rejectedServices.join(', ')}`);
    }
    
    if (validServices.length === 0) {
      criticalMissing.push('specificServices');
      questionsForUser.push(
        'Your services are too generic. Please provide specific service names ' +
        '(e.g., "Trademark Protection", "E-Money Licensing" instead of "Expertise" or "Services")'
      );
    }
  }

  if (!business.domain || business.domain === 'unknown') {
    criticalMissing.push('domain');
    questionsForUser.push('What is your website domain?');
  }

  if (!business.niche || business.niche === 'unknown' || business.niche.toLowerCase() === 'general') {
    criticalMissing.push('niche');
    questionsForUser.push('What specific industry or niche are you in?');
  }

  // Check recommended inputs (warnings, not blockers)
  if (!business.primaryLocations || business.primaryLocations.length === 0) {
    warnings.push('No locations defined - local SEO tasks will be limited');
    questionsForUser.push('Where do you serve customers? (City, region, or "online/global")');
  }

  if (!business.yearsActive || business.yearsActive === 0) {
    warnings.push('Years of experience not specified - proof elements may be weaker');
  }

  if (!business.primaryGoal || business.primaryGoal === 'unknown') {
    warnings.push('Primary goal not defined - conversion paths may be generic');
    questionsForUser.push('What is the main action you want visitors to take?');
  }

  if (!business.differentiators || business.differentiators.length === 0) {
    warnings.push('No differentiators defined - USP messaging will be limited');
  }

  // Check for scenario-based proof
  if (!business.scenarioProof || business.scenarioProof.length === 0) {
    warnings.push('No scenario-based proof available - trust content will be weaker');
  }

  if (pages.length === 0) {
    warnings.push('No pages crawled yet - plan will be based on user context only');
  }

  // Determine if we can proceed
  const isValid = criticalMissing.length === 0;
  const canProceed = isValid; // Must have critical inputs
  const requiresUserInput = criticalMissing.length > 0 || warnings.length > 3;

  return {
    isValid,
    criticalMissing,
    warnings,
    canProceed,
    requiresUserInput,
    questionsForUser: criticalMissing.length > 0 ? questionsForUser : [],
  };
}

// ============================================================================
// PHASE 2: PAGE ROLE DISCOVERY
// ============================================================================

/**
 * Classify all pages into roles and detect issues
 */
export function classifyPages(
  pages: PageContentContext[],
  business: BusinessRealityModel
): PageRoleReport {
  const classifications: PageClassification[] = [];

  for (const page of pages) {
    const detectedRole = detectPageRole(page, business);
    const confidence = calculateRoleConfidence(page, detectedRole, business);
    const issues = detectPageIssues(page, detectedRole, pages, business);

    classifications.push({
      path: page.path,
      title: page.title,
      currentRole: page.role,
      detectedRole,
      confidence,
      issues,
    });
  }

  // Build summary
  const summary = {
    money: classifications.filter((c) => c.detectedRole === 'money').length,
    support: classifications.filter((c) => c.detectedRole === 'support').length,
    trust: classifications.filter((c) => c.detectedRole === 'trust').length,
    authority: classifications.filter((c) => c.detectedRole === 'authority').length,
    operational: classifications.filter((c) => c.detectedRole === 'operational').length,
    unclassified: classifications.filter((c) => c.confidence === 'low').length,
  };

  // Detect cross-page issues
  const issues = detectCrossPageIssues(classifications, pages, business);

  return {
    classifications,
    summary,
    issues,
  };
}

/**
 * Detect the role of a single page based on content signals
 */
function detectPageRole(
  page: PageContentContext,
  business: BusinessRealityModel
): PageRole {
  const path = page.path.toLowerCase();
  const title = (page.title || '').toLowerCase();
  const h1 = (page.h1 || '').toLowerCase();

  // Operational pages (easy to detect)
  if (path.includes('/contact') || path.includes('/legal') || 
      path.includes('/privacy') || path.includes('/terms') ||
      path.includes('/cookie') || path.includes('/sitemap')) {
    return 'operational';
  }

  // Trust pages
  if (path.includes('/about') || path.includes('/team') ||
      path.includes('/testimonial') || path.includes('/review') ||
      path.includes('/case-stud') || path.includes('/portfolio') ||
      path.includes('/credentials') || path.includes('/awards')) {
    return 'trust';
  }

  // Check for service mentions (money page indicator)
  const hasServiceMention = business.coreServices.some((s) =>
    title.includes(s.toLowerCase()) ||
    h1.includes(s.toLowerCase()) ||
    page.serviceMentions.some((sm) => sm.toLowerCase() === s.toLowerCase())
  );

  // Check for conversion elements
  if (hasServiceMention && page.hasConversionElements) {
    return 'money';
  }

  // Support pages (FAQ, process, how-to, guides)
  if (path.includes('/faq') || path.includes('/how-') ||
      path.includes('/guide') || path.includes('/process') ||
      path.includes('/what-is') || path.includes('/what-to-expect') ||
      title.includes('faq') || title.includes('guide')) {
    return 'support';
  }

  // Authority pages (blog, articles, resources)
  if (path.includes('/blog') || path.includes('/article') ||
      path.includes('/resource') || path.includes('/news') ||
      path.includes('/insight')) {
    return 'authority';
  }

  // If has service mention but no conversion, likely support
  if (hasServiceMention && !page.hasConversionElements) {
    return 'support';
  }

  // Default to support for unclassified content pages
  return page.wordCount > 500 ? 'support' : 'operational';
}

/**
 * Calculate confidence in role detection
 */
function calculateRoleConfidence(
  page: PageContentContext,
  detectedRole: PageRole,
  business: BusinessRealityModel
): 'high' | 'medium' | 'low' {
  let score = 0;

  // Strong URL signal
  const path = page.path.toLowerCase();
  if (detectedRole === 'money' && business.coreServices.some((s) => 
    path.includes(s.toLowerCase().replace(/\s+/g, '-'))
  )) {
    score += 3;
  }

  // Title matches role
  if (detectedRole === 'money' && page.hasConversionElements) {
    score += 2;
  }
  if (detectedRole === 'trust' && (path.includes('about') || path.includes('review'))) {
    score += 3;
  }

  // Content supports role
  if (detectedRole === 'money' && page.wordCount > 500) {
    score += 1;
  }
  if (detectedRole === 'support' && page.internalLinksOut > 2) {
    score += 1;
  }

  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

/**
 * Detect issues with a single page's role
 */
function detectPageIssues(
  page: PageContentContext,
  detectedRole: PageRole,
  allPages: PageContentContext[],
  business: BusinessRealityModel
): PageRoleIssue[] {
  const issues: PageRoleIssue[] = [];

  // Wrong role assigned
  if (page.role !== detectedRole && page.role !== 'unknown') {
    issues.push({
      type: 'wrong_role',
      severity: 'warning',
      description: `Page appears to be ${detectedRole} but is classified as ${page.role}`,
      recommendation: `Reclassify as ${detectedRole}`,
    });
  }

  // Money page without conversion
  if (detectedRole === 'money' && !page.hasConversionElements) {
    issues.push({
      type: 'missing_conversion',
      severity: 'critical',
      description: 'Money page lacks clear conversion elements',
      recommendation: 'Add clear CTA, contact form, or booking option',
    });
  }

  // Orphaned page
  if (page.internalLinksIn === 0 && page.role !== 'operational') {
    issues.push({
      type: 'orphan',
      severity: 'warning',
      description: 'Page has no internal links pointing to it',
      recommendation: 'Add links from related pages',
    });
  }

  // Support page not linking up
  if (detectedRole === 'support' && page.internalLinksOut === 0) {
    issues.push({
      type: 'no_support_links',
      severity: 'warning',
      description: 'Support page does not link to any money pages',
      recommendation: 'Add links to relevant service pages',
    });
  }

  return issues;
}

/**
 * Detect issues across multiple pages
 */
function detectCrossPageIssues(
  classifications: PageClassification[],
  pages: PageContentContext[],
  business: BusinessRealityModel
): PageRoleReport['issues'] {
  // Find missing roles
  const presentRoles = new Set(classifications.map((c) => c.detectedRole));
  const allRoles: PageRole[] = ['money', 'support', 'trust', 'authority', 'operational'];
  const missingRoles = allRoles.filter((r) => !presentRoles.has(r) && r !== 'operational');

  // Find duplicated intent (pages competing for same keyword)
  const duplicatedIntent: string[][] = [];
  const moneyPages = pages.filter((p) => p.role === 'money' || 
    classifications.find((c) => c.path === p.path)?.detectedRole === 'money'
  );

  for (let i = 0; i < moneyPages.length; i++) {
    for (let j = i + 1; j < moneyPages.length; j++) {
      const page1 = moneyPages[i];
      const page2 = moneyPages[j];

      // Check for overlapping service mentions
      const overlap = page1.serviceMentions.filter((s) =>
        page2.serviceMentions.includes(s)
      );

      if (overlap.length > 0 && page1.path !== page2.path) {
        duplicatedIntent.push([page1.path, page2.path]);
      }
    }
  }

  // Find orphaned pages
  const orphanedPages = pages
    .filter((p) => p.internalLinksIn === 0 && p.role !== 'operational')
    .map((p) => p.path);

  // Find multi-role pages (pages trying to do too much)
  const multiRolePages = classifications
    .filter((c) => c.issues.some((i) => i.type === 'multi_role'))
    .map((c) => c.path);

  return {
    missingRoles,
    duplicatedIntent,
    orphanedPages,
    multiRolePages,
  };
}

// ============================================================================
// PHASE 5: TASK VALIDATION
// ============================================================================

/**
 * Validate that a task meets all personalization rules
 * HARD GATES: Some violations make the task INVALID and it must be fixed/removed
 */
export function validateTask(task: GrowthTask): TaskValidation {
  const violations: TaskViolation[] = [];

  // HARD GATE 1: Must have exactly one role
  if (!task.role) {
    violations.push({
      rule: 'missing_role',
      severity: 'error',
      description: 'Task must have exactly one page role',
    });
  }

  // HARD GATE 2: Support pages MUST have support mapping (NON-NEGOTIABLE)
  if (task.role === 'support' && !task.supportsPage) {
    violations.push({
      rule: 'missing_support_mapping',
      severity: 'error',
      description: 'Support pages MUST specify which money page they support. Task is INVALID without supportsPage.',
    });
  }

  // HARD GATE 3: Service Reality Lock - no generic services
  if (isGenericService(task.primaryService)) {
    violations.push({
      rule: 'generic_service',
      severity: 'error',
      description: `Generic service "${task.primaryService}" is not allowed. Use specific service names.`,
    });
  }

  // HARD GATE 4: Target audience cannot be generic
  if (!task.targetAudience || 
      task.targetAudience === 'unknown' ||
      task.targetAudience.toLowerCase().includes('people looking for expertise') ||
      task.targetAudience.toLowerCase().includes('people looking for service')) {
    violations.push({
      rule: 'missing_audience',
      severity: 'error',
      description: 'Task must specify a real target audience, not generic placeholders',
    });
  }

  // WARNING: Should have proof requirement
  if (task.proofElements.length === 0 && task.role !== 'operational') {
    violations.push({
      rule: 'missing_proof',
      severity: 'warning',
      description: 'Content tasks should specify scenario-based proof requirements',
    });
  }

  // WARNING: Proof should be scenario-based, not generic
  const genericProofSignals = [
    'years experience',
    'years of experience', 
    'professional team',
    'quality service',
    'best in class',
  ];
  const hasGenericProof = task.proofElements.some((p) =>
    genericProofSignals.some((s) => p.toLowerCase().includes(s))
  );
  if (hasGenericProof) {
    violations.push({
      rule: 'generic_proof',
      severity: 'warning',
      description: 'Proof elements should be scenario-based (outcomes, volumes, complexity handled) not generic claims',
    });
  }

  // WARNING: Must have CTA direction
  if (!task.conversionPath || task.conversionPath === 'unknown') {
    violations.push({
      rule: 'missing_cta',
      severity: 'warning',
      description: 'Task should have clear conversion path',
    });
  }

  // HARD GATE 5: Support pages must link up
  if (task.role === 'support' && task.internalLinksUp.length === 0) {
    violations.push({
      rule: 'orphan_links',
      severity: 'error',
      description: 'Support pages must link to money pages - no orphan support content allowed',
    });
  }

  // WARNING: Check for generic content signals
  const genericSignals = [
    'blog post',
    'article about',
    'general guide',
    'tips and tricks',
    'everything you need to know',
    'complete guide to expertise',
    'our services',
  ];
  const titleLower = task.title.toLowerCase();
  if (genericSignals.some((s) => titleLower.includes(s))) {
    violations.push({
      rule: 'generic_content',
      severity: 'warning',
      description: 'Task title suggests generic content - should be more specific to the service',
    });
  }

  return {
    taskId: task.id,
    isValid: !violations.some((v) => v.severity === 'error'),
    violations,
  };
}

/**
 * Validate all tasks in a plan and return summary
 */
export function validatePlan(
  tasks: GrowthTask[]
): { valid: TaskValidation[]; invalid: TaskValidation[] } {
  const validations = tasks.map(validateTask);

  return {
    valid: validations.filter((v) => v.isValid),
    invalid: validations.filter((v) => !v.isValid),
  };
}

/**
 * Validate foundation score allows authority/seasonal content
 */
export function validateFoundationForPhase(
  foundationScore: number,
  phase: 'foundation' | 'depth' | 'support' | 'authority' | 'seasonal'
): { allowed: boolean; reason: string | null } {
  if (phase === 'foundation' || phase === 'depth') {
    return { allowed: true, reason: null };
  }

  if (phase === 'support' && foundationScore >= FOUNDATION_THRESHOLDS.critical) {
    return { allowed: true, reason: null };
  }

  if ((phase === 'authority' || phase === 'seasonal') && foundationScore >= FOUNDATION_THRESHOLDS.minimum) {
    return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason: `Foundation score (${foundationScore}) too low for ${phase} phase. ` +
      `Required: ${phase === 'support' ? FOUNDATION_THRESHOLDS.critical : FOUNDATION_THRESHOLDS.minimum}. ` +
      `Fix foundation issues first.`,
  };
}

// ============================================================================
// PHASE 7: QUALITY GATE
// ============================================================================

/**
 * Check if plan meets quality threshold
 */
export function meetsQualityThreshold(
  score: number,
  threshold: number = QUALITY_THRESHOLDS.minimum
): boolean {
  return score >= threshold;
}

/**
 * Get quality rating from score
 */
export function getQualityRating(score: number): 'insufficient' | 'acceptable' | 'good' | 'excellent' {
  if (score >= QUALITY_THRESHOLDS.excellent) return 'excellent';
  if (score >= QUALITY_THRESHOLDS.good) return 'good';
  if (score >= QUALITY_THRESHOLDS.acceptable) return 'acceptable';
  return 'insufficient';
}

/**
 * Generate improvement suggestions based on quality score
 */
export function getQualityImprovements(
  qualityScore: {
    personalization: number;
    conversionAlignment: number;
    localRelevance: number;
    trustStrength: number;
    taskUniqueness: number;
    overall: number;
  }
): string[] {
  const improvements: string[] = [];

  if (qualityScore.personalization < 70) {
    improvements.push('Add more business context: services, experience, differentiators');
  }

  if (qualityScore.conversionAlignment < 70) {
    improvements.push('Plan needs more money pages - ensure each core service has dedicated page');
  }

  if (qualityScore.localRelevance < 50 && qualityScore.localRelevance > 0) {
    improvements.push('Add location-specific content for your service areas');
  }

  if (qualityScore.trustStrength < 60) {
    improvements.push('Add more trust content: testimonials, case studies, about page');
  }

  if (qualityScore.taskUniqueness < 90) {
    improvements.push('Some tasks appear duplicated - review for unique intent');
  }

  return improvements;
}

// ============================================================================
// HARD RULES VALIDATION (NEW)
// ============================================================================

import {
  HardRuleViolation,
  HardRuleCode,
  TaskValidationReport,
  PlanValidationReport,
  SLUG_MAX_LENGTH,
  TITLE_SOFT_MAX_LENGTH,
  TITLE_HARD_MAX_LENGTH,
} from './types';

/**
 * Validate slug against hard rules:
 * - Must be <= 70 chars
 * - Must not contain full sentences
 * - Must be kebab-case
 * - Must include 1 primary keyword token
 */
export function validateSlug(
  slug: string,
  primaryKeyword: string
): HardRuleViolation[] {
  const violations: HardRuleViolation[] = [];

  // Rule A1: Slug length
  if (slug.length > SLUG_MAX_LENGTH) {
    violations.push({
      code: 'SLUG_TOO_LONG',
      severity: 'error',
      field: 'slug',
      message: `Slug exceeds ${SLUG_MAX_LENGTH} chars (${slug.length})`,
      currentValue: slug,
      suggestion: slug.slice(0, SLUG_MAX_LENGTH),
    });
  }

  // Rule A2: No full sentences (check for multiple spaces or sentence-like patterns)
  const hasSentencePatterns = /\s{2,}|[.!?]|^[A-Z].*\s+.*\s+.*\s+/.test(slug);
  if (hasSentencePatterns) {
    violations.push({
      code: 'SLUG_SENTENCE',
      severity: 'error',
      field: 'slug',
      message: 'Slug appears to contain a full sentence',
      currentValue: slug,
      suggestion: slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    });
  }

  // Rule A3: Must be kebab-case
  const isKebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
  if (!isKebabCase) {
    violations.push({
      code: 'SLUG_NOT_KEBAB',
      severity: 'error',
      field: 'slug',
      message: 'Slug must be kebab-case (lowercase letters, numbers, hyphens only)',
      currentValue: slug,
      suggestion: slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    });
  }

  // Rule A4: Must include primary keyword token
  if (primaryKeyword) {
    const keywordTokens = primaryKeyword.toLowerCase().split(/\s+/);
    const slugTokens = slug.toLowerCase().split('-');
    const hasKeywordToken = keywordTokens.some(
      (kw) => kw.length >= 3 && slugTokens.some((st) => st.includes(kw) || kw.includes(st))
    );
    if (!hasKeywordToken) {
      violations.push({
        code: 'SLUG_MISSING_KEYWORD',
        severity: 'warning',
        field: 'slug',
        message: `Slug should include keyword token from: "${primaryKeyword}"`,
        currentValue: slug,
        suggestion: `${keywordTokens[0]}-${slug}`.slice(0, SLUG_MAX_LENGTH),
      });
    }
  }

  return violations;
}

/**
 * Validate title against hard rules:
 * - Must be <= 85 chars (soft) and <= 110 chars (hard)
 * - Must not contain the entire offerOneLiner verbatim
 * - Must not be a generic/garbage title pattern
 * - Must contain meaningful SEO signals
 */
export function validateTitle(
  title: string,
  offerOneLiner?: string
): HardRuleViolation[] {
  const violations: HardRuleViolation[] = [];

  // Rule B1: Soft limit
  if (title.length > TITLE_SOFT_MAX_LENGTH && title.length <= TITLE_HARD_MAX_LENGTH) {
    violations.push({
      code: 'TITLE_TOO_LONG_SOFT',
      severity: 'warning',
      field: 'title',
      message: `Title exceeds soft limit of ${TITLE_SOFT_MAX_LENGTH} chars (${title.length})`,
      currentValue: title,
      suggestion: title.slice(0, TITLE_SOFT_MAX_LENGTH),
    });
  }

  // Rule B2: Hard limit
  if (title.length > TITLE_HARD_MAX_LENGTH) {
    violations.push({
      code: 'TITLE_TOO_LONG_HARD',
      severity: 'error',
      field: 'title',
      message: `Title exceeds hard limit of ${TITLE_HARD_MAX_LENGTH} chars (${title.length})`,
      currentValue: title,
      suggestion: title.slice(0, TITLE_HARD_MAX_LENGTH - 3) + '...',
    });
  }

  // Rule B3: No verbatim offerOneLiner
  if (offerOneLiner && offerOneLiner.length > 20 && title.includes(offerOneLiner)) {
    violations.push({
      code: 'TITLE_VERBATIM_OFFER',
      severity: 'error',
      field: 'title',
      message: 'Title contains verbatim offer one-liner, should be unique',
      currentValue: title,
      suggestion: title.replace(offerOneLiner, '').trim(),
    });
  }

  // Rule B4: Detect generic/garbage title patterns
  const genericTitlePatterns = [
    /^(About Us|About|Team|Our Team|Who We Are)\s*\|/i,
    /^(Testimonials|Reviews|Testimonial)\s*\|/i,
    /^(FAQ|FAQs|Questions|Frequently Asked Questions)\s*\|/i,
    /^(Contact|Contact Us|Get in Touch)\s*\|/i,
    /^(Services|Our Services|What We Do)\s*\|/i,
    /^(Home|Welcome|Homepage)\s*\|/i,
    /^(Blog|News|Articles)\s*\|/i,
    /^(Process|How It Works)\s*\|/i,
    /^(Case Studies?|Portfolio|Our Work)\s*\|/i,
  ];
  
  for (const pattern of genericTitlePatterns) {
    if (pattern.test(title)) {
      violations.push({
        code: 'TITLE_GENERIC_PATTERN',
        severity: 'warning',
        field: 'title',
        message: `Title uses generic pattern "${title.split('|')[0].trim()}" - needs service/location specificity`,
        currentValue: title,
        suggestion: 'Add service name, location, or unique angle before the pipe',
      });
      break;
    }
  }
  
  // Rule B5: Title must have meaningful length
  if (title.length < 15) {
    violations.push({
      code: 'TITLE_TOO_SHORT',
      severity: 'warning',
      field: 'title',
      message: 'Title is too short to be SEO-effective',
      currentValue: title,
    });
  }
  
  // Rule B6: Title should contain power words for SEO
  const hasPowerWord = /\b(guide|how|what|why|best|top|ultimate|complete|expert|professional|specialist|trusted|proven|success|results|tips|secrets|essential|quick|easy|simple|free|affordable|guaranteed|reliable|quality|premium)\b/i.test(title);
  const hasNumber = /\d+/.test(title);
  const hasYear = /20[2-3]\d/.test(title);
  
  // Only warn if title lacks both power words AND specificity
  if (!hasPowerWord && !hasNumber && !hasYear && title.length < 40) {
    violations.push({
      code: 'TITLE_LACKS_ENGAGEMENT',
      severity: 'warning',
      field: 'title',
      message: 'Title lacks SEO power words or specificity',
      currentValue: title,
      suggestion: 'Consider adding: numbers, year, or words like "Guide", "Expert", "Proven"',
    });
  }

  return violations;
}

/**
 * Validate personalization requirements:
 * - Must have at least 1 review theme
 * - Must have at least 1 experience/story proof point
 * - Must reference city/district/landmark
 */
export function validatePersonalization(
  task: GrowthTask,
  businessReality: BusinessRealityModel
): HardRuleViolation[] {
  const violations: HardRuleViolation[] = [];

  // Rule C1: Review themes
  if (!task.reviewThemesToUse || task.reviewThemesToUse.length === 0) {
    // Try to backfill from business reality
    const availableThemes = businessReality.reviewThemes.map((rt) => rt.theme);
    if (availableThemes.length > 0) {
      violations.push({
        code: 'MISSING_REVIEW_THEME',
        severity: 'warning',
        field: 'reviewThemesToUse',
        message: 'Task missing review theme, will backfill',
        currentValue: '[]',
        suggestion: availableThemes[0],
      });
    } else {
      violations.push({
        code: 'MISSING_REVIEW_THEME',
        severity: 'error',
        field: 'reviewThemesToUse',
        message: 'Task requires at least 1 review theme but none available',
        currentValue: '[]',
      });
    }
  }

  // Rule C2: Experience/story proof
  if (!task.experienceRequired || task.experienceRequired.length === 0) {
    const availableProof = [
      ...(businessReality.scenarioProof?.map((sp) => sp.statement) || []),
      ...(businessReality.volumeIndicators || []),
    ];
    if (availableProof.length > 0) {
      violations.push({
        code: 'MISSING_EXPERIENCE_PROOF',
        severity: 'warning',
        field: 'experienceRequired',
        message: 'Task missing experience proof, will backfill',
        currentValue: '[]',
        suggestion: availableProof[0],
      });
    } else {
      violations.push({
        code: 'MISSING_EXPERIENCE_PROOF',
        severity: 'error',
        field: 'experienceRequired',
        message: 'Task requires experience proof but none available',
        currentValue: '[]',
      });
    }
  }

  // Rule C3: Local anchoring
  if (!task.localAnchoring || task.localAnchoring.trim() === '') {
    const availableLocal = [
      ...businessReality.primaryLocations,
      ...(businessReality.localPhrasing || []),
    ];
    if (availableLocal.length > 0) {
      violations.push({
        code: 'MISSING_LOCAL_ANCHORING',
        severity: 'warning',
        field: 'localAnchoring',
        message: 'Task missing local anchoring, will backfill',
        currentValue: '',
        suggestion: availableLocal[0],
      });
    } else {
      violations.push({
        code: 'MISSING_LOCAL_ANCHORING',
        severity: 'error',
        field: 'localAnchoring',
        message: 'Task requires local anchoring but no locations available',
        currentValue: '',
      });
    }
  }

  return violations;
}

/**
 * Validate internal linking requirements:
 * - Must have min 2 internal links down (support + trust)
 * - Must have min 1 internal link up (money page it supports)
 */
export function validateInternalLinks(task: GrowthTask): HardRuleViolation[] {
  const violations: HardRuleViolation[] = [];

  // Rule D1: Links down (for WP content)
  if (task.channel === 'wp') {
    if (!task.internalLinksDown || task.internalLinksDown.length < 2) {
      violations.push({
        code: 'MISSING_INTERNAL_LINKS_DOWN',
        severity: 'warning',
        field: 'internalLinksDown',
        message: `Task needs min 2 internal links down (has ${task.internalLinksDown?.length || 0})`,
        currentValue: JSON.stringify(task.internalLinksDown || []),
      });
    }

    // Rule D2: Links up
    if (!task.internalLinksUp || task.internalLinksUp.length < 1) {
      violations.push({
        code: 'MISSING_INTERNAL_LINKS_UP',
        severity: 'warning',
        field: 'internalLinksUp',
        message: `Task needs min 1 internal link up (has ${task.internalLinksUp?.length || 0})`,
        currentValue: JSON.stringify(task.internalLinksUp || []),
      });
    }
  }

  return violations;
}

/**
 * Validate a single task against all hard rules
 */
export function validateTaskHardRules(
  task: GrowthTask,
  businessReality: BusinessRealityModel,
  primaryKeyword: string,
  offerOneLiner?: string
): TaskValidationReport {
  const violations: HardRuleViolation[] = [
    ...validateSlug(task.slug, primaryKeyword),
    ...validateTitle(task.title, offerOneLiner),
    ...validatePersonalization(task, businessReality),
    ...validateInternalLinks(task),
  ];

  const errors = violations.filter((v) => v.severity === 'error');
  const isValid = errors.length === 0;

  return {
    taskId: task.id,
    isValid,
    violations,
    wasAutoFixed: false,
    autoFixActions: [],
  };
}

/**
 * Sanitize slug to meet hard rules
 */
export function sanitizeSlug(slug: string, maxLength: number = SLUG_MAX_LENGTH): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
}

/**
 * Sanitize title to meet hard rules
 */
export function sanitizeTitle(title: string, maxLength: number = TITLE_SOFT_MAX_LENGTH): string {
  if (title.length <= maxLength) return title;
  
  // Try to cut at word boundary
  const truncated = title.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength - 20) {
    return truncated.slice(0, lastSpace);
  }
  return truncated;
}

/**
 * Auto-fix task violations where possible
 */
export function autoFixTaskViolations(
  task: GrowthTask,
  businessReality: BusinessRealityModel,
  violations: HardRuleViolation[]
): { fixedTask: GrowthTask; fixActions: string[] } {
  const fixedTask = { ...task };
  const fixActions: string[] = [];

  for (const violation of violations) {
    switch (violation.code) {
      case 'SLUG_TOO_LONG':
      case 'SLUG_NOT_KEBAB':
      case 'SLUG_SENTENCE':
        fixedTask.slug = sanitizeSlug(task.slug);
        fixActions.push(`Fixed slug: "${task.slug}" -> "${fixedTask.slug}"`);
        break;

      case 'TITLE_TOO_LONG_HARD':
      case 'TITLE_TOO_LONG_SOFT':
        fixedTask.title = sanitizeTitle(task.title);
        fixActions.push(`Fixed title length: ${task.title.length} -> ${fixedTask.title.length}`);
        break;

      case 'MISSING_REVIEW_THEME':
        if (businessReality.reviewThemes.length > 0) {
          fixedTask.reviewThemesToUse = [businessReality.reviewThemes[0].theme];
          fixActions.push(`Backfilled review theme: ${fixedTask.reviewThemesToUse[0]}`);
        }
        break;

      case 'MISSING_EXPERIENCE_PROOF':
        const proof = businessReality.scenarioProof?.[0]?.statement 
          || businessReality.volumeIndicators?.[0]
          || `${businessReality.yearsActive || 'Years of'} experience in ${businessReality.niche}`;
        fixedTask.experienceRequired = [proof];
        fixActions.push(`Backfilled experience proof: ${proof}`);
        break;

      case 'MISSING_LOCAL_ANCHORING':
        const location = businessReality.primaryLocations[0] 
          || businessReality.localPhrasing?.[0]
          || 'local area';
        fixedTask.localAnchoring = location;
        fixActions.push(`Backfilled local anchoring: ${location}`);
        break;

      case 'MISSING_INTERNAL_LINKS_DOWN':
        // Will be handled in link planning phase
        fixActions.push('Internal links down will be generated');
        break;

      case 'MISSING_INTERNAL_LINKS_UP':
        // Will be handled in link planning phase
        fixActions.push('Internal links up will be generated');
        break;
    }
  }

  return { fixedTask, fixActions };
}

/**
 * Validate entire plan and generate report
 */
export function validatePlanHardRules(
  tasks: GrowthTask[],
  businessReality: BusinessRealityModel,
  existingPageSlugs?: string[]
): PlanValidationReport {
  const taskReports: TaskValidationReport[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const task of tasks) {
    const primaryKeyword = task.primaryService;
    // Use primary goal as a proxy for offer one-liner if available
    const offerOneLiner = businessReality.primaryGoal || undefined;
    const report = validateTaskHardRules(task, businessReality, primaryKeyword, offerOneLiner);
    taskReports.push(report);

    if (!report.isValid) {
      errors.push(`Task ${task.id} (${task.slug}): ${report.violations.filter(v => v.severity === 'error').map(v => v.message).join(', ')}`);
    }

    const taskWarnings = report.violations.filter(v => v.severity === 'warning');
    if (taskWarnings.length > 0) {
      warnings.push(`Task ${task.id} (${task.slug}): ${taskWarnings.map(v => v.message).join(', ')}`);
    }
  }

  const validTasks = taskReports.filter((r) => r.isValid).length;
  const invalidTasks = taskReports.filter((r) => !r.isValid).length;
  const totalViolations = taskReports.reduce((sum, r) => sum + r.violations.length, 0);
  
  // Count auto-fixable violations
  const autoFixableCodes: Set<string> = new Set([
    'SLUG_TOO_LONG',
    'SLUG_SENTENCE',
    'SLUG_NOT_KEBAB',
    'TITLE_TOO_LONG_SOFT',
    'TITLE_TOO_LONG_HARD',
    'MISSING_REVIEW_THEME',
    'MISSING_EXPERIENCE_PROOF',
    'MISSING_LOCAL_ANCHORING',
    'MISSING_INTERNAL_LINKS_DOWN',
    'MISSING_INTERNAL_LINKS_UP',
  ]);
  const autoFixable = taskReports.reduce((sum, r) => 
    sum + r.violations.filter(v => autoFixableCodes.has(v.code)).length, 0);

  return {
    isValid: invalidTasks === 0,
    totalTasks: taskReports.length,
    validTasks,
    invalidTasks,
    totalViolations,
    autoFixable,
    taskReports,
    warnings,
    errors,
  };
}
