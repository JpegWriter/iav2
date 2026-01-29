/**
 * Test the scraper directly without needing the server running
 */

import { createHash } from 'crypto';

const SITE_URL = 'https://www.bbc.com/';
const MAX_PAGES = 10;  // Test 10 pages
const MAX_DEPTH = 2;

const DEFAULT_USER_AGENT = 'SiteFixBot/1.0 (+https://sitefix.io/bot)';

// Test Jina Reader scraping
async function scrapeWithJina(url) {
  console.log(`  Scraping ${url} with Jina...`);
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`Jina Reader failed: ${response.status}`);
    }

    const markdownContent = await response.text();
    
    // Parse the markdown to extract metadata
    const lines = markdownContent.split('\n');
    let title = null;
    let h1 = null;

    for (const line of lines) {
      if (line.startsWith('# ') && !h1) {
        h1 = line.slice(2).trim();
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

    console.log(`    ✓ Got ${wordCount} words, title: ${title || h1 || 'Unknown'}`);
    
    return {
      url,
      statusCode: 200,
      title: title || h1,
      h1,
      wordCount,
      cleanedText: cleanedText.slice(0, 5000),
      error: null
    };
  } catch (error) {
    console.log(`    ✗ Error: ${error.message}`);
    return {
      url,
      statusCode: 0,
      title: null,
      h1: null,
      wordCount: 0,
      cleanedText: '',
      error: error.message
    };
  }
}

// Discover pages using Cheerio
async function discoverPages(startUrl, maxPages, maxDepth) {
  console.log(`\nDiscovering pages from ${startUrl}...`);
  const discovered = new Set();
  const queue = [{ url: startUrl, depth: 0 }];
  const baseHost = new URL(startUrl).hostname;

  while (queue.length > 0 && discovered.size < maxPages) {
    const { url, depth } = queue.shift();
    
    if (discovered.has(url) || depth > maxDepth) continue;
    discovered.add(url);
    console.log(`  Discovered: ${url} (depth ${depth})`);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': DEFAULT_USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) continue;
      
      const html = await response.text();
      
      // Simple regex-based link extraction
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
        } catch {
          // Invalid URL
        }
      }
    } catch (error) {
      console.log(`    Error fetching ${url}: ${error.message}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  return Array.from(discovered);
}

// Main test
async function main() {
  console.log('=== SCRAPER DIRECT TEST ===\n');
  
  // Step 1: Discover pages
  const pages = await discoverPages(SITE_URL, MAX_PAGES, MAX_DEPTH);
  console.log(`\nFound ${pages.length} pages to scrape.\n`);
  
  // Step 2: Scrape each page
  console.log('Scraping each page with Jina Reader...\n');
  const results = [];
  
  for (const url of pages) {
    const result = await scrapeWithJina(url);
    results.push(result);
    await new Promise(r => setTimeout(r, 1000)); // Be polite
  }
  
  // Step 3: Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total pages discovered: ${pages.length}`);
  console.log(`Successfully scraped: ${results.filter(r => !r.error).length}`);
  console.log(`Failed: ${results.filter(r => r.error).length}`);
  
  console.log('\nPages:');
  results.forEach((r, i) => {
    console.log(`${i+1}. ${r.url}`);
    console.log(`   Status: ${r.error ? '✗ ' + r.error : '✓ OK'}`);
    console.log(`   Title: ${r.title || 'N/A'}`);
    console.log(`   Words: ${r.wordCount}`);
  });
}

main().catch(console.error);
