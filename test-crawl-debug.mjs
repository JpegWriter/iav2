/**
 * Debug test for crawl functionality
 */

const PROJECT_ID = '8a81f2b3-902d-428e-a511-37504ad437ca';
const BASE_URL = 'http://localhost:3000';

async function testCrawl() {
  console.log('Testing crawl API...');
  console.log('Project ID:', PROJECT_ID);
  
  try {
    const response = await fetch(`${BASE_URL}/api/projects/${PROJECT_ID}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCrawl();
