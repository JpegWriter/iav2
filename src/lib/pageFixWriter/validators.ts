/**
 * Page Fix Writer Validators
 * 
 * Quality gates that protect users from bad AI output.
 * Each validator returns warnings or errors that can trigger a repair pass.
 */

import type { 
  PageFixOutput, 
  ValidationWarning, 
  PageFixRequest,
  PageFixSection 
} from './types';

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  errors: ValidationWarning[];
  canPublish: boolean; // true if only warnings, no errors
}

export function validatePageFixOutput(
  output: PageFixOutput,
  request: PageFixRequest
): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationWarning[] = [];

  // Run all validators
  const validators = [
    validateJsonStructure,
    validateRequiredKeys,
    validateTitleLength,
    validateMetaDescriptionLength,
    validateH1Exists,
    validateProhibitedPhrases,
    validateVerifiableClaims,
    validateKeywordDensity,
    validateNoOutboundLinks,
    validateSectionStructure,
    validateImageInstructions,
  ];

  for (const validator of validators) {
    const results = validator(output, request);
    for (const result of results) {
      if (result.severity === 'error') {
        errors.push(result);
      } else {
        warnings.push(result);
      }
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    canPublish: errors.length === 0,
  };
}

// ============================================================================
// JSON STRUCTURE VALIDATOR
// ============================================================================

export function validateJsonStructure(
  output: PageFixOutput,
  _request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check if output is actually an object
  if (typeof output !== 'object' || output === null) {
    return [{
      code: 'INVALID_JSON_STRUCTURE',
      severity: 'error',
      message: 'Output is not a valid JSON object',
    }];
  }

  return warnings;
}

// ============================================================================
// REQUIRED KEYS VALIDATOR
// ============================================================================

const REQUIRED_KEYS = ['title', 'metaDescription', 'h1', 'sections', 'notes'];

export function validateRequiredKeys(
  output: PageFixOutput,
  _request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const key of REQUIRED_KEYS) {
    if (!(key in output) || output[key as keyof PageFixOutput] === undefined) {
      warnings.push({
        code: 'MISSING_REQUIRED_KEY',
        severity: 'error',
        message: `Missing required key: ${key}`,
        field: key,
      });
    }
  }

  // Check notes sub-keys
  if (output.notes) {
    const noteKeys = ['whatChanged', 'whyItMatters', 'claimsToVerify'];
    for (const key of noteKeys) {
      if (!(key in output.notes)) {
        warnings.push({
          code: 'MISSING_NOTES_KEY',
          severity: 'warning',
          message: `Missing notes.${key} - helps users understand changes`,
          field: `notes.${key}`,
        });
      }
    }
  }

  return warnings;
}

// ============================================================================
// TITLE LENGTH VALIDATOR
// ============================================================================

export function validateTitleLength(
  output: PageFixOutput,
  _request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!output.title) return warnings;

  const length = output.title.length;

  if (length < 35) {
    warnings.push({
      code: 'TITLE_TOO_SHORT',
      severity: 'warning',
      message: `Title is ${length} chars (recommended: 50-60)`,
      field: 'title',
      suggestion: 'Consider adding descriptive words or location',
    });
  } else if (length > 65) {
    warnings.push({
      code: 'TITLE_TOO_LONG',
      severity: 'warning',
      message: `Title is ${length} chars (recommended: 50-60). May be truncated in search results.`,
      field: 'title',
      suggestion: 'Shorten to fit within 60 characters',
    });
  }

  return warnings;
}

// ============================================================================
// META DESCRIPTION LENGTH VALIDATOR
// ============================================================================

export function validateMetaDescriptionLength(
  output: PageFixOutput,
  _request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!output.metaDescription) return warnings;

  const length = output.metaDescription.length;

  if (length < 120) {
    warnings.push({
      code: 'META_DESCRIPTION_TOO_SHORT',
      severity: 'warning',
      message: `Meta description is ${length} chars (recommended: 120-160)`,
      field: 'metaDescription',
      suggestion: 'Add more compelling details or a call-to-action',
    });
  } else if (length > 160) {
    warnings.push({
      code: 'META_DESCRIPTION_TOO_LONG',
      severity: 'warning',
      message: `Meta description is ${length} chars (recommended: 120-160). May be truncated.`,
      field: 'metaDescription',
      suggestion: 'Shorten while keeping key information',
    });
  }

  return warnings;
}

// ============================================================================
// H1 EXISTS VALIDATOR
// ============================================================================

export function validateH1Exists(
  output: PageFixOutput,
  _request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!output.h1 || output.h1.trim().length === 0) {
    warnings.push({
      code: 'MISSING_H1',
      severity: 'error',
      message: 'H1 heading is required',
      field: 'h1',
    });
  }

  return warnings;
}

// ============================================================================
// PROHIBITED PHRASES VALIDATOR
// ============================================================================

export function validateProhibitedPhrases(
  output: PageFixOutput,
  request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const prohibited = request.guardrails.prohibitedPhrases;

  if (!prohibited || prohibited.length === 0) return warnings;

  // Combine all text content for checking
  const allText = [
    output.title,
    output.metaDescription,
    output.h1,
    ...(output.sections?.map(s => s.html) || []),
    output.authorBlock?.html,
  ].filter(Boolean).join(' ').toLowerCase();

  for (const phrase of prohibited) {
    if (allText.includes(phrase.toLowerCase())) {
      warnings.push({
        code: 'PROHIBITED_PHRASE_FOUND',
        severity: 'error',
        message: `Prohibited phrase found: "${phrase}"`,
        suggestion: 'Remove or replace with more authentic language',
      });
    }
  }

  return warnings;
}

// ============================================================================
// VERIFIABLE CLAIMS VALIDATOR
// ============================================================================

const CLAIM_PATTERNS = [
  /\b(\d+)\+?\s*years?\b/i,
  /\b(\d+)\+?\s*clients?\b/i,
  /\b(\d+)\+?\s*projects?\b/i,
  /\bcertified\b/i,
  /\blicensed\b/i,
  /\baccredited\b/i,
  /\baward\b/i,
  /\bguarantee\b/i,
  /\b100%\b/i,
  /\b#1\b/i,
  /\bbest\b/i,
  /\bleading\b/i,
  /\btop\s+\d/i,
];

export function validateVerifiableClaims(
  output: PageFixOutput,
  request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!request.guardrails.requireVerifiableClaims) return warnings;

  // Combine all generated text
  const allText = [
    output.title,
    output.metaDescription,
    output.h1,
    ...(output.sections?.map(s => s.html) || []),
    output.authorBlock?.html,
  ].filter(Boolean).join(' ');

  // Get claims from original content for comparison
  const originalText = request.originalSnapshot.bodyText;
  
  // Get verified claims from business context
  const verifiedClaims = [
    request.businessContext?.yearsInBusiness?.toString(),
    ...(request.businessContext?.credentials || []),
  ].filter(Boolean).map(c => c!.toLowerCase());

  for (const pattern of CLAIM_PATTERNS) {
    const matches = allText.match(new RegExp(pattern, 'gi'));
    if (matches) {
      for (const match of matches) {
        const matchLower = match.toLowerCase();
        
        // Check if claim exists in original or verified context
        const inOriginal = originalText.toLowerCase().includes(matchLower);
        const isVerified = verifiedClaims.some(vc => matchLower.includes(vc));
        
        if (!inOriginal && !isVerified) {
          warnings.push({
            code: 'UNVERIFIABLE_CLAIM',
            severity: 'warning',
            message: `Claim needs verification: "${match}"`,
            suggestion: 'Add to claimsToVerify in notes, or remove if unverifiable',
          });
        }
      }
    }
  }

  return warnings;
}

// ============================================================================
// KEYWORD DENSITY VALIDATOR
// ============================================================================

export function validateKeywordDensity(
  output: PageFixOutput,
  request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!request.focusKeyword) return warnings;

  const keyword = request.focusKeyword.toLowerCase();
  const maxDensity = request.guardrails.maxKeywordDensity || 0.02;

  // Combine all text
  const allText = [
    output.title,
    output.metaDescription,
    output.h1,
    ...(output.sections?.map(s => stripHtml(s.html)) || []),
  ].filter(Boolean).join(' ').toLowerCase();

  const words = allText.split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;

  if (totalWords === 0) return warnings;

  // Count keyword occurrences (including multi-word keywords)
  const keywordRegex = new RegExp(escapeRegex(keyword), 'gi');
  const matches = allText.match(keywordRegex);
  const keywordCount = matches?.length || 0;

  // Calculate density (keyword occurrences / total words)
  const density = keywordCount / totalWords;

  if (density > maxDensity) {
    warnings.push({
      code: 'KEYWORD_STUFFING',
      severity: 'error',
      message: `Keyword density too high: ${(density * 100).toFixed(1)}% (max: ${(maxDensity * 100).toFixed(1)}%)`,
      suggestion: 'Use synonyms or reduce keyword repetition',
    });
  }

  return warnings;
}

// ============================================================================
// OUTBOUND LINKS VALIDATOR
// ============================================================================

const OUTBOUND_LINK_PATTERN = /<a\s+[^>]*href=["']https?:\/\/(?!${request => escapeRegex(new URL(request.originalSnapshot.url).hostname)})/gi;

export function validateNoOutboundLinks(
  output: PageFixOutput,
  request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (request.guardrails.allowOutboundLinks) return warnings;

  const hostname = new URL(request.originalSnapshot.url).hostname;
  
  // Check sections for outbound links
  for (const section of output.sections || []) {
    // Match href attributes that don't point to same domain
    const linkPattern = /<a\s+[^>]*href=["']([^"']+)["']/gi;
    let match;
    
    while ((match = linkPattern.exec(section.html)) !== null) {
      const href = match[1];
      
      // Skip internal links, anchors, and relative URLs
      if (href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }
      
      try {
        const linkUrl = new URL(href);
        if (linkUrl.hostname !== hostname) {
          warnings.push({
            code: 'OUTBOUND_LINK_NOT_ALLOWED',
            severity: 'error',
            message: `Outbound link not allowed: ${href}`,
            field: `sections[${output.sections?.indexOf(section)}]`,
            suggestion: 'Remove external link or use internal alternative',
          });
        }
      } catch {
        // Invalid URL, probably relative - OK
      }
    }
  }

  return warnings;
}

// ============================================================================
// SECTION STRUCTURE VALIDATOR
// ============================================================================

export function validateSectionStructure(
  output: PageFixOutput,
  _request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!output.sections || !Array.isArray(output.sections)) {
    warnings.push({
      code: 'INVALID_SECTIONS',
      severity: 'error',
      message: 'Sections must be an array',
      field: 'sections',
    });
    return warnings;
  }

  if (output.sections.length === 0) {
    warnings.push({
      code: 'NO_SECTIONS',
      severity: 'warning',
      message: 'No content sections provided',
      field: 'sections',
    });
  }

  for (let i = 0; i < output.sections.length; i++) {
    const section = output.sections[i];
    
    if (!section.type) {
      warnings.push({
        code: 'SECTION_MISSING_TYPE',
        severity: 'error',
        message: `Section ${i} missing type`,
        field: `sections[${i}].type`,
      });
    }
    
    if (!section.html || section.html.trim().length === 0) {
      warnings.push({
        code: 'SECTION_EMPTY',
        severity: 'warning',
        message: `Section ${i} (${section.type}) has no content`,
        field: `sections[${i}].html`,
      });
    }
  }

  return warnings;
}

// ============================================================================
// IMAGE INSTRUCTIONS VALIDATOR
// ============================================================================

export function validateImageInstructions(
  output: PageFixOutput,
  request: PageFixRequest
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (!output.imageInstructions || output.imageInstructions.length === 0) {
    // Not an error - images are optional
    return warnings;
  }

  const originalImages = request.originalSnapshot.images.map(img => img.filename.toLowerCase());

  for (const instruction of output.imageInstructions) {
    // Check if image exists in original
    if (!originalImages.includes(instruction.imageIdOrFilename.toLowerCase())) {
      warnings.push({
        code: 'IMAGE_NOT_FOUND',
        severity: 'warning',
        message: `Image not found in original: ${instruction.imageIdOrFilename}`,
        field: 'imageInstructions',
      });
    }

    // Check alt text
    if (!instruction.alt || instruction.alt.trim().length === 0) {
      warnings.push({
        code: 'IMAGE_MISSING_ALT',
        severity: 'warning',
        message: `Missing alt text for ${instruction.imageIdOrFilename}`,
        field: 'imageInstructions',
      });
    }
  }

  return warnings;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// PARSE JSON SAFELY
// ============================================================================

export function parsePageFixOutput(rawOutput: string): {
  success: boolean;
  output?: PageFixOutput;
  error?: string;
} {
  try {
    // Clean up common issues
    let cleaned = rawOutput.trim();
    
    // Remove markdown code blocks if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    
    return {
      success: true,
      output: parsed as PageFixOutput,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to parse JSON',
    };
  }
}
