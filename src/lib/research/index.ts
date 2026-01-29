// ============================================================================
// RESEARCH SERVICE - Enhanced Topic Discovery for Growth Planner
// ============================================================================

import { scrapePage, discoverPages, ScrapedPage } from '@/lib/scraper';
import { PageRole } from '@/types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Simplified business context for research purposes
 * This is a subset of the full BusinessRealityModel
 */
export interface ResearchBusinessContext {
  name: string;
  niche: string;
  coreServices: string[];
  primaryLocations: string[];
  yearsActive?: number | null;
  reviewThemes?: Array<{ theme: string; count: number }>;
  differentiators?: string[];
  volumeIndicators?: string[];
  scenarioProof?: Array<{ scenario: string; outcome: string }>;
}

export interface ExtractedKeyword {
  keyword: string;
  frequency: number;
  source: 'title' | 'h1' | 'h2' | 'h3' | 'content' | 'meta';
  pages: string[];
}

export interface ContentGapSuggestion {
  topic: string;
  reason: string;
  opportunityScore: number; // 0-100
  suggestedKeywords: string[];
  targetIntent: 'buy' | 'compare' | 'learn' | 'trust';
  relatedService: string | null;
  relatedLocation: string | null;
}

export interface TopicCluster {
  pillarTopic: string;
  subtopics: string[];
  existingPages: string[];
  missingSubtopics: string[];
  clusterStrength: number; // 0-100, based on coverage
}

export interface HeadingSuggestion {
  h1: string;
  h2s: string[];
  targetKeyword: string;
  intent: 'buy' | 'compare' | 'learn' | 'trust';
  rationale: string;
}

export interface ResearchReport {
  siteUrl: string;
  analyzedAt: string;
  
  // Inventory
  totalPages: number;
  pagesByRole: {
    money: number;
    trust: number;
    authority: number;
    support: number;
    operational: number;
    unknown: number;
  };
  
  // Extracted data
  keywords: ExtractedKeyword[];
  topicClusters: TopicCluster[];
  
  // AI-generated opportunities
  contentGaps: ContentGapSuggestion[];
  headingSuggestions: HeadingSuggestion[];
  
  // Quality metrics
  thinContentPages: string[];
  orphanedPages: string[];
  duplicateTopics: Array<{ topic: string; pages: string[] }>;
}

// ============================================================================
// STOP WORDS FOR KEYWORD EXTRACTION
// ============================================================================

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who',
  'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
  'about', 'after', 'before', 'between', 'under', 'over', 'through', 'during',
  'above', 'below', 'into', 'out', 'off', 'up', 'down', 'then', 'once', 'any',
  'our', 'your', 'their', 'his', 'her', 'my', 'me', 'him', 'us', 'them',
]);

// ============================================================================
// KEYWORD EXTRACTION
// ============================================================================

/**
 * Extract keywords from scraped pages
 * Focuses on meaningful terms from titles, headings, and content
 */
export function extractKeywords(pages: ScrapedPage[]): ExtractedKeyword[] {
  const keywordMap = new Map<string, ExtractedKeyword>();

  for (const page of pages) {
    // Extract from title (highest weight)
    if (page.title) {
      extractFromText(page.title, 'title', page.url, keywordMap);
    }

    // Extract from H1
    for (const h1 of page.headings.h1) {
      extractFromText(h1, 'h1', page.url, keywordMap);
    }

    // Extract from H2s
    for (const h2 of page.headings.h2) {
      extractFromText(h2, 'h2', page.url, keywordMap);
    }

    // Extract from H3s
    for (const h3 of page.headings.h3) {
      extractFromText(h3, 'h3', page.url, keywordMap);
    }

    // Extract from meta description
    if (page.metaDescription) {
      extractFromText(page.metaDescription, 'meta', page.url, keywordMap);
    }

    // Extract from content (sample first 1000 words)
    if (page.cleanedText) {
      const sampleText = page.cleanedText.split(/\s+/).slice(0, 1000).join(' ');
      extractFromText(sampleText, 'content', page.url, keywordMap);
    }
  }

  // Sort by frequency and filter low-value keywords
  return Array.from(keywordMap.values())
    .filter(kw => kw.frequency >= 2 && kw.keyword.length >= 3)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 200); // Top 200 keywords
}

function extractFromText(
  text: string,
  source: ExtractedKeyword['source'],
  pageUrl: string,
  keywordMap: Map<string, ExtractedKeyword>
): void {
  // Normalize text
  const normalized = text.toLowerCase().replace(/[^\w\s-]/g, ' ');
  
  // Extract single words
  const words = normalized.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  
  for (const word of words) {
    addKeyword(word, source, pageUrl, keywordMap);
  }

  // Extract 2-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
      addKeyword(phrase, source, pageUrl, keywordMap);
    }
  }

  // Extract 3-word phrases
  for (let i = 0; i < words.length - 2; i++) {
    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    addKeyword(phrase, source, pageUrl, keywordMap);
  }
}

function addKeyword(
  keyword: string,
  source: ExtractedKeyword['source'],
  pageUrl: string,
  keywordMap: Map<string, ExtractedKeyword>
): void {
  const existing = keywordMap.get(keyword);
  if (existing) {
    existing.frequency++;
    if (!existing.pages.includes(pageUrl)) {
      existing.pages.push(pageUrl);
    }
  } else {
    keywordMap.set(keyword, {
      keyword,
      frequency: 1,
      source,
      pages: [pageUrl],
    });
  }
}

// ============================================================================
// TOPIC CLUSTERING
// ============================================================================

/**
 * Group pages into topic clusters based on keyword overlap
 */
export function buildTopicClusters(
  pages: ScrapedPage[],
  keywords: ExtractedKeyword[],
  business: ResearchBusinessContext
): TopicCluster[] {
  const clusters: TopicCluster[] = [];

  // Use core services as pillar topics
  for (const service of business.coreServices) {
    const serviceLower = service.toLowerCase();
    
    const relatedPages = pages.filter(page => {
      const pageText = `${page.title} ${page.h1} ${page.headings.h2.join(' ')}`.toLowerCase();
      return pageText.includes(serviceLower);
    });

    // Find subtopics from H2s of related pages
    const subtopics = new Set<string>();
    for (const page of relatedPages) {
      for (const h2 of page.headings.h2) {
        subtopics.add(h2);
      }
    }

    // Identify missing subtopics based on common patterns
    const commonSubtopicPatterns = [
      `${service} pricing`,
      `${service} process`,
      `${service} FAQ`,
      `${service} benefits`,
      `${service} vs`,
      `how to choose ${service}`,
      `best ${service}`,
      `${service} near me`,
      `${service} guide`,
      `${service} tips`,
    ];

    const existingSubtopics = Array.from(subtopics);
    const missingSubtopics = commonSubtopicPatterns.filter(pattern =>
      !existingSubtopics.some(existing =>
        existing.toLowerCase().includes(pattern.toLowerCase()) ||
        pattern.toLowerCase().includes(existing.toLowerCase())
      )
    );

    clusters.push({
      pillarTopic: service,
      subtopics: existingSubtopics.slice(0, 10),
      existingPages: relatedPages.map(p => p.url),
      missingSubtopics,
      clusterStrength: Math.min(100, (relatedPages.length / 5) * 100),
    });
  }

  return clusters;
}

// ============================================================================
// PAGE ROLE CLASSIFICATION
// ============================================================================

/**
 * Classify a page's role based on URL and content signals
 */
export function classifyPageRole(url: string, page: ScrapedPage): PageRole {
  const urlLower = url.toLowerCase();
  const titleLower = (page.title || '').toLowerCase();
  const h1Lower = (page.h1 || '').toLowerCase();

  // Trust signals
  if (
    urlLower.includes('/about') ||
    urlLower.includes('/team') ||
    urlLower.includes('/testimonial') ||
    urlLower.includes('/review') ||
    urlLower.includes('/case-stud') ||
    titleLower.includes('about us') ||
    titleLower.includes('our team') ||
    titleLower.includes('testimonial')
  ) {
    return 'trust';
  }

  // Support signals
  if (
    urlLower.includes('/faq') ||
    urlLower.includes('/help') ||
    urlLower.includes('/guide') ||
    urlLower.includes('/how-to') ||
    urlLower.includes('/blog') ||
    urlLower.includes('/article') ||
    titleLower.includes('faq') ||
    titleLower.includes('how to') ||
    titleLower.includes('guide')
  ) {
    return 'support';
  }

  // Authority signals
  if (
    urlLower.includes('/resource') ||
    urlLower.includes('/whitepaper') ||
    urlLower.includes('/report') ||
    urlLower.includes('/research') ||
    urlLower.includes('/news') ||
    titleLower.includes('industry') ||
    titleLower.includes('report')
  ) {
    return 'authority';
  }

  // Operational signals
  if (
    urlLower.includes('/contact') ||
    urlLower.includes('/login') ||
    urlLower.includes('/signup') ||
    urlLower.includes('/cart') ||
    urlLower.includes('/checkout') ||
    urlLower.includes('/privacy') ||
    urlLower.includes('/terms') ||
    urlLower.includes('/cookie')
  ) {
    return 'operational';
  }

  // Money page signals (services, products, pricing)
  if (
    urlLower.includes('/service') ||
    urlLower.includes('/product') ||
    urlLower.includes('/pricing') ||
    urlLower.includes('/package') ||
    urlLower.includes('/solution') ||
    page.wordCount > 500 // Substantial content pages are likely money pages
  ) {
    return 'money';
  }

  // Default
  return 'unknown';
}

// ============================================================================
// AI GAP ANALYSIS
// ============================================================================

/**
 * Use AI to identify content gaps based on inventory analysis
 */
export async function analyzeContentGaps(
  pages: ScrapedPage[],
  keywords: ExtractedKeyword[],
  business: ResearchBusinessContext,
  openaiApiKey?: string
): Promise<ContentGapSuggestion[]> {
  // If no API key, use heuristic analysis
  if (!openaiApiKey) {
    return analyzeGapsHeuristically(pages, keywords, business);
  }

  // Build context for AI
  const pagesSummary = pages.slice(0, 30).map(p => ({
    url: p.url,
    title: p.title,
    h1: p.h1,
    h2s: p.headings.h2.slice(0, 5),
    wordCount: p.wordCount,
    role: classifyPageRole(p.url, p),
  }));

  const topKeywords = keywords.slice(0, 50).map(k => k.keyword);

  const prompt = `You are an SEO strategist analyzing a website's content inventory.

BUSINESS CONTEXT:
- Business Name: ${business.name}
- Core Services: ${business.coreServices.join(', ')}
- Locations: ${business.primaryLocations.join(', ')}
- Target Audience: ${business.niche}
- Niche: ${business.niche}

EXISTING CONTENT (${pages.length} pages):
${JSON.stringify(pagesSummary, null, 2)}

TOP KEYWORDS FOUND:
${topKeywords.join(', ')}

TASK: Identify 15-20 content gaps - topics this business SHOULD cover but doesn't.
For each gap, consider:
1. What the target audience would search for
2. What competitors likely cover
3. What would support the business's conversion goals

Return JSON array:
[
  {
    "topic": "specific topic title",
    "reason": "why this gap exists and why it matters",
    "opportunityScore": 0-100,
    "suggestedKeywords": ["keyword1", "keyword2"],
    "targetIntent": "buy|compare|learn|trust",
    "relatedService": "service name or null",
    "relatedLocation": "location or null"
  }
]

Focus on:
- Missing service pages for locations
- FAQ content for common objections
- Comparison pages (vs competitors, vs alternatives)
- Process/how-it-works content
- Trust-building content (case studies, testimonials pages)
- Educational guides that support purchase decisions
- Pricing/cost transparency content`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      console.error('[Research] OpenAI API error:', response.status);
      return analyzeGapsHeuristically(pages, keywords, business);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ContentGapSuggestion[];
      console.log(`[Research] AI identified ${parsed.length} content gaps`);
      return parsed;
    }
  } catch (error) {
    console.error('[Research] AI gap analysis failed:', error);
  }

  return analyzeGapsHeuristically(pages, keywords, business);
}

/**
 * Heuristic gap analysis when AI is not available
 */
function analyzeGapsHeuristically(
  pages: ScrapedPage[],
  keywords: ExtractedKeyword[],
  business: ResearchBusinessContext
): ContentGapSuggestion[] {
  const gaps: ContentGapSuggestion[] = [];
  const existingTitles = pages.map(p => (p.title || '').toLowerCase());
  const existingH1s = pages.map(p => (p.h1 || '').toLowerCase());
  const allExisting = [...existingTitles, ...existingH1s];

  // Check for missing service + location combinations
  for (const service of business.coreServices) {
    const serviceLower = service.toLowerCase();
    
    for (const location of business.primaryLocations) {
      const locationLower = location.toLowerCase();
      const exists = allExisting.some(t => 
        t.includes(serviceLower) && t.includes(locationLower)
      );
      
      if (!exists) {
        gaps.push({
          topic: `${service} in ${location} - Local Expert Services`,
          reason: `No dedicated page for ${service} targeting ${location} customers`,
          opportunityScore: 85,
          suggestedKeywords: [
            `${service} ${location}`,
            `${location} ${service}`,
            `best ${service} ${location}`,
            `${service} near ${location}`,
          ],
          targetIntent: 'buy',
          relatedService: service,
          relatedLocation: location,
        });
      }
    }
  }

  // Check for missing FAQ pages per service
  for (const service of business.coreServices) {
    const serviceLower = service.toLowerCase();
    const hasFaq = allExisting.some(t => 
      (t.includes('faq') || t.includes('questions')) && t.includes(serviceLower)
    );
    
    if (!hasFaq) {
      gaps.push({
        topic: `${service} FAQ - Your Questions Answered`,
        reason: `No FAQ page to address common questions about ${service}`,
        opportunityScore: 75,
        suggestedKeywords: [
          `${service} questions`,
          `${service} faq`,
          `common ${service} questions`,
          `${service} help`,
        ],
        targetIntent: 'learn',
        relatedService: service,
        relatedLocation: null,
      });
    }
  }

  // Check for missing process/how-it-works
  const hasProcess = allExisting.some(t => 
    t.includes('process') || t.includes('how it works') || t.includes('how we work')
  );
  if (!hasProcess && business.coreServices.length > 0) {
    const primaryService = business.coreServices[0];
    gaps.push({
      topic: `How Our ${primaryService} Process Works - Step by Step`,
      reason: 'No process page to set customer expectations and build confidence',
      opportunityScore: 70,
      suggestedKeywords: [
        `${primaryService} process`,
        `how ${primaryService} works`,
        `${primaryService} steps`,
        `what to expect ${primaryService}`,
      ],
      targetIntent: 'trust',
      relatedService: primaryService,
      relatedLocation: null,
    });
  }

  // Check for missing pricing/cost content
  const hasPricing = allExisting.some(t => 
    t.includes('price') || t.includes('cost') || t.includes('rate') || 
    t.includes('investment') || t.includes('fee')
  );
  if (!hasPricing && business.coreServices.length > 0) {
    const primaryService = business.coreServices[0];
    gaps.push({
      topic: `${primaryService} Pricing - What to Expect in ${new Date().getFullYear()}`,
      reason: 'No pricing transparency content - a key decision factor for buyers',
      opportunityScore: 80,
      suggestedKeywords: [
        `${primaryService} cost`,
        `${primaryService} pricing`,
        `how much does ${primaryService} cost`,
        `${primaryService} rates`,
      ],
      targetIntent: 'buy',
      relatedService: primaryService,
      relatedLocation: null,
    });
  }

  // Check for missing testimonials/reviews page
  const hasTestimonials = allExisting.some(t => 
    t.includes('testimonial') || t.includes('review') || 
    t.includes('client stories') || t.includes('success stories')
  );
  if (!hasTestimonials) {
    gaps.push({
      topic: `${business.name} Reviews & Client Success Stories`,
      reason: 'No dedicated social proof page to build trust',
      opportunityScore: 75,
      suggestedKeywords: [
        `${business.name} reviews`,
        `${business.coreServices[0]} testimonials`,
        `${business.name} client stories`,
      ],
      targetIntent: 'trust',
      relatedService: null,
      relatedLocation: null,
    });
  }

  // Check for missing comparison content
  const hasComparison = allExisting.some(t => 
    t.includes(' vs ') || t.includes('compare') || 
    t.includes('difference') || t.includes('alternative')
  );
  if (!hasComparison && business.coreServices.length > 0) {
    const primaryService = business.coreServices[0];
    gaps.push({
      topic: `${primaryService} Options Compared: Which is Right for You?`,
      reason: 'No comparison content for buyers in the evaluation phase',
      opportunityScore: 65,
      suggestedKeywords: [
        `types of ${primaryService}`,
        `${primaryService} comparison`,
        `${primaryService} options`,
        `choosing ${primaryService}`,
      ],
      targetIntent: 'compare',
      relatedService: primaryService,
      relatedLocation: null,
    });
  }

  // Check for missing case studies
  const hasCaseStudies = allExisting.some(t => 
    t.includes('case study') || t.includes('case-study') || 
    t.includes('project') || t.includes('portfolio')
  );
  if (!hasCaseStudies && business.coreServices.length > 0) {
    const primaryService = business.coreServices[0];
    gaps.push({
      topic: `${primaryService} Case Study: Real Results for Real Clients`,
      reason: 'No case studies to demonstrate proven results',
      opportunityScore: 70,
      suggestedKeywords: [
        `${primaryService} case study`,
        `${primaryService} results`,
        `${primaryService} success`,
        `${primaryService} examples`,
      ],
      targetIntent: 'trust',
      relatedService: primaryService,
      relatedLocation: null,
    });
  }

  // Check for missing guide/educational content
  const hasGuides = allExisting.some(t => 
    t.includes('guide') || t.includes('ultimate') || 
    t.includes('complete') || t.includes('everything you need')
  );
  if (!hasGuides && business.coreServices.length > 0) {
    const primaryService = business.coreServices[0];
    gaps.push({
      topic: `The Complete ${primaryService} Guide for ${new Date().getFullYear()}`,
      reason: 'No comprehensive guide to establish authority and capture search traffic',
      opportunityScore: 72,
      suggestedKeywords: [
        `${primaryService} guide`,
        `complete ${primaryService} guide`,
        `${primaryService} ${new Date().getFullYear()}`,
        `${primaryService} tips`,
      ],
      targetIntent: 'learn',
      relatedService: primaryService,
      relatedLocation: null,
    });
  }

  // Check for missing "why choose us" content
  const hasWhyUs = allExisting.some(t => 
    t.includes('why choose') || t.includes('why us') || 
    t.includes('why work with') || t.includes('what makes us')
  );
  if (!hasWhyUs) {
    gaps.push({
      topic: `Why Choose ${business.name}? Our Difference`,
      reason: 'No page explaining unique value proposition',
      opportunityScore: 68,
      suggestedKeywords: [
        `why choose ${business.name}`,
        `${business.name} difference`,
        `best ${business.niche}`,
      ],
      targetIntent: 'trust',
      relatedService: null,
      relatedLocation: null,
    });
  }

  // Sort by opportunity score
  return gaps.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

// ============================================================================
// HEADING SUGGESTIONS
// ============================================================================

/**
 * Generate heading suggestions for identified gaps
 */
export function generateHeadingSuggestions(
  gaps: ContentGapSuggestion[],
  business: ResearchBusinessContext
): HeadingSuggestion[] {
  return gaps.slice(0, 15).map(gap => {
    const h2s = generateH2sForTopic(gap, business);
    
    return {
      h1: gap.topic,
      h2s,
      targetKeyword: gap.suggestedKeywords[0] || gap.topic,
      intent: gap.targetIntent,
      rationale: gap.reason,
    };
  });
}

function generateH2sForTopic(gap: ContentGapSuggestion, business: ResearchBusinessContext): string[] {
  const h2s: string[] = [];
  const service = gap.relatedService || business.coreServices[0] || 'our services';

  switch (gap.targetIntent) {
    case 'buy':
      h2s.push(
        `Why Choose ${business.name} for ${service}`,
        `Our ${service} Process`,
        `What's Included in Our ${service}`,
        `${service} Pricing & Packages`,
        `Ready to Get Started?`
      );
      break;
    case 'compare':
      h2s.push(
        `Understanding Your ${service} Options`,
        `Key Differences to Consider`,
        `Pros and Cons of Each Approach`,
        `Which ${service} Option is Right for You?`,
        `Making Your Decision`
      );
      break;
    case 'learn':
      h2s.push(
        `What You Need to Know About ${service}`,
        `Common Questions Answered`,
        `Step-by-Step Guide to ${service}`,
        `Tips from Our ${business.yearsActive || 10}+ Years of Experience`,
        `Next Steps`
      );
      break;
    case 'trust':
      h2s.push(
        `Our ${service} Track Record`,
        `What Clients Say About Us`,
        `Real Results We've Achieved`,
        `Why Clients Trust ${business.name}`,
        `Your Satisfaction Guarantee`
      );
      break;
  }

  // Add location-specific H2 if applicable
  if (gap.relatedLocation) {
    h2s.splice(1, 0, `${service} in ${gap.relatedLocation}`);
  }

  return h2s.slice(0, 6);
}

// ============================================================================
// MAIN RESEARCH FUNCTION
// ============================================================================

export interface ResearchOptions {
  maxPages?: number;
  excludePatterns?: RegExp[];
  openaiApiKey?: string;
  useJinaReader?: boolean;
}

/**
 * Run comprehensive research on a website
 * Returns structured data for the growth planner
 */
export async function runSiteResearch(
  siteUrl: string,
  business: ResearchBusinessContext,
  options: ResearchOptions = {}
): Promise<ResearchReport> {
  const { 
    maxPages = 50, 
    excludePatterns = [], 
    openaiApiKey,
    useJinaReader = true 
  } = options;

  console.log(`[Research] Starting research for ${siteUrl}`);
  const startTime = Date.now();

  // 1. Discover pages
  console.log('[Research] Phase 1: Discovering pages...');
  let urls: string[];
  try {
    urls = await discoverPages(siteUrl, maxPages, 3, excludePatterns);
    console.log(`[Research] Found ${urls.length} pages`);
  } catch (error) {
    console.error('[Research] Page discovery failed:', error);
    urls = [siteUrl]; // Fallback to just the homepage
  }

  // 2. Scrape each page
  console.log('[Research] Phase 2: Scraping pages...');
  const pages: ScrapedPage[] = [];
  for (const url of urls) {
    try {
      const page = await scrapePage(url, { useJinaReader });
      pages.push(page);
      console.log(`[Research] Scraped: ${url} (${page.wordCount} words)`);
    } catch (error) {
      console.error(`[Research] Failed to scrape ${url}:`, error);
    }
    // Rate limiting
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`[Research] Successfully scraped ${pages.length} pages`);

  // 3. Classify pages by role
  const pagesByRole = {
    money: 0,
    trust: 0,
    authority: 0,
    support: 0,
    operational: 0,
    unknown: 0,
  };
  for (const page of pages) {
    const role = classifyPageRole(page.url, page);
    pagesByRole[role]++;
  }
  console.log(`[Research] Pages by role:`, pagesByRole);

  // 4. Extract keywords
  console.log('[Research] Phase 3: Extracting keywords...');
  const keywords = extractKeywords(pages);
  console.log(`[Research] Extracted ${keywords.length} unique keywords`);

  // 5. Build topic clusters
  console.log('[Research] Phase 4: Building topic clusters...');
  const topicClusters = buildTopicClusters(pages, keywords, business);
  console.log(`[Research] Built ${topicClusters.length} topic clusters`);

  // 6. Analyze content gaps
  console.log('[Research] Phase 5: Analyzing content gaps...');
  const contentGaps = await analyzeContentGaps(pages, keywords, business, openaiApiKey);
  console.log(`[Research] Identified ${contentGaps.length} content gaps`);

  // 7. Generate heading suggestions
  console.log('[Research] Phase 6: Generating heading suggestions...');
  const headingSuggestions = generateHeadingSuggestions(contentGaps, business);

  // 8. Identify quality issues
  const thinContentPages = pages
    .filter(p => p.wordCount < 300)
    .map(p => p.url);

  const orphanedPages = pages
    .filter(p => {
      const incomingLinks = pages.filter(other => 
        other.internalLinks.includes(p.url)
      ).length;
      return incomingLinks === 0 && !p.url.endsWith('/');
    })
    .map(p => p.url);

  // Find duplicate topics
  const topicMap = new Map<string, string[]>();
  for (const page of pages) {
    const topic = (page.h1 || page.title || '').toLowerCase().trim();
    if (topic && topic.length > 10) {
      const existing = topicMap.get(topic) || [];
      existing.push(page.url);
      topicMap.set(topic, existing);
    }
  }
  const duplicateTopics = Array.from(topicMap.entries())
    .filter(([, urls]) => urls.length > 1)
    .map(([topic, pages]) => ({ topic, pages }));

  const duration = Date.now() - startTime;
  console.log(`[Research] Complete in ${Math.round(duration / 1000)}s`);

  return {
    siteUrl,
    analyzedAt: new Date().toISOString(),
    totalPages: pages.length,
    pagesByRole,
    keywords,
    topicClusters,
    contentGaps,
    headingSuggestions,
    thinContentPages,
    orphanedPages,
    duplicateTopics,
  };
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Convert research gaps to growth planner PageGap format
 */
export function researchGapsToPageGaps(
  gaps: ContentGapSuggestion[]
): Array<{
  path: null;
  existingTitle: null;
  action: 'create';
  reason: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  targetRole: PageRole;
  targetService: string | null;
  targetLocation: string | null;
  blocksConversion: boolean;
  suggestedTitle: string;
}> {
  return gaps.map(gap => ({
    path: null,
    existingTitle: null,
    action: 'create' as const,
    reason: gap.reason,
    priority: gap.opportunityScore >= 80 ? 'critical' as const : 
              gap.opportunityScore >= 70 ? 'high' as const : 
              gap.opportunityScore >= 50 ? 'medium' as const : 'low' as const,
    targetRole: intentToRole(gap.targetIntent),
    targetService: gap.relatedService,
    targetLocation: gap.relatedLocation,
    blocksConversion: gap.targetIntent === 'buy' && gap.opportunityScore >= 80,
    suggestedTitle: gap.topic,
  }));
}

function intentToRole(intent: 'buy' | 'compare' | 'learn' | 'trust'): PageRole {
  switch (intent) {
    case 'buy': return 'money';
    case 'trust': return 'trust';
    case 'compare': return 'authority';
    case 'learn': return 'support';
  }
}
