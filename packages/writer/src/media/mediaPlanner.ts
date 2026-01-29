// ============================================================================
// MEDIA PLANNER
// ============================================================================
// Handles hero image selection, inline image placement, and metadata generation.
// Works with any niche - no photography assumptions.
// ============================================================================

import type {
  SelectedImage,
  VisionContext,
  WriterTask,
  WriterPlan,
  ImagePlacement,
  SectionPlan,
  WPBlock,
} from '../types';

// ============================================================================
// IMAGE SCORING
// ============================================================================

export interface ImageScore {
  imageId: string;
  technicalScore: number;
  emotionalScore: number;
  relevanceScore: number;
  totalScore: number;
}

/**
 * Score an image for hero candidacy
 * Higher score = better hero candidate
 */
export function scoreImageForHero(
  image: SelectedImage,
  task: WriterTask
): ImageScore {
  let technicalScore = image.vision.technicalScore;
  let emotionalScore = 0;
  let relevanceScore = 0;

  // Emotional impact scoring
  switch (image.vision.emotionalImpact) {
    case 'high':
      emotionalScore = 100;
      break;
    case 'medium':
      emotionalScore = 60;
      break;
    case 'low':
      emotionalScore = 30;
      break;
  }

  // Boost for positive expressions (smiles)
  const positiveExpressions = image.vision.expressions.filter(
    (e) => e.type === 'smile' || e.type === 'happy'
  );
  if (positiveExpressions.length > 0) {
    const avgConfidence =
      positiveExpressions.reduce((sum, e) => sum + e.confidence, 0) /
      positiveExpressions.length;
    emotionalScore += avgConfidence * 0.2;
  }

  // Relevance scoring based on task context
  const taskKeywords = [
    task.primaryService.toLowerCase(),
    task.location?.toLowerCase(),
    task.targetAudience.toLowerCase(),
  ].filter(Boolean);

  const imageKeywords = [
    ...image.tags.map((t) => t.toLowerCase()),
    ...image.vision.subjects.map((s) => s.toLowerCase()),
    image.vision.scene.toLowerCase(),
  ];

  const matchCount = taskKeywords.filter((keyword) =>
    imageKeywords.some((ik) => ik.includes(keyword!) || keyword!.includes(ik))
  ).length;

  relevanceScore = (matchCount / Math.max(taskKeywords.length, 1)) * 100;

  // Composition bonus
  if (image.vision.composition === 'excellent') {
    technicalScore += 10;
  } else if (image.vision.composition === 'good') {
    technicalScore += 5;
  }

  // Calculate total with weights
  const totalScore =
    technicalScore * 0.3 + emotionalScore * 0.4 + relevanceScore * 0.3;

  return {
    imageId: image.imageId,
    technicalScore: Math.min(100, technicalScore),
    emotionalScore: Math.min(100, emotionalScore),
    relevanceScore: Math.min(100, relevanceScore),
    totalScore: Math.min(100, totalScore),
  };
}

// ============================================================================
// HERO IMAGE SELECTION
// ============================================================================

export interface HeroSelection {
  selected: SelectedImage | null;
  scores: ImageScore[];
  reason: string;
}

/**
 * Select the best hero image from available candidates
 */
export function selectHeroImage(
  visionContext: VisionContext,
  task: WriterTask
): HeroSelection {
  if (visionContext.selectedImages.length === 0) {
    return {
      selected: null,
      scores: [],
      reason: 'No images provided',
    };
  }

  // Filter to images intended for hero use
  const heroCandidates = visionContext.selectedImages.filter(
    (img) => img.intendedUse === 'hero' || img.intendedUse === 'section'
  );

  // Fall back to all images if no hero-intended ones
  const candidates =
    heroCandidates.length > 0 ? heroCandidates : visionContext.selectedImages;

  // Score all candidates
  const scores = candidates.map((img) => scoreImageForHero(img, task));

  // Sort by total score descending
  scores.sort((a, b) => b.totalScore - a.totalScore);

  const bestScore = scores[0];
  const bestImage = candidates.find((img) => img.imageId === bestScore.imageId);

  if (!bestImage || bestScore.totalScore < 40) {
    return {
      selected: null,
      scores,
      reason:
        bestScore.totalScore < 40
          ? `Best candidate scored ${bestScore.totalScore.toFixed(0)}/100 - below threshold`
          : 'No suitable hero candidate found',
    };
  }

  return {
    selected: bestImage,
    scores,
    reason: `Selected based on technical (${bestScore.technicalScore.toFixed(0)}), emotional (${bestScore.emotionalScore.toFixed(0)}), relevance (${bestScore.relevanceScore.toFixed(0)}) scores`,
  };
}

// ============================================================================
// INLINE IMAGE PLANNING
// ============================================================================

export interface InlineImagePlan {
  placements: ImagePlacement[];
  unplacedImages: SelectedImage[];
  placeholderSlots: Array<{
    sectionIndex: number;
    description: string;
    requiredScene: string;
  }>;
}

/**
 * Plan inline image placements based on sections
 */
export function planInlineImages(
  visionContext: VisionContext,
  writerPlan: WriterPlan,
  task: WriterTask,
  heroImageId?: string
): InlineImagePlan {
  const placements: ImagePlacement[] = [];
  const placeholderSlots: InlineImagePlan['placeholderSlots'] = [];

  // Get available images (excluding hero)
  const availableImages = visionContext.selectedImages.filter(
    (img) => img.imageId !== heroImageId && img.intendedUse !== 'hero'
  );

  // Find sections that need images
  const sectionsNeedingImages = writerPlan.sections
    .filter((section) => section.imageSlot?.required)
    .map((section, idx) => ({
      sectionIndex: idx,
      section,
    }));

  // Calculate how many inline images we need
  const minImages = task.mediaRequirements.inlineImagesMin;
  const maxImages = task.mediaRequirements.inlineImagesMax;
  const targetImages = Math.min(
    maxImages,
    Math.max(minImages, sectionsNeedingImages.length)
  );

  // Match images to sections
  let placedCount = 0;
  const usedImageIds = new Set<string>();

  for (const { sectionIndex, section } of sectionsNeedingImages) {
    if (placedCount >= targetImages) break;
    if (!section.imageSlot) continue;

    // If section has a suggested image, use it
    if (section.imageSlot.suggestedImageId) {
      const suggestedImage = availableImages.find(
        (img) => img.imageId === section.imageSlot!.suggestedImageId
      );
      if (suggestedImage && !usedImageIds.has(suggestedImage.imageId)) {
        placements.push(
          createImagePlacement(suggestedImage, sectionIndex, 'section-break')
        );
        usedImageIds.add(suggestedImage.imageId);
        placedCount++;
        continue;
      }
    }

    // Find best matching image for section
    const sectionKeywords = [
      section.heading.toLowerCase(),
      section.intent.toLowerCase(),
      section.proofToInclude?.toLowerCase(),
    ].filter(Boolean) as string[];

    const bestMatch = findBestMatchingImage(
      availableImages.filter((img) => !usedImageIds.has(img.imageId)),
      sectionKeywords
    );

    if (bestMatch) {
      placements.push(
        createImagePlacement(bestMatch, sectionIndex, 'section-break')
      );
      usedImageIds.add(bestMatch.imageId);
      placedCount++;
    } else {
      // Create placeholder slot
      placeholderSlots.push({
        sectionIndex,
        description: section.imageSlot.description,
        requiredScene: `Image supporting: ${section.heading}`,
      });
    }
  }

  // If we still need more images, distribute remaining
  if (placedCount < minImages && availableImages.length > usedImageIds.size) {
    const unusedImages = availableImages.filter(
      (img) => !usedImageIds.has(img.imageId)
    );

    // Distribute evenly across content
    const sectionCount = writerPlan.sections.length;
    const insertionPoints = calculateDistributionPoints(
      sectionCount,
      minImages - placedCount
    );

    for (const point of insertionPoints) {
      if (unusedImages.length === 0) break;
      const img = unusedImages.shift()!;
      placements.push(createImagePlacement(img, point, 'inline'));
      usedImageIds.add(img.imageId);
    }
  }

  // Sort placements by section index
  placements.sort((a, b) => (a.sectionIndex || 0) - (b.sectionIndex || 0));

  const unplacedImages = availableImages.filter(
    (img) => !usedImageIds.has(img.imageId)
  );

  return {
    placements,
    unplacedImages,
    placeholderSlots,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createImagePlacement(
  image: SelectedImage,
  sectionIndex: number,
  placement: ImagePlacement['placement']
): ImagePlacement {
  return {
    imageId: image.imageId,
    alt: image.suggestedAlt,
    caption: image.suggestedCaption,
    filename: generateFilename(image),
    placement,
    sectionIndex,
    url: image.url || image.filePath,
  };
}

function generateFilename(image: SelectedImage): string {
  // Create SEO-friendly filename from subjects and scene
  const parts = [
    ...image.vision.subjects.slice(0, 2),
    image.vision.scene.split(' ').slice(0, 2).join('-'),
  ];

  const slugParts = parts
    .map((p) =>
      p
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    )
    .filter((p) => p.length > 0);

  return slugParts.slice(0, 3).join('-') + '.jpg';
}

function findBestMatchingImage(
  images: SelectedImage[],
  keywords: string[]
): SelectedImage | null {
  if (images.length === 0) return null;

  let bestMatch: SelectedImage | null = null;
  let bestScore = 0;

  for (const image of images) {
    const imageText = [
      ...image.tags,
      ...image.vision.subjects,
      image.vision.scene,
      image.suggestedAlt,
    ]
      .join(' ')
      .toLowerCase();

    const matchCount = keywords.filter((kw) => imageText.includes(kw)).length;
    const score = matchCount / keywords.length;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = image;
    }
  }

  return bestMatch;
}

function calculateDistributionPoints(
  sectionCount: number,
  imageCount: number
): number[] {
  if (imageCount === 0 || sectionCount === 0) return [];

  const points: number[] = [];
  const interval = sectionCount / (imageCount + 1);

  for (let i = 1; i <= imageCount; i++) {
    points.push(Math.floor(i * interval));
  }

  return points;
}

// ============================================================================
// IMAGE BLOCK GENERATION
// ============================================================================

/**
 * Generate a WordPress image block
 */
export function createImageBlock(placement: ImagePlacement): WPBlock {
  return {
    blockName: 'core/image',
    attrs: {
      id: placement.imageId,
      sizeSlug: 'large',
      linkDestination: 'none',
      alt: placement.alt,
      caption: placement.caption,
    },
    innerHTML: `<figure class="wp-block-image size-large"><img src="${placement.url || ''}" alt="${placement.alt}" /><figcaption>${placement.caption}</figcaption></figure>`,
    innerContent: [
      `<figure class="wp-block-image size-large"><img src="${placement.url || ''}" alt="${placement.alt}" /><figcaption>${placement.caption}</figcaption></figure>`,
    ],
    anchor: `img-${placement.sectionIndex || 0}-${placement.imageId.slice(0, 8)}`,
  };
}

/**
 * Generate a placeholder block for missing images
 */
export function createImagePlaceholderBlock(
  slot: InlineImagePlan['placeholderSlots'][0]
): WPBlock {
  return {
    blockName: 'core/paragraph',
    attrs: {
      className: 'image-placeholder',
    },
    innerHTML: `<p class="image-placeholder">[IMAGE SLOT: Section ${slot.sectionIndex + 1} - ${slot.description}. Required scene: ${slot.requiredScene}]</p>`,
    innerContent: [
      `<p class="image-placeholder">[IMAGE SLOT: Section ${slot.sectionIndex + 1} - ${slot.description}. Required scene: ${slot.requiredScene}]</p>`,
    ],
    anchor: `img-placeholder-${slot.sectionIndex}`,
  };
}

// ============================================================================
// ALT TEXT & CAPTION GENERATION
// ============================================================================

export interface ImageMetadata {
  alt: string;
  caption: string;
  title: string;
  filename: string;
}

/**
 * Generate SEO-optimized image metadata
 */
export function generateImageMetadata(
  image: SelectedImage,
  context: {
    businessName: string;
    primaryService: string;
    location?: string;
  }
): ImageMetadata {
  // Alt text: factual, accessible, includes context
  const altParts = [
    ...image.vision.subjects.slice(0, 2),
    image.vision.scene,
  ];

  // Add business context if relevant
  if (context.location) {
    altParts.push(`in ${context.location}`);
  }

  const alt = altParts.join(' - ');

  // Caption: engaging, includes business name
  let caption = image.suggestedCaption;
  if (!caption.includes(context.businessName)) {
    caption = `${caption} | ${context.businessName}`;
  }

  // Title: concise, keyword-rich
  const title = `${context.primaryService} - ${image.vision.scene}`;

  // Filename: SEO-friendly
  const filename = generateFilename(image);

  return {
    alt: alt.slice(0, 125), // Max 125 chars for alt
    caption: caption.slice(0, 200),
    title: title.slice(0, 70),
    filename,
  };
}
