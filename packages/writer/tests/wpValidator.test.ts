// ============================================================================
// WORDPRESS VALIDATOR TESTS
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  validateWordPressOutput,
  validateWriterTaskInputs,
  generateContentHash,
} from '../src/validators/wpValidator';
import type { WordPressOutput, WriterTask, WPBlock } from '../src/types';

// ============================================================================
// MOCK DATA
// ============================================================================

const createMockTask = (overrides: Partial<WriterTask> = {}): WriterTask => ({
  slug: 'plumbing-services-denver',
  role: 'money',
  intent: 'buy',
  primaryService: 'Plumbing Services',
  targetAudience: 'Homeowners needing plumbing repairs',
  internalLinks: {
    upLinks: [
      {
        targetUrl: '/services',
        targetTitle: 'Services',
        anchorSuggestion: 'services',
        required: true,
      },
    ],
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
    maxTableRows: 6,
    maxH2Count: 8,
  },
  requiredProofElements: ['testimonial'],
  requiredEEATSignals: ['years_active'],
  ...overrides,
});

const createMockBlock = (
  blockName: WPBlock['blockName'],
  innerHTML: string,
  attrs: Record<string, unknown> = {},
  innerBlocks: WPBlock[] = []
): WPBlock => ({
  blockName,
  attrs,
  innerHTML,
  innerBlocks,
  innerContent: [innerHTML],
});

const createMockOutput = (overrides: Partial<WordPressOutput> = {}): WordPressOutput => ({
  title: 'Professional Plumbing Services in Denver',
  slug: 'professional-plumbing-services-denver',
  excerpt: 'Expert plumbing services in Denver, CO. 24/7 emergency repairs, licensed plumbers.',
  blocks: [
    createMockBlock(
      'core/paragraph',
      '<p>We provide professional plumbing services in Denver.</p>'
    ),
    createMockBlock(
      'core/heading',
      '<h2>Our Plumbing Services</h2>',
      { level: 2 }
    ),
    createMockBlock(
      'core/paragraph',
      '<p>Our licensed plumbers handle all types of repairs.</p>'
    ),
    createMockBlock(
      'core/buttons',
      '',
      {},
      [
        createMockBlock(
          'core/button',
          '<div class="wp-block-button"><a class="wp-block-button__link" href="/contact">Get a Quote</a></div>'
        ),
      ]
    ),
  ],
  seo: {
    seoTitle: 'Professional Plumbing Services in Denver | Quick Fix',
    metaDescription: 'Expert plumbing services in Denver, CO. 24/7 emergency repairs by licensed plumbers.',
    focusKeyphrase: 'plumbing services Denver',
  },
  images: {
    hero: {
      imageId: 'img-001',
      alt: 'Professional plumber repairing pipes',
      caption: '',
      filename: 'denver-plumbing-services.jpg',
      placement: 'hero',
    },
    inline: [
      {
        imageId: 'img-002',
        alt: 'Service van',
        caption: '',
        filename: 'service-van.jpg',
        placement: 'inline',
        sectionIndex: 1,
      },
    ],
  },
  internalLinksUsed: [
    {
      url: '/services',
      anchor: 'our services',
      sectionIndex: 0,
    },
  ],
  contentHash: 'abc12345',
  ...overrides,
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe('validateWordPressOutput', () => {
  it('should pass validation for valid output', () => {
    const task = createMockTask();
    const output = createMockOutput();

    const result = validateWordPressOutput(output, task);

    expect(result.valid).toBe(true);
    expect(result.stats.blockCount).toBeGreaterThan(0);
  });

  it('should fail when block count exceeds maximum', () => {
    const task = createMockTask({
      wordpress: {
        maxBlocks: 2,
        maxHtmlBytes: 40000,
        excerptLength: 155,
        readingTimeTarget: 5,
      },
    });
    const output = createMockOutput();

    const result = validateWordPressOutput(output, task);

    expect(result.valid).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'BLOCK_COUNT_EXCEEDED' })
    );
  });

  it('should warn when H2 count exceeds maximum', () => {
    const task = createMockTask();
    const blocks = Array.from({ length: 12 }, (_, i) =>
      createMockBlock('core/heading', `<h2>Section ${i + 1}</h2>`, { level: 2 })
    );
    const output = createMockOutput({ blocks });

    const result = validateWordPressOutput(output, task);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'EXCESSIVE_H2_COUNT' })
    );
  });

  it('should warn when missing internal links', () => {
    const task = createMockTask();
    const output = createMockOutput({ internalLinksUsed: [] });

    const result = validateWordPressOutput(output, task);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'MISSING_INTERNAL_LINKS' })
    );
  });

  it('should error on forbidden markup', () => {
    const task = createMockTask();
    const output = createMockOutput({
      blocks: [
        createMockBlock(
          'core/paragraph',
          '<p onclick="alert()">Dangerous content</p>'
        ),
      ],
    });

    const result = validateWordPressOutput(output, task);

    expect(result.valid).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'FORBIDDEN_MARKUP' })
    );
  });

  it('should validate SEO title length', () => {
    const task = createMockTask();
    const output = createMockOutput({
      seo: {
        seoTitle: 'Short',
        metaDescription: 'Valid meta description that is long enough to pass validation.',
        focusKeyphrase: 'plumbing',
      },
    });

    const result = validateWordPressOutput(output, task);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'SEO_TITLE_SHORT' })
    );
  });

  it('should calculate stats correctly', () => {
    const task = createMockTask();
    const output = createMockOutput();

    const result = validateWordPressOutput(output, task);

    expect(result.stats.blockCount).toBe(5); // 4 blocks + 1 inner button
    expect(result.stats.h2Count).toBe(1);
    expect(result.stats.paragraphCount).toBe(2);
    expect(result.stats.internalLinkCount).toBe(1);
    expect(result.stats.imageCount).toBe(2); // 1 hero + 1 inline
  });
});

// ============================================================================
// INPUT VALIDATION TESTS
// ============================================================================

describe('validateWriterTaskInputs', () => {
  it('should pass for valid task', () => {
    const task = createMockTask();

    const result = validateWriterTaskInputs(task);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should error when role is missing', () => {
    const task = createMockTask({ role: undefined as unknown as 'money' });

    const result = validateWriterTaskInputs(task);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_ROLE' })
    );
  });

  it('should error when primary service is generic', () => {
    const task = createMockTask({ primaryService: 'Expertise' });

    const result = validateWriterTaskInputs(task);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'GENERIC_PRIMARY_SERVICE' })
    );
  });

  it('should error when support page lacks supportsPage', () => {
    const task = createMockTask({
      role: 'support',
      supportsPage: undefined,
    });

    const result = validateWriterTaskInputs(task);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'MISSING_SUPPORTS_PAGE' })
    );
  });

  it('should error on invalid maxBlocks', () => {
    const task = createMockTask({
      wordpress: {
        maxBlocks: 5, // Too low
        maxHtmlBytes: 40000,
        excerptLength: 155,
        readingTimeTarget: 5,
      },
    });

    const result = validateWriterTaskInputs(task);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_MAX_BLOCKS' })
    );
  });
});

// ============================================================================
// CONTENT HASH TESTS
// ============================================================================

describe('generateContentHash', () => {
  it('should generate consistent hash for same content', () => {
    const output = createMockOutput();

    const hash1 = generateContentHash(output);
    const hash2 = generateContentHash(output);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hash for different content', () => {
    const output1 = createMockOutput({ title: 'Title 1' });
    const output2 = createMockOutput({ title: 'Title 2' });

    const hash1 = generateContentHash(output1);
    const hash2 = generateContentHash(output2);

    expect(hash1).not.toBe(hash2);
  });

  it('should return 8-character hex string', () => {
    const output = createMockOutput();

    const hash = generateContentHash(output);

    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});
