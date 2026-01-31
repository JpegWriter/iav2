// ============================================================================
// CONTENT QUALITY SCORER
// ============================================================================
// Analyzes page content quality similar to Yoast SEO.
// Scores on: Readability, SEO Structure, Keyword Optimization, Content Depth, EEAT
// ============================================================================

export interface ContentScoreResult {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: {
    readability: FactorScore;
    seoStructure: FactorScore;
    keywordOptimization: FactorScore;
    contentDepth: FactorScore;
    eeatSignals: FactorScore;
  };
  recommendations: Recommendation[];
}

export interface FactorScore {
  score: number; // 0-100
  weight: number; // 0-1
  issues: string[];
  passed: string[];
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: keyof ContentScoreResult['factors'];
  action: string;
  impact: string;
}

export interface PageData {
  url: string;
  title?: string;
  metaDescription?: string;
  h1?: string;
  headings?: { level: number; text: string }[];
  bodyText?: string;
  wordCount?: number;
  focusKeyword?: string;
}

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate Flesch-Kincaid readability score
 * Higher = easier to read (target: 60-70 for web content)
 */
function calculateFleschKincaid(text: string): number {
  if (!text || text.length < 100) return 50;
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = words.reduce((count, word) => count + countSyllables(word), 0);
  
  if (sentences.length === 0 || words.length === 0) return 50;
  
  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  
  // Flesch Reading Ease formula
  const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
  
  return Math.max(0, Math.min(100, score));
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function calculateAverageSentenceLength(text: string): number {
  if (!text) return 0;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return sentences.length > 0 ? words.length / sentences.length : 0;
}

function calculateAverageParagraphLength(text: string): number {
  if (!text) return 0;
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return paragraphs.length > 0 ? words.length / paragraphs.length : 0;
}

// ============================================================================
// FACTOR SCORERS
// ============================================================================

function scoreReadability(page: PageData): FactorScore {
  const issues: string[] = [];
  const passed: string[] = [];
  let score = 100;
  
  const text = page.bodyText || '';
  
  // Flesch-Kincaid
  const fkScore = calculateFleschKincaid(text);
  if (fkScore < 30) {
    issues.push(`Very difficult to read (Flesch score: ${Math.round(fkScore)}). Target: 60-70.`);
    score -= 30;
  } else if (fkScore < 50) {
    issues.push(`Difficult to read (Flesch score: ${Math.round(fkScore)}). Target: 60-70.`);
    score -= 15;
  } else if (fkScore >= 60) {
    passed.push(`Good readability (Flesch score: ${Math.round(fkScore)})`);
  }
  
  // Average sentence length
  const avgSentence = calculateAverageSentenceLength(text);
  if (avgSentence > 25) {
    issues.push(`Sentences too long (avg: ${Math.round(avgSentence)} words). Target: 15-20.`);
    score -= 20;
  } else if (avgSentence > 20) {
    issues.push(`Sentences slightly long (avg: ${Math.round(avgSentence)} words). Target: 15-20.`);
    score -= 10;
  } else if (avgSentence >= 10) {
    passed.push(`Good sentence length (avg: ${Math.round(avgSentence)} words)`);
  }
  
  // Average paragraph length
  const avgParagraph = calculateAverageParagraphLength(text);
  if (avgParagraph > 150) {
    issues.push(`Paragraphs too long (avg: ${Math.round(avgParagraph)} words). Target: 50-100.`);
    score -= 15;
  } else if (avgParagraph <= 100) {
    passed.push(`Good paragraph length (avg: ${Math.round(avgParagraph)} words)`);
  }
  
  // Passive voice check (simple heuristic)
  const passivePatterns = /\b(is|are|was|were|been|being)\s+\w+ed\b/gi;
  const passiveMatches = text.match(passivePatterns) || [];
  const sentences = text.split(/[.!?]+/).length;
  const passiveRatio = sentences > 0 ? passiveMatches.length / sentences : 0;
  
  if (passiveRatio > 0.3) {
    issues.push(`Too much passive voice (${Math.round(passiveRatio * 100)}% of sentences). Target: <10%.`);
    score -= 15;
  } else if (passiveRatio < 0.1) {
    passed.push('Good use of active voice');
  }
  
  return { score: Math.max(0, score), weight: 0.2, issues, passed };
}

function scoreSeoStructure(page: PageData): FactorScore {
  const issues: string[] = [];
  const passed: string[] = [];
  let score = 100;
  
  // H1 check
  if (!page.h1) {
    issues.push('Missing H1 heading');
    score -= 25;
  } else {
    passed.push('H1 heading present');
  }
  
  // Title tag
  if (!page.title) {
    issues.push('Missing title tag');
    score -= 20;
  } else if (page.title.length < 30) {
    issues.push(`Title too short (${page.title.length} chars). Target: 50-60.`);
    score -= 10;
  } else if (page.title.length > 70) {
    issues.push(`Title too long (${page.title.length} chars). Target: 50-60.`);
    score -= 10;
  } else {
    passed.push(`Title length good (${page.title.length} chars)`);
  }
  
  // Meta description
  if (!page.metaDescription) {
    issues.push('Missing meta description');
    score -= 20;
  } else if (page.metaDescription.length < 120) {
    issues.push(`Meta description too short (${page.metaDescription.length} chars). Target: 120-160.`);
    score -= 10;
  } else if (page.metaDescription.length > 160) {
    issues.push(`Meta description too long (${page.metaDescription.length} chars). Target: 120-160.`);
    score -= 5;
  } else {
    passed.push(`Meta description length good (${page.metaDescription.length} chars)`);
  }
  
  // H2 headings
  const h2Count = page.headings?.filter(h => h.level === 2).length || 0;
  if (h2Count === 0) {
    issues.push('No H2 subheadings found');
    score -= 15;
  } else if (h2Count < 3) {
    issues.push(`Only ${h2Count} H2 subheadings. Target: 3-8 for good structure.`);
    score -= 10;
  } else if (h2Count <= 8) {
    passed.push(`Good H2 structure (${h2Count} subheadings)`);
  } else {
    issues.push(`Too many H2s (${h2Count}). Consider consolidating.`);
    score -= 5;
  }
  
  // Heading hierarchy check
  const headings = page.headings || [];
  let hierarchyBroken = false;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) {
      hierarchyBroken = true;
      break;
    }
  }
  if (hierarchyBroken) {
    issues.push('Heading hierarchy broken (skipping levels, e.g., H2 → H4)');
    score -= 10;
  } else if (headings.length > 2) {
    passed.push('Heading hierarchy is correct');
  }
  
  return { score: Math.max(0, score), weight: 0.25, issues, passed };
}

function scoreKeywordOptimization(page: PageData): FactorScore {
  const issues: string[] = [];
  const passed: string[] = [];
  let score = 100;
  
  const keyword = page.focusKeyword?.toLowerCase();
  if (!keyword) {
    issues.push('No focus keyword defined');
    return { score: 50, weight: 0.15, issues, passed };
  }
  
  const text = page.bodyText?.toLowerCase() || '';
  const title = page.title?.toLowerCase() || '';
  const h1 = page.h1?.toLowerCase() || '';
  const meta = page.metaDescription?.toLowerCase() || '';
  
  // Keyword in title
  if (title.includes(keyword)) {
    passed.push('Focus keyword in title');
  } else {
    issues.push('Focus keyword missing from title');
    score -= 20;
  }
  
  // Keyword in H1
  if (h1.includes(keyword)) {
    passed.push('Focus keyword in H1');
  } else {
    issues.push('Focus keyword missing from H1');
    score -= 15;
  }
  
  // Keyword in meta description
  if (meta.includes(keyword)) {
    passed.push('Focus keyword in meta description');
  } else {
    issues.push('Focus keyword missing from meta description');
    score -= 15;
  }
  
  // Keyword in first paragraph
  const firstParagraph = text.split(/\n\n/)[0] || '';
  if (firstParagraph.includes(keyword)) {
    passed.push('Focus keyword in first paragraph');
  } else {
    issues.push('Focus keyword missing from first paragraph');
    score -= 15;
  }
  
  // Keyword density
  const words = text.split(/\s+/).length;
  const keywordCount = (text.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  const density = words > 0 ? (keywordCount / words) * 100 : 0;
  
  if (density < 0.5) {
    issues.push(`Keyword density too low (${density.toFixed(1)}%). Target: 1-2.5%.`);
    score -= 15;
  } else if (density > 3) {
    issues.push(`Keyword density too high (${density.toFixed(1)}%). Target: 1-2.5%. Risk of keyword stuffing.`);
    score -= 20;
  } else {
    passed.push(`Good keyword density (${density.toFixed(1)}%)`);
  }
  
  return { score: Math.max(0, score), weight: 0.15, issues, passed };
}

function scoreContentDepth(page: PageData): FactorScore {
  const issues: string[] = [];
  const passed: string[] = [];
  let score = 100;
  
  const wordCount = page.wordCount || page.bodyText?.split(/\s+/).length || 0;
  
  // Word count
  if (wordCount < 300) {
    issues.push(`Content too thin (${wordCount} words). Target: 800+ for ranking pages.`);
    score -= 35;
  } else if (wordCount < 600) {
    issues.push(`Content could be more comprehensive (${wordCount} words). Target: 800+.`);
    score -= 20;
  } else if (wordCount < 800) {
    issues.push(`Content slightly short (${wordCount} words). Target: 800+.`);
    score -= 10;
  } else {
    passed.push(`Good content length (${wordCount} words)`);
  }
  
  // Subheadings per 300 words
  const h2Count = page.headings?.filter(h => h.level === 2).length || 0;
  const expectedH2s = Math.floor(wordCount / 300);
  if (wordCount > 300 && h2Count < expectedH2s - 1) {
    issues.push(`Need more subheadings (have ${h2Count}, recommend ${expectedH2s})`);
    score -= 15;
  } else if (h2Count >= expectedH2s) {
    passed.push('Good subheading frequency');
  }
  
  // Check for lists (bullet points, numbered lists)
  const text = page.bodyText || '';
  const hasBullets = /[•\-\*]\s/.test(text) || /<li>/i.test(text);
  if (hasBullets) {
    passed.push('Contains bullet points or lists');
  } else if (wordCount > 500) {
    issues.push('No bullet points or lists found. Add for better scannability.');
    score -= 10;
  }
  
  // Check for numbers/statistics
  const hasStats = /\d+%|\d+\+|\$\d+|\d{4}/.test(text);
  if (hasStats) {
    passed.push('Contains statistics or numbers');
  }
  
  return { score: Math.max(0, score), weight: 0.2, issues, passed };
}

function scoreEeatSignals(page: PageData): FactorScore {
  const issues: string[] = [];
  const passed: string[] = [];
  let score = 100;
  
  const text = page.bodyText?.toLowerCase() || '';
  
  // Author/expertise mentions
  const authorPatterns = /\b(author|written by|by [A-Z]|years of experience|certified|qualified|expert)\b/i;
  if (authorPatterns.test(text)) {
    passed.push('Author or expertise signals found');
  } else {
    issues.push('No author or expertise signals found');
    score -= 20;
  }
  
  // Credentials/experience
  const credentialPatterns = /\d+\+?\s*(years?|decades?)\s*(of)?\s*(experience|in business|serving)/i;
  if (credentialPatterns.test(text)) {
    passed.push('Experience credentials mentioned');
  } else {
    issues.push('No experience credentials (e.g., "10+ years experience")');
    score -= 15;
  }
  
  // Sources/references
  const sourcePatterns = /\b(according to|research|study|source|reference|cited|data shows)\b/i;
  if (sourcePatterns.test(text)) {
    passed.push('References or sources cited');
  } else {
    issues.push('No external sources or references cited');
    score -= 15;
  }
  
  // Testimonials/reviews
  const testimonialPatterns = /\b(testimonial|review|said|feedback|clients? say|customers? say|★|stars?)\b/i;
  if (testimonialPatterns.test(text)) {
    passed.push('Customer testimonials or reviews mentioned');
  } else {
    issues.push('No testimonials or reviews on page');
    score -= 15;
  }
  
  // Trust badges/certifications
  const trustPatterns = /\b(certified|accredited|licensed|insured|award|featured in|as seen in)\b/i;
  if (trustPatterns.test(text)) {
    passed.push('Trust badges or certifications mentioned');
  } else {
    issues.push('No certifications or trust badges mentioned');
    score -= 10;
  }
  
  // First-person expertise
  const firstPersonExpertise = /\b(we've|I've|our experience|in my experience|we specialize|I specialize)\b/i;
  if (firstPersonExpertise.test(text)) {
    passed.push('First-person expertise language used');
  }
  
  return { score: Math.max(0, score), weight: 0.2, issues, passed };
}

// ============================================================================
// MAIN SCORER
// ============================================================================

function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

function generateRecommendations(factors: ContentScoreResult['factors']): Recommendation[] {
  const recommendations: Recommendation[] = [];
  
  // Map each factor to recommendations
  const factorEntries = Object.entries(factors) as [keyof typeof factors, FactorScore][];
  
  for (const [category, factor] of factorEntries) {
    for (const issue of factor.issues) {
      let priority: Recommendation['priority'] = 'medium';
      
      // Determine priority based on score impact
      if (factor.score < 40) priority = 'critical';
      else if (factor.score < 60) priority = 'high';
      else if (factor.score < 75) priority = 'medium';
      else priority = 'low';
      
      recommendations.push({
        priority,
        category,
        action: issue,
        impact: `Improving this will boost your ${category} score`,
      });
    }
  }
  
  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return recommendations;
}

export function scorePageContent(page: PageData): ContentScoreResult {
  const factors = {
    readability: scoreReadability(page),
    seoStructure: scoreSeoStructure(page),
    keywordOptimization: scoreKeywordOptimization(page),
    contentDepth: scoreContentDepth(page),
    eeatSignals: scoreEeatSignals(page),
  };
  
  // Calculate weighted score
  const totalScore = Object.values(factors).reduce(
    (sum, factor) => sum + factor.score * factor.weight,
    0
  );
  
  const score = Math.round(totalScore);
  const grade = getGrade(score);
  const recommendations = generateRecommendations(factors);
  
  return {
    score,
    grade,
    factors,
    recommendations,
  };
}

export type { PageData as ContentPageData };
