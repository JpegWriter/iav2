// ============================================================================
// TAVILY API CLIENT
// ============================================================================
// Web research and authoritative source discovery via Tavily
// ============================================================================

import { getResearchConfig } from '../config';
import type { TavilySearchResult, TavilyResult } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface TavilySearchOptions {
  /** Search depth: basic or advanced */
  searchDepth?: 'basic' | 'advanced';
  /** Maximum results (default: 5) */
  maxResults?: number;
  /** Include domains (whitelist) */
  includeDomains?: string[];
  /** Exclude domains (blacklist) */
  excludeDomains?: string[];
  /** Include images in results */
  includeImages?: boolean;
  /** Include answer summary */
  includeAnswer?: boolean;
}

export interface NormalizedTavilyResult {
  results: Array<{
    title: string;
    url: string;
    contentSnippet: string;
    score: number;
    publishedDate?: string;
  }>;
  answer?: string;
  query: string;
}

// ============================================================================
// TAVILY SEARCH
// ============================================================================

export async function tavilySearch(
  query: string,
  options: TavilySearchOptions = {}
): Promise<NormalizedTavilyResult> {
  const config = getResearchConfig();
  
  if (!config.tavilyApiKey) {
    throw new Error('TAVILY_API_KEY not configured');
  }

  const {
    searchDepth = 'basic',
    maxResults = 5,
    includeDomains,
    excludeDomains,
    includeImages = false,
    includeAnswer = false,
  } = options;

  const requestBody: Record<string, unknown> = {
    api_key: config.tavilyApiKey,
    query,
    search_depth: searchDepth,
    max_results: maxResults,
    include_images: includeImages,
    include_answer: includeAnswer,
  };

  if (includeDomains?.length) {
    requestBody.include_domains = includeDomains;
  }

  if (excludeDomains?.length) {
    requestBody.exclude_domains = excludeDomains;
  }

  console.log(`[Tavily] Searching: "${query}"`);

  const response = await fetchWithRetry(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
    config.maxRetries
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as TavilySearchResult & { answer?: string };
  
  return normalizeTavilyResult(data, query);
}

// ============================================================================
// BATCH SEARCH
// ============================================================================

export async function tavilyBatchSearch(
  queries: string[],
  options: TavilySearchOptions = {}
): Promise<NormalizedTavilyResult[]> {
  const results: NormalizedTavilyResult[] = [];
  const concurrency = 2; // Tavily may have stricter rate limits

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((query) => tavilySearch(query, options).catch((err) => {
        console.warn(`[Tavily] Query failed: "${query}" - ${err.message}`);
        return createEmptyResult(query);
      }))
    );
    results.push(...batchResults);
    
    // Rate limit pause between batches
    if (i + concurrency < queries.length) {
      await sleep(300);
    }
  }

  return results;
}

// ============================================================================
// AUTHORITATIVE SOURCE DISCOVERY
// ============================================================================

/**
 * Search for authoritative sources on a topic
 * Prioritizes official, government, and industry sources
 */
export async function tavilyFindAuthoritativeSources(
  topic: string,
  options: {
    includeGov?: boolean;
    includeOrg?: boolean;
    includeEdu?: boolean;
    maxResults?: number;
  } = {}
): Promise<NormalizedTavilyResult> {
  const {
    includeGov = true,
    includeOrg = true,
    includeEdu = true,
    maxResults = 10,
  } = options;

  const includeDomains: string[] = [];
  
  if (includeGov) {
    includeDomains.push('.gov.uk', '.gov', '.gov.au', '.gov.ca');
  }
  if (includeOrg) {
    includeDomains.push('.org', '.org.uk');
  }
  if (includeEdu) {
    includeDomains.push('.edu', '.ac.uk');
  }

  // Add common authoritative domains
  includeDomains.push(
    'bbc.co.uk',
    'theguardian.com',
    'which.co.uk',
    'moneysavingexpert.com',
    'citizensadvice.org.uk'
  );

  return tavilySearch(topic, {
    searchDepth: 'advanced',
    maxResults,
    includeDomains: includeDomains.length > 0 ? includeDomains : undefined,
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeTavilyResult(data: TavilySearchResult & { answer?: string }, query: string): NormalizedTavilyResult {
  const results = (data.results || []).map((item: TavilyResult) => ({
    title: item.title || '',
    url: item.url || '',
    contentSnippet: item.content || '',
    score: item.score || 0,
    publishedDate: item.publishedDate,
  }));

  return {
    results,
    answer: data.answer,
    query,
  };
}

function createEmptyResult(query: string): NormalizedTavilyResult {
  return {
    results: [],
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
        console.warn(`[Tavily] Rate limited, waiting ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Tavily] Attempt ${attempt} failed: ${lastError.message}`);
      
      if (attempt < maxRetries) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError || new Error('Tavily request failed after retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { TavilySearchResult, TavilyResult };
