// ============================================================================
// CONTEXT MODULE - PUBLIC EXPORTS
// ============================================================================

export * from './types';
export { buildMasterProfile, getLatestMasterProfile, getMasterProfileByVersion } from './buildMasterProfile';
export { buildTaskContextPack, getContextPackById, getLatestContextPackForTask } from './buildTaskContextPack';
export type { BuildContextPackInput, TaskInput } from './buildTaskContextPack';

// Page extraction & summarisation
export { extractSignalsFromText, textContainsToken, findContradictions } from './pageExtractor';
export type { ExtractedSignals } from './pageExtractor';
export { summarisePage, summarisePages, selectKeyPages } from './pageSummariser';
export type { PageData, KeyPages } from './pageSummariser';

// Role reclassification
export { reclassifyPages, classifyPage, buildReclassifiedSiteMap } from './roleReclassifier';
export type { PageForClassification, ReclassifiedSiteMap } from './roleReclassifier';

// Proof verification
export { verifyProofAtoms, getVerificationSummary } from './proofVerifier';
export type { VerificationContext, VerificationSummary } from './proofVerifier';

// Service inference & digest building
export {
  inferServicesFromEssences,
  buildSiteContentDigest,
  buildWriterSnapshot,
  buildProfileConfidence,
  buildProfileCompleteness,
  NICHE_DEFINITIONS,
} from './serviceInference';
export type { InferredServices, ServiceSource } from './serviceInference';
