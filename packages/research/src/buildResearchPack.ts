// ============================================================================
// BUILD RESEARCH PACK
// ============================================================================
// Combines AEO + GEO research into a single pack
// Handles caching and parallel execution
// ============================================================================

import { runAeoResearcher, type AeoResearcherOptions } from './aeo';
import { runGeoResearcher, type GeoResearcherOptions } from './geo';
import {
  getResearchConfig,
  getCachePath,
  isCacheValid,
  readCache,
  writeCache,
  generateCacheKey,
  ensureCacheDir,
} from './config';
import type {
  ResearchRequest,
  ResearchPack,
  ResearchSource,
  AeoPack,
  GeoPack,
} from './types';

// ============================================================================
// OPTIONS
// ============================================================================

export interface BuildResearchPackOptions {
  /** Skip cache and force fresh research */
  forceRefresh?: boolean;
  /** AEO-specific options */
  aeoOptions?: Omit<AeoResearcherOptions, 'forceRefresh'>;
  /** GEO-specific options */
  geoOptions?: Omit<GeoResearcherOptions, 'forceRefresh'>;
  /** Skip AEO research */
  skipAeo?: boolean;
  /** Skip GEO research */
  skipGeo?: boolean;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function buildResearchPack(
  request: ResearchRequest,
  options: BuildResearchPackOptions = {}
): Promise<ResearchPack> {
  const config = getResearchConfig();
  const {
    forceRefresh = false,
    aeoOptions = {},
    geoOptions = {},
    skipAeo = false,
    skipGeo = false,
  } = options;

  console.log(`[Research] Building research pack for: ${request.focusKeyword}`);
  console.log(`[Research] Service: ${request.service}, Geo: ${request.geoPrimary || 'none'}`);
  console.log(`[Research] Intent: ${request.intent}, Role: ${request.pageRole}`);

  // Generate combined cache key
  const cacheKey = `pack_${generateCacheKey(request)}`;
  const cachePath = getCachePath(config, cacheKey);

  // Check cache
  if (config.cacheEnabled && !forceRefresh && isCacheValid(cachePath, config.cacheTtlHours)) {
    console.log(`[Research] Loading from cache: ${cacheKey}`);
    const cached = readCache<ResearchPack>(cachePath);
    if (cached) {
      return {
        ...cached,
        cache: {
          ...cached.cache,
          fromCache: true,
        },
      };
    }
  }

  ensureCacheDir(config);

  // Run researchers in parallel
  const allSources: ResearchSource[] = [];
  let aeo: AeoPack | null = null;
  let geo: GeoPack | null = null;

  const promises: Promise<void>[] = [];

  if (!skipAeo) {
    promises.push(
      runAeoResearcher(request, { ...aeoOptions, forceRefresh })
        .then((result) => {
          aeo = result.aeo;
          allSources.push(...result.sources);
          console.log(`[Research] AEO complete: ${result.aeo.peopleAlsoAsk.length} PAA questions`);
        })
        .catch((error) => {
          console.error(`[Research] AEO failed: ${error.message}`);
          aeo = createEmptyAeoPack();
        })
    );
  } else {
    aeo = createEmptyAeoPack();
  }

  if (!skipGeo && request.geoPrimary) {
    promises.push(
      runGeoResearcher(request, { ...geoOptions, forceRefresh })
        .then((result) => {
          geo = result.geo;
          allSources.push(...result.sources);
          console.log(`[Research] GEO complete: ${result.geo.placeAnchors.length} place anchors`);
        })
        .catch((error) => {
          console.error(`[Research] GEO failed: ${error.message}`);
          geo = createEmptyGeoPack(request);
        })
    );
  } else {
    geo = createEmptyGeoPack(request);
  }

  await Promise.all(promises);

  // Deduplicate sources
  const uniqueSources = deduplicateSources(allSources);

  // Build the research pack
  const now = new Date();
  const ttlMs = config.cacheTtlHours * 60 * 60 * 1000;
  
  const pack: ResearchPack = {
    aeo: aeo!,
    geo: geo!,
    sources: uniqueSources,
    cache: {
      cacheKey,
      cachedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      fromCache: false,
    },
    request,
  };

  // Save to cache
  if (config.cacheEnabled) {
    writeCache(cachePath, pack);
    console.log(`[Research] Saved to cache: ${cacheKey}`);
  }

  console.log(`[Research] Pack complete: ${uniqueSources.length} sources`);

  return pack;
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptyAeoPack(): AeoPack {
  return {
    targetQueries: [],
    peopleAlsoAsk: [],
    questionClusters: [],
    answerShapes: [],
    citationTargets: [],
    misconceptions: [],
    snippetHooks: [],
    relatedSearches: [],
    generatedAt: new Date().toISOString(),
  };
}

function createEmptyGeoPack(request: ResearchRequest): GeoPack {
  return {
    geoSummary: request.geoPrimary || 'No location specified',
    primaryLocation: {
      name: request.geoPrimary || 'Unknown',
      formatted: request.geoPrimary || 'Unknown',
    },
    nearbyAreas: [],
    proximityAnchors: [],
    placeAnchors: [],
    localLanguage: [],
    geoComparisons: [],
    localDecisionFactors: [],
    geoInternalLinkSuggestions: [],
    generatedAt: new Date().toISOString(),
  };
}

function deduplicateSources(sources: ResearchSource[]): ResearchSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface ResearchPackValidation {
  valid: boolean;
  aeoScore: number;
  geoScore: number;
  warnings: string[];
  errors: string[];
}

export function validateResearchPack(pack: ResearchPack): ResearchPackValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  // AEO validation
  let aeoScore = 0;
  if (pack.aeo.peopleAlsoAsk.length >= 5) aeoScore += 25;
  else if (pack.aeo.peopleAlsoAsk.length >= 3) aeoScore += 15;
  else warnings.push('Few PAA questions found');

  if (pack.aeo.questionClusters.length >= 3) aeoScore += 25;
  else warnings.push('Limited question clusters');

  if (pack.aeo.citationTargets.length >= 3) aeoScore += 25;
  else warnings.push('Few citation targets');

  if (pack.aeo.misconceptions.length >= 3) aeoScore += 25;
  else warnings.push('Few misconceptions identified');

  // GEO validation
  let geoScore = 0;
  if (pack.request.geoPrimary) {
    if (pack.geo.primaryLocation.lat && pack.geo.primaryLocation.lon) geoScore += 25;
    else warnings.push('Location not geocoded');

    if (pack.geo.placeAnchors.length >= 5) geoScore += 25;
    else if (pack.geo.placeAnchors.length >= 2) geoScore += 15;
    else warnings.push('Few place anchors found');

    if (pack.geo.nearbyAreas.length >= 2) geoScore += 25;
    else warnings.push('Few nearby areas identified');

    if (pack.geo.localLanguage.length >= 3) geoScore += 25;
    else warnings.push('Limited local language patterns');
  } else {
    geoScore = 100; // No geo required, so it passes
  }

  // Overall validation
  const valid = aeoScore >= 50 && (geoScore >= 50 || !pack.request.geoPrimary);

  if (!valid) {
    errors.push(`Research quality too low: AEO=${aeoScore}, GEO=${geoScore}`);
  }

  return {
    valid,
    aeoScore,
    geoScore,
    warnings,
    errors,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { ResearchPack, ResearchRequest, ResearchSource };
