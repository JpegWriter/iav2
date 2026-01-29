// ============================================================================
// TONE PROFILES TESTS
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  getToneProfile,
  mergeToneProfile,
  getPlatformAdjustment,
  getToneInstructions,
  TONE_PROFILES,
} from '../src/tones/profiles';

// ============================================================================
// GET TONE PROFILE TESTS
// ============================================================================

describe('getToneProfile', () => {
  it('should return correct profile for valid ID', () => {
    const profile = getToneProfile('friendly-expert');

    expect(profile.id).toBe('friendly-expert');
    expect(profile.name).toBe('Friendly Expert');
    expect(profile.voice).toBeDefined();
  });

  it('should return all defined profiles', () => {
    const profileIds = [
      'friendly-expert',
      'founder-led-confident',
      'luxury-premium',
      'direct-no-nonsense',
      'playful-local',
      'b2b-corporate',
    ];

    for (const id of profileIds) {
      const profile = getToneProfile(id);
      expect(profile.id).toBe(id);
    }
  });

  it('should fallback to friendly-expert for invalid ID', () => {
    const profile = getToneProfile('invalid-profile');

    expect(profile.id).toBe('friendly-expert');
  });

  it('should include tabooWords array', () => {
    const profile = getToneProfile('luxury-premium');

    expect(Array.isArray(profile.tabooWords)).toBe(true);
    expect(profile.tabooWords.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// MERGE TONE PROFILE TESTS
// ============================================================================

describe('mergeToneProfile', () => {
  it('should override specific voice properties', () => {
    const base = getToneProfile('friendly-expert');
    const overrides = {
      voice: {
        formality: 'formal' as const,
        confidence: base.voice.confidence,
        humourLevel: base.voice.humourLevel,
        sentenceLengthBias: base.voice.sentenceLengthBias,
      },
    };

    const merged = mergeToneProfile(base, overrides);

    expect(merged.voice.formality).toBe('formal');
    expect(merged.voice.confidence).toBe(base.voice.confidence); // Unchanged
  });

  it('should merge tabooWords arrays', () => {
    const base = getToneProfile('friendly-expert');
    const overrides = {
      tabooWords: ['newBadWord'],
    };

    const merged = mergeToneProfile(base, overrides);

    expect(merged.tabooWords).toContain('newBadWord');
    expect(merged.tabooWords.length).toBeGreaterThan(base.tabooWords.length);
  });

  it('should override ctaStyle', () => {
    const base = getToneProfile('friendly-expert');
    const overrides = {
      ctaStyle: 'urgent' as const,
    };

    const merged = mergeToneProfile(base, overrides);

    expect(merged.ctaStyle).toBe('urgent');
  });

  it('should preserve base properties not in overrides', () => {
    const base = getToneProfile('luxury-premium');
    const overrides = {
      persuasionLevel: 'high' as const,
    };

    const merged = mergeToneProfile(base, overrides);

    expect(merged.id).toBe(base.id);
    expect(merged.name).toBe(base.name);
    expect(merged.readingLevel).toBe(base.readingLevel);
  });
});

// ============================================================================
// GET PLATFORM ADJUSTMENT TESTS
// ============================================================================

describe('getPlatformAdjustment', () => {
  it('should return LinkedIn adjustments', () => {
    const adjustment = getPlatformAdjustment('linkedin');

    expect(adjustment).toBeDefined();
    expect(adjustment.characterLimit).toBe(3000);
    expect(adjustment.hashtagRange).toBeDefined();
  });

  it('should return GMB adjustments', () => {
    const adjustment = getPlatformAdjustment('gmb');

    expect(adjustment).toBeDefined();
    expect(adjustment.characterLimit).toBe(1500);
  });

  it('should return Reddit adjustments', () => {
    const adjustment = getPlatformAdjustment('reddit');

    expect(adjustment).toBeDefined();
    expect(adjustment.formality).toBe('informal');
    expect(adjustment.disclosureRequired).toBe(true);
  });

  it('should return WordPress adjustments', () => {
    const adjustment = getPlatformAdjustment('wordpress');

    expect(adjustment).toBeDefined();
    expect(adjustment.ctaRequired).toBe(true);
  });

  it('should return empty object for unknown platforms', () => {
    const adjustment = getPlatformAdjustment('unknown-platform');

    expect(adjustment).toBeDefined();
    expect(Object.keys(adjustment).length).toBe(0);
  });
});

// ============================================================================
// GET TONE INSTRUCTIONS TESTS
// ============================================================================

describe('getToneInstructions', () => {
  it('should generate instructions array for a profile', () => {
    const profile = getToneProfile('friendly-expert');
    const instructions = getToneInstructions(profile);

    expect(Array.isArray(instructions)).toBe(true);
    expect(instructions.length).toBeGreaterThan(0);
  });

  it('should include formality instructions', () => {
    const formalProfile = getToneProfile('luxury-premium');
    const instructions = getToneInstructions(formalProfile);

    const hasFormality = instructions.some(
      (i) => i.toLowerCase().includes('formal') || i.toLowerCase().includes('language')
    );
    expect(hasFormality).toBe(true);
  });

  it('should include taboo words in instructions for profiles with many', () => {
    const profile = getToneProfile('luxury-premium');
    const instructions = getToneInstructions(profile);

    const hasAvoidance = instructions.some((i) => i.toLowerCase().includes('avoid'));
    expect(hasAvoidance).toBe(true);
  });

  it('should include CTA style guidance', () => {
    const profile = getToneProfile('founder-led-confident');
    const instructions = getToneInstructions(profile);

    const hasCta = instructions.some(
      (i) =>
        i.toLowerCase().includes('cta') ||
        i.toLowerCase().includes('call') ||
        i.toLowerCase().includes('action')
    );
    expect(hasCta).toBe(true);
  });

  it('should include reading level guidance', () => {
    const profile = getToneProfile('direct-no-nonsense');
    const instructions = getToneInstructions(profile);

    const hasReading = instructions.some(
      (i) =>
        i.toLowerCase().includes('reading') ||
        i.toLowerCase().includes('simple') ||
        i.toLowerCase().includes('sentence')
    );
    expect(hasReading).toBe(true);
  });
});

// ============================================================================
// TONE PROFILE STRUCTURE TESTS
// ============================================================================

describe('TONE_PROFILES structure', () => {
  it('should have 6 profiles', () => {
    expect(Object.keys(TONE_PROFILES)).toHaveLength(6);
  });

  it('should have valid formality values', () => {
    const validFormalities = ['formal', 'neutral', 'informal'];
    for (const profile of Object.values(TONE_PROFILES)) {
      expect(validFormalities).toContain(profile.voice.formality);
    }
  });

  it('should have valid confidence values', () => {
    const validConfidences = ['confident', 'neutral', 'humble'];
    for (const profile of Object.values(TONE_PROFILES)) {
      expect(validConfidences).toContain(profile.voice.confidence);
    }
  });

  it('should have valid humourLevel values', () => {
    const validHumour = ['none', 'subtle', 'playful'];
    for (const profile of Object.values(TONE_PROFILES)) {
      expect(validHumour).toContain(profile.voice.humourLevel);
    }
  });

  it('should have valid persuasion levels', () => {
    const validLevels = ['low', 'medium', 'high'];
    for (const profile of Object.values(TONE_PROFILES)) {
      expect(validLevels).toContain(profile.persuasionLevel);
    }
  });

  it('should have valid ctaStyle values', () => {
    const validStyles = ['soft', 'direct', 'urgent'];
    for (const profile of Object.values(TONE_PROFILES)) {
      expect(validStyles).toContain(profile.ctaStyle);
    }
  });

  it('should have valid readingLevel values', () => {
    const validLevels = ['simple', 'standard', 'advanced'];
    for (const profile of Object.values(TONE_PROFILES)) {
      expect(validLevels).toContain(profile.readingLevel);
    }
  });
});

// ============================================================================
// SPECIFIC PROFILE BEHAVIOR TESTS
// ============================================================================

describe('specific profile behaviors', () => {
  it('luxury-premium should be formal', () => {
    const luxury = getToneProfile('luxury-premium');

    expect(luxury.voice.formality).toBe('formal');
  });

  it('playful-local should have playful humour', () => {
    const playful = getToneProfile('playful-local');

    expect(playful.voice.humourLevel).toBe('playful');
  });

  it('b2b-corporate should be formal', () => {
    const b2b = getToneProfile('b2b-corporate');

    expect(b2b.voice.formality).toBe('formal');
  });

  it('founder-led-confident should be confident', () => {
    const founder = getToneProfile('founder-led-confident');

    expect(founder.voice.confidence).toBe('confident');
  });

  it('direct-no-nonsense should have short sentence bias', () => {
    const direct = getToneProfile('direct-no-nonsense');

    expect(direct.voice.sentenceLengthBias).toBe('short');
  });
});
