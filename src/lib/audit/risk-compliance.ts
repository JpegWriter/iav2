// ============================================================================
// SERP / AEO AUDIT GATE - RISK & COMPLIANCE SCAN
// ============================================================================

import {
  TaskContext,
  ProposedContent,
  ComplianceResult,
  RISK_KEYWORDS,
} from './types';

// ============================================================================
// RISK SCAN RESULT
// ============================================================================

export interface RiskScanResult {
  score: number;  // Higher = more risky (0-100)
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  detectedCategories: string[];
  flaggedPhrases: FlaggedPhrase[];
  compliance: ComplianceResult;
  issues: string[];
  blockers: string[];
}

export interface FlaggedPhrase {
  phrase: string;
  category: string;
  severity: 'warning' | 'block';
  suggestion: string;
}

// ============================================================================
// RISK SCAN
// ============================================================================

/**
 * Scan content for risky claims, compliance issues, and dangerous language
 */
export function scanForRisks(
  proposed: ProposedContent,
  taskContext: TaskContext
): RiskScanResult {
  const detectedCategories: string[] = [];
  const flaggedPhrases: FlaggedPhrase[] = [];
  const issues: string[] = [];
  const blockers: string[] = [];
  const disclaimers: string[] = [];
  const restrictedClaims: string[] = [];

  const allText = [
    proposed.title,
    ...proposed.headings,
    proposed.metaDescription,
  ].join(' ');

  const allTextLower = allText.toLowerCase();

  // ========================================
  // SCAN 1: Category Detection
  // ========================================
  for (const [category, keywords] of Object.entries(RISK_KEYWORDS)) {
    const matches = keywords.filter(kw => allTextLower.includes(kw.toLowerCase()));
    
    if (matches.length > 0) {
      detectedCategories.push(category);
      
      for (const match of matches) {
        const flagged = createFlaggedPhrase(match, category, taskContext);
        flaggedPhrases.push(flagged);
        
        if (flagged.severity === 'block') {
          blockers.push(`Blocked phrase "${match}" in ${category} category`);
        } else {
          issues.push(`Warning: "${match}" may need careful handling`);
        }
      }
    }
  }

  // ========================================
  // SCAN 2: Guarantee/Promise Detection
  // ========================================
  const guaranteeCheck = checkGuarantees(allTextLower);
  if (guaranteeCheck.found) {
    for (const phrase of guaranteeCheck.phrases) {
      flaggedPhrases.push({
        phrase,
        category: 'guarantees',
        severity: guaranteeCheck.isBlocking ? 'block' : 'warning',
        suggestion: getSaferAlternative(phrase),
      });
      
      if (guaranteeCheck.isBlocking) {
        blockers.push(`Absolute claim "${phrase}" not allowed`);
      }
      
      restrictedClaims.push(phrase);
    }
    
    if (!detectedCategories.includes('guarantees')) {
      detectedCategories.push('guarantees');
    }
  }

  // ========================================
  // SCAN 3: Category-Specific Compliance
  // ========================================
  if (detectedCategories.includes('legal')) {
    disclaimers.push('This information is for general guidance only and does not constitute legal advice.');
    issues.push('Legal content detected - requires disclaimer');
  }

  if (detectedCategories.includes('medical')) {
    disclaimers.push('This content is informational only and should not replace professional medical advice.');
    issues.push('Medical content detected - requires health disclaimer');
  }

  if (detectedCategories.includes('finance')) {
    disclaimers.push('This is general information and not financial advice. Consult a qualified financial advisor.');
    issues.push('Financial content detected - requires finance disclaimer');
  }

  if (detectedCategories.includes('children')) {
    disclaimers.push('All sessions involving minors require parent/guardian presence and consent.');
    issues.push('Content involves children - privacy considerations apply');
    
    // Check for additional child safety concerns
    const childSafetyCheck = checkChildSafety(allTextLower);
    if (!childSafetyCheck.safe) {
      blockers.push(...childSafetyCheck.concerns);
    }
  }

  // ========================================
  // SCAN 4: Outcome Claims Check
  // ========================================
  const outcomeCheck = checkOutcomeClaims(allTextLower);
  if (outcomeCheck.hasRiskyClaims) {
    for (const claim of outcomeCheck.claims) {
      flaggedPhrases.push({
        phrase: claim.phrase,
        category: 'outcome_claims',
        severity: claim.blocking ? 'block' : 'warning',
        suggestion: claim.suggestion,
      });
      
      if (claim.blocking) {
        blockers.push(`Outcome claim "${claim.phrase}" needs substantiation`);
      }
      
      restrictedClaims.push(claim.phrase);
    }
  }

  // ========================================
  // Calculate Risk Score
  // ========================================
  let score = 0;
  
  // Base score from categories
  score += detectedCategories.length * 15;
  
  // Add for flagged phrases
  score += flaggedPhrases.filter(f => f.severity === 'warning').length * 5;
  score += flaggedPhrases.filter(f => f.severity === 'block').length * 20;
  
  // Cap at 100
  score = Math.min(100, score);

  // Determine risk level
  const riskLevel = getRiskLevel(score, blockers.length);

  // Determine primary risk category
  const riskCategory = detectedCategories.includes('legal') ? 'legal'
    : detectedCategories.includes('medical') ? 'medical'
    : detectedCategories.includes('finance') ? 'finance'
    : detectedCategories.includes('children') ? 'children'
    : 'general';

  return {
    score,
    riskLevel,
    detectedCategories,
    flaggedPhrases,
    compliance: {
      requiresDisclaimer: disclaimers.length > 0,
      disclaimers,
      restrictedClaims,
      riskCategory: detectedCategories.length > 0 ? riskCategory : undefined,
    },
    issues,
    blockers,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createFlaggedPhrase(
  phrase: string,
  category: string,
  taskContext: TaskContext
): FlaggedPhrase {
  const severity = getPhraseSeverity(phrase, category, taskContext);
  
  return {
    phrase,
    category,
    severity,
    suggestion: getSaferAlternative(phrase),
  };
}

function getPhraseSeverity(
  phrase: string,
  category: string,
  taskContext: TaskContext
): 'warning' | 'block' {
  // Blocking phrases
  const blockingPhrases = [
    'guarantee',
    'cure',
    'diagnose',
    'legal action',
    '100%',
    'never fail',
    'always',
    'definitely',
  ];

  if (blockingPhrases.some(bp => phrase.toLowerCase().includes(bp))) {
    return 'block';
  }

  // Category-specific severity
  if (category === 'medical' || category === 'legal') {
    return 'block';  // Medical and legal claims always blocked without qualification
  }

  return 'warning';
}

function getSaferAlternative(phrase: string): string {
  const alternatives: Record<string, string> = {
    'guarantee': 'we aim to...',
    'promise': 'we strive to...',
    'always': 'typically',
    'never': 'rarely',
    '100%': 'consistently high',
    'definitely': 'generally',
    'cure': 'may help with',
    'diagnose': 'identify potential',
    'legal action': 'legal considerations',
    'invest': 'consider',
    'profit': 'potential benefits',
    'return': 'potential outcome',
  };

  const lowerPhrase = phrase.toLowerCase();
  
  for (const [risky, safe] of Object.entries(alternatives)) {
    if (lowerPhrase.includes(risky)) {
      return `Consider using "${safe}" instead of "${risky}"`;
    }
  }

  return `Soften or qualify this claim`;
}

function checkGuarantees(text: string): {
  found: boolean;
  phrases: string[];
  isBlocking: boolean;
} {
  const guaranteePatterns = [
    /guarantee[ds]?\b/gi,
    /100%\s*(satisfaction|guarantee|success)/gi,
    /money.back/gi,
    /risk.free/gi,
    /no.risk/gi,
    /always\s+\w+\s+results?/gi,
    /never\s+fail/gi,
    /definitely\s+\w+/gi,
  ];

  const matches: string[] = [];
  
  for (const pattern of guaranteePatterns) {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found);
    }
  }

  const isBlocking = matches.some(m => 
    /guarantee|100%|never fail/i.test(m)
  );

  return {
    found: matches.length > 0,
    phrases: Array.from(new Set(matches)),
    isBlocking,
  };
}

function checkChildSafety(text: string): {
  safe: boolean;
  concerns: string[];
} {
  const concerns: string[] = [];

  // Check for inappropriate context
  const inappropriatePatterns = [
    /alone\s+with\s+(child|minor|kid|baby)/i,
    /unsupervised/i,
    /without\s+parent/i,
  ];

  for (const pattern of inappropriatePatterns) {
    if (pattern.test(text)) {
      concerns.push('Content implies unsupervised access to minors');
    }
  }

  // Check for image-related concerns
  if (/share\s+(photo|image|picture).*?(child|minor|kid|baby)/i.test(text)) {
    concerns.push('Review image sharing policy for content involving minors');
  }

  return {
    safe: concerns.length === 0,
    concerns,
  };
}

function checkOutcomeClaims(text: string): {
  hasRiskyClaims: boolean;
  claims: Array<{
    phrase: string;
    blocking: boolean;
    suggestion: string;
  }>;
} {
  const claims: Array<{
    phrase: string;
    blocking: boolean;
    suggestion: string;
  }> = [];

  const riskyPatterns = [
    {
      pattern: /will\s+(definitely|always|certainly)\s+\w+/gi,
      blocking: true,
      suggestion: 'Use "may" or "typically" instead of absolutes',
    },
    {
      pattern: /guaranteed\s+\w+/gi,
      blocking: true,
      suggestion: 'Remove guarantee language or qualify with conditions',
    },
    {
      pattern: /best\s+(in|around|near)\s+\w+/gi,
      blocking: false,
      suggestion: 'Substantiate "best" claims with awards or reviews',
    },
    {
      pattern: /\#1\s+\w+/gi,
      blocking: false,
      suggestion: 'Provide source for ranking claims',
    },
    {
      pattern: /leading\s+(provider|expert|specialist)/gi,
      blocking: false,
      suggestion: 'Qualify leadership claims with context',
    },
  ];

  for (const { pattern, blocking, suggestion } of riskyPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        claims.push({ phrase: match, blocking, suggestion });
      }
    }
  }

  return {
    hasRiskyClaims: claims.length > 0,
    claims,
  };
}

function getRiskLevel(
  score: number,
  blockerCount: number
): 'none' | 'low' | 'medium' | 'high' | 'critical' {
  if (blockerCount > 0) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 10) return 'low';
  return 'none';
}

// ============================================================================
// COMPLIANCE HELPERS
// ============================================================================

/**
 * Generate appropriate disclaimers for detected risk categories
 */
export function generateDisclaimers(
  detectedCategories: string[]
): string[] {
  const disclaimers: string[] = [];

  if (detectedCategories.includes('legal')) {
    disclaimers.push(
      'This information is provided for general guidance only and does not constitute legal advice. ' +
      'Please consult a qualified legal professional for advice specific to your situation.'
    );
  }

  if (detectedCategories.includes('medical')) {
    disclaimers.push(
      'This content is for informational purposes only and should not be considered medical advice. ' +
      'Always consult with a qualified healthcare provider regarding any health concerns.'
    );
  }

  if (detectedCategories.includes('finance')) {
    disclaimers.push(
      'This information is general in nature and does not constitute financial advice. ' +
      'Please consult a licensed financial advisor for guidance specific to your circumstances.'
    );
  }

  if (detectedCategories.includes('children')) {
    disclaimers.push(
      'Sessions involving minors require parent or guardian presence and written consent. ' +
      'All child safety protocols are followed in accordance with relevant regulations.'
    );
  }

  return disclaimers;
}

/**
 * Soften risky claims while preserving intent
 */
export function softenClaim(claim: string): string {
  const softenings: Array<[RegExp, string]> = [
    [/\bguarantee\b/gi, 'aim to ensure'],
    [/\balways\b/gi, 'consistently'],
    [/\bnever\b/gi, 'rarely'],
    [/\b100%\b/gi, 'high degree of'],
    [/\bdefinitely\b/gi, 'typically'],
    [/\bwill\s+always\b/gi, 'strives to'],
    [/\bbest\s+in\b/gi, 'highly rated in'],
    [/\b#1\b/gi, 'top-rated'],
  ];

  let softened = claim;
  
  for (const [pattern, replacement] of softenings) {
    softened = softened.replace(pattern, replacement);
  }

  return softened;
}
