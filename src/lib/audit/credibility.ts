// ============================================================================
// SERP / AEO AUDIT GATE - CREDIBILITY & EEAT CHECK
// ============================================================================

import {
  TaskContext,
  UserContext,
  ProposedContent,
  CredibilityInjection,
  VisionEvidencePack,
} from './types';

// ============================================================================
// CREDIBILITY RESULT
// ============================================================================

export interface CredibilityResult {
  score: number;
  isValid: boolean;
  presentSignals: CredibilitySignal[];
  missingSignals: CredibilitySignal[];
  injections: CredibilityInjection[];
  issues: string[];
  suggestions: string[];
}

export type CredibilitySignalType = 
  | 'experience' 
  | 'proof' 
  | 'local' 
  | 'process' 
  | 'visual';

export interface CredibilitySignal {
  type: CredibilitySignalType;
  description: string;
  strength: 'strong' | 'moderate' | 'weak';
}

// ============================================================================
// EEAT REQUIREMENTS
// ============================================================================

const MIN_CREDIBILITY_SIGNALS = 2;

// ============================================================================
// CREDIBILITY CHECK
// ============================================================================

/**
 * Check EEAT (Experience, Expertise, Authoritativeness, Trustworthiness)
 * Every article must include at least 2 credibility signals
 */
export function checkCredibility(
  proposed: ProposedContent,
  taskContext: TaskContext,
  userContext: UserContext,
  visionContext?: VisionEvidencePack
): CredibilityResult {
  const presentSignals: CredibilitySignal[] = [];
  const missingSignals: CredibilitySignal[] = [];
  const injections: CredibilityInjection[] = [];
  const issues: string[] = [];
  const suggestions: string[] = [];

  const allText = [
    proposed.title,
    ...proposed.headings,
    proposed.metaDescription,
  ].join(' ').toLowerCase();

  // ========================================
  // CHECK 1: Experience Signals
  // ========================================
  const experienceCheck = checkExperienceSignals(allText, userContext);
  if (experienceCheck.found) {
    presentSignals.push({
      type: 'experience',
      description: experienceCheck.description,
      strength: experienceCheck.strength,
    });
  } else {
    missingSignals.push({
      type: 'experience',
      description: 'No experience signals found',
      strength: 'weak',
    });
    
    // Generate injection
    const experienceInjection = generateExperienceInjection(userContext, taskContext);
    if (experienceInjection) {
      injections.push(experienceInjection);
    }
  }

  // ========================================
  // CHECK 2: Proof Signals (reviews, cases, numbers)
  // ========================================
  const proofCheck = checkProofSignals(allText, userContext);
  if (proofCheck.found) {
    presentSignals.push({
      type: 'proof',
      description: proofCheck.description,
      strength: proofCheck.strength,
    });
  } else {
    missingSignals.push({
      type: 'proof',
      description: 'No proof signals found',
      strength: 'weak',
    });
    
    const proofInjection = generateProofInjection(userContext, taskContext);
    if (proofInjection) {
      injections.push(proofInjection);
    }
  }

  // ========================================
  // CHECK 3: Local Specificity
  // ========================================
  const localCheck = checkLocalSignals(allText, taskContext, userContext);
  if (localCheck.found) {
    presentSignals.push({
      type: 'local',
      description: localCheck.description,
      strength: localCheck.strength,
    });
  } else if (taskContext.location) {
    missingSignals.push({
      type: 'local',
      description: 'No local signals found for location-based content',
      strength: 'weak',
    });
    
    const localInjection = generateLocalInjection(taskContext, userContext);
    if (localInjection) {
      injections.push(localInjection);
    }
  }

  // ========================================
  // CHECK 4: Process Transparency
  // ========================================
  const processCheck = checkProcessSignals(allText, proposed.headings);
  if (processCheck.found) {
    presentSignals.push({
      type: 'process',
      description: processCheck.description,
      strength: processCheck.strength,
    });
  } else if (taskContext.role === 'money') {
    missingSignals.push({
      type: 'process',
      description: 'No process transparency for money page',
      strength: 'weak',
    });
    
    injections.push({
      type: 'process',
      content: `Clear explanation of the ${taskContext.primaryService} process`,
      placementHint: 'After introduction, before pricing',
    });
  }

  // ========================================
  // CHECK 5: Visual Evidence
  // ========================================
  const visualCheck = checkVisualSignals(visionContext);
  if (visualCheck.found) {
    presentSignals.push({
      type: 'visual',
      description: visualCheck.description,
      strength: visualCheck.strength,
    });
  } else {
    missingSignals.push({
      type: 'visual',
      description: 'No visual evidence referenced',
      strength: 'weak',
    });
    
    suggestions.push('Include image references with relevant alt text');
  }

  // ========================================
  // Calculate Score
  // ========================================
  const strongSignals = presentSignals.filter(s => s.strength === 'strong').length;
  const moderateSignals = presentSignals.filter(s => s.strength === 'moderate').length;
  const weakSignals = presentSignals.filter(s => s.strength === 'weak').length;
  
  const score = Math.min(100, 
    (strongSignals * 25) + 
    (moderateSignals * 15) + 
    (weakSignals * 5)
  );

  // ========================================
  // Determine Validity
  // ========================================
  const isValid = presentSignals.length >= MIN_CREDIBILITY_SIGNALS;

  if (!isValid) {
    issues.push(`Only ${presentSignals.length} credibility signals found (minimum ${MIN_CREDIBILITY_SIGNALS} required)`);
  }

  // Generate suggestions for missing signals
  for (const missing of missingSignals) {
    suggestions.push(generateCredibilitySuggestion(missing.type, taskContext, userContext));
  }

  return {
    score,
    isValid,
    presentSignals,
    missingSignals,
    injections,
    issues,
    suggestions,
  };
}

// ============================================================================
// SIGNAL CHECKERS
// ============================================================================

interface SignalCheckResult {
  found: boolean;
  description: string;
  strength: 'strong' | 'moderate' | 'weak';
}

function checkExperienceSignals(text: string, userContext: UserContext): SignalCheckResult {
  // Strong: Specific numbers or time periods
  const strongPatterns = [
    /\b\d+\+?\s*years?\b/i,
    /\bover\s+\d+\s+years?\b/i,
    /\b\d+\+?\s*(sessions?|clients?|weddings?|families?|projects?)\b/i,
    /\bsince\s+\d{4}\b/i,
  ];

  for (const pattern of strongPatterns) {
    if (pattern.test(text)) {
      return {
        found: true,
        description: 'Specific experience metrics found',
        strength: 'strong',
      };
    }
  }

  // Moderate: General experience language
  const moderatePatterns = [
    /\b(we've|i've)\s+(photographed|worked|completed|helped)\b/i,
    /\bin our (studio|experience)\b/i,
    /\bour team\b/i,
    /\bexperienced\b/i,
  ];

  for (const pattern of moderatePatterns) {
    if (pattern.test(text)) {
      return {
        found: true,
        description: 'General experience language found',
        strength: 'moderate',
      };
    }
  }

  // Weak: Any first-person or possessive
  if (/\b(we|our|my|i)\b/i.test(text)) {
    return {
      found: true,
      description: 'First-person perspective present',
      strength: 'weak',
    };
  }

  return { found: false, description: '', strength: 'weak' };
}

function checkProofSignals(text: string, userContext: UserContext): SignalCheckResult {
  // Strong: Specific review quotes or statistics
  const strongPatterns = [
    /[""][^""]+[""]/,  // Quoted text (likely testimonial)
    /\b\d+(\.\d+)?\s*(star|rating|out of)\b/i,
    /\b\d+%/,  // Statistics
    /\baward/i,
    /\bcertified\b/i,
    /\bfeatured (in|on)\b/i,
  ];

  for (const pattern of strongPatterns) {
    if (pattern.test(text)) {
      return {
        found: true,
        description: 'Specific proof elements found',
        strength: 'strong',
      };
    }
  }

  // Moderate: Review/testimonial references
  const moderatePatterns = [
    /\b(clients?|customers?)\s+(say|said|mention|love)\b/i,
    /\b(review|testimonial|feedback)\b/i,
    /\b(trusted|recommended)\s+by\b/i,
  ];

  for (const pattern of moderatePatterns) {
    if (pattern.test(text)) {
      return {
        found: true,
        description: 'Review references found',
        strength: 'moderate',
      };
    }
  }

  // Weak: General trust language
  if (/\b(trusted|reliable|professional)\b/i.test(text)) {
    return {
      found: true,
      description: 'General trust language present',
      strength: 'weak',
    };
  }

  return { found: false, description: '', strength: 'weak' };
}

function checkLocalSignals(
  text: string,
  taskContext: TaskContext,
  userContext: UserContext
): SignalCheckResult {
  const location = taskContext.location;
  
  if (!location) {
    return { found: false, description: 'No location context', strength: 'weak' };
  }

  // Strong: Multiple location references with specifics
  const locationLower = location.toLowerCase();
  const locationCount = (text.match(new RegExp(locationLower, 'gi')) || []).length;

  if (locationCount >= 2) {
    return {
      found: true,
      description: `Multiple references to ${location}`,
      strength: 'strong',
    };
  }

  // Check for local signals
  for (const signal of userContext.localSignals) {
    if (text.toLowerCase().includes(signal.toLowerCase())) {
      return {
        found: true,
        description: 'Local signal phrase found',
        strength: 'moderate',
      };
    }
  }

  // Single location mention
  if (text.includes(locationLower)) {
    return {
      found: true,
      description: 'Location mentioned',
      strength: 'weak',
    };
  }

  return { found: false, description: '', strength: 'weak' };
}

function checkProcessSignals(text: string, headings: string[]): SignalCheckResult {
  const headingsLower = headings.map(h => h.toLowerCase());

  // Strong: Dedicated process section
  const processHeadings = headingsLower.filter(h => 
    h.includes('process') || 
    h.includes('how it works') ||
    h.includes('what to expect') ||
    h.includes('step')
  );

  if (processHeadings.length > 0) {
    return {
      found: true,
      description: 'Dedicated process section found',
      strength: 'strong',
    };
  }

  // Moderate: Process language in text
  const processPatterns = [
    /\bstep\s+\d+\b/i,
    /\bfirst,?\s+\w+\.\s+then\b/i,
    /\bthe process\b/i,
    /\bhow (it|we) work/i,
  ];

  for (const pattern of processPatterns) {
    if (pattern.test(text)) {
      return {
        found: true,
        description: 'Process language found',
        strength: 'moderate',
      };
    }
  }

  // Weak: Any sequential language
  if (/\b(then|next|after|before|during)\b/i.test(text)) {
    return {
      found: true,
      description: 'Sequential language present',
      strength: 'weak',
    };
  }

  return { found: false, description: '', strength: 'weak' };
}

function checkVisualSignals(visionContext?: VisionEvidencePack): SignalCheckResult {
  if (!visionContext) {
    return { found: false, description: 'No vision context provided', strength: 'weak' };
  }

  if (visionContext.evidenceStrength === 'strong') {
    return {
      found: true,
      description: 'Strong visual evidence available',
      strength: 'strong',
    };
  }

  if (visionContext.heroImage || (visionContext.inlineImages && visionContext.inlineImages.length > 0)) {
    return {
      found: true,
      description: 'Visual assets available',
      strength: visionContext.evidenceStrength === 'moderate' ? 'moderate' : 'weak',
    };
  }

  return { found: false, description: '', strength: 'weak' };
}

// ============================================================================
// INJECTION GENERATORS
// ============================================================================

function generateExperienceInjection(
  userContext: UserContext,
  taskContext: TaskContext
): CredibilityInjection | null {
  const { experience } = userContext;
  
  if (experience.years) {
    return {
      type: 'experience',
      content: `With ${experience.years}+ years of ${taskContext.primaryService} experience...`,
      placementHint: 'Opening paragraph or About section',
    };
  }

  if (experience.volume) {
    return {
      type: 'experience',
      content: `Having completed ${experience.volume}...`,
      placementHint: 'Opening paragraph or credentials section',
    };
  }

  if (experience.specialties && experience.specialties.length > 0) {
    return {
      type: 'experience',
      content: `Specialising in ${experience.specialties.slice(0, 2).join(' and ')}...`,
      placementHint: 'Service description section',
    };
  }

  return null;
}

function generateProofInjection(
  userContext: UserContext,
  taskContext: TaskContext
): CredibilityInjection | null {
  if (userContext.reviews.length > 0) {
    const review = userContext.reviews[0];
    return {
      type: 'proof',
      content: `"${review.snippet}" — reflects our ${review.theme}`,
      placementHint: 'After key claims or in testimonial section',
    };
  }

  if (userContext.credentials.length > 0) {
    return {
      type: 'proof',
      content: `${userContext.credentials.slice(0, 2).join(', ')}`,
      placementHint: 'About section or credentials callout',
    };
  }

  return null;
}

function generateLocalInjection(
  taskContext: TaskContext,
  userContext: UserContext
): CredibilityInjection | null {
  const { location } = taskContext;
  
  if (!location) return null;

  if (userContext.localSignals.length > 0) {
    return {
      type: 'local',
      content: userContext.localSignals[0],
      placementHint: 'Location section or service description',
    };
  }

  return {
    type: 'local',
    content: `Serving ${location} and surrounding areas`,
    placementHint: 'Footer or service area section',
  };
}

// ============================================================================
// SUGGESTION GENERATOR
// ============================================================================

function generateCredibilitySuggestion(
  type: CredibilitySignalType,
  taskContext: TaskContext,
  userContext: UserContext
): string {
  switch (type) {
    case 'experience':
      if (userContext.experience.years) {
        return `Add "${userContext.experience.years}+ years experience" to content`;
      }
      return 'Add specific experience metrics (years, number of clients/projects)';

    case 'proof':
      if (userContext.reviews.length > 0) {
        return `Include review quote about "${userContext.reviews[0].theme}"`;
      }
      return 'Add testimonial, case study, or specific achievement';

    case 'local':
      return `Mention ${taskContext.location} more specifically with local landmarks or area names`;

    case 'process':
      return 'Add "How It Works" or process explanation section';

    case 'visual':
      return 'Reference specific images that demonstrate work quality';

    default:
      return 'Add more credibility signals';
  }
}
