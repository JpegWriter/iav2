// ============================================================================
// SERP / AEO AUDIT GATE - TITLE INTELLIGENCE
// ============================================================================

import {
  TaskContext,
  UserContext,
  ProposedContent,
  BAD_TITLE_PATTERNS,
  GOOD_TITLE_PATTERNS,
  SearchIntent,
} from './types';

// ============================================================================
// TITLE VALIDATION
// ============================================================================

export interface TitleAnalysis {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  rewrittenTitle: string;
  score: number;
}

/**
 * Analyze and potentially rewrite a proposed title
 */
export function analyzeTitle(
  proposed: ProposedContent,
  taskContext: TaskContext,
  userContext: UserContext
): TitleAnalysis {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  const title = proposed.title.trim();

  // ========================================
  // CHECK 1: Bad pattern detection
  // ========================================
  for (const pattern of BAD_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      issues.push(`Title contains weak/corporate pattern: "${title.match(pattern)?.[0]}"`);
      score -= 20;
    }
  }

  // ========================================
  // CHECK 2: Missing service reference
  // ========================================
  const serviceTerms = extractServiceTerms(taskContext.primaryService);
  const hasServiceRef = serviceTerms.some(term => 
    title.toLowerCase().includes(term.toLowerCase())
  );
  
  if (!hasServiceRef) {
    issues.push(`Title missing service reference: "${taskContext.primaryService}"`);
    suggestions.push(`Include "${taskContext.primaryService}" or related term`);
    score -= 15;
  }

  // ========================================
  // CHECK 3: Missing location for local intent
  // ========================================
  if (taskContext.location && taskContext.role === 'money') {
    const hasLocation = title.toLowerCase().includes(taskContext.location.toLowerCase());
    if (!hasLocation) {
      issues.push(`Title missing location for local service: "${taskContext.location}"`);
      suggestions.push(`Add location "${taskContext.location}" for local SEO`);
      score -= 10;
    }
  }

  // ========================================
  // CHECK 4: Intent clarity
  // ========================================
  const intentClarity = checkIntentClarity(title, taskContext.intent);
  if (!intentClarity.clear) {
    issues.push(`Title doesn't clearly signal ${taskContext.intent} intent`);
    suggestions.push(intentClarity.suggestion);
    score -= 10;
  }

  // ========================================
  // CHECK 5: Length check
  // ========================================
  if (title.length > 60) {
    issues.push(`Title too long for SERP display (${title.length} chars, max 60)`);
    score -= 5;
  }

  if (title.length < 30) {
    issues.push(`Title too short, missing context (${title.length} chars)`);
    score -= 5;
  }

  // ========================================
  // CHECK 6: Outcome/benefit presence
  // ========================================
  const hasOutcome = checkForOutcome(title);
  if (!hasOutcome) {
    issues.push('Title missing clear outcome or benefit');
    suggestions.push('Add what the reader will gain or achieve');
    score -= 10;
  }

  // ========================================
  // REWRITE IF NEEDED
  // ========================================
  let rewrittenTitle = title;
  
  if (score < 70) {
    rewrittenTitle = generateBetterTitle(
      proposed,
      taskContext,
      userContext
    );
  }

  return {
    isValid: score >= 60,
    issues,
    suggestions,
    rewrittenTitle,
    score: Math.max(0, score),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractServiceTerms(service: string): string[] {
  const terms = [service];
  
  // Add common variations
  const words = service.split(/\s+/);
  if (words.length > 1) {
    terms.push(...words.filter(w => w.length > 3));
  }
  
  // Add singular/plural
  if (service.endsWith('s')) {
    terms.push(service.slice(0, -1));
  } else {
    terms.push(service + 's');
  }
  
  return terms;
}

function checkIntentClarity(title: string, intent: SearchIntent): { clear: boolean; suggestion: string } {
  const lower = title.toLowerCase();
  
  switch (intent) {
    case 'buy':
      const buySignals = ['book', 'hire', 'get', 'schedule', 'pricing', 'cost', 'rates'];
      const hasBuySignal = buySignals.some(s => lower.includes(s));
      return {
        clear: hasBuySignal || lower.includes('how to'),
        suggestion: 'Add action-oriented language (book, hire, get started, pricing)',
      };
      
    case 'compare':
      const compareSignals = ['vs', 'versus', 'compare', 'difference', 'or', 'which'];
      const hasCompareSignal = compareSignals.some(s => lower.includes(s));
      return {
        clear: hasCompareSignal,
        suggestion: 'Add comparison language (vs, compared to, difference between)',
      };
      
    case 'learn':
      const learnSignals = ['how', 'what', 'why', 'when', 'guide', 'tips', 'explained'];
      const hasLearnSignal = learnSignals.some(s => lower.includes(s));
      return {
        clear: hasLearnSignal,
        suggestion: 'Add educational framing (how to, what is, guide to)',
      };
      
    case 'trust':
      const trustSignals = ['about', 'meet', 'story', 'why', 'trust', 'experience'];
      const hasTrustSignal = trustSignals.some(s => lower.includes(s));
      return {
        clear: hasTrustSignal,
        suggestion: 'Add trust-building language (meet, about, our story, why)',
      };
  }
}

function checkForOutcome(title: string): boolean {
  const lower = title.toLowerCase();
  
  // Outcome indicators
  const outcomePatterns = [
    /what (to|you|actually)/,
    /how to/,
    /get (the|your|better)/,
    /\d+ (tips|things|ways|reasons)/,
    /(save|avoid|prevent|achieve|get)/,
    /\((costs?|pricing|timeline|mistakes?)\)/,
    /—\s*\w+,\s*\w+/,  // em-dash with list
  ];
  
  return outcomePatterns.some(p => p.test(lower));
}

/**
 * Generate a better title based on context
 */
function generateBetterTitle(
  proposed: ProposedContent,
  taskContext: TaskContext,
  userContext: UserContext
): string {
  const { primaryService, location, intent, role } = taskContext;
  
  // Find best matching pattern for intent
  const patterns = GOOD_TITLE_PATTERNS.filter(p => p.bestFor.includes(intent));
  const pattern = patterns[0] || GOOD_TITLE_PATTERNS[0];
  
  // Build title based on pattern and context
  switch (intent) {
    case 'buy':
      if (location) {
        return `${primaryService} in ${location} — What to Expect, Costs, Next Steps`;
      }
      return `${primaryService}: Process, Pricing, and What to Expect`;
      
    case 'compare':
      // Extract comparison subjects from proposed title if possible
      const vsMatch = proposed.title.match(/(.+?)\s+vs\.?\s+(.+)/i);
      if (vsMatch) {
        return `${vsMatch[1]} vs ${vsMatch[2]}: What Actually Matters`;
      }
      return `Choosing ${primaryService}: What Really Matters (Comparison Guide)`;
      
    case 'learn':
      if (location) {
        return `How to Choose ${primaryService} in ${location} (Costs, Mistakes, Timeline)`;
      }
      return `${primaryService} Explained: What You Need to Know`;
      
    case 'trust':
      const experience = userContext.experience.years 
        ? `${userContext.experience.years}+ Years of` 
        : '';
      if (location) {
        return `Why ${location} Clients Trust Us for ${primaryService}`;
      }
      return `${experience} ${primaryService}: Our Story`;
  }
}

// ============================================================================
// TITLE PATTERN MATCHING
// ============================================================================

export interface TitlePatternMatch {
  matched: boolean;
  pattern?: string;
  quality: 'excellent' | 'good' | 'acceptable' | 'poor';
}

/**
 * Check if a title matches a known good pattern
 */
export function matchTitlePattern(title: string): TitlePatternMatch {
  const lower = title.toLowerCase();
  
  // Check against good patterns
  for (const pattern of GOOD_TITLE_PATTERNS) {
    // Simple pattern matching based on structure
    if (lower.includes(' vs ') && pattern.pattern.includes('[X] vs [Y]')) {
      return { matched: true, pattern: pattern.pattern, quality: 'excellent' };
    }
    if (lower.startsWith('how to ') && pattern.pattern.startsWith('How to')) {
      return { matched: true, pattern: pattern.pattern, quality: 'excellent' };
    }
    if (lower.startsWith('when you need ') && pattern.pattern.startsWith('When You Need')) {
      return { matched: true, pattern: pattern.pattern, quality: 'excellent' };
    }
    if (/^\d+\s+\w+\s+to\s+/.test(lower)) {
      return { matched: true, pattern: pattern.pattern, quality: 'good' };
    }
    if (lower.includes(' for ') && lower.includes(':')) {
      return { matched: true, pattern: pattern.pattern, quality: 'good' };
    }
    if (lower.includes('why ') && lower.includes(' trust')) {
      return { matched: true, pattern: pattern.pattern, quality: 'good' };
    }
  }
  
  // Check for acceptable patterns
  if (lower.includes('—') || lower.includes(':')) {
    return { matched: true, quality: 'acceptable' };
  }
  
  // Check for parenthetical context
  if (/\([^)]+\)$/.test(title)) {
    return { matched: true, quality: 'acceptable' };
  }
  
  return { matched: false, quality: 'poor' };
}
