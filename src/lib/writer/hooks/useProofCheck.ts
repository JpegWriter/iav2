// ============================================================================
// USE PROOF CHECK HOOK
// ============================================================================
// React hook for the Proof Check widget in Preview mode.
// Shows vision/outcome/vague status in real-time as content is edited.

'use client';

import { useMemo } from 'react';
import { detectNarrativeOutcomes, type OutcomeDetectionResult } from '@/lib/writer/validator/narrativeOutcomeDetector';
import { runVisionGateV2, type VisionGateV2Result, getVisionGateSummary } from '@/lib/writer/validator/visionEvidenceGateV2';

// ============================================================================
// TYPES
// ============================================================================

export type ProofCheckStatus = {
  // Core status
  isValid: boolean;
  summary: string;
  
  // Vision detection
  hasVision: boolean;
  visionSignals: string[];
  
  // Outcome detection
  hasNarrativeOutcome: boolean;
  validOutcomeCount: number;
  bestOutcomeScore: number;
  
  // Vague detection
  hasVagueOutcomes: boolean;
  vagueOutcomeCount: number;
  
  // Detailed results
  errors: string[];
  warnings: string[];
  recommendedFixes: OutcomeDetectionResult['recommendedFixes'];
  
  // EEAT score impact
  eeratScore: number;
  eeratLabel: string;
  
  // Full results for advanced UI
  detectionResult: OutcomeDetectionResult;
  gateResult: VisionGateV2Result;
};

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to check proof status of article content
 * 
 * @param content - The article content to analyze
 * @param serviceContext - Service type for vertical-specific detection
 * @param pageType - Type of page (affects thresholds)
 */
export function useProofCheck(
  content: string,
  serviceContext?: string,
  pageType?: string
): ProofCheckStatus {
  // Memoize the detection to avoid re-running on every render
  const result = useMemo(() => {
    if (!content || content.length < 100) {
      return {
        isValid: false,
        summary: 'Content too short to analyze',
        hasVision: false,
        visionSignals: [],
        hasNarrativeOutcome: false,
        validOutcomeCount: 0,
        bestOutcomeScore: 0,
        hasVagueOutcomes: false,
        vagueOutcomeCount: 0,
        errors: [],
        warnings: [],
        recommendedFixes: [],
        eeratScore: 0,
        eeratLabel: 'Neutral',
        detectionResult: {
          hasVision: false,
          hasNarrativeOutcome: false,
          visionSignals: [],
          outcomeSpans: [],
          validOutcomes: [],
          vagueOutcomes: [],
          bestScore: 0,
          failures: [],
          warnings: [],
          recommendedFixes: [],
        },
        gateResult: {
          pass: false,
          hasVision: false,
          hasNarrativeOutcome: false,
          bestOutcomeScore: 0,
          validOutcomeCount: 0,
          vagueOutcomeCount: 0,
          errors: [],
          warnings: [],
          recommendedFixes: [],
          detectionResult: {} as OutcomeDetectionResult,
          requiresNarrativeRepair: false,
          eeratScore: 0,
        },
      };
    }
    
    // Run the V2 gate
    const gateResult = runVisionGateV2({
      content,
      serviceContext,
      pageType,
    });
    
    // Build EEAT label
    let eeratLabel = 'Neutral';
    if (gateResult.eeratScore >= 50) eeratLabel = 'Excellent';
    else if (gateResult.eeratScore >= 30) eeratLabel = 'Good';
    else if (gateResult.eeratScore > 0) eeratLabel = 'Moderate';
    else if (gateResult.eeratScore < 0) eeratLabel = 'Needs Work';
    
    return {
      isValid: gateResult.pass,
      summary: getVisionGateSummary(gateResult),
      hasVision: gateResult.hasVision,
      visionSignals: gateResult.detectionResult.visionSignals,
      hasNarrativeOutcome: gateResult.hasNarrativeOutcome,
      validOutcomeCount: gateResult.validOutcomeCount,
      bestOutcomeScore: gateResult.bestOutcomeScore,
      hasVagueOutcomes: gateResult.vagueOutcomeCount > 0,
      vagueOutcomeCount: gateResult.vagueOutcomeCount,
      errors: gateResult.errors,
      warnings: gateResult.warnings,
      recommendedFixes: gateResult.recommendedFixes,
      eeratScore: gateResult.eeratScore,
      eeratLabel,
      detectionResult: gateResult.detectionResult,
      gateResult,
    };
  }, [content, serviceContext, pageType]);
  
  return result;
}

// ============================================================================
// UTILITY FUNCTIONS FOR UI
// ============================================================================

/**
 * Get color for EEAT score badge
 */
export function getEEATColor(score: number): string {
  if (score >= 50) return 'text-green-600 bg-green-50';
  if (score >= 30) return 'text-blue-600 bg-blue-50';
  if (score > 0) return 'text-yellow-600 bg-yellow-50';
  if (score < 0) return 'text-red-600 bg-red-50';
  return 'text-gray-600 bg-gray-50';
}

/**
 * Get icon for proof status item
 */
export function getProofStatusIcon(status: boolean): '✅' | '❌' | '⚠️' {
  return status ? '✅' : '❌';
}

/**
 * Get color for outcome score
 */
export function getScoreColor(score: number): string {
  if (score >= 7) return 'text-green-600';
  if (score >= 5) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Format fix suggestion for display
 */
export function formatFixSuggestion(fix: OutcomeDetectionResult['recommendedFixes'][0]): {
  icon: string;
  title: string;
  description: string;
} {
  switch (fix.type) {
    case 'add-outcome':
      return {
        icon: '➕',
        title: 'Add Narrative Outcome',
        description: fix.message,
      };
    case 'fix-vague':
      return {
        icon: '✏️',
        title: 'Fix Vague Phrasing',
        description: fix.message,
      };
    case 'add-cause':
      return {
        icon: '🔗',
        title: 'Add Cause Anchor',
        description: fix.message,
      };
    case 'add-actor':
      return {
        icon: '👤',
        title: 'Add Actor',
        description: fix.message,
      };
    default:
      return {
        icon: '💡',
        title: 'Suggestion',
        description: fix.message,
      };
  }
}
