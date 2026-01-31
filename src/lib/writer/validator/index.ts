// ============================================================================
// NARRATIVE OUTCOME DETECTION SYSTEM - EXPORTS
// ============================================================================

// Vertical-specific configurations
export {
  type VerticalConfig,
  getVerticalConfig,
  getAllVerticalConfigs,
  WEDDING_PHOTOGRAPHER_CONFIG,
  ESTATE_AGENT_CONFIG,
  SOLICITOR_CONFIG,
  TRADE_SERVICES_CONFIG,
  DENTAL_CONFIG,
  GENERIC_CONFIG,
} from './verticalConfigs';

// Narrative outcome detector
export {
  type OutcomeSpan,
  type OutcomeDetectionResult,
  detectNarrativeOutcomes,
} from './narrativeOutcomeDetector';

// Vision Evidence Gate V2
export {
  type VisionGateV2Result,
  type VisionGateV2Input,
  runVisionGateV2,
  quickVisionCheck,
  getVisionGateSummary,
} from './visionEvidenceGateV2';

// Auto-repair
export {
  type NarrativeRepairResult,
  type NarrativeRepairInput,
  repairWithNarrativeOutcome,
  generateNarrativeOutcome,
  getNarrativeOutcomePromptInstructions,
} from './autoRepairNarrativeOutcome';

// Quality Gate (includes legacy + V2)
export {
  type QualityGateResult,
  type QualityGateInput,
  type VisionEvidenceStatus,
  type VagueOutcomeResult,
  runQualityGate,
  validateWriterOutput,
  generateOutcomeEvidenceBlock,
} from './qualityGate';
