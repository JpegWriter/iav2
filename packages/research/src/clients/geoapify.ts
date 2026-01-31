// ============================================================================
// GEOAPIFY API CLIENT
// ============================================================================
// Geographic context, places, and geocoding via Geoapify
// ============================================================================

import { getResearchConfig } from '../config';
import type {
  GeoapifyGeocodeResult,
  GeoapifyPlacesResult,
  GeoapifyLocation,
  GeoapifyPlace,
} from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface GeocodedLocation {
  lat: number;
  lon: number;
  formatted: string;
  name?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  postcode?: string;
  suburb?: string;
}

export interface Place {
  name: string;
  category: string;
  addressLine?: string;
  distanceMeters?: number;
  lat: number;
  lon: number;
  placeId: string;
}

export interface PlacesSearchOptions {
  /** Radius in meters (default: 1000) */
  radiusMeters?: number;
  /** Maximum results (default: 20) */
  limit?: number;
  /** Filter by categories */
  categories?: string[];
}

// ============================================================================
// PLACE CATEGORIES
// ============================================================================

/**
 * Common place categories for local context
 * https://apidocs.geoapify.com/docs/places/#categories
 */
export const PLACE_CATEGORIES = {
  transport: [
    'public_transport.train',
    'public_transport.bus',
    'public_transport.subway',
    'public_transport.tram',
  ],
  schools: [
    'education.school',
    'education.primary',
    'education.secondary',
    'education.college',
    'education.university',
  ],
  healthcare: [
    'healthcare.hospital',
    'healthcare.clinic',
    'healthcare.pharmacy',
    'healthcare.dentist',
  ],
  shopping: [
    'commercial.supermarket',
    'commercial.shopping_mall',
    'commercial.marketplace',
  ],
  leisure: [
    'leisure.park',
    'leisure.playground',
    'leisure.sports_centre',
    'leisure.fitness',
  ],
  dining: [
    'catering.restaurant',
    'catering.cafe',
    'catering.pub',
  ],
  landmarks: [
    'tourism.attraction',
    'tourism.sights',
    'heritage.memorial',
    'building.historic',
  ],
  amenities: [
    'amenity.post_office',
    'amenity.bank',
    'amenity.atm',
    'amenity.library',
  ],
};

// ============================================================================
// GEOCODE
// ============================================================================

export async function geocode(placeName: string): Promise<GeocodedLocation | null> {
  const config = getResearchConfig();
  
  if (!config.geoapifyApiKey) {
    throw new Error('GEOAPIFY_API_KEY not configured');
  }

  const encodedPlace = encodeURIComponent(placeName);
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodedPlace}&apiKey=${config.geoapifyApiKey}&limit=1`;

  console.log(`[Geoapify] Geocoding: "${placeName}"`);

  const response = await fetchWithRetry(url, { method: 'GET' }, config.maxRetries);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Geoapify geocode error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as GeoapifyGeocodeResult;

  if (!data.features || data.features.length === 0) {
    console.warn(`[Geoapify] No results for: "${placeName}"`);
    return null;
  }

  const feature = data.features[0];
  const result = feature.properties;
  const [lon, lat] = feature.geometry.coordinates;
  
  return {
    lat,
    lon,
    formatted: result.formatted || placeName,
    name: result.name,
    city: result.city,
    county: result.county,
    state: result.state,
    country: result.country,
    postcode: result.postcode,
    suburb: result.suburb,
  };
}

// ============================================================================
// PLACES SEARCH
// ============================================================================

export async function places(
  lat: number,
  lon: number,
  options: PlacesSearchOptions = {}
): Promise<Place[]> {
  const config = getResearchConfig();
  
  if (!config.geoapifyApiKey) {
    throw new Error('GEOAPIFY_API_KEY not configured');
  }

  const {
    radiusMeters = 1000,
    limit = 20,
    categories = [],
  } = options;

  // Build categories filter
  const categoryFilter = categories.length > 0
    ? `&categories=${categories.join(',')}`
    : '';

  const url = `https://api.geoapify.com/v2/places?lat=${lat}&lon=${lon}&radius=${radiusMeters}&limit=${limit}${categoryFilter}&apiKey=${config.geoapifyApiKey}`;

  console.log(`[Geoapify] Finding places near (${lat}, ${lon}), radius: ${radiusMeters}m`);

  const response = await fetchWithRetry(url, { method: 'GET' }, config.maxRetries);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Geoapify places error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as GeoapifyPlacesResult;

  if (!data.features || data.features.length === 0) {
    console.log(`[Geoapify] No places found near (${lat}, ${lon})`);
    return [];
  }

  return data.features.map(normalizePlace);
}

// ============================================================================
// PLACES BY CATEGORY
// ============================================================================

export async function placesByCategory(
  lat: number,
  lon: number,
  categoryKey: keyof typeof PLACE_CATEGORIES,
  options: Omit<PlacesSearchOptions, 'categories'> = {}
): Promise<Place[]> {
  const categories = PLACE_CATEGORIES[categoryKey];
  return places(lat, lon, { ...options, categories });
}

// ============================================================================
// NEARBY PLACES (Multiple Categories)
// ============================================================================

export interface NearbyPlacesResult {
  transport: Place[];
  schools: Place[];
  healthcare: Place[];
  shopping: Place[];
  leisure: Place[];
  dining: Place[];
  landmarks: Place[];
  amenities: Place[];
}

export async function getNearbyPlaces(
  lat: number,
  lon: number,
  options: {
    radiusMeters?: number;
    limitPerCategory?: number;
  } = {}
): Promise<NearbyPlacesResult> {
  const { radiusMeters = 1500, limitPerCategory = 5 } = options;

  const categoryKeys: (keyof typeof PLACE_CATEGORIES)[] = [
    'transport',
    'schools',
    'healthcare',
    'shopping',
    'leisure',
    'dining',
    'landmarks',
  ];

  // Fetch all categories in parallel
  const results = await Promise.all(
    categoryKeys.map(async (key) => {
      try {
        const found = await placesByCategory(lat, lon, key, {
          radiusMeters,
          limit: limitPerCategory,
        });
        return { key, places: found };
      } catch (error) {
        console.warn(`[Geoapify] Failed to fetch ${key}: ${error}`);
        return { key, places: [] };
      }
    })
  );

  // Build result object
  const nearby: NearbyPlacesResult = {
    transport: [],
    schools: [],
    healthcare: [],
    shopping: [],
    leisure: [],
    dining: [],
    landmarks: [],
    amenities: [],
  };

  for (const { key, places } of results) {
    if (key in nearby) {
      nearby[key as keyof NearbyPlacesResult] = places;
    }
  }

  return nearby;
}

// ============================================================================
// REVERSE GEOCODE
// ============================================================================

export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodedLocation | null> {
  const config = getResearchConfig();
  
  if (!config.geoapifyApiKey) {
    throw new Error('GEOAPIFY_API_KEY not configured');
  }

  const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${latitude}&lon=${longitude}&apiKey=${config.geoapifyApiKey}`;

  console.log(`[Geoapify] Reverse geocoding: (${latitude}, ${longitude})`);

  const response = await fetchWithRetry(url, { method: 'GET' }, config.maxRetries);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Geoapify reverse geocode error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as GeoapifyGeocodeResult;

  if (!data.features || data.features.length === 0) {
    return null;
  }

  const feature = data.features[0];
  const result = feature.properties;
  const [lon, lat] = feature.geometry.coordinates;
  
  return {
    lat,
    lon,
    formatted: result.formatted || `${latitude}, ${longitude}`,
    name: result.name,
    city: result.city,
    county: result.county,
    state: result.state,
    country: result.country,
    postcode: result.postcode,
    suburb: result.suburb,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeLocation(loc: GeoapifyLocation): GeocodedLocation {
  return {
    lat: loc.lat,
    lon: loc.lon,
    formatted: loc.formatted,
    name: loc.name,
    city: loc.city,
    county: loc.county,
    state: loc.state,
    country: loc.country,
    postcode: loc.postcode,
    suburb: loc.suburb || loc.district,
  };
}

function normalizePlace(feature: GeoapifyPlace): Place {
  const props = feature.properties;
  return {
    name: props.name || 'Unnamed',
    category: props.categories?.[0] || 'unknown',
    addressLine: [props.address_line1, props.address_line2].filter(Boolean).join(', '),
    distanceMeters: props.distance,
    lat: props.lat,
    lon: props.lon,
    placeId: props.place_id,
  };
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Retry on rate limit
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * attempt;
        console.warn(`[Geoapify] Rate limited, waiting ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Geoapify] Attempt ${attempt} failed: ${lastError.message}`);
      
      if (attempt < maxRetries) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError || new Error('Geoapify request failed after retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { GeoapifyGeocodeResult, GeoapifyPlacesResult, GeoapifyLocation, GeoapifyPlace };
