/**
 * Enhanced Scraper Service
 * Uses Jina Reader API for reliable content extraction
 * Falls back to direct fetch + Cheerio for basic HTML
 */

import { load } from 'cheerio';
import { createHash } from 'crypto';

export interface ScrapedPage {
  url: string;
  statusCode: number;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  canonical: string | null;
  lang: string | null;
  wordCount: number;
  textHash: string;
  cleanedText: string;
  markdownContent: string;
  internalLinks: string[];
  externalLinks: string[];
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  error?: string;
}

export interface ScraperOptions {
  useJinaReader?: boolean;
  timeout?: number;
  userAgent?: string;
}

const DEFAULT_USER_AGENT = 'SiteFixBot/1.0 (+https://sitefix.io/bot)';
const JINA_READER_URL = 'https://r.jina.ai/';

/**
 * Scrape a single page using Jina Reader (recommended)
 * Returns clean markdown content perfect for AI context
 */
export async function scrapeWithJina(url: string): Promise<ScrapedPage> {
  try {
    const jinaUrl = `${JINA_READER_URL}${url}`;
    console.log(`[Scraper] Fetching via Jina: ${url}`);
    
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout (reduced from 60)
    });

    if (!response.ok) {
      throw new Error(`Jina Reader failed: ${response.status}`);
    }

    const markdownContent = await response.text();
    console.log(`[Scraper] Jina success for ${url} (${markdownContent.length} chars)`);
    
    // Parse the markdown to extract metadata
    const lines = markdownContent.split('\n');
    let title: string | null = null;
    let h1: string | null = null;
    const h1s: string[] = [];
    const h2s: string[] = [];
    const h3s: string[] = [];

    for (const line of lines) {
      if (line.startsWith('# ') && !h1) {
        h1 = line.slice(2).trim();
        h1s.push(h1);
      } else if (line.startsWith('## ')) {
        h2s.push(line.slice(3).trim());
      } else if (line.startsWith('### ')) {
        h3s.push(line.slice(4).trim());
      } else if (line.startsWith('Title: ')) {
        title = line.slice(7).trim();
      }
    }

    // Extract links from markdown
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    const internalLinks: string[] = [];
    const externalLinks: string[] = [];
    const baseHost = new URL(url).hostname;

    let match;
    while ((match = linkRegex.exec(markdownContent)) !== null) {
      const linkUrl = match[2];
      try {
        const absoluteUrl = new URL(linkUrl, url).toString();
        const linkHost = new URL(absoluteUrl).hostname;
        if (linkHost === baseHost) {
          internalLinks.push(absoluteUrl);
        } else {
          externalLinks.push(absoluteUrl);
        }
      } catch {
        // Invalid URL, skip
      }
    }

    const cleanedText = markdownContent
      .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1') // Remove link syntax
      .replace(/[#*_`]/g, '') // Remove markdown formatting
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim();

    const wordCount = cleanedText.split(/\s+/).filter((w: string) => w.length > 0).length;
    const textHash = createHash('md5').update(cleanedText).digest('hex');

    return {
      url,
      statusCode: 200,
      title: title || h1,
      h1,
      metaDescription: null, // Jina doesn't return this
      canonical: null,
      lang: null,
      wordCount,
      textHash,
      cleanedText,
      markdownContent,
      internalLinks: Array.from(new Set(internalLinks)),
      externalLinks: Array.from(new Set(externalLinks)),
      headings: { h1: h1s, h2: h2s, h3: h3s },
    };
  } catch (error) {
    return {
      url,
      statusCode: 0,
      title: null,
      h1: null,
      metaDescription: null,
      canonical: null,
      lang: null,
      wordCount: 0,
      textHash: '',
      cleanedText: '',
      markdownContent: '',
      internalLinks: [],
      externalLinks: [],
      headings: { h1: [], h2: [], h3: [] },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Scrape with direct fetch + Cheerio (fallback)
 */
export async function scrapeWithCheerio(url: string, options: ScraperOptions = {}): Promise<ScrapedPage> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': options.userAgent || DEFAULT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(options.timeout || 30000),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error('Not an HTML page');
    }

    const html = await response.text();
    const $ = load(html);

    // Extract metadata
    const title = $('title').first().text().trim() || null;
    const h1 = $('h1').first().text().trim() || null;
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
    const canonical = $('link[rel="canonical"]').attr('href') || null;
    const lang = $('html').attr('lang') || null;

    // Extract headings
    const headings = {
      h1: $('h1').map((_: number, el: any) => $(el).text().trim()).get() as string[],
      h2: $('h2').map((_: number, el: any) => $(el).text().trim()).get() as string[],
      h3: $('h3').map((_: number, el: any) => $(el).text().trim()).get() as string[],
    };

    // Clean content - remove non-content elements
    const $content = $.root().clone();
    $content.find('script, style, nav, footer, header, aside, .sidebar, .menu, .navigation, .cookie-notice, .popup').remove();
    
    const rawText = $content.find('body').text();
    const cleanedText = rawText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim()
      .slice(0, 50000);

    const wordCount = cleanedText.split(/\s+/).filter((w: string) => w.length > 0).length;
    const textHash = createHash('md5').update(cleanedText).digest('hex');

    // Extract links
    const baseHost = new URL(url).hostname;
    const internalLinks: string[] = [];
    const externalLinks: string[] = [];

    $('a[href]').each((_: number, el: any) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
        return;
      }

      try {
        const absoluteUrl = new URL(href, url).toString();
        const linkHost = new URL(absoluteUrl).hostname;
        if (linkHost === baseHost) {
          internalLinks.push(absoluteUrl);
        } else {
          externalLinks.push(absoluteUrl);
        }
      } catch {
        // Invalid URL
      }
    });

    // Convert to basic markdown
    const markdownContent = `# ${title || 'Untitled'}\n\n${cleanedText}`;

    return {
      url,
      statusCode: response.status,
      title,
      h1,
      metaDescription,
      canonical,
      lang,
      wordCount,
      textHash,
      cleanedText,
      markdownContent,
      internalLinks: Array.from(new Set(internalLinks)),
      externalLinks: Array.from(new Set(externalLinks)),
      headings,
    };
  } catch (error) {
    return {
      url,
      statusCode: 0,
      title: null,
      h1: null,
      metaDescription: null,
      canonical: null,
      lang: null,
      wordCount: 0,
      textHash: '',
      cleanedText: '',
      markdownContent: '',
      internalLinks: [],
      externalLinks: [],
      headings: { h1: [], h2: [], h3: [] },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Smart scraper - tries Jina first, falls back to Cheerio
 */
export async function scrapePage(url: string, options: ScraperOptions = {}): Promise<ScrapedPage> {
  if (options.useJinaReader !== false) {
    const result = await scrapeWithJina(url);
    if (!result.error) {
      return result;
    }
    console.log(`Jina failed for ${url}, falling back to Cheerio:`, result.error);
  }
  
  return scrapeWithCheerio(url, options);
}

/**
 * Try to fetch sitemap.xml and extract URLs
 */
async function fetchSitemap(startUrl: string): Promise<string[]> {
  const baseUrl = new URL(startUrl);
  const sitemapUrls = [
    `${baseUrl.origin}/sitemap.xml`,
    `${baseUrl.origin}/sitemap_index.xml`,
    `${baseUrl.origin}/sitemap/sitemap.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      console.log(`[Discovery] Trying sitemap: ${sitemapUrl}`);
      const response = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SiteFixBot/1.0)' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;

      const xml = await response.text();
      
      // Extract URLs from sitemap
      const urlMatches = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g));
      const urls: string[] = [];
      
      for (const match of urlMatches) {
        const url = match[1].trim();
        // Filter to same domain only
        try {
          const parsedUrl = new URL(url);
          if (parsedUrl.hostname === baseUrl.hostname) {
            urls.push(url);
          }
        } catch {
          // Invalid URL
        }
      }

      if (urls.length > 0) {
        console.log(`[Discovery] Found ${urls.length} URLs in sitemap: ${sitemapUrl}`);
        return urls;
      }
    } catch (error: any) {
      console.log(`[Discovery] Sitemap fetch failed for ${sitemapUrl}: ${error.message}`);
    }
  }

  return [];
}

/**
 * Discover all internal pages from a starting URL
 * Uses breadth-first crawl to find all reachable pages
 * Falls back to sitemap.xml for SPAs and JS-heavy sites
 * @param excludePatterns - Array of regex patterns to exclude (e.g., [/\/blog/, /\/news/])
 */
export async function discoverPages(
  startUrl: string,
  maxPages: number = 50,
  maxDepth: number = 3,
  excludePatterns: RegExp[] = []
): Promise<string[]> {
  const discovered: Set<string> = new Set();
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const baseHost = new URL(startUrl).hostname;
  
  // Normalize hostname to handle www/non-www variations
  const normalizeHost = (hostname: string): string => {
    return hostname.replace(/^www\./, '');
  };
  const baseHostNormalized = normalizeHost(baseHost);

  // Helper to check if URL should be excluded
  const shouldExclude = (urlPath: string): boolean => {
    return excludePatterns.some(pattern => pattern.test(urlPath));
  };

  console.log(`[Discovery] Starting discovery for ${startUrl}, maxPages=${maxPages}, maxDepth=${maxDepth}`);
  console.log(`[Discovery] Base host: ${baseHost} (normalized: ${baseHostNormalized})`);

  while (queue.length > 0 && discovered.size < maxPages) {
    const { url, depth } = queue.shift()!;
    
    if (discovered.has(url) || depth > maxDepth) continue;
    discovered.add(url);

    console.log(`[Discovery] Fetching: ${url} (depth=${depth})`);

    // Quick fetch to extract links (not full content)
    try {
      const response = await fetch(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.log(`[Discovery] Non-OK response for ${url}: ${response.status}`);
        continue;
      }
      
      const html = await response.text();
      const $ = load(html);

      // Find all links
      let linksFound = 0;
      $('a[href]').each((_: number, el: any) => {
        const href = $(el).attr('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

        try {
          const absoluteUrl = new URL(href, url);
          const linkHostNormalized = normalizeHost(absoluteUrl.hostname);
          
          // Only internal (handle www/non-www), HTML-like URLs, and not excluded
          if (linkHostNormalized === baseHostNormalized && 
              !absoluteUrl.pathname.match(/\.(pdf|jpg|jpeg|png|gif|css|js|zip|svg|webp|ico|woff|woff2|ttf|eot)$/i) &&
              !shouldExclude(absoluteUrl.pathname)) {
            const normalizedUrl = `${absoluteUrl.origin}${absoluteUrl.pathname}`.replace(/\/$/, '');
            if (!discovered.has(normalizedUrl) && !shouldExclude(normalizedUrl)) {
              queue.push({ url: normalizedUrl, depth: depth + 1 });
              linksFound++;
            }
          }
        } catch {
          // Invalid URL
        }
      });

      console.log(`[Discovery] Found ${linksFound} new links on ${url}`);
    } catch (error: any) {
      console.log(`[Discovery] Error fetching ${url}: ${error.message}`);
    }

    // Small delay to be polite
    await new Promise(r => setTimeout(r, 200));
  }

  // If we found very few pages (likely an SPA), try sitemap as fallback
  if (discovered.size <= 3) {
    console.log(`[Discovery] Only found ${discovered.size} pages via HTML. Trying sitemap fallback...`);
    const sitemapUrls = await fetchSitemap(startUrl);
    
    if (sitemapUrls.length > 0) {
      console.log(`[Discovery] Sitemap found ${sitemapUrls.length} URLs. Using sitemap instead.`);
      // Filter and normalize sitemap URLs
      for (const url of sitemapUrls) {
        if (discovered.size >= maxPages) break;
        try {
          const normalizedUrl = url.replace(/\/$/, '');
          if (!shouldExclude(normalizedUrl)) {
            discovered.add(normalizedUrl);
          }
        } catch {
          // Invalid URL
        }
      }
    }
  }

  console.log(`[Discovery] Complete! Found ${discovered.size} pages`);
  return Array.from(discovered);
}

/**
 * Full site scrape - discovers pages then scrapes each one
 * @param options.excludePatterns - Regex patterns to exclude URLs (e.g., [/\/blog/, /\/news/])
 */
export async function scrapeSite(
  startUrl: string,
  options: {
    maxPages?: number;
    maxDepth?: number;
    useJinaReader?: boolean;
    excludePatterns?: RegExp[];
    onProgress?: (current: number, total: number, url: string) => void;
  } = {}
): Promise<ScrapedPage[]> {
  const { maxPages = 50, maxDepth = 3, useJinaReader = true, excludePatterns = [], onProgress } = options;

  // First, discover all pages (excluding specified patterns)
  const pages = await discoverPages(startUrl, maxPages, maxDepth, excludePatterns);
  
  // Then scrape each page
  const results: ScrapedPage[] = [];
  
  for (let i = 0; i < pages.length; i++) {
    const url = pages[i];
    onProgress?.(i + 1, pages.length, url);
    
    const result = await scrapePage(url, { useJinaReader });
    results.push(result);
    
    // Delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

/**
 * Classify page role based on URL and content
 * Priority buckets per the original brief:
 * - Money pages: services, pricing, booking, contact (highest priority)
 * - Trust pages: reviews, case studies, about, team
 * - Authority pages: guides, blog pillars, comparisons
 * - Support pages: FAQs, policies, minor content
 */
export function classifyPageRole(url: string, content: ScrapedPage): 'money' | 'trust' | 'authority' | 'support' {
  const path = new URL(url).pathname.toLowerCase();
  const text = ((content.cleanedText || '') + ' ' + (content.title || '')).toLowerCase();
  const title = (content.title || '').toLowerCase();

  // MONEY PAGES - Revenue-generating, high-intent pages
  const moneyPathPatterns = [
    /^\/?$/, // Homepage is always money
    /\/(services?|pricing|products?|shop|store|buy|order)/,
    /\/(book|booking|schedule|appointment|reserve)/,
    /\/(quote|estimate|consultation|assessment)/,
    /\/(contact|contact-us|get-in-touch|reach-us)/,
    /\/(hire|work-with|get-started|start)/,
    /\/(plans?|packages?|solutions?)/,
    /\/(property|properties|listing|for-sale|for-rent)/, // Real estate
    /\/(menu|order-online|delivery)/, // Restaurant
  ];
  if (moneyPathPatterns.some(p => p.test(path))) return 'money';
  
  // Check content signals for money pages
  const moneyContentSignals = [
    'get a quote', 'book now', 'schedule', 'contact us', 'request a call',
    'pricing', 'starting from', 'free consultation', 'our services',
    'how much', 'cost', 'price', 'buy now', 'order now', 'add to cart',
    'for sale', 'for rent', 'view property', 'enquire now',
  ];
  if (moneyContentSignals.some(signal => text.includes(signal) || title.includes(signal))) {
    // Only if it's not clearly a blog/article
    if (!path.includes('/blog') && !path.includes('/news') && !path.includes('/article')) {
      return 'money';
    }
  }

  // TRUST PAGES - Build credibility and social proof
  const trustPathPatterns = [
    /\/(about|about-us|our-story|who-we-are)/,
    /\/(team|our-team|people|staff|agents?)/,
    /\/(testimonials?|reviews?|feedback|what-clients-say)/,
    /\/(case-stud|portfolio|projects?|work|our-work)/,
    /\/(clients?|partners?|trusted-by)/,
    /\/(awards?|certifications?|credentials|accreditation)/,
    /\/(guarantee|warranty|promise)/,
    /\/(offices?|locations?|branches?|showrooms?)/,
  ];
  if (trustPathPatterns.some(p => p.test(path))) return 'trust';
  
  // Check content signals for trust pages
  const trustContentSignals = [
    'our story', 'meet the team', 'years of experience', 'testimonial',
    'case study', 'our clients', 'client results', 'certified', 'award',
    'about us', 'who we are', 'our mission', 'our values',
  ];
  if (trustContentSignals.some(signal => text.includes(signal) || title.includes(signal))) {
    return 'trust';
  }

  // AUTHORITY PAGES - Guides, pillar content, educational
  const authorityPathPatterns = [
    /\/(guide|guides|how-to|tutorial)/,
    /\/(comparison|vs|versus|compare)/,
    /\/(resource|resources|learn|education)/,
    /\/(pillar|ultimate|complete|comprehensive)/,
    /\/(research|study|report|whitepaper)/,
    /\/(area-guide|neighbourhood|neighborhood|market-report)/, // Real estate
  ];
  if (authorityPathPatterns.some(p => p.test(path))) return 'authority';

  // Check for pillar/guide content signals
  const authorityContentSignals = [
    'complete guide', 'ultimate guide', 'everything you need to know',
    'step by step', 'comprehensive', 'in-depth', 'definitive',
  ];
  if (authorityContentSignals.some(signal => text.includes(signal) || title.includes(signal))) {
    return 'authority';
  }

  // SUPPORT PAGES - Blog posts, FAQs, legal, minor content (default)
  const supportPathPatterns = [
    /\/(blog|news|articles?|posts?)/,
    /\/(faq|faqs|questions|help)/,
    /\/(privacy|terms|legal|disclaimer|policy|policies)/,
    /\/(sitemap|accessibility|cookie)/,
    /\/(career|jobs|vacancies)/,
    /\/(press|media|newsroom)/,
  ];
  if (supportPathPatterns.some(p => p.test(path))) return 'support';

  // Default: if it looks like a deep content page, it's support
  // Otherwise, treat as potential money page (service/product detail)
  const pathDepth = path.split('/').filter(Boolean).length;
  if (pathDepth > 2 && (path.includes('-') || path.match(/\/\d+/))) {
    // Deep nested pages with slugs or IDs - likely product/property details = money
    return 'money';
  }

  return 'support';
}

/**
 * Calculate priority score based on page characteristics
 */
export function calculatePriorityScore(page: ScrapedPage, role: string): number {
  let score = 0;

  // Role weight
  if (role === 'money') score += 100;
  else if (role === 'trust') score += 50;
  else score += 20;

  // Content quality signals
  if (page.wordCount > 500) score += 20;
  if (page.wordCount > 1000) score += 10;
  if (page.h1) score += 10;
  if (page.metaDescription) score += 10;
  if (page.headings.h2.length >= 3) score += 10;

  // Link signals
  score += Math.min(page.internalLinks.length, 20);

  return score;
}
