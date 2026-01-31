// ============================================================================
// RESEARCH PACKAGE - CONFIGURATION
// ============================================================================
// Runtime config loader for API keys and cache settings
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

export interface ResearchConfig {
  /** Serper API key for Google SERP + PAA */
  serperApiKey: string;
  /** Tavily API key for web research */
  tavilyApiKey: string;
  /** Geoapify API key for geo context */
  geoapifyApiKey: string;
  /** Cache directory path */
  cacheDir: string;
  /** Cache TTL in hours */
  cacheTtlHours: number;
  /** Whether to enable caching */
  cacheEnabled: boolean;
  /** Max retries for API calls */
  maxRetries: number;
  /** Request timeout in ms */
  timeoutMs: number;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULTS: Partial<ResearchConfig> = {
  cacheDir: '.cache/research',
  cacheTtlHours: 168, // 1 week
  cacheEnabled: true,
  maxRetries: 3,
  timeoutMs: 30000,
};

// ============================================================================
// CONFIG LOADER
// ============================================================================

let cachedConfig: ResearchConfig | null = null;

export function getResearchConfig(): ResearchConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const config: ResearchConfig = {
    serperApiKey: process.env.SERPER_API_KEY || '',
    tavilyApiKey: process.env.TAVILY_API_KEY || '',
    geoapifyApiKey: process.env.GEOAPIFY_API_KEY || '',
    cacheDir: process.env.RESEARCH_CACHE_DIR || DEFAULTS.cacheDir!,
    cacheTtlHours: parseInt(process.env.RESEARCH_TTL_HOURS || String(DEFAULTS.cacheTtlHours), 10),
    cacheEnabled: process.env.RESEARCH_CACHE_ENABLED !== 'false',
    maxRetries: parseInt(process.env.RESEARCH_MAX_RETRIES || String(DEFAULTS.maxRetries), 10),
    timeoutMs: parseInt(process.env.RESEARCH_TIMEOUT_MS || String(DEFAULTS.timeoutMs), 10),
  };

  cachedConfig = config;
  return config;
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface ConfigValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfig(config: ResearchConfig): ConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.serperApiKey) {
    errors.push('SERPER_API_KEY is not set - Serper search will fail');
  }

  if (!config.tavilyApiKey) {
    errors.push('TAVILY_API_KEY is not set - Tavily search will fail');
  }

  if (!config.geoapifyApiKey) {
    errors.push('GEOAPIFY_API_KEY is not set - Geo research will fail');
  }

  if (config.cacheTtlHours < 1) {
    warnings.push('Cache TTL is less than 1 hour - may cause excessive API calls');
  }

  if (config.cacheTtlHours > 720) {
    warnings.push('Cache TTL is more than 30 days - research data may be stale');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// CACHE UTILITIES
// ============================================================================

export function ensureCacheDir(config: ResearchConfig): void {
  if (!config.cacheEnabled) return;

  const absolutePath = path.isAbsolute(config.cacheDir)
    ? config.cacheDir
    : path.join(process.cwd(), config.cacheDir);

  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }
}

export function getCachePath(config: ResearchConfig, cacheKey: string): string {
  const absolutePath = path.isAbsolute(config.cacheDir)
    ? config.cacheDir
    : path.join(process.cwd(), config.cacheDir);

  return path.join(absolutePath, `${cacheKey}.json`);
}

export function isCacheValid(cachePath: string, ttlHours: number): boolean {
  if (!fs.existsSync(cachePath)) {
    return false;
  }

  const stats = fs.statSync(cachePath);
  const ageMs = Date.now() - stats.mtimeMs;
  const ttlMs = ttlHours * 60 * 60 * 1000;

  return ageMs < ttlMs;
}

export function readCache<T>(cachePath: string): T | null {
  try {
    if (!fs.existsSync(cachePath)) {
      return null;
    }
    const data = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export function writeCache<T>(cachePath: string, data: T): void {
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.warn(`[Research] Failed to write cache: ${error}`);
  }
}

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

export function generateCacheKey(request: {
  service: string;
  focusKeyword: string;
  geoPrimary?: string;
  intent: string;
  pageRole: string;
}): string {
  const parts = [
    request.service.toLowerCase().replace(/\s+/g, '-'),
    request.focusKeyword.toLowerCase().replace(/\s+/g, '-'),
    request.geoPrimary?.toLowerCase().replace(/\s+/g, '-') || 'no-geo',
    request.intent.toLowerCase(),
    request.pageRole.toLowerCase(),
  ];
  
  // Create a deterministic hash-like key
  const combined = parts.join('_');
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return `research_${Math.abs(hash).toString(36)}_${combined.substring(0, 50)}`;
}

// ============================================================================
// RESET CONFIG (for testing)
// ============================================================================

export function resetConfig(): void {
  cachedConfig = null;
}
