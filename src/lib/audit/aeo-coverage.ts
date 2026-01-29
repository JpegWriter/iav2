// ============================================================================
// SERP / AEO AUDIT GATE - AEO COVERAGE CHECK
// ============================================================================

import {
  TaskContext,
  ProposedContent,
  ApprovedOutline,
  OutlineSection,
  AEO_QUESTIONS,
  AEOQuestionId,
} from './types';

// ============================================================================
// AEO COVERAGE RESULT
// ============================================================================

export interface AEOCoverageResult {
  score: number;
  coveredQuestions: AEOQuestionId[];
  missingQuestions: AEOQuestionId[];
  requiredMissing: AEOQuestionId[];
  isValid: boolean;
  rewrittenOutline?: ApprovedOutline;
  issues: string[];
  suggestions: string[];
}

// ============================================================================
// AEO COVERAGE CHECK
// ============================================================================

/**
 * Check if content covers the 7 key AEO questions
 * Minimum 4 required for approval
 */
export function checkAEOCoverage(
  proposed: ProposedContent,
  taskContext: TaskContext
): AEOCoverageResult {
  const coveredQuestions: AEOQuestionId[] = [];
  const missingQuestions: AEOQuestionId[] = [];
  const requiredMissing: AEOQuestionId[] = [];
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Combine all text for analysis
  const allText = [
    proposed.title,
    ...proposed.headings,
    proposed.metaDescription,
  ].join(' ').toLowerCase();

  // Check each AEO question
  for (const q of AEO_QUESTIONS) {
    const isCovered = checkQuestionCoverage(q.id, allText, proposed.headings);
    
    if (isCovered) {
      coveredQuestions.push(q.id);
    } else {
      missingQuestions.push(q.id);
      if (q.required) {
        requiredMissing.push(q.id);
      }
    }
  }

  // Calculate score
  const score = Math.round((coveredQuestions.length / AEO_QUESTIONS.length) * 100);

  // Generate issues for missing required questions
  if (requiredMissing.length > 0) {
    const missingLabels = requiredMissing.map(id => 
      AEO_QUESTIONS.find(q => q.id === id)?.question
    );
    issues.push(`Missing required AEO questions: ${missingLabels.join(', ')}`);
  }

  // Generate suggestions for missing optional questions
  for (const id of missingQuestions) {
    const q = AEO_QUESTIONS.find(q => q.id === id);
    if (q) {
      suggestions.push(generateAEOSuggestion(id, taskContext));
    }
  }

  // Determine validity (need at least 4 covered)
  const isValid = coveredQuestions.length >= 4;

  // Generate rewritten outline if not valid
  let rewrittenOutline: ApprovedOutline | undefined;
  if (!isValid) {
    rewrittenOutline = generateAEOCompliantOutline(proposed, taskContext, missingQuestions);
  }

  return {
    score,
    coveredQuestions,
    missingQuestions,
    requiredMissing,
    isValid,
    rewrittenOutline,
    issues,
    suggestions,
  };
}

// ============================================================================
// QUESTION COVERAGE CHECKERS
// ============================================================================

function checkQuestionCoverage(
  questionId: AEOQuestionId,
  allText: string,
  headings: string[]
): boolean {
  const headingsLower = headings.map(h => h.toLowerCase());

  switch (questionId) {
    case 'what':
      // "What is this?"
      return (
        allText.includes('what is') ||
        allText.includes('definition') ||
        allText.includes('meaning') ||
        headingsLower.some(h => h.startsWith('what ') || h.includes('overview') || h.includes('introduction'))
      );

    case 'who':
      // "Who is it for?"
      return (
        allText.includes('who') ||
        allText.includes('for ') ||
        allText.includes('ideal for') ||
        allText.includes('perfect for') ||
        allText.includes('audience') ||
        headingsLower.some(h => h.includes('who') || h.includes('for '))
      );

    case 'when':
      // "When do I need it?"
      return (
        allText.includes('when') ||
        allText.includes('timing') ||
        allText.includes('right time') ||
        allText.includes('signs') ||
        headingsLower.some(h => h.includes('when') || h.includes('sign'))
      );

    case 'how':
      // "How does it work?"
      return (
        allText.includes('how') ||
        allText.includes('process') ||
        allText.includes('steps') ||
        allText.includes('works') ||
        headingsLower.some(h => h.includes('how') || h.includes('process') || h.includes('step'))
      );

    case 'cost':
      // "What does it cost / involve?"
      return (
        allText.includes('cost') ||
        allText.includes('price') ||
        allText.includes('investment') ||
        allText.includes('budget') ||
        allText.includes('involve') ||
        headingsLower.some(h => h.includes('cost') || h.includes('price') || h.includes('invest'))
      );

    case 'mistakes':
      // "What mistakes should I avoid?"
      return (
        allText.includes('mistake') ||
        allText.includes('avoid') ||
        allText.includes('don\'t') ||
        allText.includes('never') ||
        allText.includes('wrong') ||
        headingsLower.some(h => h.includes('mistake') || h.includes('avoid') || h.includes('common'))
      );

    case 'next':
      // "What should I do next?"
      return (
        allText.includes('next step') ||
        allText.includes('get started') ||
        allText.includes('book') ||
        allText.includes('contact') ||
        allText.includes('call') ||
        headingsLower.some(h => h.includes('next') || h.includes('start') || h.includes('book') || h.includes('contact'))
      );

    default:
      return false;
  }
}

// ============================================================================
// SUGGESTION GENERATORS
// ============================================================================

function generateAEOSuggestion(
  questionId: AEOQuestionId,
  taskContext: TaskContext
): string {
  const { primaryService, location } = taskContext;

  switch (questionId) {
    case 'what':
      return `Add section explaining what ${primaryService} is and what it involves`;

    case 'who':
      return `Add section clarifying who ${primaryService} is ideal for`;

    case 'when':
      return `Add section on when you need ${primaryService} (signs, timing, occasions)`;

    case 'how':
      return `Add section explaining how ${primaryService} works (process, steps)`;

    case 'cost':
      return `Add section on ${primaryService} pricing, packages, or what's involved`;

    case 'mistakes':
      return `Add section on common mistakes when choosing ${primaryService}`;

    case 'next':
      return `Add clear next step section (how to book, contact, get started)`;

    default:
      return 'Add more comprehensive coverage';
  }
}

// ============================================================================
// OUTLINE GENERATOR
// ============================================================================

/**
 * Generate an AEO-compliant outline that covers missing questions
 */
function generateAEOCompliantOutline(
  proposed: ProposedContent,
  taskContext: TaskContext,
  missingQuestions: AEOQuestionId[]
): ApprovedOutline {
  const { primaryService, location, intent, role } = taskContext;
  const sections: OutlineSection[] = [];

  // Start with proposed headings as base
  for (const heading of proposed.headings) {
    sections.push({
      h2: heading,
      intent: detectHeadingIntent(heading),
    });
  }

  // Add sections for missing questions
  for (const qId of missingQuestions) {
    const newSection = generateSectionForQuestion(qId, taskContext);
    if (newSection && !sections.some(s => s.h2.toLowerCase() === newSection.h2.toLowerCase())) {
      sections.push(newSection);
    }
  }

  // Reorder sections logically
  const orderedSections = reorderSectionsLogically(sections, intent);

  return {
    h1: proposed.title,
    sections: orderedSections,
  };
}

function detectHeadingIntent(heading: string): string {
  const lower = heading.toLowerCase();
  
  if (lower.includes('what is') || lower.includes('overview')) return 'define';
  if (lower.includes('who') || lower.includes('for')) return 'audience';
  if (lower.includes('when') || lower.includes('sign')) return 'timing';
  if (lower.includes('how') || lower.includes('process')) return 'process';
  if (lower.includes('cost') || lower.includes('price')) return 'investment';
  if (lower.includes('mistake') || lower.includes('avoid')) return 'warnings';
  if (lower.includes('next') || lower.includes('book')) return 'action';
  
  return 'inform';
}

function generateSectionForQuestion(
  questionId: AEOQuestionId,
  taskContext: TaskContext
): OutlineSection | null {
  const { primaryService, location } = taskContext;

  switch (questionId) {
    case 'what':
      return {
        h2: `What is ${primaryService}?`,
        intent: 'define',
        h3s: ['Overview', 'What It Includes', 'Types Available'],
      };

    case 'who':
      return {
        h2: `Who Needs ${primaryService}?`,
        intent: 'audience',
        h3s: ['Ideal Clients', 'Common Situations', 'Not Right For'],
      };

    case 'when':
      return {
        h2: `When to Get ${primaryService}`,
        intent: 'timing',
        h3s: ['Signs You Need It', 'Best Timing', 'How to Prepare'],
      };

    case 'how':
      return {
        h2: `How ${primaryService} Works`,
        intent: 'process',
        h3s: ['The Process', 'What to Expect', 'Timeline'],
      };

    case 'cost':
      return {
        h2: `${primaryService} Pricing & Packages`,
        intent: 'investment',
        h3s: ['What Affects Cost', 'Package Options', 'Getting a Quote'],
      };

    case 'mistakes':
      return {
        h2: `Common ${primaryService} Mistakes to Avoid`,
        intent: 'warnings',
        h3s: ['What Not to Do', 'Red Flags', 'How to Choose Wisely'],
      };

    case 'next':
      return {
        h2: location 
          ? `Book ${primaryService} in ${location}` 
          : `Get Started with ${primaryService}`,
        intent: 'action',
        h3s: ['How to Book', 'What Happens Next', 'Contact Us'],
      };

    default:
      return null;
  }
}

function reorderSectionsLogically(
  sections: OutlineSection[],
  intent: string
): OutlineSection[] {
  // Define intent order
  const intentOrder: Record<string, number> = {
    'define': 1,
    'audience': 2,
    'timing': 3,
    'process': 4,
    'investment': 5,
    'warnings': 6,
    'inform': 7,
    'action': 8,
  };

  return sections.sort((a, b) => {
    const orderA = intentOrder[a.intent] ?? 7;
    const orderB = intentOrder[b.intent] ?? 7;
    return orderA - orderB;
  });
}

// ============================================================================
// OUTLINE ENHANCEMENT
// ============================================================================

/**
 * Enhance an existing outline to improve AEO coverage
 */
export function enhanceOutlineForAEO(
  outline: ApprovedOutline,
  taskContext: TaskContext,
  coverage: AEOCoverageResult
): ApprovedOutline {
  if (coverage.isValid) {
    return outline; // Already valid
  }

  // Add sections for missing required questions
  const enhancedSections = [...outline.sections];

  for (const qId of coverage.requiredMissing) {
    const newSection = generateSectionForQuestion(qId, taskContext);
    if (newSection) {
      enhancedSections.push(newSection);
    }
  }

  return {
    h1: outline.h1,
    sections: reorderSectionsLogically(enhancedSections, taskContext.intent),
  };
}
