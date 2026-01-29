import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { createHash } from 'crypto';

export interface CrawlResult {
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
  internalLinks: Array<{
    href: string;
    anchorText: string;
    isNav: boolean;
    isFooter: boolean;
  }>;
  externalLinks: string[];
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  structuredData: object[];
  error?: string;
}

export interface CrawlOptions {
  respectRobotsTxt: boolean;
  maxPages: number;
  maxDepth: number;
  userAgent?: string;
  timeout?: number;
}

const DEFAULT_USER_AGENT = 'SiteFixBot/1.0 (+https://sitefix.io/bot)';

export class Crawler {
  private baseUrl: string;
  private options: CrawlOptions;
  private visited: Set<string> = new Set();
  private queue: Array<{ url: string; depth: number }> = [];
  private robotsRules: ReturnType<typeof robotsParser> | null = null;

  constructor(baseUrl: string, options: CrawlOptions) {
    this.baseUrl = this.normalizeUrl(baseUrl);
    this.options = options;
  }

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      // Remove trailing slash for consistency
      return u.origin + u.pathname.replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  private isInternalUrl(url: string): boolean {
    try {
      const base = new URL(this.baseUrl);
      const target = new URL(url, this.baseUrl);
      return target.hostname === base.hostname;
    } catch {
      return false;
    }
  }

  private isCrawlable(url: string): boolean {
    // Skip non-HTML resources
    const skipExtensions = [
      '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
      '.css', '.js', '.json', '.xml', '.txt', '.zip', '.rar',
      '.mp3', '.mp4', '.avi', '.mov', '.doc', '.docx', '.xls', '.xlsx'
    ];
    
    const lowerUrl = url.toLowerCase();
    if (skipExtensions.some(ext => lowerUrl.endsWith(ext))) {
      return false;
    }

    // Check robots.txt
    if (this.options.respectRobotsTxt && this.robotsRules) {
      return this.robotsRules.isAllowed(url, this.options.userAgent || DEFAULT_USER_AGENT) ?? true;
    }

    return true;
  }

  async initRobots(): Promise<void> {
    if (!this.options.respectRobotsTxt) return;

    try {
      const robotsUrl = new URL('/robots.txt', this.baseUrl).toString();
      const response = await fetch(robotsUrl, {
        headers: { 'User-Agent': this.options.userAgent || DEFAULT_USER_AGENT },
        signal: AbortSignal.timeout(this.options.timeout || 10000),
      });

      if (response.ok) {
        const robotsTxt = await response.text();
        this.robotsRules = robotsParser(robotsUrl, robotsTxt);
      }
    } catch {
      // Robots.txt not available, proceed without restrictions
      console.log('Robots.txt not available');
    }
  }

  async fetchPage(url: string): Promise<{ html: string; statusCode: number } | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.options.userAgent || DEFAULT_USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(this.options.timeout || 30000),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        return null;
      }

      const html = await response.text();
      return { html, statusCode: response.status };
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
      return null;
    }
  }

  parsePage(url: string, html: string, statusCode: number): CrawlResult {
    const $ = cheerio.load(html);

    // Extract title
    const title = $('title').first().text().trim() || null;

    // Extract H1
    const h1 = $('h1').first().text().trim() || null;

    // Extract meta description
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;

    // Extract canonical
    const canonical = $('link[rel="canonical"]').attr('href') || null;

    // Extract language
    const lang = $('html').attr('lang') || $('meta[http-equiv="content-language"]').attr('content') || null;

    // Extract all headings
    const headings = {
      h1: $('h1').map((_, el) => $(el).text().trim()).get(),
      h2: $('h2').map((_, el) => $(el).text().trim()).get(),
      h3: $('h3').map((_, el) => $(el).text().trim()).get(),
    };

    // Extract main content text
    // Remove scripts, styles, nav, footer for cleaner text
    const $content = $.root().clone();
    $content.find('script, style, nav, footer, header, aside, .sidebar, .menu, .navigation').remove();
    
    const rawText = $content.find('body').text();
    const cleanedText = rawText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim()
      .slice(0, 50000); // Limit text length

    const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
    const textHash = createHash('md5').update(cleanedText).digest('hex');

    // Extract internal and external links
    const internalLinks: CrawlResult['internalLinks'] = [];
    const externalLinks: string[] = [];

    $('a[href]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      const absoluteUrl = new URL(href, url).toString();
      const anchorText = $el.text().trim();

      // Check if in nav or footer
      const isNav = $el.closest('nav, header, .navigation, .menu, .nav').length > 0;
      const isFooter = $el.closest('footer, .footer').length > 0;

      if (this.isInternalUrl(absoluteUrl)) {
        internalLinks.push({
          href: this.normalizeUrl(absoluteUrl),
          anchorText,
          isNav,
          isFooter,
        });
      } else {
        externalLinks.push(absoluteUrl);
      }
    });

    // Extract structured data
    const structuredData: object[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() || '');
        structuredData.push(json);
      } catch {
        // Invalid JSON, skip
      }
    });

    return {
      url: this.normalizeUrl(url),
      statusCode,
      title,
      h1,
      metaDescription,
      canonical,
      lang,
      wordCount,
      textHash,
      cleanedText,
      internalLinks,
      externalLinks,
      headings,
      structuredData,
    };
  }

  async *crawl(): AsyncGenerator<CrawlResult> {
    await this.initRobots();

    // Start with the homepage
    this.queue.push({ url: this.baseUrl, depth: 0 });

    while (this.queue.length > 0 && this.visited.size < this.options.maxPages) {
      const item = this.queue.shift();
      if (!item) break;

      const { url, depth } = item;
      const normalizedUrl = this.normalizeUrl(url);

      // Skip if already visited
      if (this.visited.has(normalizedUrl)) continue;

      // Skip if not crawlable
      if (!this.isCrawlable(normalizedUrl)) continue;

      // Mark as visited
      this.visited.add(normalizedUrl);

      // Fetch and parse
      const result = await this.fetchPage(normalizedUrl);
      if (!result) continue;

      const parsed = this.parsePage(normalizedUrl, result.html, result.statusCode);
      yield parsed;

      // Add internal links to queue if within depth limit
      if (depth < this.options.maxDepth) {
        for (const link of parsed.internalLinks) {
          const linkNormalized = this.normalizeUrl(link.href);
          if (!this.visited.has(linkNormalized) && !this.queue.some(q => this.normalizeUrl(q.url) === linkNormalized)) {
            this.queue.push({ url: linkNormalized, depth: depth + 1 });
          }
        }
      }

      // Small delay to be polite
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  getStats() {
    return {
      visited: this.visited.size,
      queued: this.queue.length,
    };
  }
}

// Page role classification based on URL patterns and content
export function classifyPageRole(url: string, title: string | null, h1: string | null): 'money' | 'trust' | 'authority' | 'support' {
  const urlLower = url.toLowerCase();
  const titleLower = (title || '').toLowerCase();
  const h1Lower = (h1 || '').toLowerCase();
  const combined = `${urlLower} ${titleLower} ${h1Lower}`;

  // Money pages
  const moneyPatterns = [
    /\/(pricing|prices|plans|packages)/,
    /\/(contact|book|booking|schedule|appointment)/,
    /\/(services|solutions|products)/,
    /\/(get-started|start|buy|order|purchase)/,
    /\/(quote|estimate|consultation)/,
    /\/(demo|trial|signup|sign-up)/,
  ];

  if (moneyPatterns.some(p => p.test(urlLower))) {
    return 'money';
  }

  // Trust pages
  const trustPatterns = [
    /\/(about|about-us|our-story|team|our-team)/,
    /\/(reviews|testimonials|clients|case-studies|portfolio)/,
    /\/(awards|certifications|credentials)/,
  ];

  if (trustPatterns.some(p => p.test(urlLower))) {
    return 'trust';
  }

  // Authority pages
  const authorityPatterns = [
    /\/(blog|articles|news|resources|guides)/,
    /\/(how-to|tutorial|learn|education)/,
    /\/(comparison|vs|alternatives)/,
    /\/(glossary|dictionary|terms)/,
  ];

  if (authorityPatterns.some(p => p.test(urlLower))) {
    return 'authority';
  }

  // Support pages
  const supportPatterns = [
    /\/(faq|faqs|help|support)/,
    /\/(privacy|privacy-policy|terms|terms-of-service|legal|disclaimer)/,
    /\/(sitemap|404|error)/,
    /\/(careers|jobs|work-with-us)/,
  ];

  if (supportPatterns.some(p => p.test(urlLower))) {
    return 'support';
  }

  // Homepage is money
  if (urlLower.match(/^https?:\/\/[^\/]+\/?$/)) {
    return 'money';
  }

  // Check content for clues
  if (combined.includes('pricing') || combined.includes('contact') || combined.includes('book')) {
    return 'money';
  }

  if (combined.includes('about') || combined.includes('team') || combined.includes('testimonial')) {
    return 'trust';
  }

  if (combined.includes('guide') || combined.includes('how to') || combined.includes('blog')) {
    return 'authority';
  }

  // Default to support
  return 'support';
}

// Calculate priority score based on role and signals
export function calculatePriorityScore(
  role: string,
  isLinkedFromNav: boolean,
  isLinkedFromFooter: boolean,
  internalLinksIn: number,
  urlDepth: number
): number {
  let score = 0;

  // Role base score
  const roleScores: Record<string, number> = {
    money: 100,
    trust: 70,
    authority: 40,
    support: 20,
  };
  score += roleScores[role] || 20;

  // Navigation prominence
  if (isLinkedFromNav) score += 30;
  if (isLinkedFromFooter) score += 10;

  // Internal link popularity
  score += Math.min(internalLinksIn * 2, 20);

  // URL depth penalty (shorter URLs = more important)
  score -= Math.min(urlDepth * 5, 20);

  return Math.max(0, Math.min(100, score));
}
