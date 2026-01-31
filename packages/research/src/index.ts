// ============================================================================
// RESEARCH PACKAGE - MAIN INDEX
// ============================================================================

// Core types
export * from './types';

// Configuration
export {
  getResearchConfig,
  validateConfig,
  ensureCacheDir,
  generateCacheKey,
  type ResearchConfig,
  type ConfigValidation,
} from './config';

// Clients
export {
  // Serper
  serperSearch,
  serperBatchSearch,
  serperGetPaa,
  serperGetRelatedSearches,
  type SerperSearchOptions,
  type NormalizedSerperResult,
  // Tavily
  tavilySearch,
  tavilyBatchSearch,
  tavilyFindAuthoritativeSources,
  type TavilySearchOptions,
  type NormalizedTavilyResult,
  // Geoapify
  geocode,
  places,
  placesByCategory,
  getNearbyPlaces,
  reverseGeocode,
  PLACE_CATEGORIES,
  type GeocodedLocation,
  type Place,
  type PlacesSearchOptions,
  type NearbyPlacesResult,
} from './clients';

// AEO Researcher
export {
  runAeoResearcher,
  generateTargetQueries,
  buildQuestionClusters,
  classifyQuestion,
  type AeoResearcherOptions,
} from './aeo';

// GEO Researcher
export {
  runGeoResearcher,
  buildGeoPack,
  extractNearbyAreas,
  extractLocalLanguage,
  type GeoResearcherOptions,
} from './geo';

// Research Pack Builder
export {
  buildResearchPack,
  validateResearchPack,
  type BuildResearchPackOptions,
  type ResearchPackValidation,
} from './buildResearchPack';

// Task Enrichment
export {
  enrichTaskWithResearch,
  enrichTasksWithResearch,
  extractResearchForBrief,
  type TaskLike,
  type EnrichTaskOptions,
  type EnrichBatchOptions,
  type EnrichResult,
  type ResearchBriefData,
} from './enrichTask';
