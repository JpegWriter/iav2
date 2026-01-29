// ============================================================================
// MEDIA PLANNER TESTS
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  scoreImageForHero,
  selectHeroImage,
  planInlineImages,
  createImageBlock,
  createImagePlaceholderBlock,
  generateImageMetadata,
} from '../src/media/mediaPlanner';
import type {
  SelectedImage,
  VisionContext,
  WriterPlan,
  WriterTask,
  SectionPlan,
  ImagePlacement,
} from '../src/types';

// ============================================================================
// MOCK DATA FACTORIES
// ============================================================================

const createMockSelectedImage = (
  overrides: Partial<SelectedImage> = {}
): SelectedImage => ({
  imageId: 'img-001',
  filePath: '/images/plumber-working.jpg',
  vision: {
    subjects: ['plumber', 'kitchen', 'pipes'],
    expressions: [{ type: 'focused', confidence: 0.85 }],
    scene: 'Professional plumber working under kitchen sink',
    technicalScore: 85,
    emotionalImpact: 'medium',
    composition: 'good',
  },
  tags: ['plumber', 'repair', 'service'],
  suggestedAlt: 'Professional plumber repairing kitchen sink',
  suggestedCaption: 'Expert plumbing repairs',
  intendedUse: 'hero',
  ...overrides,
});

const createMockVisionContext = (
  images: SelectedImage[] = []
): VisionContext => ({
  selectedImages: images.length > 0 ? images : [createMockSelectedImage()],
  heroCandidate:
    images.find((img) => img.intendedUse === 'hero')?.imageId || 'img-001',
});

const createMockTask = (overrides: Partial<WriterTask> = {}): WriterTask => ({
  slug: 'plumbing-services',
  role: 'money',
  intent: 'buy',
  primaryService: 'Plumbing Services',
  location: 'Denver',
  targetAudience: 'Homeowners needing plumbing repairs',
  requiredProofElements: ['testimonial'],
  requiredEEATSignals: ['years_active'],
  internalLinks: {
    upLinks: [],
    downLinks: [],
    requiredAnchors: [],
  },
  mediaRequirements: {
    heroRequired: true,
    inlineImagesMin: 2,
    inlineImagesMax: 4,
  },
  wordpress: {
    maxBlocks: 50,
    maxHtmlBytes: 40000,
    excerptLength: 155,
    readingTimeTarget: 5,
  },
  ...overrides,
});

const createMockSection = (
  overrides: Partial<SectionPlan> = {}
): SectionPlan => ({
  id: 'section-1',
  heading: 'Our Services',
  level: 2,
  intent: 'Describe services offered',
  estimatedWordCount: 200,
  ...overrides,
});

const createMockPlan = (overrides: Partial<WriterPlan> = {}): WriterPlan => ({
  h1: 'Professional Plumbing Services',
  totalEstimatedWords: 1000,
  keyphraseOccurrences: 5,
  sections: [
    createMockSection({ id: 'section-1', heading: 'Our Services' }),
    createMockSection({ id: 'section-2', heading: 'Why Choose Us' }),
    createMockSection({ id: 'section-3', heading: 'Service Areas' }),
  ],
  ctaPlacement: 'end',
  ...overrides,
});

// ============================================================================
// HERO SCORING TESTS
// ============================================================================

describe('scoreImageForHero', () => {
  it('should score higher technical quality images higher', () => {
    const task = createMockTask();

    const highQuality = createMockSelectedImage({
      imageId: 'high',
      vision: {
        subjects: ['plumber'],
        expressions: [],
        scene: 'Plumber at work',
        technicalScore: 95,
        emotionalImpact: 'medium',
        composition: 'excellent',
      },
    });
    const lowQuality = createMockSelectedImage({
      imageId: 'low',
      vision: {
        subjects: ['plumber'],
        expressions: [],
        scene: 'Plumber at work',
        technicalScore: 50,
        emotionalImpact: 'medium',
        composition: 'acceptable',
      },
    });

    const highScore = scoreImageForHero(highQuality, task);
    const lowScore = scoreImageForHero(lowQuality, task);

    expect(highScore.technicalScore).toBeGreaterThan(lowScore.technicalScore);
  });

  it('should score high emotional impact images higher', () => {
    const task = createMockTask();

    const highEmotional = createMockSelectedImage({
      imageId: 'high',
      vision: {
        subjects: ['plumber'],
        expressions: [{ type: 'smile', confidence: 0.9 }],
        scene: 'Happy customer',
        technicalScore: 80,
        emotionalImpact: 'high',
      },
    });
    const lowEmotional = createMockSelectedImage({
      imageId: 'low',
      vision: {
        subjects: ['plumber'],
        expressions: [],
        scene: 'Pipes',
        technicalScore: 80,
        emotionalImpact: 'low',
      },
    });

    const highScore = scoreImageForHero(highEmotional, task);
    const lowScore = scoreImageForHero(lowEmotional, task);

    expect(highScore.emotionalScore).toBeGreaterThan(lowScore.emotionalScore);
  });

  it('should score relevant images higher', () => {
    const task = createMockTask({ primaryService: 'Plumbing Services' });

    const relevantImage = createMockSelectedImage({
      imageId: 'relevant',
      tags: ['plumbing', 'plumber', 'repair'],
      vision: {
        subjects: ['plumber', 'pipes'],
        expressions: [],
        scene: 'Plumbing work',
        technicalScore: 80,
        emotionalImpact: 'medium',
      },
    });
    const irrelevantImage = createMockSelectedImage({
      imageId: 'irrelevant',
      tags: ['cooking', 'chef', 'restaurant'],
      vision: {
        subjects: ['food', 'kitchen'],
        expressions: [],
        scene: 'Restaurant kitchen',
        technicalScore: 80,
        emotionalImpact: 'medium',
      },
    });

    const relevantScore = scoreImageForHero(relevantImage, task);
    const irrelevantScore = scoreImageForHero(irrelevantImage, task);

    expect(relevantScore.relevanceScore).toBeGreaterThan(
      irrelevantScore.relevanceScore
    );
  });

  it('should calculate correct total with weights', () => {
    const task = createMockTask();
    const image = createMockSelectedImage();

    const score = scoreImageForHero(image, task);

    // Total should be weighted: technical(30%) + emotional(40%) + relevance(30%)
    const expectedTotal =
      score.technicalScore * 0.3 +
      score.emotionalScore * 0.4 +
      score.relevanceScore * 0.3;
    expect(score.totalScore).toBeCloseTo(expectedTotal, 2);
  });
});

// ============================================================================
// HERO SELECTION TESTS
// ============================================================================

describe('selectHeroImage', () => {
  it('should select the highest scoring image', () => {
    const task = createMockTask();
    const visionContext = createMockVisionContext([
      createMockSelectedImage({
        imageId: 'low',
        vision: {
          subjects: [],
          expressions: [],
          scene: 'Generic',
          technicalScore: 40,
          emotionalImpact: 'low',
        },
        intendedUse: 'inline',
      }),
      createMockSelectedImage({
        imageId: 'high',
        vision: {
          subjects: ['plumber'],
          expressions: [{ type: 'smile', confidence: 0.9 }],
          scene: 'Expert plumber',
          technicalScore: 95,
          emotionalImpact: 'high',
          composition: 'excellent',
        },
        tags: ['plumbing', 'service'],
        intendedUse: 'hero',
      }),
      createMockSelectedImage({
        imageId: 'medium',
        vision: {
          subjects: [],
          expressions: [],
          scene: 'Tools',
          technicalScore: 70,
          emotionalImpact: 'medium',
        },
        intendedUse: 'section',
      }),
    ]);

    const selection = selectHeroImage(visionContext, task);

    expect(selection.selected?.imageId).toBe('high');
    expect(selection.scores).toBeDefined();
    expect(selection.reason).toBeDefined();
  });

  it('should return null selected for empty image array', () => {
    const task = createMockTask();
    const emptyContext: VisionContext = {
      selectedImages: [],
    };

    const selection = selectHeroImage(emptyContext, task);

    expect(selection.selected).toBeNull();
  });
});

// ============================================================================
// INLINE IMAGE PLANNING TESTS
// ============================================================================

describe('planInlineImages', () => {
  it('should create an inline image plan', () => {
    const task = createMockTask();
    const plan = createMockPlan({
      sections: [
        createMockSection({
          id: 'section-1',
          imageSlot: {
            required: true,
            description: 'Service image',
          },
        }),
        createMockSection({
          id: 'section-2',
          imageSlot: {
            required: false,
            description: 'Team photo',
          },
        }),
      ],
    });
    const visionContext = createMockVisionContext([
      createMockSelectedImage({ imageId: 'img-1', intendedUse: 'inline' }),
      createMockSelectedImage({ imageId: 'img-2', intendedUse: 'inline' }),
    ]);

    const inlinePlan = planInlineImages(visionContext, plan, task);

    expect(inlinePlan.placements).toBeDefined();
    expect(inlinePlan.unplacedImages).toBeDefined();
  });

  it('should return empty placements when no images available', () => {
    const task = createMockTask();
    const plan = createMockPlan();
    const emptyContext: VisionContext = {
      selectedImages: [],
    };

    const inlinePlan = planInlineImages(emptyContext, plan, task);

    expect(inlinePlan.placements.length).toBe(0);
  });
});

// ============================================================================
// BLOCK GENERATION TESTS
// ============================================================================

describe('createImageBlock', () => {
  it('should create a valid WordPress image block', () => {
    const placement: ImagePlacement = {
      imageId: 'img-001',
      alt: 'Professional plumber',
      caption: 'Expert repairs',
      filename: 'plumber.jpg',
      placement: 'hero',
      url: 'https://example.com/image.jpg',
    };

    const block = createImageBlock(placement);

    expect(block.blockName).toBe('core/image');
    expect(block.innerHTML).toContain('https://example.com/image.jpg');
    expect(block.attrs.alt).toBe(placement.alt);
  });
});

describe('createImagePlaceholderBlock', () => {
  it('should create a placeholder block with slot info', () => {
    const slot = {
      sectionIndex: 0,
      description: 'Hero image',
      requiredScene: 'Professional working',
    };

    const block = createImagePlaceholderBlock(slot);

    expect(block.blockName).toBe('core/paragraph');
    expect(block.innerHTML).toContain('Hero image');
  });
});

// ============================================================================
// METADATA GENERATION TESTS
// ============================================================================

describe('generateImageMetadata', () => {
  it('should generate SEO-friendly alt text', () => {
    const image = createMockSelectedImage();
    const context = {
      businessName: 'Quick Fix Plumbing',
      primaryService: 'Plumbing Services',
      location: 'Denver',
    };

    const metadata = generateImageMetadata(image, context);

    expect(metadata.alt).toBeDefined();
    expect(metadata.alt.length).toBeGreaterThan(0);
    expect(metadata.alt.length).toBeLessThanOrEqual(125);
  });

  it('should include business context in caption', () => {
    const image = createMockSelectedImage();
    const context = {
      businessName: 'Quick Fix Plumbing',
      primaryService: 'Emergency Plumbing',
      location: 'Denver',
    };

    const metadata = generateImageMetadata(image, context);

    expect(metadata.caption).toContain('Quick Fix Plumbing');
  });

  it('should generate a title with primary service', () => {
    const image = createMockSelectedImage();
    const context = {
      businessName: 'Quick Fix Plumbing',
      primaryService: 'Emergency Plumbing',
    };

    const metadata = generateImageMetadata(image, context);

    expect(metadata.title.toLowerCase()).toContain('emergency plumbing');
  });
});
