// Simple Smoke Test for Jina Reader
// Run with: node test-jina.mjs

const url = 'https://www.newagefotografie.com/';
const JINA_READER_URL = 'https://r.jina.ai/';

async function testJinaReader() {
  console.log('='.repeat(60));
  console.log('SMOKE TEST: Jina Reader API');
  console.log('Target URL:', url);
  console.log('='.repeat(60));
  
  try {
    const jinaUrl = `${JINA_READER_URL}${url}`;
    console.log('\nFetching from:', jinaUrl);
    
    const response = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain' },
    });
    
    if (!response.ok) {
      throw new Error(`Jina Reader failed: ${response.status}`);
    }
    
    const markdownContent = await response.text();
    
    // Extract title from markdown
    const titleMatch = markdownContent.match(/^Title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : null;
    
    // Extract headings
    const h1s = markdownContent.match(/^#\s+(.+)$/gm) || [];
    const h2s = markdownContent.match(/^##\s+(.+)$/gm) || [];
    
    // Word count
    const cleanText = markdownContent.replace(/\[.*?\]\(.*?\)/g, '').replace(/[#*`_~]/g, '');
    const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
    
    // Extract internal links
    const linkMatches = markdownContent.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    const internalLinks = [];
    for (const match of linkMatches) {
      const linkUrl = match[2];
      if (linkUrl.includes('newagefotografie.com') || linkUrl.startsWith('/')) {
        internalLinks.push(linkUrl);
      }
    }
    
    console.log('\n--- RESULTS ---');
    console.log('✓ Status: 200 OK');
    console.log('✓ Title:', title);
    console.log('✓ H1 Count:', h1s.length);
    console.log('✓ H2 Count:', h2s.length);
    console.log('✓ Word Count:', wordCount);
    console.log('✓ Internal Links:', internalLinks.length);
    console.log('\n--- CONTENT PREVIEW (first 500 chars) ---');
    console.log(markdownContent.slice(0, 500));
    console.log('\n--- INTERNAL LINKS FOUND ---');
    internalLinks.slice(0, 10).forEach((link, i) => console.log(`  ${i+1}. ${link}`));
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ SMOKE TEST PASSED');
    console.log('='.repeat(60));
    
  } catch (err) {
    console.error('✗ SMOKE TEST FAILED:', err.message);
    process.exit(1);
  }
}

testJinaReader();
