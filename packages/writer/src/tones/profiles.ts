// ============================================================================
// BRAND TONE PROFILES
// ============================================================================
// Pre-defined tone profiles for different brand personalities.
// Users select a base profile and can customize.
// ============================================================================

import type { BrandToneProfile } from '../types';

// Re-export BrandToneProfile as ToneProfile for convenience
export type { BrandToneProfile };
export type ToneProfile = BrandToneProfile;

// ============================================================================
// DEFAULT TONE PROFILES
// ============================================================================

export const TONE_PROFILES: Record<string, BrandToneProfile> = {
  'friendly-expert': {
    id: 'friendly-expert',
    name: 'Friendly Expert',
    voice: {
      formality: 'neutral',
      confidence: 'confident',
      humourLevel: 'subtle',
      sentenceLengthBias: 'mixed',
    },
    tabooWords: [
      'synergy',
      'leverage',
      'utilize',
      'paradigm',
      'disrupt',
      'innovative',
      'cutting-edge',
      'world-class',
      'best-in-class',
      'guru',
      'ninja',
      'rockstar',
    ],
    persuasionLevel: 'medium',
    ctaStyle: 'direct',
    readingLevel: 'standard',
  },

  'founder-led-confident': {
    id: 'founder-led-confident',
    name: 'Founder-Led Confident',
    voice: {
      formality: 'neutral',
      confidence: 'confident',
      humourLevel: 'subtle',
      sentenceLengthBias: 'short',
    },
    tabooWords: [
      'we think',
      'maybe',
      'possibly',
      'kind of',
      'sort of',
      'hopefully',
      'leverage',
      'synergy',
    ],
    persuasionLevel: 'high',
    ctaStyle: 'direct',
    readingLevel: 'standard',
  },

  'luxury-premium': {
    id: 'luxury-premium',
    name: 'Luxury Premium',
    voice: {
      formality: 'formal',
      confidence: 'confident',
      humourLevel: 'none',
      sentenceLengthBias: 'long',
    },
    tabooWords: [
      'cheap',
      'affordable',
      'budget',
      'deal',
      'discount',
      'bargain',
      'free',
      'hack',
      'trick',
      'awesome',
      'cool',
      'amazing',
    ],
    persuasionLevel: 'low',
    ctaStyle: 'soft',
    readingLevel: 'advanced',
  },

  'direct-no-nonsense': {
    id: 'direct-no-nonsense',
    name: 'Direct & No-Nonsense',
    voice: {
      formality: 'informal',
      confidence: 'confident',
      humourLevel: 'none',
      sentenceLengthBias: 'short',
    },
    tabooWords: [
      'just',
      'simply',
      'basically',
      'honestly',
      'frankly',
      'literally',
      'actually',
      'very',
      'really',
      'extremely',
      'incredibly',
    ],
    persuasionLevel: 'high',
    ctaStyle: 'urgent',
    readingLevel: 'simple',
  },

  'playful-local': {
    id: 'playful-local',
    name: 'Playful Local',
    voice: {
      formality: 'informal',
      confidence: 'neutral',
      humourLevel: 'playful',
      sentenceLengthBias: 'short',
    },
    tabooWords: [
      'enterprise',
      'solution',
      'leverage',
      'synergy',
      'optimize',
      'stakeholder',
      'scalable',
    ],
    persuasionLevel: 'medium',
    ctaStyle: 'soft',
    readingLevel: 'simple',
  },

  'b2b-corporate': {
    id: 'b2b-corporate',
    name: 'B2B Corporate',
    voice: {
      formality: 'formal',
      confidence: 'confident',
      humourLevel: 'none',
      sentenceLengthBias: 'mixed',
    },
    tabooWords: [
      'awesome',
      'cool',
      'amazing',
      'killer',
      'crushing it',
      'game-changer',
      'ninja',
      'rockstar',
      'guru',
    ],
    persuasionLevel: 'medium',
    ctaStyle: 'direct',
    readingLevel: 'advanced',
  },
};

// ============================================================================
// PLATFORM-SPECIFIC ADJUSTMENTS
// ============================================================================

export interface PlatformToneAdjustment {
  formality?: 'formal' | 'neutral' | 'informal';
  characterLimit?: number;
  hashtagRange?: [number, number];
  emojiAllowed?: boolean;
  emojiLimit?: number;
  ctaRequired?: boolean;
  disclosureRequired?: boolean;
}

export const PLATFORM_ADJUSTMENTS: Record<string, PlatformToneAdjustment> = {
  linkedin: {
    formality: 'neutral',
    characterLimit: 3000,
    hashtagRange: [3, 8],
    emojiAllowed: true,
    emojiLimit: 3,
    ctaRequired: true,
    disclosureRequired: false,
  },

  gmb: {
    formality: 'informal',
    characterLimit: 1500,
    hashtagRange: [0, 3],
    emojiAllowed: true,
    emojiLimit: 3,
    ctaRequired: true,
    disclosureRequired: false,
  },

  reddit: {
    formality: 'informal',
    characterLimit: 10000,
    hashtagRange: [0, 0], // No hashtags on Reddit
    emojiAllowed: false,
    emojiLimit: 0,
    ctaRequired: false,
    disclosureRequired: true,
  },

  wordpress: {
    characterLimit: 50000,
    hashtagRange: [0, 0],
    emojiAllowed: false,
    emojiLimit: 0,
    ctaRequired: true,
    disclosureRequired: false,
  },
};

// ============================================================================
// TONE HELPER FUNCTIONS
// ============================================================================

/**
 * Get a tone profile by ID, with fallback to friendly-expert
 */
export function getToneProfile(profileId: string): BrandToneProfile {
  return TONE_PROFILES[profileId] || TONE_PROFILES['friendly-expert'];
}

/**
 * Merge a base profile with overrides
 */
export function mergeToneProfile(
  base: BrandToneProfile,
  overrides: Partial<BrandToneProfile>
): BrandToneProfile {
  return {
    ...base,
    ...overrides,
    voice: {
      ...base.voice,
      ...(overrides.voice || {}),
    },
    tabooWords: overrides.tabooWords
      ? Array.from(new Set([...base.tabooWords, ...overrides.tabooWords]))
      : base.tabooWords,
  };
}

/**
 * Get platform-specific tone adjustments
 */
export function getPlatformAdjustment(platform: string): PlatformToneAdjustment {
  return PLATFORM_ADJUSTMENTS[platform] || {};
}

/**
 * Check if a word/phrase is taboo for the given profile
 */
export function isTabooWord(word: string, profile: BrandToneProfile): boolean {
  const lowerWord = word.toLowerCase();
  return profile.tabooWords.some((taboo) =>
    lowerWord.includes(taboo.toLowerCase())
  );
}

/**
 * Get writing style instructions based on tone profile
 */
export function getToneInstructions(profile: BrandToneProfile): string[] {
  const instructions: string[] = [];

  // Formality
  switch (profile.voice.formality) {
    case 'formal':
      instructions.push('Use formal language. Avoid contractions.');
      instructions.push('Address the reader professionally.');
      break;
    case 'informal':
      instructions.push('Use conversational, friendly language.');
      instructions.push('Contractions are encouraged.');
      break;
    default:
      instructions.push('Use a balanced, approachable tone.');
  }

  // Confidence
  switch (profile.voice.confidence) {
    case 'confident':
      instructions.push('Write with authority and certainty.');
      instructions.push('Avoid hedging words like "might", "maybe", "perhaps".');
      break;
    case 'humble':
      instructions.push('Write with a collaborative, inclusive tone.');
      break;
  }

  // Humour
  switch (profile.voice.humourLevel) {
    case 'playful':
      instructions.push('Inject personality and light humor where appropriate.');
      break;
    case 'subtle':
      instructions.push('Occasional wit is acceptable, but keep it professional.');
      break;
    case 'none':
      instructions.push('Keep the tone serious and professional. No jokes.');
      break;
  }

  // Sentence length
  switch (profile.voice.sentenceLengthBias) {
    case 'short':
      instructions.push('Keep sentences short and punchy. Max 15-20 words per sentence.');
      break;
    case 'long':
      instructions.push('Use varied, flowing sentences. Complex ideas can have longer sentences.');
      break;
    default:
      instructions.push('Mix sentence lengths for rhythm. Average 15-25 words.');
  }

  // Persuasion
  switch (profile.persuasionLevel) {
    case 'high':
      instructions.push('Be persuasive. Highlight benefits and urgency.');
      break;
    case 'low':
      instructions.push('Let the quality speak for itself. Avoid pushy language.');
      break;
    default:
      instructions.push('Balance information with gentle persuasion.');
  }

  // CTA style
  switch (profile.ctaStyle) {
    case 'urgent':
      instructions.push('CTAs should create urgency: "Get started today", "Don\'t wait".');
      break;
    case 'soft':
      instructions.push('CTAs should be inviting: "Learn more", "Discover", "Explore".');
      break;
    default:
      instructions.push('CTAs should be clear and direct: "Contact us", "Get a quote".');
  }

  // Reading level
  switch (profile.readingLevel) {
    case 'simple':
      instructions.push('Write at a 6th-8th grade reading level. Simple vocabulary.');
      break;
    case 'advanced':
      instructions.push('Sophisticated vocabulary is acceptable. Write for educated readers.');
      break;
    default:
      instructions.push('Write at a high school reading level. Clear and accessible.');
  }

  // Taboo words
  if (profile.tabooWords.length > 0) {
    instructions.push(
      `NEVER use these words/phrases: ${profile.tabooWords.slice(0, 10).join(', ')}${profile.tabooWords.length > 10 ? '...' : ''}`
    );
  }

  return instructions;
}
