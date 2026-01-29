import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

interface ScrapedReview {
  source: 'google_maps' | 'yelp' | 'tripadvisor';
  author: string;
  rating: number;
  text: string;
  date?: string;
}

async function scrapeWithJina(url: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    console.log(`[ReviewScraper] Fetching ${url} via Jina...`);
    
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.log(`[ReviewScraper] Jina returned ${response.status} for ${url}`);
      return null;
    }

    const text = await response.text();
    console.log(`[ReviewScraper] Got ${text.length} chars from ${url}`);
    return text;
  } catch (error) {
    console.error(`[ReviewScraper] Error fetching ${url}:`, error);
    return null;
  }
}

function extractGoogleMapsReviews(content: string): ScrapedReview[] {
  const reviews: ScrapedReview[] = [];
  
  // Google Maps reviews typically have patterns like:
  // "5 stars" or "4 stars" followed by review text
  // Reviews often separated by author names
  const lines = content.split('\n');
  
  let currentReview: Partial<ScrapedReview> = { source: 'google_maps' };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for star ratings
    const starMatch = line.match(/(\d)\s*stars?/i);
    if (starMatch) {
      // If we have a previous review in progress, save it
      if (currentReview.text && currentReview.rating) {
        reviews.push(currentReview as ScrapedReview);
      }
      currentReview = { 
        source: 'google_maps',
        rating: parseInt(starMatch[1]),
        author: 'Google Reviewer',
      };
      continue;
    }
    
    // Look for review text (longer lines that aren't navigation)
    if (line.length > 50 && !line.includes('http') && 
        !line.match(/^(Home|Menu|Reviews|About|Contact|Sign|Log)/i)) {
      if (currentReview.rating) {
        currentReview.text = (currentReview.text || '') + ' ' + line;
      }
    }
  }
  
  // Save last review
  if (currentReview.text && currentReview.rating) {
    currentReview.text = currentReview.text.trim().slice(0, 500);
    reviews.push(currentReview as ScrapedReview);
  }
  
  return reviews.slice(0, 20); // Limit to 20 reviews
}

function extractYelpReviews(content: string): ScrapedReview[] {
  const reviews: ScrapedReview[] = [];
  
  // Yelp patterns: "5.0 star rating" or "4 star rating"
  const lines = content.split('\n');
  
  let currentReview: Partial<ScrapedReview> = { source: 'yelp' };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for star ratings
    const starMatch = line.match(/(\d(?:\.\d)?)\s*star/i);
    if (starMatch) {
      if (currentReview.text && currentReview.rating) {
        reviews.push(currentReview as ScrapedReview);
      }
      currentReview = { 
        source: 'yelp',
        rating: Math.round(parseFloat(starMatch[1])),
        author: 'Yelp Reviewer',
      };
      continue;
    }
    
    // Look for review text
    if (line.length > 50 && !line.includes('http') && 
        !line.match(/^(Useful|Funny|Cool|Elite|Yelp|Login)/i)) {
      if (currentReview.rating) {
        currentReview.text = (currentReview.text || '') + ' ' + line;
      }
    }
  }
  
  if (currentReview.text && currentReview.rating) {
    currentReview.text = currentReview.text.trim().slice(0, 500);
    reviews.push(currentReview as ScrapedReview);
  }
  
  return reviews.slice(0, 20);
}

function extractTripAdvisorReviews(content: string): ScrapedReview[] {
  const reviews: ScrapedReview[] = [];
  
  // TripAdvisor patterns: "5 of 5 bubbles" or review scores
  const lines = content.split('\n');
  
  let currentReview: Partial<ScrapedReview> = { source: 'tripadvisor' };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for bubble ratings or score patterns
    const bubbleMatch = line.match(/(\d)\s*(?:of\s*5\s*)?bubble/i) || 
                        line.match(/Rating:\s*(\d)/i) ||
                        line.match(/^(\d)\s*(?:stars?|\/\s*5)/i);
    if (bubbleMatch) {
      if (currentReview.text && currentReview.rating) {
        reviews.push(currentReview as ScrapedReview);
      }
      currentReview = { 
        source: 'tripadvisor',
        rating: parseInt(bubbleMatch[1]),
        author: 'TripAdvisor Reviewer',
      };
      continue;
    }
    
    // Look for review text
    if (line.length > 50 && !line.includes('http') && 
        !line.match(/^(TripAdvisor|Write|Contribute|Login|Sign)/i)) {
      if (currentReview.rating) {
        currentReview.text = (currentReview.text || '') + ' ' + line;
      }
    }
  }
  
  if (currentReview.text && currentReview.rating) {
    currentReview.text = currentReview.text.trim().slice(0, 500);
    reviews.push(currentReview as ScrapedReview);
  }
  
  return reviews.slice(0, 20);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const adminClient = createAdminClient();
    const body = await request.json();
    
    const { googleMapsUrl, yelpUrl, tripAdvisorUrl } = body;
    
    console.log('[ReviewScraper] Starting review scrape for project:', params.projectId);
    console.log('[ReviewScraper] URLs:', { googleMapsUrl, yelpUrl, tripAdvisorUrl });
    
    const allReviews: ScrapedReview[] = [];
    
    // Scrape Google Maps
    if (googleMapsUrl) {
      const content = await scrapeWithJina(googleMapsUrl);
      if (content) {
        const reviews = extractGoogleMapsReviews(content);
        console.log(`[ReviewScraper] Found ${reviews.length} Google Maps reviews`);
        allReviews.push(...reviews);
      }
    }
    
    // Scrape Yelp
    if (yelpUrl) {
      const content = await scrapeWithJina(yelpUrl);
      if (content) {
        const reviews = extractYelpReviews(content);
        console.log(`[ReviewScraper] Found ${reviews.length} Yelp reviews`);
        allReviews.push(...reviews);
      }
    }
    
    // Scrape TripAdvisor
    if (tripAdvisorUrl) {
      const content = await scrapeWithJina(tripAdvisorUrl);
      if (content) {
        const reviews = extractTripAdvisorReviews(content);
        console.log(`[ReviewScraper] Found ${reviews.length} TripAdvisor reviews`);
        allReviews.push(...reviews);
      }
    }
    
    console.log(`[ReviewScraper] Total reviews found: ${allReviews.length}`);
    
    // Save reviews to beads table as 'proof' type
    let savedCount = 0;
    for (const review of allReviews.filter(r => r.rating >= 4)) { // Only save 4+ star reviews
      const beadValue = review.text.length > 200 
        ? review.text.slice(0, 200) + '...' 
        : review.text;
      
      const { error } = await adminClient
        .from('beads')
        .insert({
          project_id: params.projectId,
          type: 'proof',
          label: `${review.rating}★ ${review.source.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} Review`,
          value: beadValue,
          priority: review.rating * 20, // 5 stars = 100, 4 stars = 80
          channels: ['wp', 'gmb'],
          where_to_use: ['trust_block', 'testimonials'],
          tone: ['authentic'],
          source_url: body[`${review.source === 'google_maps' ? 'googleMaps' : review.source === 'tripadvisor' ? 'tripAdvisor' : review.source}Url`] || null,
        });
      
      if (!error) {
        savedCount++;
      } else {
        console.error('[ReviewScraper] Error saving review:', error);
      }
    }
    
    console.log(`[ReviewScraper] Saved ${savedCount} reviews as beads`);
    
    return NextResponse.json({ 
      success: true,
      reviewsFound: allReviews.length,
      reviewsSaved: savedCount,
    });
  } catch (error) {
    console.error('[ReviewScraper] Error:', error);
    return NextResponse.json(
      { error: 'Failed to scrape reviews' },
      { status: 500 }
    );
  }
}
