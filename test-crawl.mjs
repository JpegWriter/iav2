// Full Crawl Smoke Test
// Run with: node test-crawl.mjs

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const SUPABASE_URL = 'https://nlwsmcndqxnmnhxszbtc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sd3NtY25kcXhubW5oeHN6YnRjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTI0ODA4MSwiZXhwIjoyMDg0ODI0MDgxfQ.i6_bdIwmysolQzeD6AAubUc5zi6cdyfoGDgF-iHmIWE';
const PROJECT_ID = '9c45156a-1506-42e4-a1e2-a9aabd449ea7';
const ROOT_URL = 'https://www.newagefotografie.com/';
const JINA_READER_URL = 'https://r.jina.ai/';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function scrapeWithJina(url) {
  console.log(`  Scraping: ${url}`);
  try {
    const jinaUrl = `${JINA_READER_URL}${url}`;
    const response = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(60000),
    });
    
    if (!response.ok) throw new Error(`Jina failed: ${response.status}`);
    
    const markdown = await response.text();
    
    // Extract metadata
    const titleMatch = markdown.match(/^Title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : null;
    
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    const h1 = h1Match ? h1Match[1].trim() : null;
    
    const cleanText = markdown.replace(/\[.*?\]\(.*?\)/g, '').replace(/[#*`_~]/g, '');
    const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
    const textHash = createHash('md5').update(cleanText).digest('hex');
    
    // Extract internal links
    const baseHost = new URL(url).hostname;
    const linkMatches = markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    const internalLinks = [];
    for (const match of linkMatches) {
      try {
        const linkUrl = new URL(match[2], url);
        if (linkUrl.hostname === baseHost) internalLinks.push(linkUrl.href);
      } catch {}
    }
    
    return {
      url,
      statusCode: 200,
      title,
      h1,
      wordCount,
      textHash,
      cleanedText: cleanText.slice(0, 50000),
      internalLinks: [...new Set(internalLinks)],
    };
  } catch (err) {
    return { url, statusCode: 0, error: err.message, wordCount: 0, internalLinks: [] };
  }
}

function classifyPageRole(url) {
  const lower = url.toLowerCase();
  if (lower.includes('preise') || lower.includes('service') || lower.includes('angebot') || 
      lower.includes('voucher') || lower.includes('paket')) return 'money';
  if (lower.includes('ueber') || lower.includes('about') || lower.includes('team') ||
      lower.includes('review') || lower.includes('kunden')) return 'trust';
  if (lower.includes('blog') || lower.includes('faq') || lower.includes('hilfe')) return 'support';
  if (lower === ROOT_URL || lower === ROOT_URL.slice(0,-1)) return 'money';
  return 'support';
}

async function runCrawl() {
  console.log('='.repeat(60));
  console.log('FULL CRAWL SMOKE TEST');
  console.log('Project:', PROJECT_ID);
  console.log('Target:', ROOT_URL);
  console.log('='.repeat(60));
  
  // Create crawl run
  const crawlRunId = crypto.randomUUID();
  await supabase.from('crawl_runs').insert({
    id: crawlRunId,
    project_id: PROJECT_ID,
    status: 'running',
    started_at: new Date().toISOString(),
  });
  console.log('\n✓ Created crawl run:', crawlRunId);
  
  // Update project status
  await supabase.from('projects').update({ status: 'crawling' }).eq('id', PROJECT_ID);
  
  // Discover pages (simplified - just use homepage + links from it)
  console.log('\n--- DISCOVERING PAGES ---');
  const homepage = await scrapeWithJina(ROOT_URL);
  const pagesToScrape = [ROOT_URL, ...homepage.internalLinks.slice(0, 9)]; // Max 10 pages
  console.log(`✓ Found ${pagesToScrape.length} pages to scrape`);
  
  // Scrape each page
  console.log('\n--- SCRAPING PAGES ---');
  const results = [];
  for (let i = 0; i < pagesToScrape.length; i++) {
    const pageData = await scrapeWithJina(pagesToScrape[i]);
    results.push(pageData);
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }
  
  // Store pages in database
  console.log('\n--- SAVING TO DATABASE ---');
  for (let i = 0; i < results.length; i++) {
    const page = results[i];
    if (page.error) {
      console.log(`  ✗ Skipping ${page.url}: ${page.error}`);
      continue;
    }
    
    const role = classifyPageRole(page.url);
    const priorityScore = role === 'money' ? 90 : role === 'trust' ? 70 : 50;
    
    const pageId = crypto.randomUUID();
    const { error } = await supabase.from('pages').upsert({
      id: pageId,
      project_id: PROJECT_ID,
      url: page.url,
      path: new URL(page.url).pathname,
      status_code: page.statusCode,
      title: page.title,
      h1: page.h1,
      word_count: page.wordCount,
      text_hash: page.textHash,
      cleaned_text: page.cleanedText,
      role,
      priority_score: priorityScore,
      priority_rank: i + 1,
      internal_links_out: page.internalLinks.length,
      crawled_at: new Date().toISOString(),
    }, { onConflict: 'project_id,url' });
    
    if (error) console.log(`  ✗ DB Error for ${page.url}:`, error.message);
    else console.log(`  ✓ Saved: ${page.title || page.url}`);
  }
  
  // Update crawl run
  const successCount = results.filter(p => !p.error).length;
  await supabase.from('crawl_runs').update({
    status: 'completed',
    ended_at: new Date().toISOString(),
    pages_found: results.length,
    pages_crawled: successCount,
  }).eq('id', crawlRunId);
  
  // Update project status
  await supabase.from('projects').update({ status: 'ready' }).eq('id', PROJECT_ID);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('CRAWL COMPLETE');
  console.log('='.repeat(60));
  console.log('Pages Attempted:', results.length);
  console.log('Pages Saved:', successCount);
  console.log('Total Words:', results.reduce((sum, p) => sum + p.wordCount, 0));
  
  // Verify data in dashboard
  const { data: pages } = await supabase
    .from('pages')
    .select('id, url, title, word_count, role, priority_rank')
    .eq('project_id', PROJECT_ID)
    .order('priority_rank');
  
  console.log('\n--- PAGES NOW IN DATABASE ---');
  pages?.forEach((p, i) => {
    console.log(`  ${p.priority_rank}. [${p.role}] ${p.title || p.url}`);
    console.log(`     Words: ${p.word_count}`);
  });
  
  console.log('\n✓ SMOKE TEST COMPLETE - Check dashboard at http://localhost:3000/app/' + PROJECT_ID);
}

runCrawl().catch(console.error);
