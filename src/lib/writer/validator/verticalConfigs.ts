// ============================================================================
// VERTICAL-SPECIFIC CONFIGURATIONS FOR NARRATIVE OUTCOME DETECTION
// ============================================================================
// These configs allow the same detector to work for photographers, estate agents,
// dentists, solicitors, etc. Each vertical has domain-specific terminology.

export type VerticalConfig = {
  id: string;
  name: string;
  actorKeywords: string[];
  impactVerbs: string[];
  causeAnchors: string[];
  evidenceQualifiers: string[];
  proofWords: string[]; // Domain-specific proof words (+2 score)
  vagueOutcomeRegexes: RegExp[];
};

// ============================================================================
// BASE CAUSE ANCHORS (shared across all verticals)
// ============================================================================
const BASE_CAUSE_ANCHORS = [
  'because',
  'due to',
  'which meant',
  'so',
  'that led to',
  'resulting in',
  'as a result',
  'that\'s why',
  'which is why',
  'since',
  'after seeing',
  'after viewing',
  'having seen',
  'once they saw',
  'when they noticed',
];

// ============================================================================
// BASE EVIDENCE QUALIFIERS (shared across all verticals)
// ============================================================================
const BASE_EVIDENCE_QUALIFIERS = [
  'within',
  'after',
  'before',
  'same day',
  'same week',
  'first',
  'later',
  'then',
  'compared',
  'more than',
  'fewer than',
  'less than',
  'over',
  'under',
  '%',
  'percent',
  'hours',
  'days',
  'weeks',
  'months',
];

// ============================================================================
// BASE VAGUE OUTCOME REGEXES (shared across all verticals)
// ============================================================================
const BASE_VAGUE_REGEXES: RegExp[] = [
  // Generic "generated interest" patterns
  /(generated|created|drove|boosted)\s+(interest|engagement|results|growth|awareness)/i,
  // Meaningless "loved it" patterns
  /(clients|people|couples|buyers|guests)\s+(loved|liked|enjoyed|were happy|were pleased)/i,
  // Vague performance claims
  /(went|performed)\s+(well|great|better|strongly)/i,
  // Empty superlatives
  /(strong|great|amazing|excellent|fantastic)\s+(results|performance|response|feedback)/i,
  // Template artifacts
  /within this timeframe/i,
  /driven by (we|our|what we) (observed|documented|noted)/i,
  /as expected/i,
  /as observed$/i,
  /we observed$/i,
  /we noted$/i,
  /this was successful/i,
  /positive results/i,
  /good outcomes/i,
  // Self-referential causes
  /thanks to our (expertise|approach|style|brand)/i,
  /due to our (reputation|experience|quality)/i,
  // Missing actor outcomes
  /resulted in (strong|positive|good|great)/i,
  /led to (strong|positive|good|great)/i,
];

// ============================================================================
// WEDDING PHOTOGRAPHER CONFIG
// ============================================================================
export const WEDDING_PHOTOGRAPHER_CONFIG: VerticalConfig = {
  id: 'wedding-photographer',
  name: 'Wedding Photographer',
  actorKeywords: [
    'couple', 'couples',
    'bride', 'groom',
    'guests', 'guest',
    'parents', 'family', 'families',
    'planner', 'coordinator',
    'venue', 'venues',
    'enquiry', 'enquiries',
    'consultation', 'consultations',
    'booking', 'bookings',
    'client', 'clients',
    'bridesmaids', 'groomsmen',
    'wedding party',
  ],
  impactVerbs: [
    'booked', 'confirmed', 'enquired',
    'requested', 'chose', 'chosen',
    'upgraded', 'shared', 'ordered',
    'referred', 'shortlisted', 'selected',
    'decided', 'picked', 'went with',
    'recommended', 'contacted', 'reached out',
    'messaged', 'called', 'emailed',
    'purchased', 'bought', 'added',
  ],
  causeAnchors: BASE_CAUSE_ANCHORS,
  evidenceQualifiers: BASE_EVIDENCE_QUALIFIERS,
  proofWords: [
    'enquiry', 'booking', 'consultation',
    'gallery', 'album', 'prints',
    'referral', 'portfolio', 'package',
    'deposit', 'contract', 'signed',
    'wedding day', 'ceremony', 'reception',
    'first dance', 'confetti', 'vows',
  ],
  vagueOutcomeRegexes: [
    ...BASE_VAGUE_REGEXES,
    // Wedding-specific vague patterns
    /couples? (loved|liked|enjoyed) (it|the|our|this)/i,
    /beautiful (results|photos|images)/i,
    /stunning (shots|images|photos)/i,
  ],
};

// ============================================================================
// ESTATE AGENT CONFIG
// ============================================================================
export const ESTATE_AGENT_CONFIG: VerticalConfig = {
  id: 'estate-agent',
  name: 'Estate Agent',
  actorKeywords: [
    'buyer', 'buyers',
    'seller', 'sellers',
    'vendor', 'vendors',
    'landlord', 'landlords',
    'tenant', 'tenants',
    'viewing', 'viewings',
    'enquiry', 'enquiries',
    'offer', 'offers',
    'applicant', 'applicants',
    'chain', 'chains',
    'purchaser', 'purchasers',
  ],
  impactVerbs: [
    'booked', 'viewed', 'offered',
    'accepted', 'reduced', 'listed',
    'sold', 'completed', 'exchanged',
    'agreed', 'confirmed', 'proceeded',
    'instructed', 'committed', 'secured',
    'submitted', 'requested', 'registered',
    'shortlisted', 'arranged', 'scheduled',
  ],
  causeAnchors: BASE_CAUSE_ANCHORS,
  evidenceQualifiers: [
    ...BASE_EVIDENCE_QUALIFIERS,
    'asking price',
    'guide price',
    'over asking',
    'under offer',
    'sold stc',
    'chain-free',
  ],
  proofWords: [
    'viewing', 'offer', 'sold',
    'asking price', 'guide price',
    'chain', 'completion', 'exchange',
    'under offer', 'sold stc',
    'memorandum', 'survey', 'mortgage',
    'stamp duty', 'conveyancing',
  ],
  vagueOutcomeRegexes: [
    ...BASE_VAGUE_REGEXES,
    // Estate-specific vague patterns
    /property (performed|did) (well|great)/i,
    /strong (interest|demand)/i,
    /lots of (interest|viewings|enquiries)/i,
  ],
};

// ============================================================================
// LEGAL / SOLICITOR CONFIG
// ============================================================================
export const SOLICITOR_CONFIG: VerticalConfig = {
  id: 'solicitor',
  name: 'Solicitor / Legal Services',
  actorKeywords: [
    'client', 'clients',
    'claimant', 'claimants',
    'defendant', 'defendants',
    'party', 'parties',
    'enquiry', 'enquiries',
    'case', 'cases',
    'matter', 'matters',
    'instruction', 'instructions',
  ],
  impactVerbs: [
    'instructed', 'engaged', 'retained',
    'settled', 'resolved', 'concluded',
    'completed', 'proceeded', 'agreed',
    'signed', 'executed', 'exchanged',
    'referred', 'recommended', 'contacted',
  ],
  causeAnchors: BASE_CAUSE_ANCHORS,
  evidenceQualifiers: BASE_EVIDENCE_QUALIFIERS,
  proofWords: [
    'settlement', 'completion', 'exchange',
    'instruction', 'retainer', 'brief',
    'hearing', 'court', 'tribunal',
    'mediation', 'negotiation',
  ],
  vagueOutcomeRegexes: BASE_VAGUE_REGEXES,
};

// ============================================================================
// TRADE SERVICES CONFIG (plumber, electrician, builder, etc.)
// ============================================================================
export const TRADE_SERVICES_CONFIG: VerticalConfig = {
  id: 'trade-services',
  name: 'Trade Services',
  actorKeywords: [
    'customer', 'customers',
    'client', 'clients',
    'homeowner', 'homeowners',
    'property owner', 'property owners',
    'enquiry', 'enquiries',
    'quote', 'quotes',
    'job', 'jobs',
    'project', 'projects',
  ],
  impactVerbs: [
    'booked', 'confirmed', 'requested',
    'agreed', 'proceeded', 'approved',
    'signed off', 'accepted', 'chose',
    'referred', 'recommended', 'contacted',
    'called back', 'scheduled', 'arranged',
  ],
  causeAnchors: BASE_CAUSE_ANCHORS,
  evidenceQualifiers: BASE_EVIDENCE_QUALIFIERS,
  proofWords: [
    'quote', 'estimate', 'job',
    'project', 'installation', 'repair',
    'completion', 'sign-off', 'warranty',
    'guarantee', 'certificate',
  ],
  vagueOutcomeRegexes: BASE_VAGUE_REGEXES,
};

// ============================================================================
// DENTAL / MEDICAL CONFIG
// ============================================================================
export const DENTAL_CONFIG: VerticalConfig = {
  id: 'dental',
  name: 'Dental / Medical Services',
  actorKeywords: [
    'patient', 'patients',
    'client', 'clients',
    'enquiry', 'enquiries',
    'appointment', 'appointments',
    'consultation', 'consultations',
    'referral', 'referrals',
  ],
  impactVerbs: [
    'booked', 'scheduled', 'confirmed',
    'proceeded', 'chose', 'selected',
    'referred', 'recommended', 'returned',
    'completed', 'continued', 'upgraded',
  ],
  causeAnchors: BASE_CAUSE_ANCHORS,
  evidenceQualifiers: BASE_EVIDENCE_QUALIFIERS,
  proofWords: [
    'appointment', 'treatment', 'procedure',
    'consultation', 'check-up', 'follow-up',
    'referral', 'recommendation',
  ],
  vagueOutcomeRegexes: BASE_VAGUE_REGEXES,
};

// ============================================================================
// GENERIC / FALLBACK CONFIG
// ============================================================================
export const GENERIC_CONFIG: VerticalConfig = {
  id: 'generic',
  name: 'Generic Business',
  actorKeywords: [
    'client', 'clients',
    'customer', 'customers',
    'enquiry', 'enquiries',
    'lead', 'leads',
    'prospect', 'prospects',
    'user', 'users',
    'visitor', 'visitors',
  ],
  impactVerbs: [
    'booked', 'confirmed', 'purchased',
    'signed up', 'registered', 'contacted',
    'enquired', 'requested', 'chose',
    'selected', 'decided', 'proceeded',
    'referred', 'recommended', 'converted',
  ],
  causeAnchors: BASE_CAUSE_ANCHORS,
  evidenceQualifiers: BASE_EVIDENCE_QUALIFIERS,
  proofWords: [
    'sale', 'conversion', 'booking',
    'enquiry', 'lead', 'signup',
  ],
  vagueOutcomeRegexes: BASE_VAGUE_REGEXES,
};

// ============================================================================
// CONFIG REGISTRY & LOOKUP
// ============================================================================
const CONFIG_REGISTRY: Record<string, VerticalConfig> = {
  'wedding-photographer': WEDDING_PHOTOGRAPHER_CONFIG,
  'wedding': WEDDING_PHOTOGRAPHER_CONFIG,
  'photography': WEDDING_PHOTOGRAPHER_CONFIG,
  'photographer': WEDDING_PHOTOGRAPHER_CONFIG,
  'videographer': WEDDING_PHOTOGRAPHER_CONFIG,
  'estate-agent': ESTATE_AGENT_CONFIG,
  'estate': ESTATE_AGENT_CONFIG,
  'property': ESTATE_AGENT_CONFIG,
  'letting': ESTATE_AGENT_CONFIG,
  'solicitor': SOLICITOR_CONFIG,
  'legal': SOLICITOR_CONFIG,
  'law': SOLICITOR_CONFIG,
  'trade-services': TRADE_SERVICES_CONFIG,
  'trade': TRADE_SERVICES_CONFIG,
  'plumber': TRADE_SERVICES_CONFIG,
  'electrician': TRADE_SERVICES_CONFIG,
  'builder': TRADE_SERVICES_CONFIG,
  'dental': DENTAL_CONFIG,
  'dentist': DENTAL_CONFIG,
  'medical': DENTAL_CONFIG,
  'generic': GENERIC_CONFIG,
};

/**
 * Get vertical config by service type or niche keyword
 */
export function getVerticalConfig(serviceOrNiche?: string): VerticalConfig {
  if (!serviceOrNiche) return GENERIC_CONFIG;
  
  const key = serviceOrNiche.toLowerCase().trim();
  
  // Direct match
  if (CONFIG_REGISTRY[key]) {
    return CONFIG_REGISTRY[key];
  }
  
  // Partial match
  for (const [configKey, config] of Object.entries(CONFIG_REGISTRY)) {
    if (key.includes(configKey) || configKey.includes(key)) {
      return config;
    }
  }
  
  // Keyword detection
  if (/wedding|photography|photo|video|film/i.test(key)) {
    return WEDDING_PHOTOGRAPHER_CONFIG;
  }
  if (/estate|property|letting|rental|valuation/i.test(key)) {
    return ESTATE_AGENT_CONFIG;
  }
  if (/solicitor|legal|law|conveyancing/i.test(key)) {
    return SOLICITOR_CONFIG;
  }
  if (/plumber|electrician|builder|trade|roofer|carpenter/i.test(key)) {
    return TRADE_SERVICES_CONFIG;
  }
  if (/dental|dentist|medical|doctor|clinic/i.test(key)) {
    return DENTAL_CONFIG;
  }
  
  return GENERIC_CONFIG;
}

/**
 * Get all available vertical configs
 */
export function getAllVerticalConfigs(): VerticalConfig[] {
  return [
    WEDDING_PHOTOGRAPHER_CONFIG,
    ESTATE_AGENT_CONFIG,
    SOLICITOR_CONFIG,
    TRADE_SERVICES_CONFIG,
    DENTAL_CONFIG,
    GENERIC_CONFIG,
  ];
}
