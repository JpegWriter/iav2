// ============================================================================
// GEO RESEARCHER
// ============================================================================
// Geographic context research using Geoapify + Serper local signals
// Builds structured geo packs for local content generation
// ============================================================================

import {
  geocode,
  getNearbyPlaces,
  serperSearch,
  serperBatchSearch,
  type GeocodedLocation,
  type NearbyPlacesResult,
  type Place,
  type NormalizedSerperResult,
} from '../clients';
import {
  getResearchConfig,
  getCachePath,
  isCacheValid,
  readCache,
  writeCache,
  generateCacheKey,
  ensureCacheDir,
} from '../config';
import type {
  ResearchRequest,
  GeoPack,
  GeoLocation,
  NearbyArea,
  ProximityAnchor,
  PlaceAnchor,
  LocalLanguagePattern,
  GeoComparison,
  LocalDecisionFactor,
  InternalLinkSuggestion,
  ResearchSource,
} from '../types';

// ============================================================================
// LOCAL DECISION FACTORS BY CATEGORY
// ============================================================================

const DECISION_FACTORS: Record<string, LocalDecisionFactor[]> = {
  transport: [
    {
      factor: 'Public transport links',
      category: 'transport',
      importance: 'high',
      phrasePattern: 'The area benefits from good transport connections, with [nearby stations/stops] providing access to...',
    },
    {
      factor: 'Commuter accessibility',
      category: 'transport',
      importance: 'medium',
      phrasePattern: 'For commuters, the location offers...',
    },
  ],
  parking: [
    {
      factor: 'Parking availability',
      category: 'parking',
      importance: 'medium',
      phrasePattern: 'Parking in the area is [typical situation]...',
    },
  ],
  walkability: [
    {
      factor: 'Local amenities within walking distance',
      category: 'walkability',
      importance: 'high',
      phrasePattern: 'Day-to-day conveniences are within easy reach, including...',
    },
  ],
  schools: [
    {
      factor: 'School catchment',
      category: 'schools',
      importance: 'high',
      phrasePattern: 'Families often consider the local schools, which include...',
    },
  ],
  lifestyle: [
    {
      factor: 'Local character',
      category: 'lifestyle',
      importance: 'medium',
      phrasePattern: 'The area has a [characteristic] feel, with...',
    },
    {
      factor: 'Community feel',
      category: 'lifestyle',
      importance: 'medium',
      phrasePattern: 'Residents often mention the sense of community...',
    },
  ],
  amenities: [
    {
      factor: 'Shopping and services',
      category: 'amenities',
      importance: 'medium',
      phrasePattern: 'Local shops and services include...',
    },
  ],
};

// ============================================================================
// MAIN GEO RESEARCHER
// ============================================================================

export interface GeoResearcherOptions {
  /** Skip cache and force fresh research */
  forceRefresh?: boolean;
  /** Radius in meters for place search */
  radiusMeters?: number;
  /** Maximum places per category */
  placesPerCategory?: number;
}

export async function runGeoResearcher(
  request: ResearchRequest,
  options: GeoResearcherOptions = {}
): Promise<{ geo: GeoPack; sources: ResearchSource[] }> {
  const config = getResearchConfig();
  const {
    forceRefresh = false,
    radiusMeters = 1500,
    placesPerCategory = 5,
  } = options;

  // Must have a geo location
  if (!request.geoPrimary) {
    console.warn('[GEO] No geoPrimary provided, returning minimal geo pack');
    return {
      geo: createMinimalGeoPack(request),
      sources: [],
    };
  }

  // Generate cache key
  const cacheKey = `geo_${generateCacheKey(request)}`;
  const cachePath = getCachePath(config, cacheKey);

  // Check cache
  if (config.cacheEnabled && !forceRefresh && isCacheValid(cachePath, config.cacheTtlHours)) {
    console.log(`[GEO] Loading from cache: ${cacheKey}`);
    const cached = readCache<{ geo: GeoPack; sources: ResearchSource[] }>(cachePath);
    if (cached) {
      return cached;
    }
  }

  console.log(`[GEO] Running research for: ${request.geoPrimary}`);
  ensureCacheDir(config);

  const sources: ResearchSource[] = [];

  // Step 1: Geocode the primary location
  let primaryLocation: GeocodedLocation | null = null;
  try {
    primaryLocation = await geocode(request.geoPrimary);
  } catch (error) {
    console.warn(`[GEO] Geocoding failed for: ${request.geoPrimary}`);
  }

  // Step 2: Get nearby places if we have coordinates
  let nearbyPlaces: NearbyPlacesResult | null = null;
  if (primaryLocation || request.coordinates) {
    const lat = request.coordinates?.lat || primaryLocation?.lat;
    const lon = request.coordinates?.lon || primaryLocation?.lon;
    
    if (lat && lon) {
      try {
        nearbyPlaces = await getNearbyPlaces(lat, lon, {
          radiusMeters,
          limitPerCategory: placesPerCategory,
        });
        console.log(`[GEO] Found nearby places in ${Object.keys(nearbyPlaces).length} categories`);
      } catch (error) {
        console.warn(`[GEO] Places search failed: ${error}`);
      }
    }
  }

  // Step 3: Run Serper for local language patterns
  const localQueries = [
    `${request.service} ${request.geoPrimary}`,
    `${request.geoPrimary} area guide`,
    `living in ${request.geoPrimary}`,
  ];

  const serperResults = await serperBatchSearch(localQueries, { gl: 'gb', num: 5 });

  // Collect sources
  for (const result of serperResults) {
    for (const org of result.organic) {
      sources.push({
        url: org.link,
        title: org.title,
        snippet: org.snippet,
        type: 'local',
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  // Step 4: Build the Geo Pack
  const geo = buildGeoPack(request, primaryLocation, nearbyPlaces, serperResults);

  const result = { geo, sources };

  // Save to cache
  if (config.cacheEnabled) {
    writeCache(cachePath, result);
    console.log(`[GEO] Saved to cache: ${cacheKey}`);
  }

  return result;
}

// ============================================================================
// GEO PACK BUILDER
// ============================================================================

function buildGeoPack(
  request: ResearchRequest,
  primaryLocation: GeocodedLocation | null,
  nearbyPlaces: NearbyPlacesResult | null,
  serperResults: NormalizedSerperResult[]
): GeoPack {
  // Build primary location
  const geoLocation: GeoLocation = primaryLocation
    ? {
        name: primaryLocation.name || request.geoPrimary!,
        formatted: primaryLocation.formatted,
        lat: primaryLocation.lat,
        lon: primaryLocation.lon,
        country: primaryLocation.country,
        region: primaryLocation.county || primaryLocation.state,
        postcode: primaryLocation.postcode,
      }
    : {
        name: request.geoPrimary!,
        formatted: request.geoPrimary!,
      };

  // Build geo summary
  const geoSummary = buildGeoSummary(request, primaryLocation);

  // Build nearby areas from Serper related searches and snippets
  const nearbyAreas = extractNearbyAreas(serperResults, request.geoPrimary!);

  // Build proximity anchors
  const proximityAnchors = buildProximityAnchors(nearbyPlaces);

  // Build place anchors from actual places
  const placeAnchors = buildPlaceAnchors(nearbyPlaces);

  // Extract local language patterns
  const localLanguage = extractLocalLanguage(serperResults, request.geoPrimary!);

  // Build geo comparisons
  const geoComparisons = buildGeoComparisons(request.geoPrimary!, nearbyAreas);

  // Build local decision factors
  const localDecisionFactors = buildLocalDecisionFactors(nearbyPlaces, request);

  // Build internal link suggestions
  const geoInternalLinkSuggestions = buildInternalLinkSuggestions(request);

  return {
    geoSummary,
    primaryLocation: geoLocation,
    nearbyAreas,
    proximityAnchors,
    placeAnchors,
    localLanguage,
    geoComparisons,
    localDecisionFactors,
    geoInternalLinkSuggestions,
    generatedAt: new Date().toISOString(),
  };
}

function buildGeoSummary(request: ResearchRequest, location: GeocodedLocation | null): string {
  const geo = request.geoPrimary!;
  
  if (location) {
    const parts = [geo];
    if (location.county) parts.push(location.county);
    if (location.country) parts.push(location.country);
    return `${parts.join(', ')}`;
  }
  
  return geo;
}

function extractNearbyAreas(
  serperResults: NormalizedSerperResult[],
  geoPrimary: string
): NearbyArea[] {
  const areas: NearbyArea[] = [];
  const seenNames = new Set<string>([geoPrimary.toLowerCase()]);

  // Extract from related searches
  for (const result of serperResults) {
    for (const related of result.relatedSearches) {
      // Look for area names (common UK patterns)
      const areaPattern = /(?:in|near|around|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
      let match;
      while ((match = areaPattern.exec(related)) !== null) {
        const areaName = match[1];
        if (!seenNames.has(areaName.toLowerCase())) {
          seenNames.add(areaName.toLowerCase());
          areas.push({
            name: areaName,
            relationship: 'nearby',
          });
        }
      }
    }

    // Extract from snippets
    for (const org of result.organic) {
      // Look for "X and surrounding areas" patterns
      const surroundingPattern = new RegExp(
        `${geoPrimary}\\s+(?:and|including|near|to)\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)`,
        'gi'
      );
      let match;
      while ((match = surroundingPattern.exec(org.snippet)) !== null) {
        const areaName = match[1];
        if (!seenNames.has(areaName.toLowerCase())) {
          seenNames.add(areaName.toLowerCase());
          areas.push({
            name: areaName,
            relationship: 'adjacent',
          });
        }
      }
    }
  }

  return areas.slice(0, 8);
}

function buildProximityAnchors(nearbyPlaces: NearbyPlacesResult | null): ProximityAnchor[] {
  if (!nearbyPlaces) {
    // Return category templates without actual places
    return [
      { category: 'transport', hasPlaces: false, relevanceScore: 90 },
      { category: 'school', hasPlaces: false, relevanceScore: 80 },
      { category: 'shopping', hasPlaces: false, relevanceScore: 70 },
      { category: 'amenity', hasPlaces: false, relevanceScore: 60 },
    ];
  }

  const anchors: ProximityAnchor[] = [];

  const categoryMap: Record<string, ProximityAnchor['category']> = {
    transport: 'transport',
    schools: 'school',
    healthcare: 'hospital',
    shopping: 'shopping',
    leisure: 'park',
    dining: 'amenity',
    landmarks: 'landmark',
  };

  for (const [key, places] of Object.entries(nearbyPlaces)) {
    const category = categoryMap[key];
    if (category && places.length > 0) {
      anchors.push({
        category,
        hasPlaces: true,
        relevanceScore: Math.min(100, 50 + places.length * 10),
      });
    }
  }

  return anchors.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function buildPlaceAnchors(nearbyPlaces: NearbyPlacesResult | null): PlaceAnchor[] {
  if (!nearbyPlaces) return [];

  const anchors: PlaceAnchor[] = [];

  for (const places of Object.values(nearbyPlaces)) {
    for (const place of places as Place[]) {
      anchors.push({
        name: place.name,
        category: place.category,
        addressLine: place.addressLine,
        distanceMeters: place.distanceMeters,
        lat: place.lat,
        lon: place.lon,
      });
    }
  }

  // Sort by distance and take top 10
  return anchors
    .sort((a, b) => (a.distanceMeters || 9999) - (b.distanceMeters || 9999))
    .slice(0, 10);
}

function extractLocalLanguage(
  serperResults: NormalizedSerperResult[],
  geoPrimary: string
): LocalLanguagePattern[] {
  const patterns: LocalLanguagePattern[] = [];
  const seenPhrases = new Set<string>();

  // Add the primary location variations
  patterns.push({
    phrase: geoPrimary,
    type: 'area-name',
    importance: 'high',
  });

  // Extract from related searches
  for (const result of serperResults) {
    for (const related of result.relatedSearches) {
      if (!seenPhrases.has(related.toLowerCase())) {
        seenPhrases.add(related.toLowerCase());
        patterns.push({
          phrase: related,
          type: 'search-term',
          importance: 'medium',
        });
      }
    }
  }

  // Look for local colloquialisms in snippets
  const colloquialPatterns = [
    /locally known as\s+"?([^"]+)"?/gi,
    /residents call\s+"?([^"]+)"?/gi,
    /also known as\s+"?([^"]+)"?/gi,
  ];

  for (const result of serperResults) {
    for (const org of result.organic) {
      for (const pattern of colloquialPatterns) {
        let match;
        while ((match = pattern.exec(org.snippet)) !== null) {
          const phrase = match[1].trim();
          if (!seenPhrases.has(phrase.toLowerCase())) {
            seenPhrases.add(phrase.toLowerCase());
            patterns.push({
              phrase,
              type: 'colloquial',
              importance: 'medium',
            });
          }
        }
      }
    }
  }

  return patterns.slice(0, 15);
}

function buildGeoComparisons(geoPrimary: string, nearbyAreas: NearbyArea[]): GeoComparison[] {
  const comparisons: GeoComparison[] = [];

  for (const area of nearbyAreas.slice(0, 3)) {
    comparisons.push({
      areaA: geoPrimary,
      areaB: area.name,
      framingSuggestion: `When comparing ${geoPrimary} and ${area.name}, factors like transport links, local amenities, and community feel often come into play.`,
      comparisonFactors: [
        'Transport accessibility',
        'Local amenities',
        'Community character',
        'Property types',
      ],
    });
  }

  return comparisons;
}

function buildLocalDecisionFactors(
  nearbyPlaces: NearbyPlacesResult | null,
  request: ResearchRequest
): LocalDecisionFactor[] {
  const factors: LocalDecisionFactor[] = [];

  // Always include core factors
  factors.push(...DECISION_FACTORS.transport);
  factors.push(...DECISION_FACTORS.walkability);

  // Add factors based on what places were found
  if (nearbyPlaces) {
    if (nearbyPlaces.schools.length > 0) {
      factors.push(...DECISION_FACTORS.schools);
    }
    if (nearbyPlaces.transport.length > 0) {
      // Upgrade transport importance
      factors[0].importance = 'high';
    }
  }

  // Add lifestyle factors
  factors.push(...DECISION_FACTORS.lifestyle);
  factors.push(...DECISION_FACTORS.amenities);

  // Deduplicate
  const seen = new Set<string>();
  return factors.filter(f => {
    if (seen.has(f.factor)) return false;
    seen.add(f.factor);
    return true;
  }).slice(0, 8);
}

function buildInternalLinkSuggestions(request: ResearchRequest): InternalLinkSuggestion[] {
  if (!request.sitemapUrls || request.sitemapUrls.length === 0) {
    return [];
  }

  const suggestions: InternalLinkSuggestion[] = [];
  const geo = request.geoPrimary?.toLowerCase() || '';

  for (const page of request.sitemapUrls) {
    // Look for pages that mention the same location
    if (page.url.toLowerCase().includes(geo) || page.title.toLowerCase().includes(geo)) {
      suggestions.push({
        url: page.url,
        title: page.title,
        anchorSuggestion: page.title,
        relevanceReason: `Same location: ${request.geoPrimary}`,
      });
    }
    // Look for service pages
    if (page.role === 'money' && request.service) {
      const service = request.service.toLowerCase();
      if (page.title.toLowerCase().includes(service) || page.url.toLowerCase().includes(service)) {
        suggestions.push({
          url: page.url,
          title: page.title,
          anchorSuggestion: page.title,
          relevanceReason: `Service page: ${request.service}`,
        });
      }
    }
  }

  return suggestions.slice(0, 4);
}

function createMinimalGeoPack(request: ResearchRequest): GeoPack {
  return {
    geoSummary: 'Location details not available',
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

// ============================================================================
// EXPORTS
// ============================================================================

export { buildGeoPack, extractNearbyAreas, extractLocalLanguage };
