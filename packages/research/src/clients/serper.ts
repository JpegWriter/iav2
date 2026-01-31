// ============================================================================
// SERPER API CLIENT
// ============================================================================
// Google SERP results + People Also Ask via Serper.dev
// ============================================================================

import { getResearchConfig } from '../config';
import type {
  SerperSearchResult,
  SerperOrganicResult,
  SerperPaaResult,
  SerperRelatedSearch,
} from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface SerperSearchOptions {
  /** Country code (default: gb for UK) */
  gl?: string;
  /** Language (default: en) */
  hl?: string;
  /** Number of results (default: 10) */
  num?: number;
  /** Include People Also Ask */
  includePaa?: boolean;
  /** Include Related Searches */
  includeRelated?: boolean;
}

export interface NormalizedSerperResult {
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
  }>;
  paa: Array<{
    question: string;
    snippet?: string;
    sourceUrl?: string;
  }>;
  relatedSearches: string[];
  query: string;
}

// ============================================================================
// SERPER SEARCH
// ============================================================================

export async function serperSearch(
  query: string,
  options: SerperSearchOptions = {}
): Promise<NormalizedSerperResult> {
  const config = getResearchConfig();
  
  if (!config.serperApiKey) {
    throw new Error('SERPER_API_KEY not configured');
  }

  const {
    gl = 'gb',
    hl = 'en',
    num = 10,
  } = options;

  const requestBody = {
    q: query,
    gl,
    hl,
    num,
  };

  console.log(`[Serper] Searching: "${query}"`);

  const response = await fetchWithRetry(
    'https://google.serper.dev/search',
    {
      method: 'POST',
      headers: {
        'X-API-KEY': config.serperApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
    config.maxRetries
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Serper API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as SerperSearchResult;
  
  return normalizeSerperResult(data, query);
}

// ============================================================================
// BATCH SEARCH (for efficiency)
// ============================================================================

export async function serperBatchSearch(
  queries: string[],
  options: SerperSearchOptions = {}
): Promise<NormalizedSerperResult[]> {
  // Serper doesn't have batch API, so we parallelize with concurrency limit
  const results: NormalizedSerperResult[] = [];
  const concurrency = 3;

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((query) => serperSearch(query, options).catch((err) => {
        console.warn(`[Serper] Query failed: "${query}" - ${err.message}`);
        return createEmptyResult(query);
      }))
    );
    results.push(...batchResults);
    
    // Rate limit pause between batches
    if (i + concurrency < queries.length) {
      await sleep(200);
    }
  }

  return results;
}

// ============================================================================
// PAA EXTRACTION
// ============================================================================

export async function serperGetPaa(query: string): Promise<SerperPaaResult[]> {
  const result = await serperSearch(query, { num: 10 });
  return result.paa.map((p) => ({
    question: p.question,
    snippet: p.snippet,
    link: p.sourceUrl,
  }));
}

// ============================================================================
// RELATED SEARCHES
// ============================================================================

export async function serperGetRelatedSearches(query: string): Promise<string[]> {
  const result = await serperSearch(query, { num: 10 });
  return result.relatedSearches;
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeSerperResult(data: SerperSearchResult, query: string): NormalizedSerperResult {
  const organic = (data.organic || []).map((item: SerperOrganicResult) => ({
    title: item.title || '',
    link: item.link || '',
    snippet: item.snippet || '',
    position: item.position || 0,
  }));

  const paa = (data.peopleAlsoAsk || []).map((item: SerperPaaResult) => ({
    question: item.question || '',
    snippet: item.snippet,
    sourceUrl: item.link,
  }));

  const relatedSearches = (data.relatedSearches || []).map((item: SerperRelatedSearch) => item.query);

  return {
    organic,
    paa,
    relatedSearches,
    query,
  };
}

function createEmptyResult(query: string): NormalizedSerperResult {
  return {
    organic: [],
    paa: [],
    relatedSearches: [],
    query,
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
        console.warn(`[Serper] Rate limited, waiting ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Serper] Attempt ${attempt} failed: ${lastError.message}`);
      
      if (attempt < maxRetries) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError || new Error('Serper request failed after retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { SerperSearchResult, SerperOrganicResult, SerperPaaResult };
