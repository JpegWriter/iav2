// ============================================================================
// VISION EVIDENCE GATE V2
// ============================================================================
// Replacement gate logic using the Narrative Outcome Detector.
// Enforces that vision must lead to outcomes, but outcomes can live
// anywhere in prose (not just in a dedicated block).

import { detectNarrativeOutcomes, type OutcomeDetectionResult } from './narrativeOutcomeDetector';

// ============================================================================
// TYPES
// ============================================================================

export type VisionGateV2Result = {
  pass: boolean;
  hasVision: boolean;
  hasNarrativeOutcome: boolean;
  bestOutcomeScore: number;
  validOutcomeCount: number;
  vagueOutcomeCount: number;
  errors: string[];
  warnings: string[];
  recommendedFixes: OutcomeDetectionResult['recommendedFixes'];
  detectionResult: OutcomeDetectionResult;
  requiresNarrativeRepair: boolean;
  eeratScore: number; // -25 to +60 based on evidence quality
};

export type VisionGateV2Input = {
  content: string;
  serviceContext?: string;
  pageType?: string;
  strictMode?: boolean; // For case studies, raise the bar
};

// ============================================================================
// EEAT SCORING
// ============================================================================

/**
 * Calculate EEAT score impact based on vision/outcome quality
 */
function calculateEEATScore(result: OutcomeDetectionResult): number {
  if (!result.hasVision) {
    // No vision = neutral (content might be informational)
    return 0;
  }
  
  if (!result.hasNarrativeOutcome) {
    // Vision without outcomes = negative signal
    return -25;
  }
  
  // Has vision AND outcomes
  const hasCauseAnchor = result.validOutcomes.some(o => o.reasons.includes('cause'));
  const hasHighQuality = result.bestScore >= 7;
  
  if (hasHighQuality && hasCauseAnchor) {
    // Vision + high-quality outcomes with causation = excellent
    return 60;
  }
  
  if (hasCauseAnchor) {
    // Vision + outcomes with causation = good
    return 50;
  }
  
  // Vision + outcomes but weak causation = moderate
  return 40;
}

// ============================================================================
// MAIN GATE
// ============================================================================

/**
 * Run the Vision Evidence Gate V2
 * 
 * Gate rules:
 * 1. If hasVision AND !hasNarrativeOutcome → FAIL
 * 2. If any vague outcome with score >= 6 → FAIL
 * 3. If strictMode/case-study AND bestScore < 7 → FAIL
 * 4. Otherwise → PASS
 */
export function runVisionGateV2(input: VisionGateV2Input): VisionGateV2Result {
  const { content, serviceContext, pageType, strictMode } = input;
  
  // Run the detector
  const detectionResult = detectNarrativeOutcomes(content, serviceContext, pageType);
  
  // Calculate EEAT score
  const eeratScore = calculateEEATScore(detectionResult);
  
  // Determine if strict mode applies
  const isCaseStudy = strictMode || 
    /case.?study|what we (saw|observed|captured)|local.?case/i.test(pageType || '');
  
  // Collect errors and warnings
  const errors: string[] = [...detectionResult.failures];
  const warnings: string[] = [...detectionResult.warnings];
  
  // Additional strict mode check
  if (isCaseStudy && detectionResult.bestScore < 7 && detectionResult.hasVision) {
    const alreadyHasThisError = errors.some(e => e.includes('CASE STUDY THRESHOLD'));
    if (!alreadyHasThisError) {
      errors.push(
        `CASE STUDY THRESHOLD: This page type requires stronger outcomes (score 7+). ` +
        `Current best: ${detectionResult.bestScore}/10.`
      );
    }
  }
  
  // Determine pass/fail
  const pass = errors.length === 0;
  
  // Determine if narrative repair is needed
  const requiresNarrativeRepair = 
    detectionResult.hasVision && 
    !detectionResult.hasNarrativeOutcome;
  
  // Log for debugging
  if (errors.length > 0) {
    console.log('[VisionGateV2] FAILED');
    console.log('  Vision:', detectionResult.hasVision);
    console.log('  Narrative Outcome:', detectionResult.hasNarrativeOutcome);
    console.log('  Best Score:', detectionResult.bestScore);
    console.log('  Valid Outcomes:', detectionResult.validOutcomes.length);
    console.log('  Vague Outcomes:', detectionResult.vagueOutcomes.length);
    console.log('  Errors:', errors);
  } else {
    console.log('[VisionGateV2] PASSED');
    console.log('  EEAT Score:', eeratScore > 0 ? `+${eeratScore}` : eeratScore);
  }
  
  return {
    pass,
    hasVision: detectionResult.hasVision,
    hasNarrativeOutcome: detectionResult.hasNarrativeOutcome,
    bestOutcomeScore: detectionResult.bestScore,
    validOutcomeCount: detectionResult.validOutcomes.length,
    vagueOutcomeCount: detectionResult.vagueOutcomes.length,
    errors,
    warnings,
    recommendedFixes: detectionResult.recommendedFixes,
    detectionResult,
    requiresNarrativeRepair,
    eeratScore,
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick check if content passes vision gate (for UI indicators)
 */
export function quickVisionCheck(content: string, serviceContext?: string): {
  pass: boolean;
  hasVision: boolean;
  hasOutcome: boolean;
  score: number;
} {
  const result = runVisionGateV2({ content, serviceContext });
  return {
    pass: result.pass,
    hasVision: result.hasVision,
    hasOutcome: result.hasNarrativeOutcome,
    score: result.bestOutcomeScore,
  };
}

/**
 * Get a human-readable summary of the vision gate status
 */
export function getVisionGateSummary(result: VisionGateV2Result): string {
  if (result.pass) {
    if (result.hasVision && result.hasNarrativeOutcome) {
      return `✅ Evidence-driven content (${result.validOutcomeCount} valid outcomes, best score ${result.bestOutcomeScore}/10)`;
    }
    return '✅ Content passes validation';
  }
  
  if (result.hasVision && !result.hasNarrativeOutcome) {
    return '❌ Vision without outcomes – add narrative proof of real-world impact';
  }
  
  if (result.vagueOutcomeCount > 0) {
    return `❌ ${result.vagueOutcomeCount} vague outcome(s) detected – rewrite with actor + impact + cause`;
  }
  
  return `❌ ${result.errors.length} issue(s) found`;
}
