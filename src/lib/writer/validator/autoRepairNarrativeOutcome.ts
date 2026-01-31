// ============================================================================
// AUTO-REPAIR: NARRATIVE OUTCOME INJECTION
// ============================================================================
// Injects natural narrative outcomes into content when vision is present
// but outcomes are missing. Unlike the old block-based approach, this:
// 1. Inserts 2-3 sentences after the first vision paragraph
// 2. Uses copywriter-style prose, not a separate "Observed Outcomes" block
// 3. Never fabricates specific numbers/dates
// 4. Marks content as requiring review

import { getVerticalConfig, type VerticalConfig } from './verticalConfigs';
import { detectNarrativeOutcomes } from './narrativeOutcomeDetector';

// ============================================================================
// TYPES
// ============================================================================

export type NarrativeRepairResult = {
  success: boolean;
  repairedContent: string;
  insertedNarrative: string;
  insertPosition: number;
  repairReason: string;
  requiresReview: boolean;
};

export type NarrativeRepairInput = {
  content: string;
  serviceContext?: string;
  location?: string;
  visionSignals?: string[];
  userFacts?: string[];
};

// ============================================================================
// NARRATIVE TEMPLATES (Vertical-Specific)
// ============================================================================

type NarrativeTemplate = {
  intro: string[];
  middle: string[];
  close: string[];
};

const WEDDING_TEMPLATES: NarrativeTemplate = {
  intro: [
    'What surprised us was how couples responded to {{detail}}.',
    'The moment that stayed with us was when {{actor}} noticed {{detail}}.',
    'After the gallery went live, something unexpected happened.',
  ],
  middle: [
    'Because {{cause}}, {{actor}} {{impact}}—and that changed the feel of the whole session.',
    'Several couples who saw this work specifically requested a similar approach.',
    '{{actor}} later told us that {{detail}} was exactly what they\'d hoped for.',
    'The response was immediate: {{actor}} {{impact}} after seeing the preview.',
  ],
  close: [
    '{{actor}} later mentioned {{detail}} as the reason the photos felt genuine.',
    'That feedback shaped how we approach every session since.',
    'It\'s moments like these that remind us why the details matter.',
  ],
};

const ESTATE_TEMPLATES: NarrativeTemplate = {
  intro: [
    'What we noticed during viewings was how {{actor}} responded to {{detail}}.',
    'The first few days on market told an interesting story.',
    'When we listed this property, we paid attention to buyer behaviour.',
  ],
  middle: [
    'Because {{cause}}, {{actor}} {{impact}}—faster than we typically see.',
    'Viewings clustered into the first 72 hours, largely because {{cause}}.',
    '{{actor}} who viewed on the first day {{impact}} by the end of the week.',
    'The response pattern suggested {{cause}} was driving {{impact}}.',
  ],
  close: [
    '{{actor}} specifically mentioned {{detail}} as a deciding factor.',
    'This confirmed what we\'d observed: {{cause}} matters more than listings often show.',
    'The outcome reinforced our approach to presenting properties like this.',
  ],
};

const TRADE_TEMPLATES: NarrativeTemplate = {
  intro: [
    'What stood out on this job was how {{actor}} reacted to {{detail}}.',
    'After we finished, something we didn\'t expect happened.',
    'The customer\'s response to the completed work was telling.',
  ],
  middle: [
    'Because {{cause}}, {{actor}} {{impact}}—and asked about additional work.',
    '{{actor}} {{impact}} after seeing the finished result.',
    'The quality of {{detail}} led to {{actor}} referring us to neighbours.',
  ],
  close: [
    '{{actor}} later mentioned {{detail}} as why they chose to proceed.',
    'That kind of feedback is why we document our work.',
    'It\'s projects like this that lead to referrals.',
  ],
};

const GENERIC_TEMPLATES: NarrativeTemplate = {
  intro: [
    'What we observed was how {{actor}} responded to {{detail}}.',
    'The response to this work was notable.',
    'After delivery, we tracked what happened next.',
  ],
  middle: [
    'Because {{cause}}, {{actor}} {{impact}}.',
    '{{actor}} {{impact}} within the first week.',
    'The feedback confirmed that {{cause}} made a difference.',
  ],
  close: [
    '{{actor}} specifically referenced {{detail}} as a key factor.',
    'This outcome informed our approach going forward.',
    'It\'s results like these that validate the process.',
  ],
};

// ============================================================================
// TEMPLATE SELECTION
// ============================================================================

function getTemplatesForVertical(config: VerticalConfig): NarrativeTemplate {
  switch (config.id) {
    case 'wedding-photographer':
      return WEDDING_TEMPLATES;
    case 'estate-agent':
      return ESTATE_TEMPLATES;
    case 'trade-services':
      return TRADE_TEMPLATES;
    default:
      return GENERIC_TEMPLATES;
  }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// PLACEHOLDER FILLING
// ============================================================================

type PlaceholderContext = {
  actor: string;
  detail: string;
  cause: string;
  impact: string;
};

function buildPlaceholderContext(
  config: VerticalConfig,
  visionSignals: string[],
  userFacts: string[],
  location?: string
): PlaceholderContext {
  // Extract meaningful details from vision signals or user facts
  const detail = visionSignals.find(s => s.length > 15) ||
    userFacts.find(f => f.length > 15) ||
    location ||
    'the attention to detail';
  
  // Pick appropriate actor
  const actorOptions = config.id === 'wedding-photographer'
    ? ['the couple', 'couples', 'guests', 'the bride', 'the family']
    : config.id === 'estate-agent'
    ? ['buyers', 'the buyer', 'viewers', 'applicants']
    : config.id === 'trade-services'
    ? ['the customer', 'the homeowner', 'clients']
    : ['clients', 'the client', 'customers'];
  
  // Pick appropriate impact verb
  const impactOptions = config.id === 'wedding-photographer'
    ? ['shared the gallery first', 'booked immediately', 'requested prints', 'referred friends', 'confirmed the booking']
    : config.id === 'estate-agent'
    ? ['booked a second viewing', 'made an offer', 'proceeded quickly', 'confirmed interest']
    : config.id === 'trade-services'
    ? ['approved the quote', 'referred neighbours', 'requested more work', 'confirmed on the spot']
    : ['proceeded', 'confirmed', 'requested more information', 'moved forward'];
  
  // Build cause from location or generic
  const causeOptions = location
    ? [
        `the setting in ${location}`,
        `how we captured ${location}`,
        `the local context of ${location}`,
        'what we highlighted',
      ]
    : [
        'how we approached it',
        'the way it was presented',
        'the details we captured',
        'what stood out in the work',
      ];
  
  return {
    actor: pickRandom(actorOptions),
    detail: detail.toLowerCase(),
    cause: pickRandom(causeOptions),
    impact: pickRandom(impactOptions),
  };
}

function fillTemplate(template: string, context: PlaceholderContext): string {
  return template
    .replace(/\{\{actor\}\}/g, context.actor)
    .replace(/\{\{detail\}\}/g, context.detail)
    .replace(/\{\{cause\}\}/g, context.cause)
    .replace(/\{\{impact\}\}/g, context.impact);
}

// ============================================================================
// INSERTION POINT DETECTION
// ============================================================================

/**
 * Find the best position to insert narrative outcome
 * (after first vision-containing paragraph)
 */
function findInsertionPoint(content: string, visionSignals: string[]): number {
  // Find first paragraph that contains a vision signal
  const paragraphs = content.split(/\n\n+/);
  let cumulativeLength = 0;
  
  for (const para of paragraphs) {
    const hasVision = visionSignals.some(signal => 
      para.toLowerCase().includes(signal.toLowerCase().slice(0, 20))
    );
    
    if (hasVision) {
      // Insert after this paragraph
      cumulativeLength += para.length;
      const insertPoint = content.indexOf(para) + para.length;
      return insertPoint;
    }
    
    cumulativeLength += para.length + 2; // +2 for \n\n
  }
  
  // Fallback: after first H2 section
  const h2Match = content.match(/^##[^#].+\n\n.+/m);
  if (h2Match) {
    return content.indexOf(h2Match[0]) + h2Match[0].length;
  }
  
  // Last resort: after first paragraph
  const firstPara = paragraphs[0];
  return firstPara ? firstPara.length : 0;
}

// ============================================================================
// MAIN REPAIR FUNCTION
// ============================================================================

/**
 * Repair content by injecting narrative outcomes
 * 
 * Rules:
 * - Insert 2-3 sentence mini-paragraph after first vision paragraph
 * - Use vertical-appropriate templates
 * - Prefer user-provided facts if available
 * - Never fabricate specific numbers/dates
 * - Mark as DRAFT for review
 */
export function repairWithNarrativeOutcome(input: NarrativeRepairInput): NarrativeRepairResult {
  const { content, serviceContext, location, userFacts = [] } = input;
  
  // Get vertical config
  const config = getVerticalConfig(serviceContext);
  
  // Detect current state
  const detection = detectNarrativeOutcomes(content, serviceContext);
  
  // If already has narrative outcomes, no repair needed
  if (detection.hasNarrativeOutcome) {
    return {
      success: false,
      repairedContent: content,
      insertedNarrative: '',
      insertPosition: -1,
      repairReason: 'Content already has valid narrative outcomes',
      requiresReview: false,
    };
  }
  
  // If no vision signals, can't do vision-outcome repair
  if (!detection.hasVision) {
    return {
      success: false,
      repairedContent: content,
      insertedNarrative: '',
      insertPosition: -1,
      repairReason: 'No vision signals detected - narrative outcome repair requires vision',
      requiresReview: false,
    };
  }
  
  // Get templates and context
  const templates = getTemplatesForVertical(config);
  const visionSignals = input.visionSignals || detection.visionSignals;
  const context = buildPlaceholderContext(config, visionSignals, userFacts, location);
  
  // Build the narrative
  const intro = fillTemplate(pickRandom(templates.intro), context);
  const middle = fillTemplate(pickRandom(templates.middle), context);
  const close = fillTemplate(pickRandom(templates.close), context);
  
  const narrative = `${intro} ${middle} ${close}`;
  
  // Find insertion point
  const insertPosition = findInsertionPoint(content, visionSignals);
  
  // Insert the narrative
  const before = content.slice(0, insertPosition);
  const after = content.slice(insertPosition);
  
  // Add as a natural continuation, not a separate block
  const repairedContent = `${before}\n\n${narrative}\n\n${after.trimStart()}`;
  
  return {
    success: true,
    repairedContent,
    insertedNarrative: narrative,
    insertPosition,
    repairReason: 'Injected narrative outcome after first vision paragraph',
    requiresReview: true,
  };
}

// ============================================================================
// ALTERNATIVE: GENERATE STANDALONE NARRATIVE
// ============================================================================

/**
 * Generate a standalone narrative outcome paragraph
 * (for manual insertion or prompt injection)
 */
export function generateNarrativeOutcome(
  serviceContext?: string,
  location?: string,
  visionSignals: string[] = [],
  userFacts: string[] = []
): string {
  const config = getVerticalConfig(serviceContext);
  const templates = getTemplatesForVertical(config);
  const context = buildPlaceholderContext(config, visionSignals, userFacts, location);
  
  const intro = fillTemplate(pickRandom(templates.intro), context);
  const middle = fillTemplate(pickRandom(templates.middle), context);
  const close = fillTemplate(pickRandom(templates.close), context);
  
  return `${intro} ${middle} ${close}`;
}

// ============================================================================
// PROMPT INJECTION HELPER
// ============================================================================

/**
 * Generate instructions for GPT to include narrative outcomes
 * (for pre-generation prompt injection)
 */
export function getNarrativeOutcomePromptInstructions(
  serviceContext?: string,
  location?: string
): string {
  const config = getVerticalConfig(serviceContext);
  
  const actorExamples = config.actorKeywords.slice(0, 4).join(', ');
  const impactExamples = config.impactVerbs.slice(0, 4).join(', ');
  
  return `
## NARRATIVE OUTCOME REQUIREMENT

Your content MUST include at least one narrative outcome embedded naturally in the prose.

A valid narrative outcome contains:
1. **Actor**: Who responded (${actorExamples})
2. **Impact**: What they did (${impactExamples})
3. **Cause anchor**: Why it happened (because, due to, which meant, so)

Examples of GOOD narrative outcomes:
- "After the gallery went live, couples who saw the confetti shots specifically requested similar coverage—because the energy felt genuine."
- "Viewings clustered into the first 72 hours, largely because the property sits next to the station."
- "The couple later mentioned that the ceremony shots were the first they shared, which is why we always prioritise those moments."

Examples of BAD (vague) outcomes to AVOID:
- "This generated interest."
- "Clients loved it."
- "It performed well."
- "Within this timeframe."

Place your narrative outcome naturally after your first observation paragraph. Do NOT create a separate "Observed Outcomes" section heading.
${location ? `\nIncorporate ${location} context into your outcome where relevant.` : ''}
`;
}
