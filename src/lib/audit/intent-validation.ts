// ============================================================================
// SERP / AEO AUDIT GATE - INTENT VALIDATION
// ============================================================================

import {
  TaskContext,
  ProposedContent,
  ApprovedOutline,
  SearchIntent,
  INTENT_REQUIREMENTS,
} from './types';

// ============================================================================
// INTENT VALIDATION RESULT
// ============================================================================

export interface IntentValidation {
  isValid: boolean;
  score: number;
  matchedRequirements: string[];
  missingRequirements: string[];
  issues: string[];
  suggestions: string[];
}

// ============================================================================
// INTENT VALIDATORS
// ============================================================================

/**
 * Validate that content matches declared search intent
 */
export function validateIntent(
  proposed: ProposedContent,
  taskContext: TaskContext
): IntentValidation {
  const { intent } = taskContext;
  const requirements = INTENT_REQUIREMENTS[intent];
  
  const matchedRequirements: string[] = [];
  const missingRequirements: string[] = [];
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check each requirement
  for (const req of requirements) {
    const isMet = checkRequirement(req, proposed, taskContext);
    if (isMet) {
      matchedRequirements.push(req);
    } else {
      missingRequirements.push(req);
    }
  }

  // Calculate score (percentage of requirements met)
  const score = Math.round((matchedRequirements.length / requirements.length) * 100);

  // Generate issues and suggestions
  if (missingRequirements.length > 0) {
    issues.push(`Missing ${intent} intent signals: ${missingRequirements.join(', ')}`);
    suggestions.push(...generateIntentSuggestions(missingRequirements, intent));
  }

  // Additional intent-specific checks
  const intentChecks = performIntentSpecificChecks(proposed, taskContext);
  issues.push(...intentChecks.issues);
  suggestions.push(...intentChecks.suggestions);

  return {
    isValid: score >= 50 && intentChecks.issues.length === 0,
    score,
    matchedRequirements,
    missingRequirements,
    issues,
    suggestions,
  };
}

// ============================================================================
// REQUIREMENT CHECKERS
// ============================================================================

function checkRequirement(
  requirement: string,
  proposed: ProposedContent,
  taskContext: TaskContext
): boolean {
  const allText = [
    proposed.title,
    ...proposed.headings,
    proposed.metaDescription,
  ].join(' ').toLowerCase();

  switch (requirement) {
    // Buy intent requirements
    case 'CTA logic':
      return hasCTASignals(allText);
    case 'process explanation':
      return hasProcessSignals(allText);
    case 'next step clarity':
      return hasNextStepSignals(allText);
    case 'pricing context':
      return hasPricingSignals(allText);

    // Compare intent requirements
    case 'criteria for comparison':
      return hasCriteriaSignals(allText);
    case 'alternatives listed':
      return hasAlternativeSignals(allText);
    case 'pros/cons':
      return hasProsConsSignals(allText);
    case 'recommendation':
      return hasRecommendationSignals(allText);

    // Learn intent requirements
    case 'clear explanations':
      return hasExplanationSignals(allText);
    case 'examples':
      return hasExampleSignals(allText);
    case 'definitions':
      return hasDefinitionSignals(allText);
    case 'step-by-step':
      return hasStepByStepSignals(allText);

    // Trust intent requirements
    case 'experience signals':
      return hasExperienceSignals(allText);
    case 'proof elements':
      return hasProofSignals(allText);
    case 'reassurance':
      return hasReassuranceSignals(allText);
    case 'transparency':
      return hasTransparencySignals(allText);

    default:
      return false;
  }
}

// ============================================================================
// SIGNAL DETECTORS
// ============================================================================

function hasCTASignals(text: string): boolean {
  const signals = [
    'book', 'schedule', 'contact', 'call', 'get started', 'enquire', 'request',
    'learn more', 'find out', 'get in touch', 'start', 'begin', 'order'
  ];
  return signals.some(s => text.includes(s));
}

function hasProcessSignals(text: string): boolean {
  const signals = [
    'process', 'how it works', 'what happens', 'steps', 'stages',
    'first', 'then', 'after', 'during', 'before', 'session'
  ];
  return signals.some(s => text.includes(s));
}

function hasNextStepSignals(text: string): boolean {
  const signals = [
    'next step', 'what to do', 'ready to', 'start by', 'begin with',
    'your next', 'take action', 'get started'
  ];
  return signals.some(s => text.includes(s));
}

function hasPricingSignals(text: string): boolean {
  const signals = [
    'price', 'cost', 'rate', 'fee', 'investment', 'budget', 'afford',
    'package', 'quote', 'estimate', 'value', '$', 'dollar'
  ];
  return signals.some(s => text.includes(s));
}

function hasCriteriaSignals(text: string): boolean {
  const signals = [
    'criteria', 'factor', 'consider', 'look for', 'important',
    'matter', 'quality', 'feature', 'aspect', 'requirement'
  ];
  return signals.some(s => text.includes(s));
}

function hasAlternativeSignals(text: string): boolean {
  const signals = [
    'vs', 'versus', 'or', 'alternative', 'option', 'choice',
    'instead', 'compare', 'between', 'difference'
  ];
  return signals.some(s => text.includes(s));
}

function hasProsConsSignals(text: string): boolean {
  const signals = [
    'pro', 'con', 'advantage', 'disadvantage', 'benefit', 'drawback',
    'good', 'bad', 'upside', 'downside', 'strength', 'weakness'
  ];
  return signals.some(s => text.includes(s));
}

function hasRecommendationSignals(text: string): boolean {
  const signals = [
    'recommend', 'suggest', 'best for', 'ideal for', 'perfect for',
    'choose', 'pick', 'go with', 'opt for', 'better for'
  ];
  return signals.some(s => text.includes(s));
}

function hasExplanationSignals(text: string): boolean {
  const signals = [
    'what is', 'means', 'explain', 'understand', 'basically',
    'simply', 'in other words', 'definition', 'refers to'
  ];
  return signals.some(s => text.includes(s));
}

function hasExampleSignals(text: string): boolean {
  const signals = [
    'example', 'for instance', 'such as', 'like', 'sample',
    'case', 'scenario', 'situation', 'illustration'
  ];
  return signals.some(s => text.includes(s));
}

function hasDefinitionSignals(text: string): boolean {
  const signals = [
    'what is', 'definition', 'meaning', 'refers to', 'known as',
    'called', 'term', 'concept', 'is a type of'
  ];
  return signals.some(s => text.includes(s));
}

function hasStepByStepSignals(text: string): boolean {
  const signals = [
    'step', 'first', 'second', 'third', 'next', 'then', 'finally',
    'how to', 'guide', 'process', 'stages'
  ];
  return signals.some(s => text.includes(s));
}

function hasExperienceSignals(text: string): boolean {
  const signals = [
    'experience', 'years', 'worked with', 'photographed', 'completed',
    'sessions', 'clients', 'families', 'weddings', 'projects'
  ];
  return signals.some(s => text.includes(s));
}

function hasProofSignals(text: string): boolean {
  const signals = [
    'review', 'testimonial', 'client', 'feedback', 'said',
    'rated', 'award', 'certified', 'recognised', 'featured'
  ];
  return signals.some(s => text.includes(s));
}

function hasReassuranceSignals(text: string): boolean {
  const signals = [
    'worry', 'stress', 'relax', 'comfortable', 'easy',
    'hassle', 'support', 'help', 'guide', 'care'
  ];
  return signals.some(s => text.includes(s));
}

function hasTransparencySignals(text: string): boolean {
  const signals = [
    'honest', 'transparent', 'clear', 'upfront', 'no hidden',
    'what to expect', 'process', 'how we work', 'our approach'
  ];
  return signals.some(s => text.includes(s));
}

// ============================================================================
// INTENT-SPECIFIC CHECKS
// ============================================================================

function performIntentSpecificChecks(
  proposed: ProposedContent,
  taskContext: TaskContext
): { issues: string[]; suggestions: string[] } {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const { intent, role } = taskContext;

  // Check for intent/role mismatch
  if (intent === 'buy' && role !== 'money') {
    issues.push('Buy intent declared but role is not money page');
  }

  if (intent === 'trust' && role !== 'trust') {
    // This is actually okay - trust content can be on any page
  }

  // Check headings align with intent
  const headings = proposed.headings.map(h => h.toLowerCase());
  
  if (intent === 'buy' && !headings.some(h => 
    h.includes('book') || h.includes('contact') || h.includes('next step') || 
    h.includes('get started') || h.includes('process')
  )) {
    suggestions.push('Add a heading about booking/next steps for buy intent');
  }

  if (intent === 'compare' && !headings.some(h =>
    h.includes('vs') || h.includes('compare') || h.includes('difference')
  )) {
    suggestions.push('Add explicit comparison headings for compare intent');
  }

  if (intent === 'learn' && !headings.some(h =>
    h.includes('what') || h.includes('how') || h.includes('why')
  )) {
    suggestions.push('Add educational question-based headings for learn intent');
  }

  return { issues, suggestions };
}

// ============================================================================
// SUGGESTION GENERATORS
// ============================================================================

function generateIntentSuggestions(missing: string[], intent: SearchIntent): string[] {
  const suggestions: string[] = [];

  for (const req of missing) {
    switch (req) {
      case 'CTA logic':
        suggestions.push('Add clear call-to-action in headings or meta');
        break;
      case 'process explanation':
        suggestions.push('Include "How it works" or "The process" section');
        break;
      case 'next step clarity':
        suggestions.push('Add "What happens next" or "Your next step" section');
        break;
      case 'pricing context':
        suggestions.push('Include pricing, packages, or investment information');
        break;
      case 'criteria for comparison':
        suggestions.push('Add "What to look for" or evaluation criteria');
        break;
      case 'alternatives listed':
        suggestions.push('List and compare alternatives explicitly');
        break;
      case 'pros/cons':
        suggestions.push('Add advantages/disadvantages for each option');
        break;
      case 'recommendation':
        suggestions.push('Include "Best for..." or clear recommendation');
        break;
      case 'clear explanations':
        suggestions.push('Add "What is..." or definition sections');
        break;
      case 'examples':
        suggestions.push('Include concrete examples or case scenarios');
        break;
      case 'step-by-step':
        suggestions.push('Add numbered steps or process breakdown');
        break;
      case 'experience signals':
        suggestions.push('Include years of experience or client numbers');
        break;
      case 'proof elements':
        suggestions.push('Add reviews, testimonials, or credentials');
        break;
      case 'reassurance':
        suggestions.push('Address common concerns or worries');
        break;
      case 'transparency':
        suggestions.push('Show process, pricing, or expectation clarity');
        break;
    }
  }

  return suggestions;
}

// ============================================================================
// OUTLINE INTENT ALIGNMENT
// ============================================================================

/**
 * Check if an outline properly supports the declared intent
 */
export function validateOutlineIntent(
  outline: ApprovedOutline,
  intent: SearchIntent
): { aligned: boolean; score: number; issues: string[] } {
  const issues: string[] = [];
  let alignmentPoints = 0;
  const maxPoints = 4;

  const headings = outline.sections.map(s => s.h2.toLowerCase());

  switch (intent) {
    case 'buy':
      if (headings.some(h => h.includes('process') || h.includes('how it works'))) alignmentPoints++;
      if (headings.some(h => h.includes('price') || h.includes('cost') || h.includes('investment'))) alignmentPoints++;
      if (headings.some(h => h.includes('book') || h.includes('contact') || h.includes('next'))) alignmentPoints++;
      if (headings.some(h => h.includes('expect') || h.includes('include'))) alignmentPoints++;
      break;

    case 'compare':
      if (headings.some(h => h.includes('vs') || h.includes('compare'))) alignmentPoints++;
      if (headings.some(h => h.includes('differ') || h.includes('pro') || h.includes('con'))) alignmentPoints++;
      if (headings.some(h => h.includes('best') || h.includes('recommend'))) alignmentPoints++;
      if (headings.some(h => h.includes('choose') || h.includes('decision'))) alignmentPoints++;
      break;

    case 'learn':
      if (headings.some(h => h.includes('what is') || h.includes('meaning'))) alignmentPoints++;
      if (headings.some(h => h.includes('how') || h.includes('why'))) alignmentPoints++;
      if (headings.some(h => h.includes('example') || h.includes('type'))) alignmentPoints++;
      if (headings.some(h => h.includes('tip') || h.includes('mistake') || h.includes('avoid'))) alignmentPoints++;
      break;

    case 'trust':
      if (headings.some(h => h.includes('about') || h.includes('story') || h.includes('who'))) alignmentPoints++;
      if (headings.some(h => h.includes('experience') || h.includes('background'))) alignmentPoints++;
      if (headings.some(h => h.includes('client') || h.includes('review') || h.includes('testimonial'))) alignmentPoints++;
      if (headings.some(h => h.includes('approach') || h.includes('philosophy') || h.includes('why'))) alignmentPoints++;
      break;
  }

  const score = Math.round((alignmentPoints / maxPoints) * 100);

  if (alignmentPoints < 2) {
    issues.push(`Outline weakly aligned with ${intent} intent (${alignmentPoints}/${maxPoints} signals)`);
  }

  return {
    aligned: alignmentPoints >= 2,
    score,
    issues,
  };
}
