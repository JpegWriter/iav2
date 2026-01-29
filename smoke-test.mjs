/**
 * Smoke Test: Full Research Process
 * Tests the scraper with https://www.newagefotografie.com/
 */

import { scrapeSite, scrapePage, discoverPages } from './src/lib/scraper/index.js';

async function main() {
  const url = 'https://www.newagefotografie.com/';
  
  console.log('='.repeat(60));
  console.log('SMOKE TEST: Full Research Process');
  console.log('Target URL:', url);
  console.log('='.repeat(60));
  
  // Test 1: Single page scrape
  console.log('\n--- TEST 1: Single Page Scrape ---');
  try {
    const page = await scrapePage(url);
    console.log('✓ Status:', page.statusCode);
    console.log('✓ Title:', page.title);
    console.log('✓ H1:', page.h1);
    console.log('✓ Word Count:', page.wordCount);
    console.log('✓ Internal Links Found:', page.internalLinks.length);
    console.log('✓ Content Preview:', page.cleanedText.slice(0, 200) + '...');
    if (page.error) {
      console.log('✗ Error:', page.error);
    }
  } catch (err) {
    console.error('✗ Single page scrape failed:', err);
  }

  // Test 2: Page discovery
  console.log('\n--- TEST 2: Page Discovery (max 10 pages, depth 2) ---');
  try {
    const pages = await discoverPages(url, 10, 2);
    console.log('✓ Pages Discovered:', pages.length);
    pages.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  } catch (err) {
    console.error('✗ Page discovery failed:', err);
  }

  // Test 3: Full site scrape
  console.log('\n--- TEST 3: Full Site Scrape (max 5 pages) ---');
  try {
    const results = await scrapeSite(url, {
      maxPages: 5,
      maxDepth: 2,
      useJinaReader: true,
      onProgress: (current, total, pageUrl) => {
        console.log(`  Scraping ${current}/${total}: ${pageUrl}`);
      },
    });
    
    console.log('\n✓ Total Pages Scraped:', results.length);
    console.log('\nPage Summary:');
    results.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.url}`);
      console.log(`     Title: ${p.title || 'N/A'}`);
      console.log(`     Words: ${p.wordCount}`);
      console.log(`     Error: ${p.error || 'None'}`);
    });

    // Calculate totals
    const totalWords = results.reduce((sum, p) => sum + p.wordCount, 0);
    const successCount = results.filter(p => !p.error).length;
    
    console.log('\n--- SUMMARY ---');
    console.log('Pages Attempted:', results.length);
    console.log('Pages Successful:', successCount);
    console.log('Total Words Extracted:', totalWords);
    console.log('Average Words/Page:', Math.round(totalWords / successCount));
    
  } catch (err) {
    console.error('✗ Full site scrape failed:', err);
  }

  console.log('\n' + '='.repeat(60));
  console.log('SMOKE TEST COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
