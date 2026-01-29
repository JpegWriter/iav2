/**
 * Full Site Scan Test - Excluding Blog Pages
 * 
 * This script:
 * 1. Scans all pages on newagefotografie.com EXCEPT blog pages
 * 2. Saves to Supabase
 * 3. Exports to external backend API
 * 
 * Usage: node test-full-scan.mjs
 */

const SUPABASE_URL = 'https://nlwsmcndqxnmnhxszbtc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sd3NtY25kcXhubW5oeHN6YnRjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTI0ODA4MSwiZXhwIjoyMDg0ODI0MDgxfQ.i6_bdIwmysolQzeD6AAubUc5zi6cdyfoGDgF-iHmIWE';
const PROJECT_ID = '9c45156a-1506-42e4-a1e2-a9aabd449ea7';

const SITE_URL = 'https://www.newagefotografie.com/';

// Patterns to EXCLUDE from scanning (these URLs will be skipped)
const EXCLUDE_PATTERNS = [
  /\/blog/i,        // Skip blog section
  /\/news/i,        // Skip news section if any
  /\/tag\//i,       // Skip tag pages
  /\/category\//i,  // Skip category pages
  /\/author\//i,    // Skip author pages
  /\?/,             // Skip URLs with query params
  /#/,              // Skip anchor links
];

const MAX_PAGES = 21;  // Max pages to scan (Jina free tier limit)
const MAX_DEPTH = 2;   // How deep to crawl (reduced to prioritize top-level pages)

// ============ Jina Reader Scraper ============

async function scrapeWithJina(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  
  const response = await fetch(jinaUrl, {
    headers: {
      'Accept': 'application/json',
      'X-Return-Format': 'markdown',
    },
  });

  if (!response.ok) {
    throw new Error(`Jina failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    title: data.data?.title || '',
    content: data.data?.content || '',
    description: data.data?.description || '',
  };
}

function extractH1(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : '';
}

function extractLinks(content, baseUrl) {
  const links = new Set();
  // Match markdown links: [text](url)
  const regex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    let url = match[2];
    
    // Skip non-http links
    if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
      continue;
    }
    
    // Convert relative to absolute
    try {
      const fullUrl = new URL(url, baseUrl).href;
      
      // Only keep same-domain links
      const base = new URL(baseUrl);
      const link = new URL(fullUrl);
      
      if (link.hostname === base.hostname) {
        // Remove hash and trailing slash, normalize
        link.hash = '';
        let cleanUrl = link.href.replace(/\/$/, '');
        links.add(cleanUrl);
      }
    } catch (e) {
      // Invalid URL, skip
    }
  }
  
  return Array.from(links);
}

function shouldExclude(url, patterns) {
  return patterns.some(pattern => pattern.test(url));
}

function classifyRole(url, title, content) {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  const lowerContent = (content || '').toLowerCase().slice(0, 1000);
  
  // Trust signals
  const trustPatterns = [
    /about|über|team|contact|kontakt|impress|datenschutz|privacy|agb|terms/
  ];
  if (trustPatterns.some(p => p.test(lowerUrl) || p.test(lowerTitle))) {
    return 'trust';
  }
  
  // Support signals (blog, FAQ, resources)
  const supportPatterns = [
    /blog|faq|help|support|guide|news|artikel|beitrag/
  ];
  if (supportPatterns.some(p => p.test(lowerUrl) || p.test(lowerTitle))) {
    return 'support';
  }
  
  // Default to money page (service/product pages)
  return 'money';
}

function calculatePriority(url, wordCount, role) {
  let score = 0;
  
  // Homepage gets highest priority
  if (url.replace(/\/$/, '').split('/').length <= 3) {
    score += 100;
  }
  
  // Money pages are priority
  if (role === 'money') score += 50;
  if (role === 'trust') score += 30;
  if (role === 'support') score += 10;
  
  // More content = more important
  score += Math.min(wordCount / 10, 50);
  
  return score;
}

// ============ Main Crawler ============

async function crawlSite() {
  console.log('\n🚀 Starting full site scan...');
  console.log(`📍 Site: ${SITE_URL}`);
  console.log(`🚫 Excluding patterns: ${EXCLUDE_PATTERNS.map(p => p.source).join(', ')}`);
  console.log(`📄 Max pages: ${MAX_PAGES}`);
  console.log(`📊 Max depth: ${MAX_DEPTH}\n`);

  const visited = new Set();
  const toVisit = [{ url: SITE_URL.replace(/\/$/, ''), depth: 0 }];
  const results = [];
  
  while (toVisit.length > 0 && visited.size < MAX_PAGES) {
    const { url, depth } = toVisit.shift();
    
    // Skip if already visited
    if (visited.has(url)) continue;
    visited.add(url);
    
    // Skip if matches exclusion pattern
    if (shouldExclude(url, EXCLUDE_PATTERNS)) {
      console.log(`⏭️  Skipping (excluded): ${url}`);
      continue;
    }
    
    console.log(`🔍 [${visited.size}/${MAX_PAGES}] Scraping: ${url}`);
    
    try {
      const data = await scrapeWithJina(url);
      const wordCount = data.content.split(/\s+/).filter(Boolean).length;
      const h1 = extractH1(data.content);
      const role = classifyRole(url, data.title, data.content);
      const priority = calculatePriority(url, wordCount, role);
      
      const pageData = {
        url: url,
        path: new URL(url).pathname,
        title: data.title,
        h1: h1,
        meta_description: data.description,
        cleaned_text: data.content,
        word_count: wordCount,
        role: role,
        priority_score: Math.round(priority),  // Must be integer
        crawled_at: new Date().toISOString(),
      };
      
      results.push(pageData);
      console.log(`   ✅ ${data.title} | ${wordCount} words | ${role}`);
      
      // Discover new links if we haven't hit max depth
      if (depth < MAX_DEPTH) {
        const links = extractLinks(data.content, url);
        for (const link of links) {
          if (!visited.has(link) && !shouldExclude(link, EXCLUDE_PATTERNS)) {
            toVisit.push({ url: link, depth: depth + 1 });
          }
        }
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  // Sort by priority and assign ranks
  results.sort((a, b) => b.priority_score - a.priority_score);
  results.forEach((page, idx) => {
    page.priority_rank = idx + 1;
  });
  
  return results;
}

// ============ Save to Supabase ============

async function saveToSupabase(pages) {
  console.log('\n💾 Saving to Supabase...');
  
  for (const page of pages) {
    const pageWithProject = {
      project_id: PROJECT_ID,
      ...page,
    };
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/pages`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(pageWithProject),
    });
    
    if (response.ok) {
      console.log(`   ✅ Saved: ${page.url}`);
    } else {
      const err = await response.text();
      console.log(`   ❌ Error saving ${page.url}: ${err}`);
    }
  }
}

// ============ SmartTog Hub Sync ============

const SMARTTOG_HUB_URL = 'https://smarttog-hub-1.onrender.com';
const IA_USER_ID = 'sitefix_naf'; // Your IA user ID

function mapRoleToPageType(role) {
  // Map our roles to IA pageType
  switch (role) {
    case 'money': return 'service';
    case 'trust': return 'about';
    case 'support': return 'blog';
    default: return 'other';
  }
}

function extractH2sFromContent(content) {
  // Extract H2 headings from markdown content
  const h2Regex = /^##\s+(.+)$/gm;
  const h2s = [];
  let match;
  while ((match = h2Regex.exec(content)) !== null) {
    h2s.push(match[1]);
  }
  return h2s;
}

async function syncToSmartTogHub(pages) {
  console.log('\n📤 Syncing to SmartTog Hub...');
  console.log(`   URL: ${SMARTTOG_HUB_URL}/api/ia-sync/sync`);
  
  // Build contentInventory from scraped pages
  const contentInventory = pages.map(p => ({
    url: p.url,
    title: p.title,
    h1: p.h1 || p.title,
    h2s: extractH2sFromContent(p.cleaned_text),
    metaDescription: p.meta_description,
    keywords: [], // Could extract from content later
    wordCount: p.word_count,
    pageType: mapRoleToPageType(p.role),
    isOrphan: false,
    isCannibal: false,
    needsRefresh: p.word_count < 300, // Thin content flag
    seoScore: Math.min(100, Math.round(p.priority_score)),
  }));
  
  // Build sitemapPages
  const sitemapPages = pages.map(p => ({
    url: p.url,
    title: p.title,
    lastModified: p.crawled_at.split('T')[0],
    priority: p.priority_rank <= 5 ? 1.0 : p.priority_rank <= 15 ? 0.8 : 0.6,
    changefreq: p.role === 'money' ? 'weekly' : 'monthly',
  }));
  
  // Build the sync payload
  const syncPayload = {
    syncId: `sync_sitefix_${Date.now()}`,
    userId: IA_USER_ID,
    syncedAt: new Date().toISOString(),
    version: '1.0',
    
    // Profile info
    profile: {
      userId: IA_USER_ID,
      niche: 'photography',
      businessName: 'New Age Fotografie',
      location: {
        city: 'Vienna',
        region: 'Vienna',
        country: 'Austria',
        countryCode: 'AT',
      },
      website: SITE_URL,
      services: ['family-photography', 'baby-photography', 'business-portraits'],
    },
    
    // Beads (business identity)
    beads: {
      business_name: 'New Age Fotografie',
      primary_city_or_regions: ['Vienna', 'Wien'],
      country_of_operation: 'Austria',
      specializations: ['Family Photography', 'Newborn Photography', 'Business Portraits'],
      target_audience: {
        demographics: 'Families and businesses in Vienna',
        psychographics: 'Value professional, high-quality photography',
      },
      unique_differentiators: ['Studio & Outdoor options', 'German-speaking', 'Gift vouchers available'],
      portfolio_highlights: [],
      testimonials: [],
      services_offered: [
        { name: 'Familienfotos', description: 'Family photography sessions', priceRange: 'Contact for pricing' },
        { name: 'Babyfotos', description: 'Baby photography (3-12 months)', priceRange: 'Contact for pricing' },
        { name: 'Business Portraits', description: 'Professional headshots', priceRange: 'Contact for pricing' },
      ],
    },
    
    // Content Blueprint
    contentBlueprint: {
      id: `bp_${PROJECT_ID}`,
      websiteUrl: SITE_URL,
      locale: 'de-AT',
      niche: 'photography',
      totalPages: pages.length,
      matchedPages: pages.length,
      seoHealthScore: 72,
      overallScore: 68,
      summary: {
        totalPages: pages.length,
        blogPosts: pages.filter(p => p.role === 'support').length,
        servicePages: pages.filter(p => p.role === 'money').length,
        portfolioPages: pages.filter(p => p.url.includes('gallery')).length,
        utilityPages: pages.filter(p => p.role === 'trust').length,
      },
      clusters: [],
      gaps: [],
      redirects: [],
      seoHealth: {
        missingTitles: pages.filter(p => !p.title || p.title.length < 10).length,
        missingDescriptions: pages.filter(p => !p.meta_description).length,
        thinContent: pages.filter(p => p.word_count < 300).length,
        brokenLinks: 0,
      },
      priorityActions: [
        { action: 'Add meta descriptions to pages missing them', impact: 'high', effort: 'low' },
        { action: 'Expand thin content pages', impact: 'medium', effort: 'medium' },
      ],
      status: 'completed',
      generatedAt: new Date().toISOString(),
    },
    
    // Sitemap pages
    sitemapPages: sitemapPages,
    
    // Content inventory (the main data!)
    contentInventory: contentInventory,
  };
  
  try {
    const response = await fetch(`${SMARTTOG_HUB_URL}/api/ia-sync/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(syncPayload),
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('   ✅ Sync successful!');
      console.log(`   📊 Sync ID: ${result.syncId}`);
      console.log(`   👤 Hub User ID: ${result.hubUserId}`);
      console.log(`   📄 Sections synced: ${result.sectionsIncluded?.join(', ')}`);
      return result;
    } else {
      const errorText = await response.text();
      console.log(`   ❌ Sync failed: ${response.status}`);
      console.log(`   ${errorText}`);
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Sync error: ${error.message}`);
    return null;
  }
}

// Legacy export function (for custom webhooks)
async function exportToBackend(pages, webhookUrl, apiKey) {
  if (!webhookUrl) {
    console.log('\n📤 No webhook URL provided, skipping export');
    return null;
  }
  
  console.log(`\n📤 Exporting to: ${webhookUrl}`);
  
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    source: 'sitefix-planner',
    project: {
      id: PROJECT_ID,
      name: 'New Age Fotografie',
      rootUrl: SITE_URL,
    },
    summary: {
      totalPages: pages.length,
      totalWords: pages.reduce((sum, p) => sum + p.word_count, 0),
      pagesByRole: {
        money: pages.filter(p => p.role === 'money').length,
        trust: pages.filter(p => p.role === 'trust').length,
        support: pages.filter(p => p.role === 'support').length,
      },
    },
    pages: pages.map(p => ({
      url: p.url,
      path: p.path,
      title: p.title,
      h1: p.h1,
      metaDescription: p.meta_description,
      wordCount: p.word_count,
      role: p.role,
      priorityRank: p.priority_rank,
      cleanedText: p.cleaned_text,
      crawledAt: p.crawled_at,
    })),
  };
  
  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(exportPayload),
    });
    
    if (response.ok) {
      console.log('   ✅ Export successful!');
      return await response.json().catch(() => ({ success: true }));
    } else {
      console.log(`   ❌ Export failed: ${response.status}`);
      console.log(await response.text());
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Export error: ${error.message}`);
    return null;
  }
}

// ============ Main ============

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('           SITEFIX PLANNER - FULL SITE SCAN');
  console.log('═══════════════════════════════════════════════════════════');
  
  // 1. Crawl the site
  const pages = await crawlSite();
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    SCAN RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total pages scanned: ${pages.length}`);
  console.log(`Total words: ${pages.reduce((sum, p) => sum + p.word_count, 0)}`);
  console.log(`Money pages: ${pages.filter(p => p.role === 'money').length}`);
  console.log(`Trust pages: ${pages.filter(p => p.role === 'trust').length}`);
  console.log(`Support pages: ${pages.filter(p => p.role === 'support').length}`);
  
  console.log('\n📊 Pages by priority:');
  pages.forEach((p, i) => {
    console.log(`   ${i + 1}. [${p.role}] ${p.title} (${p.word_count} words)`);
  });
  
  // 2. Save to Supabase
  await saveToSupabase(pages);
  
  // 3. Sync to SmartTog Hub
  await syncToSmartTogHub(pages);
  
  // 4. Export to custom backend (optional - uncomment if needed)
  // await exportToBackend(pages, 'https://your-backend.com/api/seo-import', 'your-api-key');
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    ✅ COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n💡 Data synced to SmartTog Hub!');
  console.log(`   Check status: ${SMARTTOG_HUB_URL}/api/ia-sync/status/${IA_USER_ID}\n`);
}

main().catch(console.error);
