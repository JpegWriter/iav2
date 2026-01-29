// ============================================================================
// WORDPRESS VALIDATOR
// ============================================================================
// Validates WordPress output to ensure it won't break page builders,
// respects size limits, and meets SEO requirements.
// ============================================================================

import type {
  WordPressOutput,
  WPBlock,
  WriterTask,
  ValidationWarning,
  ValidationSeverity,
} from '../types';

// ============================================================================
// VALIDATION RESULT
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  stats: {
    blockCount: number;
    htmlBytes: number;
    wordCount: number;
    h2Count: number;
    h3Count: number;
    paragraphCount: number;
    maxParagraphWords: number;
    internalLinkCount: number;
    imageCount: number;
    tableCount: number;
    maxTableRows: number;
    keyphraseOccurrences: number;
    readingTimeMinutes: number;
  };
}

// ============================================================================
// FORBIDDEN PATTERNS
// ============================================================================

const FORBIDDEN_PATTERNS = [
  /<script\b/i,
  /<iframe\b/i,
  /<embed\b/i,
  /<object\b/i,
  /style\s*=\s*["'][^"']*position\s*:\s*(fixed|absolute)/i,
  /style\s*=\s*["'][^"']*z-index\s*:\s*\d{4,}/i,
  /javascript:/i,
  /on\w+\s*=/i, // onclick, onload, etc.
];

const FORBIDDEN_BLOCK_TYPES = [
  'core/html', // Raw HTML blocks are risky
  'core/freeform', // Classic editor blocks
];

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

export function validateWordPressOutput(
  output: WordPressOutput,
  task: WriterTask
): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const stats = calculateStats(output);

  // Check block count
  if (stats.blockCount > task.wordpress.maxBlocks) {
    warnings.push({
      code: 'BLOCK_COUNT_EXCEEDED',
      message: `Block count (${stats.blockCount}) exceeds maximum (${task.wordpress.maxBlocks})`,
      severity: 'error',
      field: 'blocks',
      suggestion: 'Combine paragraphs or remove less important sections',
    });
  }

  // Check HTML bytes
  if (stats.htmlBytes > task.wordpress.maxHtmlBytes) {
    warnings.push({
      code: 'HTML_SIZE_EXCEEDED',
      message: `HTML size (${stats.htmlBytes} bytes) exceeds maximum (${task.wordpress.maxHtmlBytes} bytes)`,
      severity: 'error',
      field: 'blocks',
      suggestion: 'Reduce content length or simplify markup',
    });
  }

  // Check H2 count
  const maxH2 = task.wordpress.maxH2Count || 10;
  if (stats.h2Count > maxH2) {
    warnings.push({
      code: 'EXCESSIVE_H2_COUNT',
      message: `H2 count (${stats.h2Count}) exceeds maximum (${maxH2})`,
      severity: 'warning',
      field: 'blocks',
      suggestion: 'Consolidate sections or convert some H2s to H3s',
    });
  }

  // Check paragraph length
  if (stats.maxParagraphWords > 300) {
    warnings.push({
      code: 'PARAGRAPH_TOO_LONG',
      message: `Longest paragraph (${stats.maxParagraphWords} words) exceeds 300 words`,
      severity: 'warning',
      field: 'blocks',
      suggestion: 'Break up long paragraphs for better readability',
    });
  }

  // Check table rows
  const maxTableRows = task.wordpress.maxTableRows || 8;
  if (stats.maxTableRows > maxTableRows) {
    warnings.push({
      code: 'TABLE_TOO_LARGE',
      message: `Table with ${stats.maxTableRows} rows exceeds maximum (${maxTableRows})`,
      severity: 'warning',
      field: 'blocks',
      suggestion: 'Split large tables or convert to collapsible sections',
    });
  }

  // Validate keyphrase usage
  const minKeyphraseOccurrences = 2;
  if (stats.keyphraseOccurrences < minKeyphraseOccurrences) {
    warnings.push({
      code: 'INSUFFICIENT_KEYPHRASE',
      message: `Focus keyphrase appears ${stats.keyphraseOccurrences} times (minimum: ${minKeyphraseOccurrences})`,
      severity: 'warning',
      field: 'seo.focusKeyphrase',
      suggestion: 'Add keyphrase in intro and at least one more section',
    });
  }

  // Check internal links
  if (stats.internalLinkCount === 0 && task.internalLinks.upLinks.length > 0) {
    warnings.push({
      code: 'MISSING_INTERNAL_LINKS',
      message: 'No internal links found but upLinks were required',
      severity: 'error',
      field: 'internalLinksUsed',
      suggestion: 'Add required internal links to parent pages',
    });
  }

  if (stats.internalLinkCount > 5) {
    warnings.push({
      code: 'EXCESSIVE_INTERNAL_LINKS',
      message: `${stats.internalLinkCount} internal links may dilute link equity`,
      severity: 'warning',
      field: 'internalLinksUsed',
      suggestion: 'Limit to 3-5 most relevant internal links',
    });
  }

  // Check for CTA block
  const hasCTA = output.blocks.some(
    (block) =>
      block.blockName === 'core/buttons' ||
      block.blockName === 'core/button' ||
      (block.innerHTML &&
        (block.innerHTML.includes('cta') ||
          block.innerHTML.includes('call-to-action')))
  );

  if (!hasCTA) {
    warnings.push({
      code: 'MISSING_CTA',
      message: 'No call-to-action block found',
      severity: 'warning',
      field: 'blocks',
      suggestion: 'Add a buttons block with clear CTA',
    });
  }

  // Check for forbidden markup
  const forbiddenWarnings = checkForbiddenMarkup(output.blocks);
  warnings.push(...forbiddenWarnings);

  // Check for forbidden block types
  const forbiddenBlockWarnings = checkForbiddenBlocks(output.blocks);
  warnings.push(...forbiddenBlockWarnings);

  // Validate SEO fields
  const seoWarnings = validateSEO(output);
  warnings.push(...seoWarnings);

  // Validate excerpt
  if (output.excerpt.length > task.wordpress.excerptLength) {
    warnings.push({
      code: 'EXCERPT_TOO_LONG',
      message: `Excerpt (${output.excerpt.length} chars) exceeds maximum (${task.wordpress.excerptLength})`,
      severity: 'warning',
      field: 'excerpt',
      suggestion: 'Shorten the excerpt',
    });
  }

  // Check hero image
  if (task.mediaRequirements.heroRequired && !output.images.hero) {
    warnings.push({
      code: 'MISSING_HERO_IMAGE',
      message: 'Hero image required but not provided',
      severity: 'warning',
      field: 'images.hero',
      suggestion: 'Add a hero image or image placeholder',
    });
  }

  // Check inline images
  if (output.images.inline.length < task.mediaRequirements.inlineImagesMin) {
    warnings.push({
      code: 'INSUFFICIENT_INLINE_IMAGES',
      message: `${output.images.inline.length} inline images (minimum: ${task.mediaRequirements.inlineImagesMin})`,
      severity: 'warning',
      field: 'images.inline',
      suggestion: 'Add more inline images or placeholders',
    });
  }

  const hasErrors = warnings.some((w) => w.severity === 'error');

  return {
    valid: !hasErrors,
    warnings,
    stats,
  };
}

// ============================================================================
// STATS CALCULATION
// ============================================================================

function calculateStats(output: WordPressOutput): ValidationResult['stats'] {
  let blockCount = 0;
  let htmlBytes = 0;
  let wordCount = 0;
  let h2Count = 0;
  let h3Count = 0;
  let paragraphCount = 0;
  let maxParagraphWords = 0;
  let tableCount = 0;
  let maxTableRows = 0;

  function processBlock(block: WPBlock): void {
    blockCount++;
    htmlBytes += block.innerHTML?.length || 0;

    if (block.blockName === 'core/heading') {
      const level = block.attrs?.level as number;
      if (level === 2) h2Count++;
      if (level === 3) h3Count++;
    }

    if (block.blockName === 'core/paragraph') {
      paragraphCount++;
      const text = stripHtml(block.innerHTML || '');
      const words = countWords(text);
      wordCount += words;
      maxParagraphWords = Math.max(maxParagraphWords, words);
    }

    if (block.blockName === 'core/table') {
      tableCount++;
      const rows = (block.innerHTML || '').match(/<tr/gi)?.length || 0;
      maxTableRows = Math.max(maxTableRows, rows);
    }

    // Count words in other content blocks
    if (
      block.blockName === 'core/list' ||
      block.blockName === 'core/quote'
    ) {
      const text = stripHtml(block.innerHTML || '');
      wordCount += countWords(text);
    }

    // Process inner blocks
    if (block.innerBlocks) {
      for (const inner of block.innerBlocks) {
        processBlock(inner);
      }
    }
  }

  for (const block of output.blocks) {
    processBlock(block);
  }

  // Count keyphrase occurrences
  const keyphraseOccurrences = countKeyphraseOccurrences(
    output.blocks,
    output.seo.focusKeyphrase
  );

  // Calculate reading time (200 words per minute)
  const readingTimeMinutes = Math.ceil(wordCount / 200);

  return {
    blockCount,
    htmlBytes,
    wordCount,
    h2Count,
    h3Count,
    paragraphCount,
    maxParagraphWords,
    internalLinkCount: output.internalLinksUsed.length,
    imageCount: (output.images.hero ? 1 : 0) + output.images.inline.length,
    tableCount,
    maxTableRows,
    keyphraseOccurrences,
    readingTimeMinutes,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function countKeyphraseOccurrences(
  blocks: WPBlock[],
  keyphrase: string
): number {
  if (!keyphrase) return 0;

  const lowerKeyphrase = keyphrase.toLowerCase();
  let count = 0;

  function searchBlock(block: WPBlock): void {
    const text = (block.innerHTML || '').toLowerCase();
    const matches = text.split(lowerKeyphrase).length - 1;
    count += matches;

    if (block.innerBlocks) {
      for (const inner of block.innerBlocks) {
        searchBlock(inner);
      }
    }
  }

  for (const block of blocks) {
    searchBlock(block);
  }

  return count;
}

function checkForbiddenMarkup(blocks: WPBlock[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  function checkBlock(block: WPBlock): void {
    const html = block.innerHTML || '';

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(html)) {
        warnings.push({
          code: 'FORBIDDEN_MARKUP',
          message: `Forbidden pattern detected: ${pattern.source}`,
          severity: 'error',
          field: 'blocks',
          suggestion: 'Remove scripts, iframes, and inline event handlers',
        });
      }
    }

    if (block.innerBlocks) {
      for (const inner of block.innerBlocks) {
        checkBlock(inner);
      }
    }
  }

  for (const block of blocks) {
    checkBlock(block);
  }

  return warnings;
}

function checkForbiddenBlocks(blocks: WPBlock[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  function checkBlock(block: WPBlock): void {
    if (FORBIDDEN_BLOCK_TYPES.includes(block.blockName)) {
      warnings.push({
        code: 'FORBIDDEN_BLOCK_TYPE',
        message: `Block type "${block.blockName}" is not allowed`,
        severity: 'warning',
        field: 'blocks',
        suggestion: 'Convert to standard blocks (paragraph, heading, etc.)',
      });
    }

    if (block.innerBlocks) {
      for (const inner of block.innerBlocks) {
        checkBlock(inner);
      }
    }
  }

  for (const block of blocks) {
    checkBlock(block);
  }

  return warnings;
}

function validateSEO(output: WordPressOutput): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const { seo } = output;

  // Title length
  if (seo.seoTitle.length < 30) {
    warnings.push({
      code: 'SEO_TITLE_SHORT',
      message: `SEO title (${seo.seoTitle.length} chars) is shorter than 30 characters`,
      severity: 'warning',
      field: 'seo.seoTitle',
    });
  }
  if (seo.seoTitle.length > 60) {
    warnings.push({
      code: 'SEO_TITLE_LONG',
      message: `SEO title (${seo.seoTitle.length} chars) exceeds 60 characters`,
      severity: 'warning',
      field: 'seo.seoTitle',
    });
  }

  // Meta description length
  if (seo.metaDescription.length < 120) {
    warnings.push({
      code: 'META_DESC_SHORT',
      message: `Meta description (${seo.metaDescription.length} chars) is shorter than 120 characters`,
      severity: 'warning',
      field: 'seo.metaDescription',
    });
  }
  if (seo.metaDescription.length > 160) {
    warnings.push({
      code: 'META_DESC_LONG',
      message: `Meta description (${seo.metaDescription.length} chars) exceeds 160 characters`,
      severity: 'warning',
      field: 'seo.metaDescription',
    });
  }

  // Keyphrase length
  const keyphraseWords = seo.focusKeyphrase.split(/\s+/).length;
  if (keyphraseWords > 4) {
    warnings.push({
      code: 'KEYPHRASE_TOO_LONG',
      message: `Focus keyphrase (${keyphraseWords} words) exceeds 4 words`,
      severity: 'warning',
      field: 'seo.focusKeyphrase',
    });
  }

  // Check keyphrase in title
  if (
    !seo.seoTitle.toLowerCase().includes(seo.focusKeyphrase.toLowerCase())
  ) {
    warnings.push({
      code: 'KEYPHRASE_NOT_IN_TITLE',
      message: 'Focus keyphrase not found in SEO title',
      severity: 'warning',
      field: 'seo.seoTitle',
    });
  }

  // Check keyphrase in meta description
  if (
    !seo.metaDescription
      .toLowerCase()
      .includes(seo.focusKeyphrase.toLowerCase())
  ) {
    warnings.push({
      code: 'KEYPHRASE_NOT_IN_META',
      message: 'Focus keyphrase not found in meta description',
      severity: 'info',
      field: 'seo.metaDescription',
    });
  }

  return warnings;
}

// ============================================================================
// CONTENT HASH GENERATION
// ============================================================================

/**
 * Generate a deterministic hash for content change detection
 */
export function generateContentHash(output: WordPressOutput): string {
  const contentString = JSON.stringify({
    title: output.title,
    blocks: output.blocks.map((b) => ({
      blockName: b.blockName,
      innerHTML: b.innerHTML,
    })),
    seo: output.seo,
  });

  // Simple hash function (replace with crypto.subtle if needed)
  let hash = 0;
  for (let i = 0; i < contentString.length; i++) {
    const char = contentString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

export interface InputValidationResult {
  valid: boolean;
  errors: ValidationWarning[];
}

/**
 * Validate WriterTask inputs before generation
 */
export function validateWriterTaskInputs(
  task: WriterTask
): InputValidationResult {
  const errors: ValidationWarning[] = [];

  // Role required
  if (!task.role) {
    errors.push({
      code: 'MISSING_ROLE',
      message: 'Page role is required',
      severity: 'error',
      field: 'task.role',
    });
  }

  // Intent required
  if (!task.intent) {
    errors.push({
      code: 'MISSING_INTENT',
      message: 'Page intent is required',
      severity: 'error',
      field: 'task.intent',
    });
  }

  // Primary service validation
  if (!task.primaryService) {
    errors.push({
      code: 'MISSING_PRIMARY_SERVICE',
      message: 'Primary service is required',
      severity: 'error',
      field: 'task.primaryService',
    });
  } else if (
    task.primaryService.toLowerCase() === 'expertise' ||
    task.primaryService.toLowerCase() === 'services'
  ) {
    errors.push({
      code: 'GENERIC_PRIMARY_SERVICE',
      message: 'Primary service cannot be generic (e.g., "Expertise")',
      severity: 'error',
      field: 'task.primaryService',
    });
  }

  // Support page requirements
  if (task.role === 'support' && !task.supportsPage) {
    errors.push({
      code: 'MISSING_SUPPORTS_PAGE',
      message: 'Support pages must specify which page they support',
      severity: 'error',
      field: 'task.supportsPage',
    });
  }

  // WordPress constraints
  if (!task.wordpress.maxBlocks || task.wordpress.maxBlocks < 10) {
    errors.push({
      code: 'INVALID_MAX_BLOCKS',
      message: 'maxBlocks must be at least 10',
      severity: 'error',
      field: 'task.wordpress.maxBlocks',
    });
  }

  if (!task.wordpress.maxHtmlBytes || task.wordpress.maxHtmlBytes < 5000) {
    errors.push({
      code: 'INVALID_MAX_HTML',
      message: 'maxHtmlBytes must be at least 5000',
      severity: 'error',
      field: 'task.wordpress.maxHtmlBytes',
    });
  }

  // Proof requirements for money/trust pages
  if (
    (task.role === 'money' || task.role === 'trust') &&
    task.requiredProofElements.length === 0 &&
    task.requiredEEATSignals.length === 0
  ) {
    errors.push({
      code: 'MISSING_PROOF_SIGNALS',
      message: 'Money/trust pages require at least one proof element or EEAT signal',
      severity: 'error',
      field: 'task.requiredProofElements',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
