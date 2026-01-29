/**
 * Direct Crawl Test - BBC.com
 * Bypasses the server and directly calls the scraper + saves to Supabase
 */

import { createHash } from 'crypto';

const SUPABASE_URL = 'https://nlwsmcndqxnmnhxszbtc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sd3NtY25kcXhubW5oeHN6YnRjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTI0ODA4MSwiZXhwIjoyMDg0ODI0MDgxfQ.i6_bdIwmysolQzeD6AAubUc5zi6cdyfoGDgF-iHmIWE';
const PROJECT_ID = '9c45156a-1506-42e4-a1e2-a9aabd449ea7';

const SITE_URL = 'https://www.bbc.com/';
const MAX_PAGES = 15;
const MAX_DEPTH = 2;

const DEFAULT_USER_AGENT = 'SiteFixBot/1.0';

// Discover pages
async function discoverPages(startUrl, maxPages, maxDepth) {
  console.log(`\n🔍 Discovering pages from ${startUrl}...`);
  const discovered = new Set();
  const queue = [{ url: startUrl, depth: 0 }];
  const baseHost = new URL(startUrl).hostname;

  while (queue.length > 0 && discovered.size < maxPages) {
    const { url, depth } = queue.shift();
    
    if (discovered.has(url) || depth > maxDepth) continue;
    discovered.add(url);
    console.log(`  📄 [${discovered.size}/${maxPages}] ${url}`);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': DEFAULT_USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) continue;
      
      const html = await response.text();
      const linkRegex = /href=["']([^"']+)["']/g;
      let match;
      
      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

        try {
          const absoluteUrl = new URL(href, url);
          if (absoluteUrl.hostname === baseHost && 
              !absoluteUrl.pathname.match(/\.(pdf|jpg|png|gif|css|js|zip)$/i)) {
            const normalizedUrl = `${absoluteUrl.origin}${absoluteUrl.pathname}`.replace(/\/$/, '');
            if (!discovered.has(normalizedUrl)) {
              queue.push({ url: normalizedUrl, depth: depth + 1 });
            }
          }
        } catch {}
      }
    } catch (error) {
      console.log(`    ⚠️ Error: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  return Array.from(discovered);
}

// Scrape with Jina Reader
async function scrapeWithJina(url) {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    
    const response = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`Jina failed: ${response.status}`);
    }

    const markdownContent = await response.text();
    
    const lines = markdownContent.split('\n');
    let title = null;
    let h1 = null;
    const h2s = [];

    for (const line of lines) {
      if (line.startsWith('# ') && !h1) {
        h1 = line.slice(2).trim();
      } else if (line.startsWith('## ')) {
        h2s.push(line.slice(3).trim());
      } else if (line.startsWith('Title: ')) {
        title = line.slice(7).trim();
      }
    }

    const cleanedText = markdownContent
      .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/[#*_`]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
    const textHash = createHash('md5').update(cleanedText).digest('hex');

    // Extract internal links
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    const internalLinks = [];
    const baseHost = new URL(url).hostname;
    let match;

    while ((match = linkRegex.exec(markdownContent)) !== null) {
      try {
        const absoluteUrl = new URL(match[2], url).toString();
        if (new URL(absoluteUrl).hostname === baseHost) {
          internalLinks.push(absoluteUrl);
        }
      } catch {}
    }

    return {
      url,
      statusCode: 200,
      title: title || h1,
      h1,
      wordCount,
      textHash,
      cleanedText,
      internalLinks: [...new Set(internalLinks)],
      error: null
    };
  } catch (error) {
    return {
      url,
      statusCode: 0,
      title: null,
      h1: null,
      wordCount: 0,
      textHash: '',
      cleanedText: '',
      internalLinks: [],
      error: error.message
    };
  }
}

// Classify page role
function classifyPageRole(url, content) {
  const path = new URL(url).pathname.toLowerCase();
  const text = ((content.cleanedText || '') + ' ' + (content.title || '')).toLowerCase();

  const moneyPatterns = [/\/(services?|pricing|products?|shop|buy|order|book)/];
  if (moneyPatterns.some(p => p.test(path))) return 'money';

  const trustPatterns = [/\/(about|team|testimonials?|reviews?|case-stud)/];
  if (trustPatterns.some(p => p.test(path))) return 'trust';

  return 'support';
}

// Calculate priority score
function calculatePriorityScore(page, role) {
  let score = 0;
  if (role === 'money') score += 100;
  else if (role === 'trust') score += 50;
  else score += 20;

  if (page.wordCount > 500) score += 20;
  if (page.wordCount > 1000) score += 10;
  if (page.h1) score += 10;
  score += Math.min((page.internalLinks || []).length, 20);

  return Math.round(score);
}

// Save to Supabase
async function savePage(pageData) {
  const role = classifyPageRole(pageData.url, pageData);
  const priorityScore = calculatePriorityScore(pageData, role);
  
  const pageId = crypto.randomUUID();
  
  const body = {
    id: pageId,
    project_id: PROJECT_ID,
    url: pageData.url,
    path: new URL(pageData.url).pathname,
    status_code: pageData.statusCode,
    title: pageData.title,
    h1: pageData.h1,
    word_count: pageData.wordCount,
    text_hash: pageData.textHash,
    cleaned_text: (pageData.cleanedText || '').slice(0, 100000),
    role: role,
    priority_score: priorityScore,
    internal_links_out: (pageData.internalLinks || []).length,
    crawled_at: new Date().toISOString(),
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/pages`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Save failed: ${response.status} - ${text}`);
  }

  return pageId;
}

// Main
async function main() {
  console.log('=== BBC.COM CRAWL TEST ===\n');
  
  // Step 1: Discover pages
  const pages = await discoverPages(SITE_URL, MAX_PAGES, MAX_DEPTH);
  console.log(`\n✅ Found ${pages.length} pages.\n`);
  
  // Step 2: Scrape and save each page
  console.log('🚀 Scraping and saving pages...\n');
  let saved = 0;
  let failed = 0;
  
  for (let i = 0; i < pages.length; i++) {
    const url = pages[i];
    console.log(`[${i+1}/${pages.length}] ${url}`);
    
    const pageData = await scrapeWithJina(url);
    
    if (pageData.error) {
      console.log(`  ❌ Scrape error: ${pageData.error}`);
      failed++;
      continue;
    }
    
    console.log(`  📝 Got ${pageData.wordCount} words: "${pageData.title?.slice(0, 50)}..."`);
    
    try {
      await savePage(pageData);
      console.log(`  ✅ Saved to Supabase`);
      saved++;
    } catch (error) {
      console.log(`  ❌ Save error: ${error.message}`);
      failed++;
    }
    
    await new Promise(r => setTimeout(r, 1000)); // Rate limit
  }
  
  // Step 3: Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total discovered: ${pages.length}`);
  console.log(`Successfully saved: ${saved}`);
  console.log(`Failed: ${failed}`);
  
  // Verify saved pages
  const verifyResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/pages?project_id=eq.${PROJECT_ID}&select=id,url,title,word_count`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  
  const savedPages = await verifyResponse.json();
  console.log(`\n📊 Pages in database: ${savedPages.length}`);
  savedPages.forEach((p, i) => {
    console.log(`  ${i+1}. ${p.title?.slice(0, 50) || 'No title'} (${p.word_count} words)`);
  });
}

main().catch(console.error);
