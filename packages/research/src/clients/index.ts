// ============================================================================
// RESEARCH CLIENTS - INDEX
// ============================================================================

export {
  serperSearch,
  serperBatchSearch,
  serperGetPaa,
  serperGetRelatedSearches,
  type SerperSearchResult,
  type SerperOrganicResult,
  type SerperPaaResult,
  type NormalizedSerperResult,
  type SerperSearchOptions,
} from './serper';

export {
  tavilySearch,
  tavilyBatchSearch,
  tavilyFindAuthoritativeSources,
  type TavilySearchResult,
  type TavilyResult,
  type NormalizedTavilyResult,
  type TavilySearchOptions,
} from './tavily';

export {
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
  type GeoapifyGeocodeResult,
  type GeoapifyPlacesResult,
  type GeoapifyLocation,
  type GeoapifyPlace,
} from './geoapify';
