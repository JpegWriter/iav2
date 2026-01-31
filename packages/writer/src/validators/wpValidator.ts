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
    listCount: number;
    maxTableRows: number;
    keyphraseOccurrences: number;
    readingTimeMinutes: number;
    // New: Upgrade rules validation
    hasDecisionChecklist: boolean;
    hasComparisonTable: boolean;
    hasAeoQASection: boolean;
    aeoQuestionCount: number;
    focusKeywordInFirst150Words: boolean;
    focusKeywordInMetaDescription: boolean;
    eeatScore: number;
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

  // =========================================================================
  // AUTHORITY CONTENT ENFORCEMENT (STEP 2 - LENGTH)
  // =========================================================================
  
  // Enforce minimum word count - articles under this are not authority content
  const MIN_WORDS = task.targetWordCount ?? 1500;
  if (stats.wordCount < MIN_WORDS) {
    warnings.push({
      code: 'CONTENT_TOO_SHORT',
      message: `Article too short (${stats.wordCount} words). Minimum required: ${MIN_WORDS}.`,
      severity: 'error',
      field: 'blocks',
      suggestion: 'Expand sections with more detail, add decision support section, expand FAQ answers',
    });
  }

  // Enforce minimum reading time
  const MIN_READING_MINUTES = task.readingTimeTarget ?? 7;
  if (stats.readingTimeMinutes < MIN_READING_MINUTES) {
    warnings.push({
      code: 'READING_TIME_TOO_LOW',
      message: `Reading time too low (${stats.readingTimeMinutes} min). Target: ${MIN_READING_MINUTES} min.`,
      severity: 'warning',
      field: 'blocks',
      suggestion: 'Add more substantive content to each section',
    });
  }

  // =========================================================================
  // IMAGE BLOCK SAFETY (STEP 3 - NO EMPTY IMAGE BLOCKS)
  // =========================================================================
  
  output.blocks.forEach((block, index) => {
    if (block.blockName === 'core/image') {
      const hasUrl = block.attrs?.url;
      const hasInnerHtml = block.innerHTML?.includes('<img') || block.innerHTML?.includes('<figure');

      if (!hasUrl && !hasInnerHtml) {
        warnings.push({
          code: 'INVALID_IMAGE_BLOCK',
          message: `Invalid image block at index ${index}. Image blocks must include url and innerHTML.`,
          severity: 'error',
          field: 'blocks',
          suggestion: 'Remove empty image block or add PLACEHOLDER:description in url attr',
        });
      }

      // Check for empty innerHTML specifically
      if (block.innerHTML === '' || block.innerHTML === null) {
        warnings.push({
          code: 'EMPTY_IMAGE_BLOCK',
          message: `Empty innerHTML in image block at index ${index}. This will break rendering.`,
          severity: 'error',
          field: 'blocks',
          suggestion: 'Add proper <figure><img/></figure> structure or remove the block',
        });
      }
    }
  });

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

  // =========================================================================
  // VISION ANALYSIS USAGE CHECK (STEP 6 - EEAT ENFORCEMENT)
  // =========================================================================
  
  // If vision analysis was provided, check if it was actually used
  if (task.visionAnalysis && Object.keys(task.visionAnalysis).length > 0) {
    const fullText = output.blocks.map(b => b.innerHTML || '').join(' ').toLowerCase();
    const visionPatterns = [
      /we see/i,
      /we observe/i,
      /in practice/i,
      /from the images/i,
      /visual evidence/i,
      /the images show/i,
      /analysis reveals/i,
      /visual inspection/i,
      /from our analysis/i,
      /pattern (we|that) (see|observe)/i,
    ];
    
    const usedVision = visionPatterns.some(pattern => pattern.test(fullText));
    
    if (!usedVision) {
      warnings.push({
        code: 'VISION_NOT_USED',
        message: 'Vision analysis was provided but not referenced in the content.',
        severity: 'warning',
        field: 'blocks',
        suggestion: 'Include phrases like "From the images provided..." or "The visual evidence suggests..."',
      });
    }
  }

  // =========================================================================
  // AUTHORITY STRUCTURE CHECKS
  // =========================================================================
  
  // Check for decision support section (checklist, table, or comparison)
  const hasDecisionSupport = output.blocks.some(block => 
    block.blockName === 'core/list' || 
    block.blockName === 'core/table' ||
    (block.innerHTML && (
      block.innerHTML.includes('checklist') ||
      block.innerHTML.includes('right for you') ||
      block.innerHTML.includes('consider if')
    ))
  );
  
  if (!hasDecisionSupport && stats.wordCount >= 1000) {
    warnings.push({
      code: 'MISSING_DECISION_SUPPORT',
      message: 'No decision support section (checklist or comparison table) found.',
      severity: 'warning',
      field: 'blocks',
      suggestion: 'Add a "Is this right for you?" checklist or comparison table',
    });
  }

  // Check for FAQ section (common questions pattern)
  const hasFAQ = output.blocks.some(block => 
    block.innerHTML && (
      block.innerHTML.toLowerCase().includes('common questions') ||
      block.innerHTML.toLowerCase().includes('frequently asked') ||
      block.innerHTML.toLowerCase().includes('faq')
    )
  );
  
  if (!hasFAQ && stats.wordCount >= 1200) {
    warnings.push({
      code: 'MISSING_FAQ_SECTION',
      message: 'No FAQ/Common Questions section found for authority content.',
      severity: 'warning',
      field: 'blocks',
      suggestion: 'Add "Common Questions About [Topic]" section with 5-7 questions',
    });
  }

  // =========================================================================
  // EEAT SCORE GATE (Deterministic heuristic scoring)
  // =========================================================================
  
  const fullText = output.blocks.map(b => b.innerHTML || '').join(' ');
  const eeatScore = scoreEEAT(fullText, output.blocks, task);
  const minEEATScore = task.minEEATScore ?? 70;
  
  if (eeatScore.score < minEEATScore) {
    warnings.push({
      code: 'EEAT_SCORE_TOO_LOW',
      message: `EEAT score ${eeatScore.score}/${eeatScore.max}. Minimum required: ${minEEATScore}. Missing: ${eeatScore.missing.join(', ')}`,
      severity: 'error',
      field: 'blocks',
      suggestion: 'Add first-party experience markers, decision support, trade-offs, and process explanations',
    });
  }

  // =========================================================================
  // VISION REQUIRED NOT USED (stricter than VISION_NOT_USED warning)
  // =========================================================================
  
  if (task.requiresVisionUsage && task.visionProvided) {
    const visionMarkers = /(from the visuals|from the images|across the analysed|we see|in practice)/i;
    if (!visionMarkers.test(fullText)) {
      warnings.push({
        code: 'VISION_REQUIRED_NOT_USED',
        message: 'Vision analysis was provided but not referenced using evidence-based language.',
        severity: 'error',
        field: 'blocks',
        suggestion: 'Reference vision analysis with "From the visuals provided..." or "Across the analysed images..."',
      });
    }
  }

  // =========================================================================
  // UPGRADE RULES VALIDATION (IF DEFINED)
  // =========================================================================
  
  if (task.upgradeRules) {
    const rules = task.upgradeRules;
    
    // Check decision checklist requirement
    if (rules.mustInclude?.decisionChecklist && !stats.hasDecisionChecklist) {
      warnings.push({
        code: 'MISSING_DECISION_CHECKLIST',
        message: 'Decision checklist required but not found.',
        severity: 'error',
        field: 'blocks',
        suggestion: 'Add a checklist with "What to look for", "How to choose", or "Questions to ask"',
      });
    }
    
    // Check comparison table requirement
    if (rules.mustInclude?.comparisonTable && !stats.hasComparisonTable) {
      warnings.push({
        code: 'MISSING_COMPARISON_TABLE',
        message: 'Comparison table required but not found.',
        severity: 'error',
        field: 'blocks',
        suggestion: 'Add a table comparing options, features, or scenarios',
      });
    }
    
    // Check AEO Q&A section requirement
    if (rules.mustInclude?.aeoQASection?.enabled) {
      if (!stats.hasAeoQASection) {
        warnings.push({
          code: 'MISSING_AEO_QA_SECTION',
          message: 'AEO Q&A section required but not found.',
          severity: 'error',
          field: 'blocks',
          suggestion: `Add "${rules.mustInclude.aeoQASection.titlePattern.replace('{{topic}}', '[Topic]')}" section`,
        });
      } else if (stats.aeoQuestionCount < (rules.mustInclude.aeoQASection.minQuestions || 5)) {
        warnings.push({
          code: 'INSUFFICIENT_AEO_QUESTIONS',
          message: `Only ${stats.aeoQuestionCount} questions in AEO section. Minimum: ${rules.mustInclude.aeoQASection.minQuestions || 5}`,
          severity: 'warning',
          field: 'blocks',
          suggestion: 'Add more questions to the FAQ section',
        });
      }
    }
    
    // Check paragraph length
    if (rules.style?.maxParagraphWords && stats.maxParagraphWords > rules.style.maxParagraphWords) {
      warnings.push({
        code: 'PARAGRAPH_TOO_LONG',
        message: `Longest paragraph (${stats.maxParagraphWords} words) exceeds maximum (${rules.style.maxParagraphWords})`,
        severity: 'warning',
        field: 'blocks',
        suggestion: 'Break up long paragraphs for better scannability',
      });
    }
    
    // Check SEO field requirements
    if (rules.seoFields?.enforceFocusKeywordInFirst150Words && !stats.focusKeywordInFirst150Words) {
      warnings.push({
        code: 'FOCUS_KEYWORD_NOT_IN_INTRO',
        message: 'Focus keyword not found in first 150 words.',
        severity: 'warning',
        field: 'seo.focusKeyphrase',
        suggestion: 'Add focus keyword naturally in the introduction',
      });
    }
    
    if (rules.seoFields?.enforceFocusKeywordInMetaDescription && !stats.focusKeywordInMetaDescription) {
      warnings.push({
        code: 'FOCUS_KEYWORD_NOT_IN_META',
        message: 'Focus keyword not found in meta description.',
        severity: 'warning',
        field: 'seo.metaDescription',
        suggestion: 'Include focus keyword in the meta description',
      });
    }
    
    // Check for hype claims if noHypeClaims is enabled
    if (rules.style?.noHypeClaims) {
      const hypePatterns = /\b(best|leading|world-class|premier|top-rated|#1|number one|unmatched|unparalleled|guaranteed results)\b/i;
      if (hypePatterns.test(fullText)) {
        warnings.push({
          code: 'HYPE_CLAIMS_DETECTED',
          message: 'Hype language detected. Content should use calm, experienced tone.',
          severity: 'warning',
          field: 'blocks',
          suggestion: 'Remove superlatives like "best", "leading", "world-class" unless explicitly supported',
        });
      }
    }
  }

  // =========================================================================
  // SEO DRAFTS ENFORCEMENT (Plan-time drafts are source of truth)
  // =========================================================================
  
  const seoDraftsWarnings = validateSeoDrafts(output, task);
  warnings.push(...seoDraftsWarnings);

  // =========================================================================
  // VISION FACTS ENFORCEMENT
  // =========================================================================
  
  const visionFactsWarnings = validateVisionFactsUsage(output, task);
  warnings.push(...visionFactsWarnings);

  // Update stats with EEAT score
  stats.eeatScore = eeatScore.score;

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
  let listCount = 0;
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

    if (block.blockName === 'core/list') {
      listCount++;
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

  // Full text for analysis
  const fullText = output.blocks.map(b => b.innerHTML || '').join(' ');
  
  // Check for decision checklist (list with decision-related language)
  const hasDecisionChecklist = output.blocks.some(block => {
    if (block.blockName !== 'core/list') return false;
    const text = (block.innerHTML || '').toLowerCase();
    return /(what to look for|how to choose|checklist|consider|ask yourself|prepare|before you|questions to ask)/i.test(text);
  });

  // Check for comparison table
  const hasComparisonTable = tableCount > 0 && output.blocks.some(block => {
    if (block.blockName !== 'core/table') return false;
    const text = (block.innerHTML || '').toLowerCase();
    return /(vs|versus|compare|comparison|option|pros|cons|advantage|disadvantage)/i.test(text);
  });

  // Check for AEO Q&A section
  const aeoPatterns = /(common questions|frequently asked|faq|q&a|questions about)/i;
  const hasAeoQASection = aeoPatterns.test(fullText);
  
  // Count questions in FAQ section (look for ? in content after FAQ heading)
  let aeoQuestionCount = 0;
  let inFaqSection = false;
  for (const block of output.blocks) {
    if (block.blockName === 'core/heading' && aeoPatterns.test(block.innerHTML || '')) {
      inFaqSection = true;
    } else if (inFaqSection && block.blockName === 'core/heading') {
      const level = block.attrs?.level as number;
      if (level === 2) inFaqSection = false; // End of FAQ section
      if (level === 3) aeoQuestionCount++; // Each H3 is a question
    }
  }

  // Check focus keyword in first 150 words
  const first150Words = fullText.split(/\s+/).slice(0, 150).join(' ').toLowerCase();
  const focusKeyword = (output.seo.focusKeyphrase || '').toLowerCase();
  const focusKeywordInFirst150Words = focusKeyword.length > 0 && first150Words.includes(focusKeyword);

  // Check focus keyword in meta description
  const metaDesc = (output.seo.metaDescription || '').toLowerCase();
  const focusKeywordInMetaDescription = focusKeyword.length > 0 && metaDesc.includes(focusKeyword);

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
    listCount,
    maxTableRows,
    keyphraseOccurrences,
    readingTimeMinutes,
    hasDecisionChecklist,
    hasComparisonTable,
    hasAeoQASection,
    aeoQuestionCount,
    focusKeywordInFirst150Words,
    focusKeywordInMetaDescription,
    eeatScore: 0, // Will be calculated separately by scoreEEAT
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

// ============================================================================
// REWRITE CONTEXT VALIDATOR
// ============================================================================
// Validates that update/rewrite mode has all required context

export interface RewriteValidationResult {
  valid: boolean;
  errors: ValidationWarning[];
  warnings: ValidationWarning[];
}

export function validateRewriteContext(
  rewriteContext: {
    originalUrl?: string;
    originalTitle?: string;
    originalH1?: string;
    originalContent?: string;
    originalWordCount?: number;
    preserveElements?: string[];
    removeElements?: string[];
  } | undefined
): RewriteValidationResult {
  const errors: ValidationWarning[] = [];
  const warnings: ValidationWarning[] = [];

  if (!rewriteContext) {
    errors.push({
      code: 'MISSING_REWRITE_CONTEXT',
      message: 'Update mode requires rewrite context with original page data',
      severity: 'error',
      field: 'rewriteContext',
      suggestion: 'Provide originalUrl and fetch page data from crawl',
    });
    return { valid: false, errors, warnings };
  }

  // Required: originalUrl
  if (!rewriteContext.originalUrl) {
    errors.push({
      code: 'MISSING_ORIGINAL_URL',
      message: 'Rewrite context must include the original page URL',
      severity: 'error',
      field: 'rewriteContext.originalUrl',
      suggestion: 'Provide the URL of the page being rewritten',
    });
  }

  // Required: originalContent (or we can't properly rewrite)
  if (!rewriteContext.originalContent) {
    errors.push({
      code: 'MISSING_ORIGINAL_CONTENT',
      message: 'Rewrite context must include the original page content',
      severity: 'error',
      field: 'rewriteContext.originalContent',
      suggestion: 'Fetch and clean the original page content from crawl data',
    });
  }

  // Warning: originalContent too short
  const wordCount = rewriteContext.originalWordCount || 
    (rewriteContext.originalContent?.split(/\s+/).length || 0);
  
  if (wordCount > 0 && wordCount < 200) {
    warnings.push({
      code: 'SHORT_ORIGINAL_CONTENT',
      message: `Original content is very short (${wordCount} words). Consider treating as new content instead.`,
      severity: 'warning',
      field: 'rewriteContext.originalContent',
      suggestion: 'Verify this is the correct page or switch to create mode',
    });
  }

  // Warning: no preservation rules
  if (
    (!rewriteContext.preserveElements || rewriteContext.preserveElements.length === 0) &&
    (!rewriteContext.removeElements || rewriteContext.removeElements.length === 0)
  ) {
    warnings.push({
      code: 'NO_PRESERVATION_RULES',
      message: 'No preservation or removal rules specified for rewrite',
      severity: 'warning',
      field: 'rewriteContext.preserveElements',
      suggestion: 'Consider specifying which elements to preserve (pricing, legal disclaimers) or remove',
    });
  }

  // Warning: missing title/H1
  if (!rewriteContext.originalTitle && !rewriteContext.originalH1) {
    warnings.push({
      code: 'MISSING_ORIGINAL_HEADING',
      message: 'Original title and H1 not provided. Generated title may not maintain continuity.',
      severity: 'warning',
      field: 'rewriteContext.originalTitle',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// COMPLIANCE VALIDATOR
// ============================================================================
// Validates output against master profile compliance rules

export function validateComplianceRules(
  outputHtml: string,
  masterProfile: {
    brandVoice: {
      tabooWords: string[];
      mustSay: string[];
      mustNotSay: string[];
      complianceNotes: string[];
    };
    proofAtoms: Array<{
      claimsPolicy: {
        mustBeVerifiable: boolean;
        forbiddenPhrases: string[];
      };
    }>;
  }
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const lowerHtml = outputHtml.toLowerCase();

  // Check taboo words
  for (const taboo of masterProfile.brandVoice.tabooWords) {
    if (lowerHtml.includes(taboo.toLowerCase())) {
      warnings.push({
        code: 'TABOO_WORD_FOUND',
        message: `Output contains taboo word: "${taboo}"`,
        severity: 'warning',
        field: 'content',
        suggestion: `Replace "${taboo}" with an approved alternative`,
      });
    }
  }

  // Check mustNotSay phrases
  for (const phrase of masterProfile.brandVoice.mustNotSay) {
    if (lowerHtml.includes(phrase.toLowerCase())) {
      warnings.push({
        code: 'FORBIDDEN_PHRASE_FOUND',
        message: `Output contains forbidden phrase: "${phrase}"`,
        severity: 'error',
        field: 'content',
        suggestion: `Remove or rephrase: "${phrase}"`,
      });
    }
  }

  // Check mustSay phrases (optional)
  for (const phrase of masterProfile.brandVoice.mustSay) {
    if (!lowerHtml.includes(phrase.toLowerCase())) {
      warnings.push({
        code: 'MISSING_REQUIRED_PHRASE',
        message: `Output missing required phrase: "${phrase}"`,
        severity: 'warning',
        field: 'content',
        suggestion: `Include phrase: "${phrase}"`,
      });
    }
  }

  // Check proof atoms forbidden phrases
  for (const atom of masterProfile.proofAtoms) {
    for (const forbidden of atom.claimsPolicy.forbiddenPhrases) {
      if (lowerHtml.includes(forbidden.toLowerCase())) {
        warnings.push({
          code: 'FORBIDDEN_CLAIM_PHRASE',
          message: `Output contains forbidden claim phrase: "${forbidden}"`,
          severity: 'error',
          field: 'content',
          suggestion: `This phrase violates claims policy. Remove or verify.`,
        });
      }
    }
  }

  return warnings;
}

// ============================================================================
// EEAT SCORE FUNCTION (Deterministic heuristic scoring)
// ============================================================================

interface EEATScoreResult {
  score: number;
  max: number;
  missing: string[];
}

/**
 * Deterministic EEAT scoring based on presence of authority signals.
 * Intentionally boring and tuneable - adjust weights as needed.
 * 
 * Score breakdown (max 100):
 * - AEO Q&A section: 15 points
 * - Comparison table: 10 points
 * - Checklist/list: 10 points
 * - Decision-support language: 15 points
 * - First-party experience markers: 20 points
 * - Trade-offs/nuance: 10 points
 * - Process explanation: 10 points
 * - Local/context signals: 10 points
 */
function scoreEEAT(text: string, blocks: any[], task: any): EEATScoreResult {
  const missing: string[] = [];
  let score = 0;
  const max = 100;

  // Check for AEO Q&A section
  const hasAeoSection = /Common Questions About|Frequently Asked|FAQ/i.test(text);
  if (hasAeoSection) {
    score += 15;
  } else {
    missing.push('AEO Q&A section');
  }

  // Check for comparison table
  const hasTable = blocks.some(
    (b: any) => b?.blockName === 'core/table' || /<table/i.test(b?.innerHTML ?? '')
  );
  if (hasTable) {
    score += 10;
  } else {
    missing.push('comparison table');
  }

  // Check for checklist/list
  const hasChecklist = /<ul>|<ol>/i.test(text);
  if (hasChecklist) {
    score += 10;
  } else {
    missing.push('checklist/list');
  }

  // Check for decision-support language
  const hasDecisionLanguage = /(what to look for|how to choose|is this right for you|compare|criteria|consider if)/i.test(text);
  if (hasDecisionLanguage) {
    score += 15;
  } else {
    missing.push('decision-support language');
  }

  // Check for first-party experience markers (most important - 20 pts)
  const hasFirstParty = /(in our experience|we often see|in practice|we typically|a common scenario|we recommend|we've found|from our work)/i.test(text);
  if (hasFirstParty) {
    score += 20;
  } else {
    missing.push('first-party experience markers');
  }

  // Check for trade-offs and nuance
  const hasTradeoffs = /(however|on the other hand|trade[- ]off|depends on|in some cases|that said|the downside)/i.test(text);
  if (hasTradeoffs) {
    score += 10;
  } else {
    missing.push('trade-offs/nuance');
  }

  // Check for process explanation
  const hasProcess = /(step|process|stages|how it works|what happens next|first.*then|the process)/i.test(text);
  if (hasProcess) {
    score += 10;
  } else {
    missing.push('process explanation');
  }

  // Check for local/context signals (only if geo context was provided)
  const geoProvided = task?.geoProvided === true;
  if (geoProvided) {
    const hasLocalContext = /(in this area|locally|nearby|neighbourhood|local market|in [A-Z][a-z]+)/i.test(text);
    if (hasLocalContext) {
      score += 10;
    } else {
      missing.push('local/context signals');
    }
  } else {
    // Give the points if geo wasn't required
    score += 10;
  }

  // Cap at max
  score = Math.min(max, score);

  return { score, max, missing };
}

// ============================================================================
// SEO DRAFTS VALIDATION
// ============================================================================
// Validates that plan-time SEO drafts are applied by the writer

function validateSeoDrafts(
  output: WordPressOutput,
  task: WriterTask
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  
  // Check if plan-time drafts exist on the task
  const seoDrafts = task.seoDrafts;
  
  if (!seoDrafts) {
    // No drafts provided - this is a warning for new-style tasks
    if (task.enforceSeoDrafts) {
      warnings.push({
        code: 'SEO_DRAFTS_MISSING',
        message: 'SEO drafts (seoTitleDraft, h1Draft, metaDescriptionDraft) not provided in task.',
        severity: 'error',
        field: 'seoDrafts',
        suggestion: 'Run plan refinement to generate SEO drafts before writing',
      });
    }
    return warnings;
  }

  // Validate title tag matches seoTitleDraft
  if (seoDrafts.seoTitleDraft) {
    const titleMatch = fuzzyMatch(output.seo.seoTitle, seoDrafts.seoTitleDraft, 0.8);
    if (!titleMatch) {
      warnings.push({
        code: 'SEO_TITLE_NOT_APPLIED',
        message: `Title tag doesn't match plan draft. Expected: "${seoDrafts.seoTitleDraft}"`,
        severity: 'error',
        field: 'seo.seoTitle',
        suggestion: `Use the planned title: "${seoDrafts.seoTitleDraft}"`,
      });
    }
  }

  // Validate H1 matches h1Draft
  if (seoDrafts.h1Draft) {
    const firstH1 = findFirstH1(output.blocks);
    if (!firstH1) {
      warnings.push({
        code: 'H1_MISSING',
        message: 'No H1 heading found in content.',
        severity: 'error',
        field: 'blocks',
        suggestion: `Add H1: "${seoDrafts.h1Draft}"`,
      });
    } else {
      const h1Match = fuzzyMatch(stripHtml(firstH1), seoDrafts.h1Draft, 0.8);
      if (!h1Match) {
        warnings.push({
          code: 'H1_NOT_APPLIED',
          message: `H1 doesn't match plan draft. Expected: "${seoDrafts.h1Draft}"`,
          severity: 'error',
          field: 'blocks',
          suggestion: `Use the planned H1: "${seoDrafts.h1Draft}"`,
        });
      }
    }
  }

  // Validate meta description matches metaDescriptionDraft
  if (seoDrafts.metaDescriptionDraft) {
    const metaMatch = fuzzyMatch(output.seo.metaDescription, seoDrafts.metaDescriptionDraft, 0.7);
    if (!metaMatch) {
      warnings.push({
        code: 'META_DESCRIPTION_NOT_APPLIED',
        message: `Meta description doesn't match plan draft. Expected: "${seoDrafts.metaDescriptionDraft}"`,
        severity: 'error',
        field: 'seo.metaDescription',
        suggestion: `Use the planned meta: "${seoDrafts.metaDescriptionDraft}"`,
      });
    }
  }

  return warnings;
}

function findFirstH1(blocks: WPBlock[]): string | null {
  for (const block of blocks) {
    if (block.blockName === 'core/heading' && block.attrs?.level === 1) {
      return block.innerHTML || null;
    }
    if (block.innerBlocks && block.innerBlocks.length > 0) {
      const found = findFirstH1(block.innerBlocks);
      if (found) return found;
    }
  }
  return null;
}

function fuzzyMatch(actual: string, expected: string, threshold: number): boolean {
  if (!actual || !expected) return false;
  
  const normalizeText = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const a = normalizeText(actual);
  const e = normalizeText(expected);
  
  // Exact match
  if (a === e) return true;
  
  // Contains match (actual contains expected core)
  if (a.includes(e.slice(0, Math.floor(e.length * 0.7)))) return true;
  
  // Word overlap match
  const aWords = new Set(a.split(/\s+/));
  const eWords = e.split(/\s+/);
  const matchedWords = eWords.filter(w => aWords.has(w));
  const matchRatio = matchedWords.length / eWords.length;
  
  return matchRatio >= threshold;
}

// ============================================================================
// VISION FACTS VALIDATION
// ============================================================================
// Validates that provided vision facts are incorporated into the content

function validateVisionFactsUsage(
  output: WordPressOutput,
  task: WriterTask
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  
  // Get vision facts from task
  const visionFacts = task.visionFacts;
  
  if (!visionFacts || visionFacts.length === 0) {
    return warnings; // No facts to validate
  }

  const fullText = extractAllText(output);
  const lowerText = fullText.toLowerCase();

  // Check how many facts are present
  let factsFound = 0;
  const missingFacts: string[] = [];
  
  for (const fact of visionFacts) {
    // Check for fact presence (at least 60% of significant words)
    const factWords = fact.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4);
    
    const matchedWords = factWords.filter(word => lowerText.includes(word));
    
    if (matchedWords.length >= Math.ceil(factWords.length * 0.6)) {
      factsFound++;
    } else {
      missingFacts.push(fact.slice(0, 50) + (fact.length > 50 ? '...' : ''));
    }
  }

  // Require at least 3 facts or all facts if fewer than 3
  const minRequired = Math.min(3, visionFacts.length);
  
  if (factsFound < minRequired) {
    warnings.push({
      code: 'VISION_FACTS_NOT_USED',
      message: `Only ${factsFound}/${visionFacts.length} vision facts incorporated. Minimum required: ${minRequired}.`,
      severity: 'error',
      field: 'blocks',
      suggestion: `Missing facts: ${missingFacts.slice(0, 3).join('; ')}`,
    });
  }

  // Check for evidence marker phrases
  const evidenceMarkers = [
    'in practice',
    'from the visuals',
    'we often see',
    'from recent site visits',
    'on the ground',
    'based on local inspections',
    'we\'ve observed',
    'during recent work',
  ];
  
  const hasEvidenceMarker = evidenceMarkers.some(marker => 
    lowerText.includes(marker.toLowerCase())
  );
  
  if (!hasEvidenceMarker && visionFacts.length > 0) {
    warnings.push({
      code: 'MISSING_EVIDENCE_MARKER',
      message: 'Vision facts provided but no evidence marker phrases found.',
      severity: 'warning',
      field: 'blocks',
      suggestion: 'Use phrases like "In practice, we\'ve observed..." or "From recent site visits..."',
    });
  }

  // Check for dedicated evidence section
  const hasEvidenceSection = /(what we've seen in practice|local evidence|on-site observations)/i.test(fullText);
  
  if (!hasEvidenceSection && visionFacts.length >= 2) {
    warnings.push({
      code: 'MISSING_EVIDENCE_SECTION',
      message: 'Multiple vision facts provided but no dedicated evidence section.',
      severity: 'warning',
      field: 'blocks',
      suggestion: 'Add a section titled "What We\'ve Seen in Practice" or "Local Evidence"',
    });
  }

  return warnings;
}

function extractAllText(output: WordPressOutput): string {
  const texts: string[] = [];
  
  // Extract from blocks
  if (output.blocks) {
    for (const block of output.blocks) {
      if (block.innerHTML) {
        texts.push(stripHtml(block.innerHTML));
      }
      if (block.innerBlocks) {
        for (const inner of block.innerBlocks) {
          if (inner.innerHTML) {
            texts.push(stripHtml(inner.innerHTML));
          }
        }
      }
    }
  }

  // Extract from SEO
  if (output.seo) {
    if (output.seo.metaDescription) texts.push(output.seo.metaDescription);
    if (output.seo.titleTag) texts.push(output.seo.titleTag);
  }

  // Extract from FAQs
  if (output.faq) {
    for (const qa of output.faq) {
      texts.push(qa.question);
      texts.push(qa.answer);
    }
  }

  return texts.join(' ');
}