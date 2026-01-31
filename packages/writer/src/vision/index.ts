/**
 * Vision Facts Binding Module
 * 
 * Binds vision-derived facts (from uploaded images) into article content
 * to ensure AI doesn't ignore concrete evidence from real-world context.
 */

export {
  bindVisionFacts,
  validateVisionBinding,
  extractVisionFactsFromPack,
  EVIDENCE_MARKERS,
  type BindVisionFactsInput,
  type BindVisionFactsResult,
} from './bindVisionFacts';
