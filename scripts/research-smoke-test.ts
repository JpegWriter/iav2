// ============================================================================
// RESEARCH LAYER SMOKE TEST
// ============================================================================
// Tests the AEO + GEO research layer with real API calls
// Run with: npx tsx scripts/research-smoke-test.ts
// ============================================================================

// Load environment variables (dotenv may not be available, use native fs)
import * as fs from 'fs';
import * as path from 'path';

// Manual .env.local loading
function loadEnvFile(filepath: string) {
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

loadEnvFile(path.resolve('.env.local'));

// Direct imports from the research package
import {
  buildResearchPack,
  validateResearchPack,
  getResearchConfig,
  validateConfig,
  serperSearch,
  tavilySearch,
  geocode,
  places,
  type ResearchRequest,
} from '../packages/research/src/index';

// Test configuration
const TEST_REQUEST: ResearchRequest = {
  businessName: 'Test Photography Studio',
  focusKeyword: 'wedding photography',
  service: 'wedding photography',
  geoPrimary: 'Manchester, UK',
  intent: 'MONEY',  // PageIntent enum
  pageRole: 'money',
};

async function main() {
  console.log('='.repeat(60));
  console.log('RESEARCH LAYER SMOKE TEST');
  console.log('='.repeat(60));

  // 1. Validate configuration
  console.log('\n[1/6] Validating configuration...');
  const config = getResearchConfig();
  const configValidation = validateConfig(config);
  
  if (!configValidation.valid) {
    console.error('❌ Configuration invalid:');
    for (const msg of configValidation.errors) {
      console.error(`   - ${msg}`);
    }
    process.exit(1);
  }
  console.log('✅ Configuration valid');
  console.log(`   - Serper: ${config.serperApiKey ? '✓' : '✗'}`);
  console.log(`   - Tavily: ${config.tavilyApiKey ? '✓' : '✗'}`);
  console.log(`   - Geoapify: ${config.geoapifyApiKey ? '✓' : '✗'}`);
  console.log(`   - Cache: ${config.cacheEnabled ? 'enabled' : 'disabled'}`);

  // 2. Test Serper API
  console.log('\n[2/6] Testing Serper API...');
  try {
    const serperResult = await serperSearch(TEST_REQUEST.focusKeyword, {
      gl: 'uk',
      num: 5,
    });
    console.log('✅ Serper API working');
    console.log(`   - Organic results: ${serperResult.organic.length}`);
    console.log(`   - PAA questions: ${serperResult.paa.length}`);
    console.log(`   - Related searches: ${serperResult.relatedSearches.length}`);
    
    if (serperResult.paa.length > 0) {
      console.log('\n   Sample PAA:');
      for (const q of serperResult.paa.slice(0, 3)) {
        console.log(`   - ${q}`);
      }
    }
  } catch (error) {
    console.error('❌ Serper API failed:', error instanceof Error ? error.message : error);
  }

  // 3. Test Tavily API
  console.log('\n[3/6] Testing Tavily API...');
  try {
    const tavilyResult = await tavilySearch(`${TEST_REQUEST.service} ${TEST_REQUEST.geoPrimary}`, {
      maxResults: 5,
      includeAnswer: true,
    });
    console.log('✅ Tavily API working');
    console.log(`   - Results: ${tavilyResult.results.length}`);
    console.log(`   - Answer: ${tavilyResult.answer ? 'provided' : 'none'}`);
    
    if (tavilyResult.results.length > 0) {
      console.log('\n   Sample sources:');
      for (const r of tavilyResult.results.slice(0, 3)) {
        console.log(`   - ${r.url} (score: ${r.score.toFixed(2)})`);
      }
    }
  } catch (error) {
    console.error('❌ Tavily API failed:', error instanceof Error ? error.message : error);
  }

  // 4. Test Geoapify API
  console.log('\n[4/6] Testing Geoapify API...');
  try {
    const geoResult = await geocode(TEST_REQUEST.geoPrimary || 'London');
    if (!geoResult) {
      throw new Error('No geocode result returned');
    }
    console.log('✅ Geoapify API working');
    console.log(`   - Location: ${geoResult.formatted}`);
    console.log(`   - Coords: ${geoResult.lat}, ${geoResult.lon}`);
    console.log(`   - City: ${geoResult.city || geoResult.county || 'N/A'}`);
    
    // Test nearby places
    const nearbyPlaces = await places(geoResult.lat, geoResult.lon, {
      categories: ['commercial.shopping_mall', 'public_transport.train'],
      radiusMeters: 3000,
      limit: 5,
    });
    console.log(`   - Nearby places found: ${nearbyPlaces.length}`);
    
    if (nearbyPlaces.length > 0) {
      console.log('\n   Sample nearby places:');
      for (const p of nearbyPlaces.slice(0, 3)) {
        console.log(`   - ${p.name} (${p.category})`);
      }
    }
  } catch (error) {
    console.error('❌ Geoapify API failed:', error instanceof Error ? error.message : error);
  }

  // 5. Build full research pack
  console.log('\n[5/6] Building full research pack...');
  try {
    const startTime = Date.now();
    const pack = await buildResearchPack(TEST_REQUEST, {
      forceRefresh: true, // Don't use cache for smoke test
    });
    const duration = Date.now() - startTime;
    
    console.log('✅ Research pack built');
    console.log(`   - Duration: ${duration}ms`);
    console.log(`   - From cache: ${pack.cache.fromCache || false}`);
    
    // AEO summary
    console.log('\n   AEO Pack:');
    console.log(`   - Target Queries: ${pack.aeo.targetQueries.length}`);
    console.log(`   - PAA Questions: ${pack.aeo.peopleAlsoAsk.length}`);
    console.log(`   - Question Clusters: ${pack.aeo.questionClusters.length}`);
    console.log(`   - Answer Shapes: ${pack.aeo.answerShapes.length}`);
    console.log(`   - Citation Targets: ${pack.aeo.citationTargets.length}`);
    console.log(`   - Misconceptions: ${pack.aeo.misconceptions.length}`);
    console.log(`   - Snippet Hooks: ${pack.aeo.snippetHooks.length}`);
    
    // GEO summary
    console.log('\n   GEO Pack:');
    console.log(`   - Summary: ${pack.geo.geoSummary.substring(0, 100)}...`);
    console.log(`   - Nearby Areas: ${pack.geo.nearbyAreas.length}`);
    console.log(`   - Place Anchors: ${pack.geo.placeAnchors.length}`);
    console.log(`   - Proximity Anchors: ${pack.geo.proximityAnchors.length}`);
    console.log(`   - Local Language: ${pack.geo.localLanguage.length} patterns`);
    
    // Show some sample data
    if (pack.aeo.peopleAlsoAsk.length > 0) {
      console.log('\n   Sample PAA Questions:');
      for (const q of pack.aeo.peopleAlsoAsk.slice(0, 5)) {
        console.log(`   - ${q.question}`);
      }
    }
    
    if (pack.geo.placeAnchors.length > 0) {
      console.log('\n   Sample Place Anchors:');
      for (const place of pack.geo.placeAnchors.slice(0, 5)) {
        console.log(`   - ${place.name} (${place.category}, ${place.distanceMeters || 'N/A'}m)`);
      }
    }
    
    // 6. Validate the pack
    console.log('\n[6/6] Validating research pack...');
    const validation = validateResearchPack(pack);
    console.log(`✅ Validation complete`);
    console.log(`   - Valid: ${validation.valid}`);
    console.log(`   - AEO Score: ${validation.aeoScore}/100`);
    console.log(`   - GEO Score: ${validation.geoScore}/100`);
    console.log(`   - Warnings: ${validation.warnings.length}`);
    console.log(`   - Errors: ${validation.errors.length}`);
    
    if (validation.warnings.length > 0) {
      console.log('\n   Warnings:');
      for (const warning of validation.warnings) {
        console.log(`   ⚠️ ${warning}`);
      }
    }
    
    if (validation.errors.length > 0) {
      console.log('\n   Errors:');
      for (const error of validation.errors) {
        console.log(`   ❌ ${error}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Research pack build failed:', error instanceof Error ? error.message : error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SMOKE TEST COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
