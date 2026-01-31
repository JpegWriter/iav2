// ============================================================================
// GROWTH PLANNER ENGINE - MAIN ORCHESTRATOR
// ============================================================================

import { SupabaseClient } from '@supabase/supabase-js';
import { ingestContext } from './context';
import { analyzeGaps } from './gaps';
import { buildGrowthPlan, flagVisionEvidenceTasks } from './builder';
import { 
  generateBrief, 
  generateBriefsForMonth,
  generateEnhancedBrief,
  generateEnhancedBriefsForMonth,
  generateAllBriefs,
} from './briefs';
import {
  validateContext,
  classifyPages,
  validatePlan,
  meetsQualityThreshold,
  getQualityRating,
  getQualityImprovements,
  validateTaskHardRules,
  validatePlanHardRules,
  autoFixTaskViolations,
  sanitizeSlug,
  sanitizeTitle,
} from './validation';
import {
  refineSeoDraftsForPlan,
  refineSeoDraftsForTask,
  validateSeoDrafts as validateTaskSeoDrafts,
  getEffectiveSeoValues,
} from './refineSeoDrafts';
import {
  PersonalizedGrowthPlan,
  GrowthPlannerOptions,
  WriterBrief,
  LegacyWriterBrief,
  GrowthPlanMonth,
  ContextValidation,
  PageRoleReport,
  QUALITY_THRESHOLDS,
  calculateFoundationScore,
  isGenericService,
  EnhancedGrowthPlanOutput,
  PlanValidationReport,
  GapAnalysis,
  BusinessRealityModel,
  PageGap,
} from './types';
import {
  runSiteResearch,
  researchGapsToPageGaps,
  ResearchReport,
  ContentGapSuggestion,
} from '@/lib/research';
import {
  resolveCannibalisation,
  exportOwnershipMap,
  CannibalisationReport,
  detectEnhancedCannibalisation,
  CannibalisationBlocker,
} from './cannibalisation';
import {
  applyPlanCadence,
  getCadenceStats,
  validateCadence,
  formatPublishingSchedule,
  CadenceValidation,
} from './cadence';
import {
  runAuditGate,
  AuditGateInput,
  ContentIntelGateResult,
  TaskContext,
  SiteContext,
  UserContext as AuditUserContext,
  ProposedContent,
} from '@/lib/audit';
import {
  validateUniqueIdentifiers,
  UniqueIdentifierBlocker,
  UniqueIdentifierResult,
} from './unique-identifiers';
import {
  validateTopicIntentCanon,
  ServiceOwnershipBlocker,
  ServiceOwnershipResult,
  OnboardingContext,
} from './service-ownership';

// Re-export types
export * from './types';
export { 
  validateContext, 
  classifyPages, 
  validatePlan,
  validateTaskHardRules,
  validatePlanHardRules,
  autoFixTaskViolations,
  sanitizeSlug,
  sanitizeTitle,
} from './validation';
export {
  generateEnhancedBrief,
  generateEnhancedBriefsForMonth,
  generateAllBriefs,
} from './briefs';
export {
  applyPlanCadence,
  validateCadence,
  formatPublishingSchedule,
  getCadenceStats,
} from './cadence';
// SEO Drafts refinement exports
export {
  refineSeoDraftsForPlan,
  refineSeoDraftsForTask,
  validateSeoDrafts as validateTaskSeoDrafts,
  getEffectiveSeoValues,
  generateHeadingContract,
} from './refineSeoDrafts';
export type { SeoOptions, HeadingContract, PageIntent } from './refineSeoDrafts';

/**
 * Get the first day of next month as the default plan start date
 */
function getNextMonthStart(): Date {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  nextMonth.setHours(9, 0, 0, 0); // 9 AM
  return nextMonth;
}

/**
 * Result type that can be either a plan or a hard-gate failure
 */
export type PlanResult = 
  | { success: true; plan: PersonalizedGrowthPlan }
  | { success: false; validation: ContextValidation; reason: string };

/**
 * Generate a fully personalized growth plan from real business context.
 * 
 * This is a REASONING ENGINE, not a template generator.
 * It follows a strict phase-based approach with hard gates.
 */
export async function generatePersonalizedPlan(
  supabase: SupabaseClient,
  projectId: string,
  options: GrowthPlannerOptions = {}
): Promise<PersonalizedGrowthPlan> {
  const startTime = Date.now();
  console.log(`[GrowthPlanner] Starting personalized plan generation for ${projectId}`);

  // ========================================
  // PHASE 0: Context Ingestion (HARD GATE)
  // ========================================
  console.log('[GrowthPlanner] Phase 0: Ingesting context...');
  const {
    siteStructure,
    pageContents,
    businessReality,
    missingInputs,
  } = await ingestContext(supabase, projectId);

  console.log(`[GrowthPlanner] Context ingested:
    - Site: ${siteStructure.totalPages} pages
    - Business: ${businessReality.name}
    - Services: ${businessReality.coreServices.join(', ')}
    - Locations: ${businessReality.primaryLocations.join(', ')}
    - Missing inputs: ${missingInputs.length > 0 ? missingInputs.join(', ') : 'None'}
  `);

  // ========================================
  // PHASE 0.5: HARD GATE VALIDATION
  // ========================================
  console.log('[GrowthPlanner] Phase 0.5: Validating context (HARD GATE)...');
  const contextValidation = validateContext(businessReality, pageContents);

  if (!contextValidation.canProceed && options.strictMode) {
    console.log('[GrowthPlanner] HARD GATE FAILED - Insufficient context');
    // In strict mode, throw an error with required inputs
    throw new Error(
      `Cannot generate personalized plan. Missing: ${contextValidation.criticalMissing.join(', ')}. ` +
      `Please provide: ${contextValidation.questionsForUser.join(' | ')}`
    );
  }

  // Log warnings even if we proceed
  if (contextValidation.warnings.length > 0) {
    console.log(`[GrowthPlanner] Context warnings: ${contextValidation.warnings.join(', ')}`);
  }

  // ========================================
  // PHASE 1: Business Reality Model
  // ========================================
  console.log('[GrowthPlanner] Phase 1: Building Business Reality Model...');
  console.log(`[GrowthPlanner] Business Reality:
    - What do they sell? ${businessReality.coreServices.join(', ') || 'Unknown'}
    - Who is it for? ${businessReality.niche || 'Unknown'} customers
    - Where does trust come from? ${businessReality.proofAssets.length} proof assets, ${businessReality.reviewThemes.length} review themes
    - Primary conversion: ${businessReality.primaryGoal || businessReality.primaryCTA}
  `);

  // ========================================
  // PHASE 2: Page Role Discovery
  // ========================================
  console.log('[GrowthPlanner] Phase 2: Discovering page roles...');
  const pageRoleReport = classifyPages(pageContents, businessReality);

  console.log(`[GrowthPlanner] Page roles discovered:
    - Money pages: ${pageRoleReport.summary.money}
    - Support pages: ${pageRoleReport.summary.support}
    - Trust pages: ${pageRoleReport.summary.trust}
    - Authority pages: ${pageRoleReport.summary.authority}
    - Missing roles: ${pageRoleReport.issues.missingRoles.join(', ') || 'None'}
    - Orphaned pages: ${pageRoleReport.issues.orphanedPages.length}
    - Duplicated intent: ${pageRoleReport.issues.duplicatedIntent.length} pairs
  `);

  // ========================================
  // PHASE 3: Gap & Opportunity Analysis
  // ========================================
  console.log('[GrowthPlanner] Phase 3: Analyzing gaps...');
  let gapAnalysis = analyzeGaps(siteStructure, pageContents, businessReality);

  console.log(`[GrowthPlanner] Gaps identified:
    - Money page gaps: ${gapAnalysis.moneyPageGaps.length}
    - Trust gaps: ${gapAnalysis.trustGaps.length}
    - Support gaps: ${gapAnalysis.supportGaps.length}
    - Structural issues: ${gapAnalysis.structuralIssues.length}
    - Conversion blockers: ${gapAnalysis.conversionBlockers.length}
  `);

  // ========================================
  // PHASE 3.5: Research Integration (Optional)
  // ========================================
  if (options.useResearch) {
    console.log('[GrowthPlanner] Phase 3.5: Integrating research data...');
    gapAnalysis = await integrateResearchGaps(
      supabase,
      projectId,
      gapAnalysis,
      businessReality,
      siteStructure.siteUrl,
      options
    );
    console.log(`[GrowthPlanner] After research integration:
    - Money page gaps: ${gapAnalysis.moneyPageGaps.length}
    - Trust gaps: ${gapAnalysis.trustGaps.length}
    - Support gaps: ${gapAnalysis.supportGaps.length}
    `);
  }

  // ========================================
  // PHASE 4: Build Monthly Growth Plan
  // ========================================
  console.log('[GrowthPlanner] Phase 4: Building growth plan...');
  // Pass siteStructure for foundation score calculation
  let months = buildGrowthPlan(gapAnalysis, businessReality, siteStructure);

  // Apply options
  if (options.maxMonths && options.maxMonths < 12) {
    months = months.slice(0, options.maxMonths);
  }

  let totalTasks = months.reduce((sum, m) => sum + m.tasks.length, 0);
  console.log(`[GrowthPlanner] Plan built: ${months.length} months, ${totalTasks} tasks`);

  // ========================================
  // PHASE 4.5: Cannibalisation Prevention (MANDATORY)
  // ========================================
  console.log('[GrowthPlanner] Phase 4.5: Running cannibalisation check...');
  const { resolvedPlan, report: cannibalisationReport } = resolveCannibalisation(
    months,
    pageContents,
    businessReality
  );
  
  // Update months with resolved plan
  months = resolvedPlan;
  totalTasks = months.reduce((sum, m) => sum + m.tasks.length, 0);
  
  console.log(`[GrowthPlanner] Cannibalisation resolved:
    - Canonical pages: ${cannibalisationReport.canonicalPages.size}
    - Tasks after resolution: ${totalTasks}
    - Dropped tasks: ${cannibalisationReport.droppedTasks.length}
    - Warnings: ${cannibalisationReport.warnings.length}
  `);

  // If blockers remain and strict mode, throw error
  if (!cannibalisationReport.isValid && options.strictMode) {
    const blockerMessages = cannibalisationReport.blockers
      .map(b => `${b.type}: ${b.taskTitle} - ${b.suggestion}`)
      .join('\n');
    throw new Error(`Cannibalisation blockers detected:\n${blockerMessages}`);
  }

  // ========================================
  // PHASE 4.6: Unique Identifier Validation (with auto-repair)
  // ========================================
  console.log('[GrowthPlanner] Phase 4.6: Validating unique identifiers...');
  
  const uniqueIdResult = validateUniqueIdentifiers(months, pageContents, true);
  
  console.log(`[GrowthPlanner] Unique identifier check:
    - Valid: ${uniqueIdResult.isValid}
    - Blockers: ${uniqueIdResult.blockers.length}
    - IDs repaired: ${uniqueIdResult.repairedIds.length}
    - Slugs repaired: ${uniqueIdResult.repairedSlugs.length}
  `);

  // If repairs were applied, log them
  if (uniqueIdResult.repairedIds.length > 0) {
    console.log(`[GrowthPlanner] Auto-repaired duplicate IDs: ${uniqueIdResult.repairedIds.join(', ')}`);
  }
  if (uniqueIdResult.repairedSlugs.length > 0) {
    console.log(`[GrowthPlanner] Auto-repaired duplicate slugs: ${uniqueIdResult.repairedSlugs.join(', ')}`);
  }

  // ========================================
  // PHASE 4.7: Service Ownership & Intent Canon Gate
  // ========================================
  console.log('[GrowthPlanner] Phase 4.7: Validating service ownership & intent canon...');
  
  // Build onboarding context from business reality
  const onboardingContext: OnboardingContext = {
    services: businessReality.coreServices || [],
    allowedExpansions: [], // Could be extended from onboarding data
    locations: businessReality.primaryLocations || [],
  };
  
  const serviceOwnershipResult = validateTopicIntentCanon(months, onboardingContext);
  
  console.log(`[GrowthPlanner] Service ownership check:
    - Valid: ${serviceOwnershipResult.isValid}
    - Blockers: ${serviceOwnershipResult.blockers.length}
    - Validated: ${serviceOwnershipResult.validatedTasks}
    - Rejected: ${serviceOwnershipResult.rejectedTasks}
  `);

  if (serviceOwnershipResult.warnings.length > 0) {
    console.log(`[GrowthPlanner] Ownership warnings: ${serviceOwnershipResult.warnings.join('; ')}`);
  }

  // ========================================
  // PHASE 4.8: Enhanced Cannibalisation Detection (Jaccard)
  // ========================================
  console.log('[GrowthPlanner] Phase 4.8: Running enhanced cannibalisation detection (Jaccard)...');
  
  const enhancedCannibalisation = detectEnhancedCannibalisation(months, pageContents, 0.82);
  
  console.log(`[GrowthPlanner] Enhanced cannibalisation check:
    - Valid: ${enhancedCannibalisation.isValid}
    - Blockers: ${enhancedCannibalisation.blockers.length}
    - Semantic duplicates: ${enhancedCannibalisation.semanticDuplicates.length}
    - Warnings: ${enhancedCannibalisation.warnings.length}
  `);

  if (enhancedCannibalisation.semanticDuplicates.length > 0) {
    console.log('[GrowthPlanner] Semantic duplicates found:');
    for (const dup of enhancedCannibalisation.semanticDuplicates.slice(0, 5)) {
      console.log(`  - ${dup.task1Id} <-> ${dup.task2Id}: ${(dup.score * 100).toFixed(1)}% similar`);
    }
  }

  // ========================================
  // PHASE 5: Task Validation (Personalisation Rules)
  // ========================================
  console.log('[GrowthPlanner] Phase 5: Validating tasks against personalisation rules...');
  const allTasks = months.flatMap((m) => m.tasks);
  const taskValidation = validatePlan(allTasks);

  console.log(`[GrowthPlanner] Task validation:
    - Valid tasks: ${taskValidation.valid.length}
    - Invalid tasks: ${taskValidation.invalid.length}
    - Violations found: ${taskValidation.invalid.reduce((sum, t) => sum + t.violations.length, 0)}
  `);

  // Flag invalid tasks but don't remove them (let user decide)
  const flaggedTasks = taskValidation.invalid.map((v) => v.taskId);
  if (flaggedTasks.length > 0 && options.strictMode) {
    console.log(`[GrowthPlanner] Warning: ${flaggedTasks.length} tasks have validation issues`);
  }

  // ========================================
  // PHASE 5.5: SERP/AEO Audit Gate (Planning Mode)
  // ========================================
  console.log('[GrowthPlanner] Phase 5.5: Running SERP/AEO Audit Gate on proposed titles...');
  
  // Build audit context from business reality
  const primaryTone = Array.isArray(businessReality.tone) 
    ? businessReality.tone[0] || 'professional' 
    : 'professional';
    
  const auditUserContext: AuditUserContext = {
    brandTone: {
      personality: primaryTone,
      formality: 'professional',
      confidence: 'confident',
      localFlavour: businessReality.primaryLocations[0] || undefined,
    },
    USPs: businessReality.differentiators || [],
    reviews: businessReality.reviewThemes?.map(r => ({
      theme: r.theme,
      snippet: r.snippets[0] || '',
    })) || [],
    experience: {
      years: businessReality.yearsActive || undefined,
      volume: businessReality.volumeIndicators[0] || undefined,
      specialties: businessReality.coreServices,
    },
    credentials: businessReality.proofAssets || [],
    beads: [],
    localSignals: businessReality.primaryLocations || [],
  };

  const auditSiteContext: SiteContext = {
    sitemap: pageContents.map(p => p.path),
    existingPages: pageContents.map(p => ({
      path: p.path,
      title: p.title || '',
      role: p.role,
    })),
    internalLinkGraph: new Map(),
  };

  // Track audit results for reporting
  const auditResults: Array<{
    taskId: string;
    originalTitle: string;
    approved: boolean;
    rewrittenTitle?: string;
    scores: Record<string, number>;
    warnings: string[];
  }> = [];

  let auditedTitlesCount = 0;
  let rewrittenTitlesCount = 0;

  // Run audit gate on each task in the plan
  for (const month of months) {
    for (const task of month.tasks) {
      const taskContext: TaskContext = {
        role: task.role,
        intent: task.searchIntent,
        supportsPage: task.supportsPage || undefined,
        primaryService: task.primaryService,
        location: task.primaryLocation || undefined,
      };

      const proposed: ProposedContent = {
        title: task.title,
        headings: [], // Not available at planning stage
        keyphrase: task.primaryService,
        metaDescription: '',
      };

      const auditInput: AuditGateInput = {
        taskContext,
        siteContext: auditSiteContext,
        userContext: auditUserContext,
        proposed,
      };

      try {
        const auditResult = runAuditGate(auditInput, 'planning');
        auditedTitlesCount++;

        auditResults.push({
          taskId: task.id,
          originalTitle: task.title,
          approved: auditResult.approved,
          rewrittenTitle: auditResult.rewrittenTitle !== task.title ? auditResult.rewrittenTitle : undefined,
          scores: {
            title: auditResult.scores.serpStrength,
            intent: auditResult.scores.intentMatch,
            aeo: auditResult.scores.aeoCoverage,
            credibility: auditResult.scores.credibility,
          },
          warnings: auditResult.warnings,
        });

        // Apply rewritten title if improved
        if (auditResult.rewrittenTitle && auditResult.rewrittenTitle !== task.title) {
          console.log(`[AuditGate] Rewriting title: "${task.title}" → "${auditResult.rewrittenTitle}"`);
          task.title = auditResult.rewrittenTitle;
          rewrittenTitlesCount++;
        }
      } catch (error) {
        console.warn(`[AuditGate] Failed to audit task ${task.id}:`, error);
        // Continue without failing the plan
      }
    }
  }

  console.log(`[GrowthPlanner] Audit Gate complete:
    - Tasks audited: ${auditedTitlesCount}
    - Titles rewritten: ${rewrittenTitlesCount}
  `);

  // ========================================
  // PHASE 6: CADENCE ENFORCEMENT (4 Posts/Month)
  // ========================================
  console.log('[GrowthPlanner] Phase 6: Enforcing 4-post monthly cadence...');
  
  // Determine plan start date (first day of next month, or user-specified)
  const planStartDate = options.startDate 
    ? new Date(options.startDate)
    : getNextMonthStart();
  
  // Apply cadence to all months - ensures:
  // - Exactly 4 posts per month
  // - Week 1: Money, Week 2: Support, Week 3: Case Study (mandatory), Week 4: Authority
  // - Publishing dates assigned
  // - Dependencies enforced (support/case-study/authority link to money page)
  const cadenceResult = applyPlanCadence(months, planStartDate, businessReality);
  
  // Replace months with cadence-enforced version
  const cadencedMonths = cadenceResult.months;
  
  // Get cadence statistics
  const cadenceStats = getCadenceStats(cadencedMonths);
  
  console.log(`[GrowthPlanner] Cadence applied:
    - Plan start: ${planStartDate.toISOString().split('T')[0]}
    - Complete months: ${cadenceResult.validation.completeMonths}/${cadenceResult.validation.monthsProcessed}
    - Total posts: ${cadenceStats.totalPosts}
    - Posts by slot: Money=${cadenceStats.bySlot.money}, Support=${cadenceStats.bySlot.support}, CaseStudy=${cadenceStats.bySlot['case-study']}, Authority=${cadenceStats.bySlot.authority}
  `);
  
  if (cadenceResult.validation.warnings.length > 0) {
    console.log(`[GrowthPlanner] Cadence warnings: ${cadenceResult.validation.warnings.join('; ')}`);
  }
  
  // Update months reference for remaining phases
  months.length = 0;
  months.push(...cadencedMonths);

  // ========================================
  // PHASE 6.5: SEO Drafts Refinement
  // ========================================
  console.log('[GrowthPlanner] Phase 6.5: Refining SEO drafts for all tasks...');
  
  try {
    const geo = businessReality.primaryLocations?.[0];
    
    // Refine SEO drafts for all tasks in the plan
    const refinedMonths = await refineSeoDraftsForPlan({
      months,
      businessName: businessReality.name,
      geo,
      openaiApiKey: options.openaiApiKey,
    });
    
    // Replace months with refined version
    months.length = 0;
    months.push(...refinedMonths);
    
    // Count how many tasks got SEO drafts
    const tasksWithDrafts = refinedMonths.flatMap(m => m.tasks)
      .filter(t => t.seoTitleDraft && t.h1Draft && t.metaDescriptionDraft).length;
    const totalTaskCount = refinedMonths.flatMap(m => m.tasks).length;
    
    console.log(`[GrowthPlanner] SEO drafts refined:
    - Tasks with drafts: ${tasksWithDrafts}/${totalTaskCount}
    - Draft coverage: ${((tasksWithDrafts / totalTaskCount) * 100).toFixed(1)}%
    `);
  } catch (error) {
    console.warn('[GrowthPlanner] SEO drafts refinement failed, continuing without drafts:', error);
    // Non-fatal - plan can proceed without SEO drafts, they'll be generated at write time
  }

  // ========================================
  // PHASE 6.6: Vision Evidence Task Flagging
  // ========================================
  console.log('[GrowthPlanner] Phase 6.6: Flagging tasks requiring vision evidence...');
  
  const visionEvidenceResult = flagVisionEvidenceTasks(months);
  
  console.log(`[GrowthPlanner] Vision evidence flagging:
    - Tasks flagged: ${visionEvidenceResult.flaggedCount}
    - Flagged tasks: ${visionEvidenceResult.flaggedTasks.slice(0, 5).join(', ')}${visionEvidenceResult.flaggedTasks.length > 5 ? '...' : ''}
  `);

  // ========================================
  // PHASE 7: Quality Scoring & Threshold
  // ========================================
  console.log('[GrowthPlanner] Phase 7: Quality scoring...');
  const qualityScore = calculateQualityScore(months, businessReality, gapAnalysis);
  const qualityRating = getQualityRating(qualityScore.overall);
  const threshold = options.qualityThreshold || QUALITY_THRESHOLDS.minimum;

  console.log(`[GrowthPlanner] Quality score: ${qualityScore.overall}/100 (${qualityRating})`);

  // Check quality threshold
  if (!meetsQualityThreshold(qualityScore.overall, threshold)) {
    console.log(`[GrowthPlanner] Warning: Plan below quality threshold (${qualityScore.overall} < ${threshold})`);
    
    if (options.strictMode) {
      const improvements = getQualityImprovements(qualityScore);
      throw new Error(
        `Plan quality too low (${qualityScore.overall}/100). Improvements needed: ${improvements.join('; ')}`
      );
    }
  }

  // ========================================
  // Build Final Output
  // ========================================
  const warnings = generateWarnings(months, businessReality, missingInputs, contextValidation, taskValidation);
  const assumptions = generateAssumptions(businessReality, pageContents);

  // Calculate foundation score for output
  const foundationScore = calculateFoundationScore(siteStructure, gapAnalysis);

  // Get confirmed services (filtered for generics)
  const confirmedPrimaryServices = businessReality.coreServices.filter(
    (s) => !isGenericService(s)
  );

  // Build ownership map for output
  const ownershipMap = exportOwnershipMap(cannibalisationReport.canonicalPages);

  // ========================================
  // COLLECT ALL BLOCKERS (Fail-Fast)
  // ========================================
  const allBlockers: Array<{
    phase: string;
    type: string;
    message: string;
    suggestion: string;
  }> = [];

  // Add cannibalisation blockers
  for (const blocker of cannibalisationReport.blockers) {
    allBlockers.push({
      phase: 'cannibalisation',
      type: blocker.type,
      message: `${blocker.taskTitle}: ${blocker.type}`,
      suggestion: blocker.suggestion,
    });
  }

  // Add EEAT proof hard gate blocker
  // At least 2 proof types must be present in business reality
  const eeatProofCount = [
    businessReality.yearsActive ? 1 : 0,
    businessReality.reviewThemes?.length > 0 ? 1 : 0,
    businessReality.volumeIndicators?.length > 0 ? 1 : 0,
    businessReality.proofAssets?.length > 0 ? 1 : 0,
    businessReality.primaryLocations?.length > 0 ? 1 : 0,
  ].reduce((sum, v) => sum + v, 0);
  
  if (eeatProofCount < 2) {
    allBlockers.push({
      phase: 'eeat',
      type: 'MISSING_EEAT_PROOF',
      message: `Only ${eeatProofCount} EEAT proof types available (minimum 2 required)`,
      suggestion: 'Add at least 2 of: years experience, reviews, project count, proof assets, or local expertise',
    });
  }

  // Add unique identifier blockers
  for (const blocker of uniqueIdResult.blockers) {
    allBlockers.push({
      phase: 'unique-identifiers',
      type: blocker.type,
      message: `${blocker.taskTitle}: ${blocker.details}`,
      suggestion: blocker.suggestion,
    });
  }

  // Add service ownership blockers
  for (const blocker of serviceOwnershipResult.blockers) {
    allBlockers.push({
      phase: 'service-ownership',
      type: blocker.type,
      message: `${blocker.taskTitle}: ${blocker.details}`,
      suggestion: blocker.suggestion,
    });
  }

  // Add enhanced cannibalisation blockers
  for (const blocker of enhancedCannibalisation.blockers) {
    allBlockers.push({
      phase: 'enhanced-cannibalisation',
      type: blocker.type,
      message: `${blocker.taskTitle}: ${blocker.details}`,
      suggestion: blocker.suggestion,
    });
  }

  // Add audit gate blockers (from pre-publish mode only, planning mode doesn't block)
  for (const auditResult of auditResults) {
    if (!auditResult.approved && auditResult.warnings.length > 0) {
      // In planning mode these are warnings not blockers, but log them
      console.log(`[GrowthPlanner] Audit warning for ${auditResult.originalTitle}: ${auditResult.warnings.join(', ')}`);
    }
  }

  // Log blocker summary
  const isBlocked = allBlockers.length > 0 && (options.strictMode === true);
  if (allBlockers.length > 0) {
    console.log(`[GrowthPlanner] Plan has ${allBlockers.length} blockers${options.strictMode ? ' - BLOCKED' : ' (non-strict mode, continuing)'}`);
  }

  const plan: PersonalizedGrowthPlan = {
    projectId,
    projectName: businessReality.name,
    generatedAt: new Date().toISOString(),
    
    businessContext: businessReality,
    siteContext: siteStructure,
    gapAnalysis,
    
    // NEW: Foundation health tracking
    foundationScore,
    confirmedPrimaryServices,
    
    // NEW: Cannibalisation prevention
    ownershipMap,
    cannibalisationReport: {
      isValid: cannibalisationReport.isValid,
      warnings: cannibalisationReport.warnings.length,
      blockers: cannibalisationReport.blockers.length,
      droppedTasks: cannibalisationReport.droppedTasks.map(t => t.title),
      mergedTasks: cannibalisationReport.mergedTasks,
    },

    // NEW: Unique identifier validation report
    uniqueIdentifierReport: {
      isValid: uniqueIdResult.isValid,
      blockers: uniqueIdResult.blockers.length,
      repairedIds: uniqueIdResult.repairedIds,
      repairedSlugs: uniqueIdResult.repairedSlugs,
    },

    // NEW: Service ownership validation report
    serviceOwnershipReport: {
      isValid: serviceOwnershipResult.isValid,
      blockers: serviceOwnershipResult.blockers.length,
      validatedTasks: serviceOwnershipResult.validatedTasks,
      rejectedTasks: serviceOwnershipResult.rejectedTasks,
      warnings: serviceOwnershipResult.warnings,
    },

    // NEW: Enhanced cannibalisation report (Jaccard)
    enhancedCannibalisationReport: {
      isValid: enhancedCannibalisation.isValid,
      blockers: enhancedCannibalisation.blockers.length,
      semanticDuplicates: enhancedCannibalisation.semanticDuplicates.length,
      warnings: enhancedCannibalisation.warnings,
    },

    // NEW: SERP/AEO Audit Gate report
    auditGateReport: auditResults.length > 0 ? {
      tasksAudited: auditedTitlesCount,
      titlesRewritten: rewrittenTitlesCount,
      averageScores: {
        title: auditResults.reduce((sum, r) => sum + (r.scores.title || 0), 0) / auditResults.length,
        intent: auditResults.reduce((sum, r) => sum + (r.scores.intent || 0), 0) / auditResults.length,
        aeo: auditResults.reduce((sum, r) => sum + (r.scores.aeo || 0), 0) / auditResults.length,
        credibility: auditResults.reduce((sum, r) => sum + (r.scores.credibility || 0), 0) / auditResults.length,
      },
      taskResults: auditResults,
    } : undefined,

    // NEW: Cadence scheduling report
    cadenceReport: {
      planStartDate: planStartDate.toISOString(),
      isValid: cadenceResult.validation.isValid,
      completeMonths: cadenceResult.validation.completeMonths,
      incompleteMonths: cadenceResult.validation.incompleteMonths,
      totalPosts: cadenceStats.totalPosts,
      bySlot: cadenceStats.bySlot,
      warnings: cadenceResult.validation.warnings,
    },
    
    months,
    totalTasks: cadenceStats.totalPosts, // Use cadence count for accuracy
    
    // FAIL-FAST: Blocker tracking
    blocked: isBlocked,
    blockers: allBlockers,
    
    qualityScore,
    
    assumptions,
    missingInputs,
    warnings,
  };

  const duration = Date.now() - startTime;
  console.log(`[GrowthPlanner] Complete in ${duration}ms`);

  return plan;
}

/**
 * Generate a single brief for a specific task (legacy format)
 */
export async function generateTaskBrief(
  supabase: SupabaseClient,
  projectId: string,
  taskId: string
): Promise<LegacyWriterBrief | null> {
  const { businessReality } = await ingestContext(supabase, projectId);

  // Find the task in the growth plan
  const { data: growthPlan } = await supabase
    .from('growth_plans')
    .select('months')
    .eq('project_id', projectId)
    .single();

  if (!growthPlan?.months) {
    return null;
  }

  // Search for task in months
  for (const month of growthPlan.months as GrowthPlanMonth[]) {
    const task = month.tasks.find((t) => t.id === taskId);
    if (task) {
      return generateBrief(task, businessReality);
    }
  }

  return null;
}

/**
 * Generate all briefs for a month (legacy format)
 */
export async function generateMonthBriefs(
  supabase: SupabaseClient,
  projectId: string,
  monthNumber: number
): Promise<LegacyWriterBrief[]> {
  const { businessReality } = await ingestContext(supabase, projectId);

  const { data: growthPlan } = await supabase
    .from('growth_plans')
    .select('months')
    .eq('project_id', projectId)
    .single();

  if (!growthPlan?.months) {
    return [];
  }

  const months = growthPlan.months as GrowthPlanMonth[];
  const targetMonth = months.find((m) => m.month === monthNumber);

  if (!targetMonth) {
    return [];
  }

  return generateBriefsForMonth(targetMonth.tasks, businessReality);
}

// ============================================================================
// ENHANCED PLAN GENERATION (With Briefs & Validation)
// ============================================================================

/**
 * Extended options for enhanced plan generation
 */
export interface EnhancedPlanOptions extends GrowthPlannerOptions {
  /** Whether to auto-fix validation violations (default: true) */
  autoFix?: boolean;
  /** Whether to generate briefs for all tasks (default: true) */
  generateBriefs?: boolean;
  /** Array of existing page slugs for internal linking validation */
  existingPageSlugs?: string[];
}

/**
 * Generate a fully personalized growth plan with briefs and validation.
 * 
 * This extends the base plan generation with:
 * - Hard rules validation (slug hygiene, title length, personalization)
 * - Auto-fix for violations (backfills from business reality)
 * - Full brief generation for every task (with channel derivatives)
 */
export async function generateEnhancedPlan(
  supabase: SupabaseClient,
  projectId: string,
  options: EnhancedPlanOptions = {}
): Promise<EnhancedGrowthPlanOutput> {
  const { autoFix = true, generateBriefs = true, existingPageSlugs = [] } = options;

  console.log(`[GrowthPlanner] Starting enhanced plan generation for ${projectId}`);

  // Generate the base plan
  const plan = await generatePersonalizedPlan(supabase, projectId, options);

  console.log(`[GrowthPlanner] Base plan complete. Starting hard rules validation...`);

  // ========================================
  // PHASE 6: Hard Rules Validation
  // ========================================
  let allTasks = plan.months.flatMap((m) => m.tasks);
  const businessReality = plan.businessContext;

  // First pass: validate all tasks
  let validationReport = validatePlanHardRules(allTasks, businessReality, existingPageSlugs);

  console.log(`[GrowthPlanner] Hard rules validation:
    - Valid tasks: ${validationReport.validTasks}
    - Invalid tasks: ${validationReport.invalidTasks}
    - Total violations: ${validationReport.totalViolations}
    - Auto-fixable: ${validationReport.autoFixable}
  `);

  // Auto-fix if enabled
  if (autoFix && validationReport.autoFixable > 0) {
    console.log(`[GrowthPlanner] Auto-fixing ${validationReport.autoFixable} violations...`);
    
    const fixedTasks = allTasks.map((task) => {
      const taskReport = validationReport.taskReports.find((t) => t.taskId === task.id);
      if (taskReport && taskReport.violations.length > 0) {
        const { fixedTask } = autoFixTaskViolations(task, businessReality, taskReport.violations);
        return fixedTask;
      }
      return task;
    });

    // Update months with fixed tasks
    let taskIndex = 0;
    plan.months = plan.months.map((month) => ({
      ...month,
      tasks: month.tasks.map(() => fixedTasks[taskIndex++]),
    }));

    // Re-validate after fixes
    allTasks = plan.months.flatMap((m) => m.tasks);
    validationReport = validatePlanHardRules(allTasks, businessReality, existingPageSlugs);

    console.log(`[GrowthPlanner] Post-fix validation:
      - Valid tasks: ${validationReport.validTasks}
      - Invalid tasks: ${validationReport.invalidTasks}
      - Remaining violations: ${validationReport.totalViolations}
    `);
  }

  // ========================================
  // PHASE 7: Brief Generation
  // ========================================
  let briefs: WriterBrief[] = [];

  if (generateBriefs) {
    console.log(`[GrowthPlanner] Generating enhanced briefs for ${allTasks.length} tasks...`);
    briefs = generateAllBriefs(plan.months, businessReality);
    console.log(`[GrowthPlanner] Generated ${briefs.length} briefs with channel derivatives`);
  }

  // Build enhanced output
  const enhancedOutput: EnhancedGrowthPlanOutput = {
    plan,
    briefs,
    validationReport,
  };

  console.log(`[GrowthPlanner] Enhanced plan generation complete`);

  return enhancedOutput;
}

// ============================================================================
// QUALITY SCORING
// ============================================================================

function calculateQualityScore(
  months: GrowthPlanMonth[],
  business: any,
  gaps: any
): PersonalizedGrowthPlan['qualityScore'] {
  // Personalization score - how much real context is used
  let personalization = 50;
  if (business.coreServices.length > 0) personalization += 10;
  if (business.primaryLocations.length > 0) personalization += 10;
  if (business.yearsActive) personalization += 10;
  if (business.reviewThemes.length > 0) personalization += 10;
  if (business.differentiators.length > 0) personalization += 10;

  // Conversion alignment - money pages addressed
  const moneyTasks = months.flatMap((m) => m.tasks).filter((t) => t.role === 'money');
  const conversionAlignment = Math.min(100, 50 + moneyTasks.length * 5);

  // Local relevance
  const localTasks = months.flatMap((m) => m.tasks).filter((t) => t.primaryLocation);
  const localRelevance = business.primaryLocations.length > 0
    ? Math.min(100, 50 + localTasks.length * 10)
    : 0;

  // Trust strength
  const trustTasks = months.flatMap((m) => m.tasks).filter((t) => t.role === 'trust');
  const trustStrength = Math.min(100, 50 + trustTasks.length * 8);

  // Task uniqueness (no duplicates)
  const allSlugs = months.flatMap((m) => m.tasks.map((t) => t.slug));
  const uniqueSlugs = new Set(allSlugs).size;
  const taskUniqueness = Math.round((uniqueSlugs / allSlugs.length) * 100) || 100;

  // Overall
  const overall = Math.round(
    (personalization + conversionAlignment + localRelevance + trustStrength + taskUniqueness) / 5
  );

  return {
    personalization,
    conversionAlignment,
    localRelevance,
    trustStrength,
    taskUniqueness,
    overall,
  };
}

function generateWarnings(
  months: GrowthPlanMonth[],
  business: any,
  missingInputs: string[],
  contextValidation?: { warnings: string[]; criticalMissing: string[] },
  taskValidation?: { invalid: Array<{ taskId: string; violations: Array<{ description: string }> }> }
): string[] {
  const warnings: string[] = [];

  // Add context validation warnings
  if (contextValidation?.criticalMissing && contextValidation.criticalMissing.length > 0) {
    warnings.push(`Critical inputs missing: ${contextValidation.criticalMissing.join(', ')}`);
  }
  if (contextValidation?.warnings) {
    warnings.push(...contextValidation.warnings);
  }

  if (missingInputs.length > 0) {
    warnings.push(`Missing inputs may reduce plan quality: ${missingInputs.join(', ')}`);
  }

  if (business.coreServices.length === 0) {
    warnings.push('No core services defined - using generic service references');
  }

  if (business.primaryLocations.length === 0) {
    warnings.push('No locations defined - local SEO tasks may not be relevant');
  }

  if (!business.yearsActive) {
    warnings.push('Years of experience not specified - proof elements may be weaker');
  }

  if (business.reviewThemes.length === 0) {
    warnings.push('No review themes available - social proof may be limited');
  }

  const totalTasks = months.reduce((sum, m) => sum + m.tasks.length, 0);
  if (totalTasks < 20) {
    warnings.push('Plan has fewer tasks than typical - may need expansion');
  }

  // Add task validation warnings
  if (taskValidation?.invalid && taskValidation.invalid.length > 0) {
    warnings.push(`${taskValidation.invalid.length} tasks have validation issues - review flagged tasks`);
  }

  // Deduplicate warnings
  return Array.from(new Set(warnings));
}

function generateAssumptions(
  business: any,
  pageContents: any[]
): string[] {
  const assumptions: string[] = [];

  if (pageContents.length === 0) {
    assumptions.push('No pages crawled yet - plan based on user context only');
  }

  if (!business.pricePositioning) {
    assumptions.push('Assumed mid-range price positioning');
  }

  if (business.coreServices.length === 1) {
    assumptions.push('Single service focus - plan structured around one offering');
  }

  if (business.primaryLocations.length > 3) {
    assumptions.push('Multiple locations detected - focused on top 3 for initial plan');
  }

  return assumptions;
}

// ============================================================================
// TEMPLATE FALLBACK (for when no context available)
// ============================================================================

export function getTemplatePlan(): GrowthPlanMonth[] {
  // This is the fallback template - kept for when user has no context
  return [
    {
      month: 1,
      theme: 'Core Service Pages',
      focus: 'foundation',
      tasks: [],
      monthlyGoal: 'Establish core service presence',
      kpis: ['Service pages live', 'Basic SEO in place'],
    },
    {
      month: 2,
      theme: 'Local SEO & Trust',
      focus: 'depth',
      tasks: [],
      monthlyGoal: 'Build local visibility',
      kpis: ['GMB optimized', 'About page live'],
    },
    {
      month: 3,
      theme: 'Content Expansion',
      focus: 'expansion',
      tasks: [],
      monthlyGoal: 'Support pages strengthen money pages',
      kpis: ['FAQ live', 'Process page live'],
    },
    // ... remaining months would be added
  ];
}

// ============================================================================
// RESEARCH INTEGRATION
// ============================================================================

/**
 * Convert BusinessRealityModel to ResearchBusinessContext
 */
function toResearchContext(business: BusinessRealityModel): import('@/lib/research').ResearchBusinessContext {
  return {
    name: business.name,
    niche: business.niche,
    coreServices: business.coreServices,
    primaryLocations: business.primaryLocations,
    yearsActive: business.yearsActive,
    reviewThemes: business.reviewThemes.map(t => ({ theme: t.theme, count: t.count })),
    differentiators: business.differentiators,
    volumeIndicators: business.volumeIndicators,
    scenarioProof: business.scenarioProof.map(s => ({ scenario: s.service, outcome: s.statement })),
  };
}

/**
 * Integrate research gaps into the gap analysis
 * This enriches the planner with deep research data
 */
async function integrateResearchGaps(
  supabase: SupabaseClient,
  projectId: string,
  gapAnalysis: GapAnalysis,
  businessReality: BusinessRealityModel,
  siteUrl: string,
  options: GrowthPlannerOptions
): Promise<GapAnalysis> {
  let researchReport: ResearchReport | null = null;

  // Convert business context for research
  const researchContext = toResearchContext(businessReality);

  // Option 1: Run fresh research
  if (options.runFreshResearch) {
    console.log('[GrowthPlanner] Running fresh research...');
    try {
      researchReport = await runSiteResearch(siteUrl, researchContext, {
        maxPages: 50,
        openaiApiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
        useJinaReader: true,
      });
      console.log(`[GrowthPlanner] Fresh research completed: ${researchReport.contentGaps.length} gaps found`);
    } catch (error) {
      console.error('[GrowthPlanner] Fresh research failed:', error);
    }
  }

  // Option 2: Load existing research report
  if (!researchReport && options.researchReportId) {
    console.log(`[GrowthPlanner] Loading research report: ${options.researchReportId}`);
    const { data, error } = await supabase
      .from('research_reports')
      .select('*')
      .eq('id', options.researchReportId)
      .single();

    if (data && !error) {
      researchReport = {
        siteUrl: data.site_url,
        analyzedAt: data.analyzed_at,
        totalPages: data.total_pages,
        pagesByRole: data.pages_by_role,
        keywords: data.keywords || [],
        topicClusters: data.topic_clusters || [],
        contentGaps: data.content_gaps || [],
        headingSuggestions: data.heading_suggestions || [],
        thinContentPages: data.thin_content_pages || [],
        orphanedPages: data.orphaned_pages || [],
        duplicateTopics: data.duplicate_topics || [],
      };
    }
  }

  // Option 3: Load latest research for project
  if (!researchReport) {
    console.log('[GrowthPlanner] Loading latest research for project...');
    const { data, error } = await supabase
      .from('research_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data && !error) {
      researchReport = {
        siteUrl: data.site_url,
        analyzedAt: data.analyzed_at,
        totalPages: data.total_pages,
        pagesByRole: data.pages_by_role,
        keywords: data.keywords || [],
        topicClusters: data.topic_clusters || [],
        contentGaps: data.content_gaps || [],
        headingSuggestions: data.heading_suggestions || [],
        thinContentPages: data.thin_content_pages || [],
        orphanedPages: data.orphaned_pages || [],
        duplicateTopics: data.duplicate_topics || [],
      };
      console.log(`[GrowthPlanner] Loaded research from ${researchReport.analyzedAt}`);
    }
  }

  // No research available
  if (!researchReport) {
    console.log('[GrowthPlanner] No research data available, using standard gap analysis');
    return gapAnalysis;
  }

  // Merge research gaps into gap analysis
  return mergeResearchIntoGaps(gapAnalysis, researchReport, businessReality);
}

/**
 * Merge research-discovered gaps into the main gap analysis
 */
function mergeResearchIntoGaps(
  existing: GapAnalysis,
  research: ResearchReport,
  business: BusinessRealityModel
): GapAnalysis {
  const merged = { ...existing };
  
  // Track existing titles to avoid duplicates
  const existingMoneyTitles = new Set(merged.moneyPageGaps.map(g => g.suggestedTitle.toLowerCase()));
  const existingTrustTitles = new Set(merged.trustGaps.map(g => g.suggestedTitle.toLowerCase()));
  const existingSupportTitles = new Set(merged.supportGaps.map(g => g.suggestedTitle.toLowerCase()));

  // Convert research gaps to PageGap format and merge
  const researchPageGaps = researchGapsToPageGaps(research.contentGaps);
  
  for (const gap of researchPageGaps) {
    const titleLower = gap.suggestedTitle.toLowerCase();
    
    switch (gap.targetRole) {
      case 'money':
        if (!existingMoneyTitles.has(titleLower)) {
          merged.moneyPageGaps.push(gap);
          existingMoneyTitles.add(titleLower);
        }
        break;
      case 'trust':
        if (!existingTrustTitles.has(titleLower)) {
          merged.trustGaps.push(gap);
          existingTrustTitles.add(titleLower);
        }
        break;
      case 'support':
        if (!existingSupportTitles.has(titleLower)) {
          merged.supportGaps.push(gap);
          existingSupportTitles.add(titleLower);
        }
        break;
      case 'authority':
        // Authority gaps go to support gaps in our model
        if (!existingSupportTitles.has(titleLower)) {
          merged.supportGaps.push({
            ...gap,
            targetRole: 'support',
          });
          existingSupportTitles.add(titleLower);
        }
        break;
    }
  }

  // Add research-identified structural issues
  if (research.duplicateTopics.length > 0) {
    for (const dup of research.duplicateTopics) {
      const issueExists = merged.structuralIssues.some(
        i => i.type === 'cannibalisation' && 
        i.pages.some(p => dup.pages.includes(p))
      );
      
      if (!issueExists) {
        merged.structuralIssues.push({
          type: 'cannibalisation',
          pages: dup.pages,
          recommendation: `Multiple pages target "${dup.topic}" - consolidate or differentiate`,
        });
      }
    }
  }

  // Add thin content pages as structural issues
  for (const thinPage of research.thinContentPages.slice(0, 5)) {
    const alreadyExists = merged.structuralIssues.some(
      i => i.pages.includes(thinPage)
    );
    if (!alreadyExists) {
      merged.structuralIssues.push({
        type: 'thin_content',
        pages: [thinPage],
        recommendation: `Page has less than 300 words - expand or consolidate`,
      });
    }
  }

  console.log(`[GrowthPlanner] Research merged: +${researchPageGaps.length} gaps, +${research.duplicateTopics.length} structural issues`);
  
  return merged;
}
