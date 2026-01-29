// ============================================================================
// SERP / AEO AUDIT GATE - MAIN ORCHESTRATOR
// ============================================================================

import {
  AuditGateInput,
  ContentIntelGateResult,
  ApprovedOutline,
  AuditScores,
  CredibilityInjection,
  ComplianceResult,
  TaskContext,
  UserContext,
} from './types';

import { analyzeTitle } from './title-intelligence';
import { validateIntent, validateOutlineIntent } from './intent-validation';
import { checkAEOCoverage, enhanceOutlineForAEO } from './aeo-coverage';
import { checkCredibility } from './credibility';
import { scanForRisks, softenClaim } from './risk-compliance';

// ============================================================================
// GATE EXECUTION MODES
// ============================================================================

export type GateMode = 'planning' | 'pre-publish';

// ============================================================================
// MAIN GATE FUNCTION
// ============================================================================

/**
 * Run the SERP/AEO Audit Gate on proposed content
 * 
 * This gate runs twice:
 * A) At planning time - evaluates proposed topics & titles, rewrites weak ones
 * B) Pre-publish - audits final output, tightens titles/headings/meta
 * 
 * @param input - All context required for the audit
 * @param mode - 'planning' or 'pre-publish'
 * @returns ContentIntelGateResult with approval status, rewrites, and scores
 */
export function runAuditGate(
  input: AuditGateInput,
  mode: GateMode = 'planning'
): ContentIntelGateResult {
  const {
    taskContext,
    siteContext,
    userContext,
    visionContext,
    proposed,
  } = input;

  const allWarnings: string[] = [];
  const allBlockers: string[] = [];
  const allSuggestions: string[] = [];
  const allInjections: CredibilityInjection[] = [];

  console.log(`[AuditGate] Running ${mode} audit for: ${proposed.title}`);

  // ========================================
  // CHECK 1: Title Intelligence
  // ========================================
  console.log('[AuditGate] Check 1: Title Intelligence...');
  const titleAnalysis = analyzeTitle(proposed, taskContext, userContext);
  
  if (!titleAnalysis.isValid) {
    if (mode === 'pre-publish') {
      allBlockers.push('Title failed intelligence check');
    } else {
      allWarnings.push('Title needs improvement');
    }
  }
  
  allSuggestions.push(...titleAnalysis.suggestions);
  
  // Use rewritten title if original was weak
  const approvedTitle = titleAnalysis.score < 70 
    ? titleAnalysis.rewrittenTitle 
    : proposed.title;

  console.log(`[AuditGate] Title score: ${titleAnalysis.score}/100`);

  // ========================================
  // CHECK 2: Search Intent Validation
  // ========================================
  console.log('[AuditGate] Check 2: Intent Validation...');
  const intentValidation = validateIntent(proposed, taskContext);
  
  if (!intentValidation.isValid) {
    if (mode === 'pre-publish') {
      allBlockers.push(`Content does not match declared ${taskContext.intent} intent`);
    } else {
      allWarnings.push(`Weak ${taskContext.intent} intent signals`);
    }
  }
  
  for (const issue of intentValidation.issues) {
    allWarnings.push(issue);
  }
  allSuggestions.push(...intentValidation.suggestions);

  console.log(`[AuditGate] Intent score: ${intentValidation.score}/100`);

  // ========================================
  // CHECK 3: AEO Coverage
  // ========================================
  console.log('[AuditGate] Check 3: AEO Coverage...');
  const aeoCoverage = checkAEOCoverage(proposed, taskContext);
  
  if (!aeoCoverage.isValid) {
    if (mode === 'pre-publish') {
      allBlockers.push(`Insufficient AEO coverage (${aeoCoverage.coveredQuestions.length}/7 questions)`);
    } else {
      allWarnings.push(`AEO coverage below threshold - ${aeoCoverage.missingQuestions.length} questions missing`);
    }
  }
  
  for (const issue of aeoCoverage.issues) {
    allWarnings.push(issue);
  }
  allSuggestions.push(...aeoCoverage.suggestions);

  console.log(`[AuditGate] AEO score: ${aeoCoverage.score}/100`);

  // ========================================
  // CHECK 4: Credibility & EEAT
  // ========================================
  console.log('[AuditGate] Check 4: Credibility & EEAT...');
  const credibilityCheck = checkCredibility(proposed, taskContext, userContext, visionContext);
  
  if (!credibilityCheck.isValid) {
    if (mode === 'pre-publish' && taskContext.role === 'money') {
      allBlockers.push('Money page requires minimum credibility signals');
    } else {
      allWarnings.push(`Only ${credibilityCheck.presentSignals.length} credibility signals (minimum 2)`);
    }
  }
  
  for (const issue of credibilityCheck.issues) {
    allWarnings.push(issue);
  }
  allSuggestions.push(...credibilityCheck.suggestions);
  allInjections.push(...credibilityCheck.injections);

  console.log(`[AuditGate] Credibility score: ${credibilityCheck.score}/100`);

  // ========================================
  // CHECK 5: Risk & Compliance
  // ========================================
  console.log('[AuditGate] Check 5: Risk & Compliance...');
  const riskScan = scanForRisks(proposed, taskContext);
  
  // Add blockers from risk scan
  allBlockers.push(...riskScan.blockers);
  
  for (const issue of riskScan.issues) {
    allWarnings.push(issue);
  }
  
  // Add risky phrase suggestions
  for (const flagged of riskScan.flaggedPhrases) {
    if (flagged.severity === 'warning') {
      allSuggestions.push(flagged.suggestion);
    }
  }

  console.log(`[AuditGate] Risk score: ${riskScan.score}/100 (${riskScan.riskLevel})`);

  // ========================================
  // BUILD APPROVED OUTLINE
  // ========================================
  let approvedOutline: ApprovedOutline;
  
  if (aeoCoverage.rewrittenOutline) {
    approvedOutline = aeoCoverage.rewrittenOutline;
  } else {
    approvedOutline = {
      h1: approvedTitle,
      sections: proposed.headings.map((h, i) => ({
        h2: h,
        intent: i === proposed.headings.length - 1 ? 'action' : 'inform',
      })),
    };
  }

  // Enhance outline for AEO if needed
  if (!aeoCoverage.isValid) {
    approvedOutline = enhanceOutlineForAEO(approvedOutline, taskContext, aeoCoverage);
  }

  // Validate outline aligns with intent
  const outlineIntentCheck = validateOutlineIntent(approvedOutline, taskContext.intent);
  if (!outlineIntentCheck.aligned) {
    allWarnings.push(...outlineIntentCheck.issues);
  }

  // ========================================
  // BUILD META DESCRIPTION
  // ========================================
  const approvedMeta = buildApprovedMetaDescription(
    proposed.metaDescription,
    approvedTitle,
    taskContext,
    userContext
  );

  // ========================================
  // CALCULATE FINAL SCORES
  // ========================================
  const scores: AuditScores = {
    serpStrength: titleAnalysis.score,
    aeoCoverage: aeoCoverage.score,
    credibility: credibilityCheck.score,
    intentMatch: intentValidation.score,
    risk: riskScan.score,
  };

  // ========================================
  // DETERMINE APPROVAL
  // ========================================
  const approved = allBlockers.length === 0 && 
    (mode === 'planning' ? true : calculateOverallScore(scores) >= 60);

  console.log(`[AuditGate] Overall result: ${approved ? 'APPROVED' : 'BLOCKED'}`);
  if (allBlockers.length > 0) {
    console.log(`[AuditGate] Blockers: ${allBlockers.join(', ')}`);
  }

  return {
    approved,
    rewrittenTitle: approvedTitle,
    approvedOutline,
    approvedKeyphrase: proposed.keyphrase,
    metaDescription: approvedMeta,
    scores,
    warnings: Array.from(new Set(allWarnings)),
    blockers: Array.from(new Set(allBlockers)),
    suggestions: Array.from(new Set(allSuggestions)),
    credibilityInjections: allInjections,
    compliance: riskScan.compliance,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildApprovedMetaDescription(
  proposed: string,
  title: string,
  taskContext: TaskContext,
  userContext: UserContext
): string {
  // Check proposed meta
  if (proposed.length >= 120 && proposed.length <= 160) {
    // Check for key elements
    const hasService = proposed.toLowerCase().includes(taskContext.primaryService.toLowerCase());
    const hasLocation = !taskContext.location || proposed.toLowerCase().includes(taskContext.location.toLowerCase());
    const hasCTA = /\b(book|call|contact|learn|discover|find out|get)\b/i.test(proposed);
    
    if (hasService && hasLocation && hasCTA) {
      return proposed;
    }
  }

  // Generate improved meta
  const { primaryService, location, intent } = taskContext;
  const experience = userContext.experience.years 
    ? `${userContext.experience.years}+ years experience.`
    : '';
  
  let meta = '';
  
  switch (intent) {
    case 'buy':
      meta = `${primaryService}${location ? ` in ${location}` : ''}. ${experience} See our process, pricing, and book your session today.`;
      break;
    case 'compare':
      meta = `Comparing ${primaryService} options${location ? ` in ${location}` : ''}? ${experience} See what matters, costs, and how to choose.`;
      break;
    case 'learn':
      meta = `Learn about ${primaryService}${location ? ` in ${location}` : ''}: what to expect, costs, timing, and how to get started.`;
      break;
    case 'trust':
      meta = `Meet the team behind ${userContext.brandTone.personality || 'our work'}. ${experience} See why clients trust us for ${primaryService}.`;
      break;
  }

  // Trim to 160 chars
  if (meta.length > 160) {
    meta = meta.substring(0, 157) + '...';
  }

  return meta;
}

function calculateOverallScore(scores: AuditScores): number {
  // Weighted average
  const weights = {
    serpStrength: 0.25,
    aeoCoverage: 0.2,
    credibility: 0.25,
    intentMatch: 0.2,
    risk: 0.1,  // Inverted - higher risk = lower contribution
  };

  const riskContribution = Math.max(0, 100 - scores.risk);  // Invert risk score

  return Math.round(
    (scores.serpStrength * weights.serpStrength) +
    (scores.aeoCoverage * weights.aeoCoverage) +
    (scores.credibility * weights.credibility) +
    (scores.intentMatch * weights.intentMatch) +
    (riskContribution * weights.risk)
  );
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick check if content would pass the gate
 */
export function wouldPassGate(
  input: AuditGateInput,
  mode: GateMode = 'planning'
): { pass: boolean; reason?: string } {
  const result = runAuditGate(input, mode);
  
  return {
    pass: result.approved,
    reason: result.blockers.length > 0 
      ? result.blockers[0] 
      : undefined,
  };
}

/**
 * Get just the rewritten title without full audit
 */
export function rewriteTitle(
  input: AuditGateInput
): string {
  const titleAnalysis = analyzeTitle(
    input.proposed,
    input.taskContext,
    input.userContext
  );
  
  return titleAnalysis.rewrittenTitle;
}

/**
 * Get AEO-enhanced outline
 */
export function getEnhancedOutline(
  input: AuditGateInput
): ApprovedOutline {
  const aeoCoverage = checkAEOCoverage(input.proposed, input.taskContext);
  
  if (aeoCoverage.rewrittenOutline) {
    return aeoCoverage.rewrittenOutline;
  }
  
  return {
    h1: input.proposed.title,
    sections: input.proposed.headings.map(h => ({
      h2: h,
      intent: 'inform',
    })),
  };
}
