// ============================================================================
// RESEARCH PACKAGE - CANONICAL TYPES
// ============================================================================
// Types for AEO (Answer Engine Optimization) and GEO (Geographic) research
// These are niche-agnostic and work for ANY business/service.
// ============================================================================

// ============================================================================
// PAGE INTENT & ROLE
// ============================================================================

export type PageIntent = 'MONEY' | 'SERVICE' | 'INFORMATIONAL' | 'TRUST';
export type PageRole = 'money' | 'support' | 'trust' | 'authority' | 'operational';

// ============================================================================
// RESEARCH REQUEST
// ============================================================================

export interface ResearchRequest {
  /** Business name for brand context */
  businessName: string;
  /** Primary service or topic for this page */
  service: string;
  /** Focus keyword/keyphrase */
  focusKeyword: string;
  /** Primary geographic location (city/town) */
  geoPrimary?: string;
  /** Secondary locations for coverage */
  geoSecondary?: string[];
  /** Page intent determines research focus */
  intent: PageIntent;
  /** Page role for structural context */
  pageRole: PageRole;
  /** Business category for Geoapify places lookup */
  businessCategory?: string;
  /** Optional lat/lon for precise geo queries */
  coordinates?: { lat: number; lon: number };
  /** Existing sitemap pages for internal link suggestions */
  sitemapUrls?: Array<{ url: string; title: string; role: string }>;
  /** Task ID for cache keying */
  taskId?: string;
}

// ============================================================================
// AEO PACK (Answer Engine Optimization)
// ============================================================================

export interface AeoPack {
  /** Generated target queries (6-12) */
  targetQueries: string[];
  
  /** People Also Ask questions from Serper */
  peopleAlsoAsk: PaaQuestion[];
  
  /** Grouped question clusters by type */
  questionClusters: QuestionCluster[];
  
  /** Answer shape guidance for each cluster */
  answerShapes: AnswerShape[];
  
  /** Citation targets - authoritative sources to reference */
  citationTargets: CitationTarget[];
  
  /** Common misconceptions to address */
  misconceptions: Misconception[];
  
  /** Snippet hooks - quotable phrasing patterns */
  snippetHooks: string[];
  
  /** Related searches from SERP */
  relatedSearches: string[];
  
  /** Generation timestamp */
  generatedAt: string;
}

export interface PaaQuestion {
  question: string;
  /** Snippet answer if available */
  snippet?: string;
  /** Source URL if available */
  sourceUrl?: string;
}

export interface QuestionCluster {
  /** Cluster type: how, cost, best, near-me, steps, mistakes, comparison */
  type: 'how' | 'cost' | 'best' | 'near-me' | 'steps' | 'mistakes' | 'comparison' | 'what' | 'when' | 'why';
  /** Questions in this cluster */
  questions: string[];
  /** Priority score (higher = more important to answer) */
  priority: number;
}

export interface AnswerShape {
  /** Which cluster this answer shape is for */
  clusterType: QuestionCluster['type'];
  /** Bullet points describing what a quotable answer needs */
  requirements: string[];
  /** Suggested opening phrase */
  openingHook?: string;
  /** Ideal word count range */
  wordCountRange: { min: number; max: number };
}

export interface CitationTarget {
  /** Source URL */
  url: string;
  /** Source title */
  title: string;
  /** Relevant snippet */
  snippet: string;
  /** Source type: official, industry, news, guide */
  type: 'official' | 'industry' | 'news' | 'guide' | 'local';
  /** Credibility score 0-100 */
  credibilityScore: number;
}

export interface Misconception {
  /** The misconception statement */
  misconception: string;
  /** Brief factual correction */
  correction: string;
  /** Evidence source if available */
  source?: string;
}

// ============================================================================
// GEO PACK (Geographic Context)
// ============================================================================

export interface GeoPack {
  /** Short factual geo descriptor */
  geoSummary: string;
  
  /** Primary location details */
  primaryLocation: GeoLocation;
  
  /** Nearby areas/neighborhoods */
  nearbyAreas: NearbyArea[];
  
  /** Categories of place anchors (stations, schools, etc.) */
  proximityAnchors: ProximityAnchor[];
  
  /** Actual nearby places if coordinates provided */
  placeAnchors: PlaceAnchor[];
  
  /** Local language patterns from search */
  localLanguage: LocalLanguagePattern[];
  
  /** Area comparison suggestions */
  geoComparisons: GeoComparison[];
  
  /** Local decision factors */
  localDecisionFactors: LocalDecisionFactor[];
  
  /** Internal link suggestions based on sitemap */
  geoInternalLinkSuggestions: InternalLinkSuggestion[];
  
  /** Generation timestamp */
  generatedAt: string;
}

export interface GeoLocation {
  name: string;
  formatted: string;
  lat?: number;
  lon?: number;
  country?: string;
  region?: string;
  postcode?: string;
}

export interface NearbyArea {
  name: string;
  /** Approximate distance if known */
  distanceKm?: number;
  /** Relationship: adjacent, nearby, within, overlapping */
  relationship: 'adjacent' | 'nearby' | 'within' | 'overlapping';
}

export interface ProximityAnchor {
  /** Category: station, school, hospital, park, shopping, landmark */
  category: 'station' | 'school' | 'hospital' | 'park' | 'shopping' | 'landmark' | 'transport' | 'amenity';
  /** Whether actual places were found */
  hasPlaces: boolean;
  /** Relevance to this business type */
  relevanceScore: number;
}

export interface PlaceAnchor {
  name: string;
  category: string;
  addressLine?: string;
  distanceMeters?: number;
  lat?: number;
  lon?: number;
}

export interface LocalLanguagePattern {
  /** The phrase or pattern */
  phrase: string;
  /** Type: colloquial, search-term, area-name */
  type: 'colloquial' | 'search-term' | 'area-name';
  /** Frequency/importance */
  importance: 'high' | 'medium' | 'low';
}

export interface GeoComparison {
  /** Area A name */
  areaA: string;
  /** Area B name */
  areaB: string;
  /** Comparison framing (pattern-based, not fake stats) */
  framingSuggestion: string;
  /** Factors to compare */
  comparisonFactors: string[];
}

export interface LocalDecisionFactor {
  /** Factor name */
  factor: string;
  /** Category: transport, parking, walkability, amenities, safety, schools */
  category: 'transport' | 'parking' | 'walkability' | 'amenities' | 'safety' | 'schools' | 'lifestyle';
  /** Importance for this page intent */
  importance: 'high' | 'medium' | 'low';
  /** Pattern phrase (no hard numbers unless sourced) */
  phrasePattern: string;
}

export interface InternalLinkSuggestion {
  url: string;
  title: string;
  anchorSuggestion: string;
  relevanceReason: string;
}

// ============================================================================
// COMBINED RESEARCH PACK
// ============================================================================

export interface ResearchPack {
  /** AEO research results */
  aeo: AeoPack;
  
  /** GEO research results */
  geo: GeoPack;
  
  /** All sources used in research */
  sources: ResearchSource[];
  
  /** Cache metadata */
  cache: {
    cacheKey: string;
    cachedAt: string;
    expiresAt: string;
    fromCache: boolean;
  };
  
  /** Request that generated this pack */
  request: ResearchRequest;
}

export interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  type: 'serp' | 'paa' | 'tavily' | 'geoapify' | 'local';
  fetchedAt: string;
}

// ============================================================================
// API CLIENT RESPONSES
// ============================================================================

export interface SerperSearchResult {
  organic: SerperOrganicResult[];
  peopleAlsoAsk?: SerperPaaResult[];
  relatedSearches?: SerperRelatedSearch[];
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
  };
}

export interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  domain?: string;
}

export interface SerperPaaResult {
  question: string;
  snippet?: string;
  title?: string;
  link?: string;
}

export interface SerperRelatedSearch {
  query: string;
}

export interface TavilySearchResult {
  results: TavilyResult[];
  query: string;
  responseTime: number;
}

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface GeoapifyGeocodeResult {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: GeoapifyLocation;
    geometry: {
      type: 'Point';
      coordinates: [number, number]; // [lon, lat]
    };
    bbox?: [number, number, number, number];
  }>;
  query?: {
    text: string;
    parsed?: Record<string, string>;
  };
}

export interface GeoapifyLocation {
  lat: number;
  lon: number;
  formatted: string;
  name?: string;
  country?: string;
  country_code?: string;
  state?: string;
  county?: string;
  city?: string;
  postcode?: string;
  suburb?: string;
  district?: string;
}

export interface GeoapifyPlacesResult {
  features: GeoapifyPlace[];
}

export interface GeoapifyPlace {
  properties: {
    name?: string;
    categories: string[];
    address_line1?: string;
    address_line2?: string;
    distance?: number;
    lat: number;
    lon: number;
    place_id: string;
  };
  geometry: {
    coordinates: [number, number];
  };
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface ResearchValidation {
  valid: boolean;
  aeoScore: number;
  geoScore: number;
  warnings: ResearchWarning[];
  errors: ResearchError[];
}

export interface ResearchWarning {
  code: string;
  message: string;
  field: string;
}

export interface ResearchError {
  code: string;
  message: string;
  field: string;
  fatal: boolean;
}
