// ============================================================================
// QUALITY GATE VALIDATOR
// ============================================================================
// PASS/FAIL validation for writer output
// Blocks publishing if requirements not met
// ============================================================================

import type { WPBlock } from '../types';

// ============================================================================
// GATE CODES
// ============================================================================

export type GateCode =
  // SEO Title Gates
  | 'SEO_TITLE_GENERIC'
  | 'SEO_TITLE_MISSING_GEO'
  | 'SEO_TITLE_MISSING_SERVICE'
  | 'SEO_TITLE_TOO_LONG'
  | 'SEO_TITLE_TOO_SHORT'
  // Vision Evidence Gates
  | 'VISION_FACTS_MIN_NOT_MET'
  | 'VISION_MISSING_EVIDENCE_HEADER'
  | 'VISION_MISSING_MARKERS'
  | 'VISION_USER_FACTS_NOT_USED'
  // AEO Gates
  | 'AEO_FAQ_MISSING'
  | 'AEO_FAQ_TOO_FEW'
  | 'AEO_ANSWER_TOO_SHORT'
  | 'AEO_ANSWER_TOO_LONG'
  | 'AEO_MISSING_LEAD_SENTENCE'
  // GEO Gates
  | 'GEO_MISSING_LOCAL_REFERENCE'
  | 'GEO_MISSING_NEARBY_AREA'
  | 'GEO_MISSING_DECISION_FACTORS'
  // WP Block Safety Gates
  | 'WP_EMPTY_IMAGE_BLOCK'
  | 'WP_EMPTY_PARAGRAPH'
  | 'WP_MALFORMED_BLOCK'
  | 'WP_FORBIDDEN_BLOCK_TYPE';

// ============================================================================
// GATE RESULT
// ============================================================================

export interface GateViolation {
  code: GateCode;
  message: string;
  severity: 'error' | 'warning';
  location?: string;
  suggestion?: string;
}

export interface GateResult {
  passed: boolean;
  score: number; // 0-100
  violations: GateViolation[];
  warnings: GateViolation[];
  summary: {
    seoTitlePassed: boolean;
    visionPassed: boolean;
    aeoPassed: boolean;
    geoPassed: boolean;
    wpBlocksPassed: boolean;
  };
}

// ============================================================================
// VALIDATION INPUT
// ============================================================================

export interface ValidationInput {
  // SEO Data
  seo: {
    title: string;
    metaDescription: string;
    focusKeyphrase: string;
  };
  
  // Content Data
  blocks: WPBlock[];
  
  // Context Requirements
  requirements: {
    // SEO Title Requirements
    seoTitle: {
      maxLength: number;
      minLength: number;
      mustIncludeGeo: boolean;
      mustIncludeService: boolean;
      forbiddenPatterns: string[];
    };
    
    // Vision Evidence Requirements (if vision provided)
    vision?: {
      minFactsUsed: number;
      requireEvidenceHeader: boolean;
      requireEvidenceMarkers: boolean;
      availableFacts: string[];
      /** User-provided facts that MUST appear in output (hard fail if missing) */
      userFacts?: string[];
      /** Minimum number of userFacts that must be used (default: all) */
      minUserFactsUsed?: number;
    };
    
    // AEO Requirements (if research provided)
    aeo?: {
      minQuestions: number;
      maxQuestions: number;
      answerMinWords: number;
      answerMaxWords: number;
      paaQuestions: string[];
    };
    
    // GEO Requirements (if location-based)
    geo?: {
      requireLocalReference: boolean;
      requireNearbyArea: boolean;
      requireDecisionFactors: boolean;
      nearbyAreas: string[];
      locationName: string;
    };
    
    // WP Block Safety
    wpBlocks: {
      forbiddenTypes: string[];
      requireValidImageUrls: boolean;
      allowEmptyParagraphs: boolean;
    };
  };
  
  // Business Context
  context: {
    service: string;
    location?: string;
    niche?: string;
  };
}

// ============================================================================
// FORBIDDEN TITLE PATTERNS
// ============================================================================

const GENERIC_TITLE_PATTERNS = [
  /^the ultimate guide/i,
  /^everything you need to know/i,
  /^complete guide to/i,
  /^a guide to/i,
  /^introduction to/i,
  /^understanding/i,
  /best \w+ services$/i,
  /^why you need/i,
  /^what is/i,
  /^how to get/i,
  /professional \w+ services$/i,
  /quality \w+ services$/i,
  /expert \w+ services$/i,
  /top \w+ services$/i,
  /^discover/i,
  /^unlock/i,
  /^transform/i,
  /^elevate/i,
  /your .*journey$/i,
];

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

export function runQualityGate(input: ValidationInput): GateResult {
  const violations: GateViolation[] = [];
  const warnings: GateViolation[] = [];
  
  // Run all gate checks
  const seoResult = validateSeoTitle(input, violations, warnings);
  const visionResult = validateVision(input, violations, warnings);
  const aeoResult = validateAeo(input, violations, warnings);
  const geoResult = validateGeo(input, violations, warnings);
  const wpResult = validateWpBlocks(input, violations, warnings);
  
  // Calculate overall score
  const scores = [
    seoResult ? 20 : 0,
    visionResult ? 20 : (input.requirements.vision ? 0 : 20),
    aeoResult ? 20 : (input.requirements.aeo ? 0 : 20),
    geoResult ? 20 : (input.requirements.geo ? 0 : 20),
    wpResult ? 20 : 0,
  ];
  const score = scores.reduce((a, b) => a + b, 0);
  
  // Pass if all critical gates pass (errors only)
  const passed = violations.length === 0;
  
  return {
    passed,
    score,
    violations,
    warnings,
    summary: {
      seoTitlePassed: seoResult,
      visionPassed: visionResult,
      aeoPassed: aeoResult,
      geoPassed: geoResult,
      wpBlocksPassed: wpResult,
    },
  };
}

// ============================================================================
// SEO TITLE VALIDATION
// ============================================================================

function validateSeoTitle(
  input: ValidationInput,
  violations: GateViolation[],
  warnings: GateViolation[]
): boolean {
  const { seo, requirements, context } = input;
  const req = requirements.seoTitle;
  let passed = true;
  
  // Length checks
  if (seo.title.length > req.maxLength) {
    violations.push({
      code: 'SEO_TITLE_TOO_LONG',
      message: `SEO title is ${seo.title.length} chars, max is ${req.maxLength}`,
      severity: 'error',
      suggestion: `Shorten title to under ${req.maxLength} characters`,
    });
    passed = false;
  }
  
  if (seo.title.length < req.minLength) {
    violations.push({
      code: 'SEO_TITLE_TOO_SHORT',
      message: `SEO title is ${seo.title.length} chars, min is ${req.minLength}`,
      severity: 'error',
      suggestion: `Expand title to at least ${req.minLength} characters`,
    });
    passed = false;
  }
  
  // Must include geo (if required and location provided)
  if (req.mustIncludeGeo && context.location) {
    const locationLower = context.location.toLowerCase();
    const titleLower = seo.title.toLowerCase();
    
    // Check for location or reasonable variations
    const locationParts = locationLower.split(',');
    const hasGeo = titleLower.includes(locationLower) ||
      (locationParts[0] && titleLower.includes(locationParts[0])) ||
      titleLower.includes('in ') ||
      titleLower.includes('near ');
    
    if (!hasGeo) {
      violations.push({
        code: 'SEO_TITLE_MISSING_GEO',
        message: `SEO title missing location reference. Location: ${context.location}`,
        severity: 'error',
        suggestion: `Include "${context.location}" or a geographic reference in the title`,
      });
      passed = false;
    }
  }
  
  // Must include service
  if (req.mustIncludeService && context.service) {
    const serviceLower = context.service.toLowerCase();
    const titleLower = seo.title.toLowerCase();
    
    // Check for service or key words from service
    const serviceWords = serviceLower.split(' ').filter(w => w.length > 3);
    const hasService = titleLower.includes(serviceLower) ||
      serviceWords.some(w => titleLower.includes(w));
    
    if (!hasService) {
      violations.push({
        code: 'SEO_TITLE_MISSING_SERVICE',
        message: `SEO title missing service reference. Service: ${context.service}`,
        severity: 'error',
        suggestion: `Include key words from "${context.service}" in the title`,
      });
      passed = false;
    }
  }
  
  // Check forbidden patterns
  for (const pattern of req.forbiddenPatterns) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(seo.title)) {
      violations.push({
        code: 'SEO_TITLE_GENERIC',
        message: `SEO title matches forbidden generic pattern: ${pattern}`,
        severity: 'error',
        suggestion: 'Use a more specific, unique title that reflects the business',
      });
      passed = false;
      break;
    }
  }
  
  // Check against known generic patterns
  for (const pattern of GENERIC_TITLE_PATTERNS) {
    if (pattern.test(seo.title)) {
      warnings.push({
        code: 'SEO_TITLE_GENERIC',
        message: `SEO title appears generic: matches pattern ${pattern}`,
        severity: 'warning',
        suggestion: 'Consider a more specific title that stands out in SERP',
      });
      break;
    }
  }
  
  return passed;
}

// ============================================================================
// VISION EVIDENCE VALIDATION
// ============================================================================

function validateVision(
  input: ValidationInput,
  violations: GateViolation[],
  warnings: GateViolation[]
): boolean {
  const { blocks, requirements } = input;
  const req = requirements.vision;
  
  // Skip if no vision requirements
  if (!req) {
    return true;
  }
  
  let passed = true;
  
  // Extract all text from blocks
  const allText = extractTextFromBlocks(blocks).toLowerCase();
  
  // Check for minimum facts used
  let factsUsed = 0;
  for (const fact of req.availableFacts) {
    // Fuzzy match - check if key phrases from the fact appear
    const factWords = fact.toLowerCase().split(' ').filter(w => w.length > 4);
    const matchCount = factWords.filter(w => allText.includes(w)).length;
    
    if (matchCount >= Math.min(2, factWords.length)) {
      factsUsed++;
    }
  }
  
  if (factsUsed < req.minFactsUsed) {
    violations.push({
      code: 'VISION_FACTS_MIN_NOT_MET',
      message: `Only ${factsUsed}/${req.minFactsUsed} vision facts used in content`,
      severity: 'error',
      suggestion: `Include at least ${req.minFactsUsed} observations from the provided vision facts`,
    });
    passed = false;
  }
  
  // Check for evidence header
  if (req.requireEvidenceHeader) {
    const hasEvidenceHeader = blocks.some(
      b => b.blockName === 'core/heading' &&
      (b.innerHTML?.toLowerCase().includes('local evidence') ||
       b.innerHTML?.toLowerCase().includes('visual evidence') ||
       b.innerHTML?.toLowerCase().includes('what we see') ||
       b.innerHTML?.toLowerCase().includes('what our images show'))
    );
    
    if (!hasEvidenceHeader) {
      warnings.push({
        code: 'VISION_MISSING_EVIDENCE_HEADER',
        message: 'Missing "Local Evidence" or similar H2 section',
        severity: 'warning',
        suggestion: 'Add a section that showcases visual evidence from the business',
      });
    }
  }
  
  // Check for evidence markers (phrases like "as seen in our...")
  if (req.requireEvidenceMarkers) {
    const evidenceMarkers = [
      'as shown',
      'as seen',
      'demonstrates',
      'evident in',
      'visible in',
      'our photos show',
      'the image shows',
      'pictured',
    ];
    
    const hasMarkers = evidenceMarkers.some(m => allText.includes(m));
    
    if (!hasMarkers) {
      warnings.push({
        code: 'VISION_MISSING_MARKERS',
        message: 'Content lacks visual evidence markers',
        severity: 'warning',
        suggestion: 'Add phrases like "as shown in our photos" to reference visual evidence',
      });
    }
  }
  
  // =====================================================================
  // USER FACTS VALIDATION (HARD FAIL)
  // These are first-party evidence like "Sold in 3 days", "12 viewings"
  // They MUST appear in the output
  // =====================================================================
  if (req.userFacts && req.userFacts.length > 0) {
    const minUserFacts = req.minUserFactsUsed ?? Math.min(2, req.userFacts.length);
    let userFactsUsed = 0;
    const unusedUserFacts: string[] = [];
    
    for (const userFact of req.userFacts) {
      // Fuzzy match - check if key phrases from the fact appear
      const factWords = userFact.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matchCount = factWords.filter(w => allText.includes(w)).length;
      
      // Match if at least half of significant words appear
      if (matchCount >= Math.ceil(factWords.length / 2)) {
        userFactsUsed++;
      } else {
        unusedUserFacts.push(userFact);
      }
    }
    
    if (userFactsUsed < minUserFacts) {
      violations.push({
        code: 'VISION_USER_FACTS_NOT_USED',
        message: `Only ${userFactsUsed}/${minUserFacts} required user-provided facts used`,
        severity: 'error',
        suggestion: `Include these facts in your content: ${unusedUserFacts.slice(0, 3).join(', ')}`,
      });
      passed = false;
    }
  }
  
  return passed;
}

// ============================================================================
// AEO VALIDATION
// ============================================================================

function validateAeo(
  input: ValidationInput,
  violations: GateViolation[],
  warnings: GateViolation[]
): boolean {
  const { blocks, requirements } = input;
  const req = requirements.aeo;
  
  // Skip if no AEO requirements
  if (!req) {
    return true;
  }
  
  let passed = true;
  
  // Find FAQ section (H2 containing FAQ, Questions, Q&A, etc.)
  const faqSectionIndex = blocks.findIndex(
    b => b.blockName === 'core/heading' &&
    b.attrs?.level === 2 &&
    (b.innerHTML?.toLowerCase().includes('faq') ||
     b.innerHTML?.toLowerCase().includes('question') ||
     b.innerHTML?.toLowerCase().includes('ask'))
  );
  
  if (faqSectionIndex === -1) {
    violations.push({
      code: 'AEO_FAQ_MISSING',
      message: 'No FAQ/Questions section found in content',
      severity: 'error',
      suggestion: 'Add a "Frequently Asked Questions" H2 section with Q&A content',
    });
    return false;
  }
  
  // Count H3 questions after the FAQ header
  let questionCount = 0;
  let shortAnswers = 0;
  let longAnswers = 0;
  let currentQuestion: string | null = null;
  let currentAnswerWords = 0;
  
  for (let i = faqSectionIndex + 1; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;
    
    // Stop at next H2
    if (block.blockName === 'core/heading' && block.attrs?.level === 2) {
      break;
    }
    
    // H3 is a question
    if (block.blockName === 'core/heading' && block.attrs?.level === 3) {
      // Process previous question's answer
      if (currentQuestion) {
        if (currentAnswerWords < req.answerMinWords) shortAnswers++;
        if (currentAnswerWords > req.answerMaxWords) longAnswers++;
      }
      
      currentQuestion = block.innerHTML || '';
      currentAnswerWords = 0;
      questionCount++;
    }
    
    // Count words in answer paragraphs
    if (currentQuestion && block.blockName === 'core/paragraph') {
      const text = block.innerHTML?.replace(/<[^>]*>/g, '') || '';
      currentAnswerWords += text.split(/\s+/).filter(w => w.length > 0).length;
    }
  }
  
  // Process last question
  if (currentQuestion) {
    if (currentAnswerWords < req.answerMinWords) shortAnswers++;
    if (currentAnswerWords > req.answerMaxWords) longAnswers++;
  }
  
  // Validate question count
  if (questionCount < req.minQuestions) {
    violations.push({
      code: 'AEO_FAQ_TOO_FEW',
      message: `Only ${questionCount} FAQ questions, minimum is ${req.minQuestions}`,
      severity: 'error',
      suggestion: `Add ${req.minQuestions - questionCount} more Q&A pairs to the FAQ section`,
    });
    passed = false;
  }
  
  // Warn about answer lengths
  if (shortAnswers > 0) {
    warnings.push({
      code: 'AEO_ANSWER_TOO_SHORT',
      message: `${shortAnswers} FAQ answers are under ${req.answerMinWords} words`,
      severity: 'warning',
      suggestion: `Expand short answers to at least ${req.answerMinWords} words for featured snippet targeting`,
    });
  }
  
  if (longAnswers > 0) {
    warnings.push({
      code: 'AEO_ANSWER_TOO_LONG',
      message: `${longAnswers} FAQ answers exceed ${req.answerMaxWords} words`,
      severity: 'warning',
      suggestion: `Condense long answers to under ${req.answerMaxWords} words for better scannability`,
    });
  }
  
  return passed;
}

// ============================================================================
// GEO VALIDATION
// ============================================================================

function validateGeo(
  input: ValidationInput,
  violations: GateViolation[],
  warnings: GateViolation[]
): boolean {
  const { blocks, requirements } = input;
  const req = requirements.geo;
  
  // Skip if no GEO requirements
  if (!req) {
    return true;
  }
  
  let passed = true;
  
  const allText = extractTextFromBlocks(blocks).toLowerCase();
  
  // Check for local reference
  if (req.requireLocalReference && req.locationName) {
    const locationLower = req.locationName.toLowerCase();
    
    if (!allText.includes(locationLower)) {
      violations.push({
        code: 'GEO_MISSING_LOCAL_REFERENCE',
        message: `Content does not mention location: ${req.locationName}`,
        severity: 'error',
        suggestion: `Include references to "${req.locationName}" throughout the content`,
      });
      passed = false;
    }
  }
  
  // Check for nearby area mentions
  if (req.requireNearbyArea && req.nearbyAreas.length > 0) {
    const hasNearbyArea = req.nearbyAreas.some(
      area => allText.includes(area.toLowerCase())
    );
    
    if (!hasNearbyArea) {
      warnings.push({
        code: 'GEO_MISSING_NEARBY_AREA',
        message: 'Content does not mention any nearby areas',
        severity: 'warning',
        suggestion: `Consider mentioning nearby areas: ${req.nearbyAreas.slice(0, 3).join(', ')}`,
      });
    }
  }
  
  // Check for decision factors (comparison table, checklist, etc.)
  if (req.requireDecisionFactors) {
    const hasTable = blocks.some(b => b.blockName === 'core/table');
    const hasList = blocks.some(b => b.blockName === 'core/list');
    const hasComparisonText = allText.includes('compare') ||
      allText.includes('versus') ||
      allText.includes('vs') ||
      allText.includes('checklist') ||
      allText.includes('consider');
    
    if (!hasTable && !hasList && !hasComparisonText) {
      warnings.push({
        code: 'GEO_MISSING_DECISION_FACTORS',
        message: 'Content lacks local decision factors (comparison/checklist)',
        severity: 'warning',
        suggestion: 'Add a comparison table or decision checklist for local context',
      });
    }
  }
  
  return passed;
}

// ============================================================================
// WP BLOCKS VALIDATION
// ============================================================================

function validateWpBlocks(
  input: ValidationInput,
  violations: GateViolation[],
  _warnings: GateViolation[]
): boolean {
  const { blocks, requirements } = input;
  const req = requirements.wpBlocks;
  let passed = true;
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;
    
    const location = `Block ${i + 1} (${block.blockName || 'unknown'})`;
    
    // Check for malformed blocks first
    if (!block.blockName || typeof block.blockName !== 'string') {
      violations.push({
        code: 'WP_MALFORMED_BLOCK',
        message: 'Block missing blockName property',
        severity: 'error',
        location,
        suggestion: 'Each block must have a valid blockName string',
      });
      passed = false;
      continue;
    }
    
    // Check forbidden types
    if (req.forbiddenTypes.includes(block.blockName)) {
      violations.push({
        code: 'WP_FORBIDDEN_BLOCK_TYPE',
        message: `Forbidden block type: ${block.blockName}`,
        severity: 'error',
        location,
        suggestion: `Remove or replace ${block.blockName} with an allowed block type`,
      });
      passed = false;
    }
    
    // Check for empty paragraphs
    if (block.blockName === 'core/paragraph') {
      const text = block.innerHTML?.replace(/<[^>]*>/g, '').trim() || '';
      
      if (!req.allowEmptyParagraphs && text.length === 0) {
        violations.push({
          code: 'WP_EMPTY_PARAGRAPH',
          message: 'Empty paragraph block found',
          severity: 'error',
          location,
          suggestion: 'Remove empty paragraph blocks',
        });
        passed = false;
      }
    }
    
    // Check for empty image blocks
    if (block.blockName === 'core/image') {
      const hasSrc = block.innerHTML?.includes('src=') ||
        block.innerHTML?.includes('PLACEHOLDER:');
      
      if (!hasSrc) {
        violations.push({
          code: 'WP_EMPTY_IMAGE_BLOCK',
          message: 'Image block has no src attribute',
          severity: 'error',
          location,
          suggestion: 'Add a valid image URL or use PLACEHOLDER:description format',
        });
        passed = false;
      }
      
      // Check for valid URL or placeholder
      if (req.requireValidImageUrls && block.innerHTML) {
        const srcMatch = block.innerHTML.match(/src="([^"]+)"/);
        if (srcMatch && srcMatch[1]) {
          const src = srcMatch[1];
          const isValid = src.startsWith('http') ||
            src.startsWith('/') ||
            src.startsWith('PLACEHOLDER:');
          
          if (!isValid) {
            violations.push({
              code: 'WP_MALFORMED_BLOCK',
              message: `Invalid image src: ${src}`,
              severity: 'error',
              location,
              suggestion: 'Use a valid URL (http...) or PLACEHOLDER:description format',
            });
            passed = false;
          }
        }
      }
    }
  }
  
  return passed;
}

// ============================================================================
// HELPERS
// ============================================================================

function extractTextFromBlocks(blocks: WPBlock[]): string {
  const texts: string[] = [];
  
  for (const block of blocks) {
    if (block.innerHTML) {
      // Strip HTML tags and extract text
      const text = block.innerHTML.replace(/<[^>]*>/g, ' ');
      texts.push(text);
    }
    
    // Recursively extract from innerBlocks
    if (block.innerBlocks && block.innerBlocks.length > 0) {
      texts.push(extractTextFromBlocks(block.innerBlocks));
    }
  }
  
  return texts.join(' ');
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create default requirements for a task
 */
export function createDefaultRequirements(
  context: ValidationInput['context'],
  options: {
    hasVision?: boolean;
    hasResearch?: boolean;
    visionFacts?: string[];
    paaQuestions?: string[];
    nearbyAreas?: string[];
  } = {}
): ValidationInput['requirements'] {
  return {
    seoTitle: {
      maxLength: 60,
      minLength: 30,
      mustIncludeGeo: !!context.location,
      mustIncludeService: true,
      forbiddenPatterns: [],
    },
    vision: options.hasVision
      ? {
          minFactsUsed: 3,
          requireEvidenceHeader: true,
          requireEvidenceMarkers: true,
          availableFacts: options.visionFacts || [],
        }
      : undefined,
    aeo: options.hasResearch
      ? {
          minQuestions: 5,
          maxQuestions: 7,
          answerMinWords: 80,
          answerMaxWords: 120,
          paaQuestions: options.paaQuestions || [],
        }
      : undefined,
    geo: context.location
      ? {
          requireLocalReference: true,
          requireNearbyArea: true,
          requireDecisionFactors: true,
          nearbyAreas: options.nearbyAreas || [],
          locationName: context.location,
        }
      : undefined,
    wpBlocks: {
      forbiddenTypes: ['core/html', 'core/freeform'],
      requireValidImageUrls: true,
      allowEmptyParagraphs: false,
    },
  };
}
