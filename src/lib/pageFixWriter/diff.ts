/**
 * Page Fix Diff Utility
 * 
 * Generates human-readable diffs between original and proposed content.
 * Powers the "What Changed & Why" panel in the Fix Workspace.
 */

import type {
  PageSnapshot,
  PageFixOutput,
  PageFixDiff,
  FieldDiff,
  SectionDiff,
  SectionType,
} from './types';
import { createHash } from 'crypto';

// ============================================================================
// MAIN DIFF FUNCTION
// ============================================================================

export function generatePageFixDiff(
  versionId: string,
  pageId: string,
  original: PageSnapshot,
  proposed: PageFixOutput
): PageFixDiff {
  // Calculate field-level diffs
  const fields = {
    title: diffField(original.title, proposed.title),
    metaDescription: diffField(original.metaDescription, proposed.metaDescription),
    h1: diffField(original.h1, proposed.h1),
  };

  // Calculate section diffs
  const sectionDiffs = diffSections(original, proposed);

  // Calculate summary stats
  const summary = calculateSummary(original, proposed, sectionDiffs);

  // Build human-readable explanations
  const explanations = buildExplanations(fields, sectionDiffs, proposed);

  return {
    versionId,
    pageId,
    url: original.url,
    summary,
    fields,
    sectionDiffs,
    explanations,
    warnings: [], // Populated by validators
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// FIELD DIFF
// ============================================================================

function diffField(before: string, after: string): FieldDiff {
  return {
    before: before || '',
    after: after || '',
    changed: (before || '') !== (after || ''),
  };
}

// ============================================================================
// SECTION DIFF
// ============================================================================

function diffSections(
  original: PageSnapshot,
  proposed: PageFixOutput
): SectionDiff[] {
  const diffs: SectionDiff[] = [];

  // Parse original content into pseudo-sections
  const originalSections = parseOriginalIntoSections(original);

  // Track which original sections have been matched
  const matchedOriginal = new Set<number>();

  // For each proposed section, find if it matches an original
  for (const proposedSection of proposed.sections) {
    const proposedHash = hashContent(proposedSection.html);
    
    // Check if this section is marked as replacing something
    if (proposedSection.replacesOriginal) {
      const originalIdx = originalSections.findIndex(
        os => hashContent(os.html) === proposedSection.replacesOriginal
      );
      
      if (originalIdx !== -1) {
        matchedOriginal.add(originalIdx);
        diffs.push({
          type: proposedSection.type,
          operation: 'modified',
          beforeHtml: originalSections[originalIdx].html,
          afterHtml: proposedSection.html,
          changeDescription: describeChange(
            originalSections[originalIdx].html,
            proposedSection.html
          ),
        });
        continue;
      }
    }

    // Check if it's a new section
    if (proposedSection.isNew) {
      diffs.push({
        type: proposedSection.type,
        operation: 'added',
        afterHtml: proposedSection.html,
        changeDescription: `New ${proposedSection.type} section added`,
      });
      continue;
    }

    // Try to fuzzy match with original content
    const bestMatch = findBestMatch(proposedSection.html, originalSections, matchedOriginal);
    
    if (bestMatch.index !== -1 && bestMatch.similarity > 0.3) {
      matchedOriginal.add(bestMatch.index);
      
      if (bestMatch.similarity > 0.95) {
        diffs.push({
          type: proposedSection.type,
          operation: 'unchanged',
          beforeHtml: originalSections[bestMatch.index].html,
          afterHtml: proposedSection.html,
        });
      } else {
        diffs.push({
          type: proposedSection.type,
          operation: 'modified',
          beforeHtml: originalSections[bestMatch.index].html,
          afterHtml: proposedSection.html,
          changeDescription: describeChange(
            originalSections[bestMatch.index].html,
            proposedSection.html
          ),
        });
      }
    } else {
      diffs.push({
        type: proposedSection.type,
        operation: 'added',
        afterHtml: proposedSection.html,
        changeDescription: `New ${proposedSection.type} section added`,
      });
    }
  }

  // Any unmatched original sections were removed
  for (let i = 0; i < originalSections.length; i++) {
    if (!matchedOriginal.has(i)) {
      diffs.push({
        type: 'custom',
        operation: 'removed',
        beforeHtml: originalSections[i].html,
        changeDescription: 'Section removed or consolidated',
      });
    }
  }

  return diffs;
}

// ============================================================================
// PARSE ORIGINAL CONTENT
// ============================================================================

interface OriginalSection {
  html: string;
  type: 'heading' | 'paragraph' | 'list' | 'other';
}

function parseOriginalIntoSections(original: PageSnapshot): OriginalSection[] {
  const sections: OriginalSection[] = [];
  
  // Split by major HTML elements
  const html = original.bodyHtml || '';
  
  // Simple regex-based splitting (could be improved with proper HTML parsing)
  const patterns = [
    { regex: /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, type: 'heading' as const },
    { regex: /<p[^>]*>[\s\S]*?<\/p>/gi, type: 'paragraph' as const },
    { regex: /<ul[^>]*>[\s\S]*?<\/ul>/gi, type: 'list' as const },
    { regex: /<ol[^>]*>[\s\S]*?<\/ol>/gi, type: 'list' as const },
    { regex: /<div[^>]*>[\s\S]*?<\/div>/gi, type: 'other' as const },
  ];

  const allMatches: { html: string; type: OriginalSection['type']; index: number }[] = [];

  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.regex);
    while ((match = regex.exec(html)) !== null) {
      allMatches.push({
        html: match[0],
        type: pattern.type,
        index: match.index,
      });
    }
  }

  // Sort by position and dedupe overlapping matches
  allMatches.sort((a, b) => a.index - b.index);

  let lastEnd = 0;
  for (const match of allMatches) {
    if (match.index >= lastEnd) {
      sections.push({ html: match.html, type: match.type });
      lastEnd = match.index + match.html.length;
    }
  }

  return sections;
}

// ============================================================================
// FUZZY MATCHING
// ============================================================================

function findBestMatch(
  proposedHtml: string,
  originalSections: OriginalSection[],
  excluded: Set<number>
): { index: number; similarity: number } {
  let bestIndex = -1;
  let bestSimilarity = 0;

  const proposedText = stripHtml(proposedHtml).toLowerCase();

  for (let i = 0; i < originalSections.length; i++) {
    if (excluded.has(i)) continue;

    const originalText = stripHtml(originalSections[i].html).toLowerCase();
    const similarity = calculateSimilarity(proposedText, originalText);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestIndex = i;
    }
  }

  return { index: bestIndex, similarity: bestSimilarity };
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Simple word overlap similarity
  const wordsAArray = a.split(/\s+/).filter(w => w.length > 2);
  const wordsBArray = b.split(/\s+/).filter(w => w.length > 2);
  const wordsA = new Set(wordsAArray);
  const wordsB = new Set(wordsBArray);

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  wordsAArray.forEach(word => {
    if (wordsB.has(word)) intersection++;
  });

  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union; // Jaccard similarity
}

// ============================================================================
// CHANGE DESCRIPTION
// ============================================================================

function describeChange(beforeHtml: string, afterHtml: string): string {
  const beforeText = stripHtml(beforeHtml);
  const afterText = stripHtml(afterHtml);

  const beforeWords = beforeText.split(/\s+/).length;
  const afterWords = afterText.split(/\s+/).length;
  const wordDiff = afterWords - beforeWords;

  const parts: string[] = [];

  if (wordDiff > 20) {
    parts.push(`Expanded content (+${wordDiff} words)`);
  } else if (wordDiff < -20) {
    parts.push(`Condensed content (${wordDiff} words)`);
  } else if (Math.abs(wordDiff) > 5) {
    parts.push(wordDiff > 0 ? `Slightly expanded (+${wordDiff} words)` : `Slightly condensed (${wordDiff} words)`);
  }

  // Check for structural changes
  const beforeHasH2 = /<h2/i.test(beforeHtml);
  const afterHasH2 = /<h2/i.test(afterHtml);
  if (!beforeHasH2 && afterHasH2) {
    parts.push('Added subheading');
  }

  const beforeHasList = /<[uo]l/i.test(beforeHtml);
  const afterHasList = /<[uo]l/i.test(afterHtml);
  if (!beforeHasList && afterHasList) {
    parts.push('Added bullet points');
  }

  if (parts.length === 0) {
    parts.push('Clarified wording');
  }

  return parts.join(', ');
}

// ============================================================================
// SUMMARY CALCULATION
// ============================================================================

function calculateSummary(
  original: PageSnapshot,
  proposed: PageFixOutput,
  sectionDiffs: SectionDiff[]
): PageFixDiff['summary'] {
  const sectionsAdded = sectionDiffs.filter(d => d.operation === 'added').length;
  const sectionsModified = sectionDiffs.filter(d => d.operation === 'modified').length;
  const sectionsRemoved = sectionDiffs.filter(d => d.operation === 'removed').length;

  // Calculate word changes
  const originalWords = original.wordCount;
  const proposedWords = proposed.sections
    .map(s => stripHtml(s.html).split(/\s+/).length)
    .reduce((a, b) => a + b, 0);

  const wordsAdded = Math.max(0, proposedWords - originalWords);
  const wordsRemoved = Math.max(0, originalWords - proposedWords);

  return {
    sectionsAdded,
    sectionsModified,
    sectionsRemoved,
    wordsAdded,
    wordsRemoved,
  };
}

// ============================================================================
// EXPLANATIONS BUILDER
// ============================================================================

function buildExplanations(
  fields: PageFixDiff['fields'],
  sectionDiffs: SectionDiff[],
  proposed: PageFixOutput
): PageFixDiff['explanations'] {
  const explanations: PageFixDiff['explanations'] = [];

  // Title change
  if (fields.title.changed) {
    explanations.push({
      category: 'Title',
      before: truncate(fields.title.before, 60),
      after: truncate(fields.title.after, 60),
      reason: 'Clarified to match page intent and search behavior',
    });
  }

  // Meta description change
  if (fields.metaDescription.changed) {
    explanations.push({
      category: 'Meta Description',
      before: truncate(fields.metaDescription.before, 80),
      after: truncate(fields.metaDescription.after, 80),
      reason: 'Improved to encourage clicks from search results',
    });
  }

  // H1 change
  if (fields.h1.changed) {
    explanations.push({
      category: 'Main Heading',
      before: truncate(fields.h1.before, 60),
      after: truncate(fields.h1.after, 60),
      reason: 'Aligned with how visitors search for this content',
    });
  }

  // Section changes
  for (const diff of sectionDiffs) {
    if (diff.operation === 'added') {
      explanations.push({
        category: `New ${formatSectionType(diff.type)} Section`,
        before: '[Not present]',
        after: truncate(stripHtml(diff.afterHtml || ''), 100),
        reason: diff.changeDescription || 'Added to improve completeness',
      });
    } else if (diff.operation === 'modified') {
      explanations.push({
        category: `${formatSectionType(diff.type)} Section`,
        before: truncate(stripHtml(diff.beforeHtml || ''), 60),
        after: truncate(stripHtml(diff.afterHtml || ''), 60),
        reason: diff.changeDescription || 'Improved clarity',
      });
    }
  }

  // Add notes from the AI
  if (proposed.notes?.whyItMatters) {
    for (const note of proposed.notes.whyItMatters.slice(0, 3)) {
      if (!explanations.some(e => e.reason.includes(note))) {
        explanations.push({
          category: 'Overall',
          before: '',
          after: '',
          reason: note,
        });
      }
    }
  }

  return explanations;
}

// ============================================================================
// HELPERS
// ============================================================================

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashContent(content: string): string {
  return createHash('md5').update(stripHtml(content)).digest('hex').slice(0, 12);
}

function truncate(str: string, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function formatSectionType(type: SectionType): string {
  const labels: Record<SectionType, string> = {
    intro: 'Introduction',
    context: 'Context',
    experience: 'Experience',
    process_or_benefits: 'Process/Benefits',
    faq: 'FAQ',
    testimonial: 'Testimonial',
    cta: 'Call to Action',
    custom: 'Content',
  };
  return labels[type] || type;
}

// ============================================================================
// EXPORT HASH UTILITY
// ============================================================================

export { hashContent };
