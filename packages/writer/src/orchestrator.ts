// ============================================================================
// WRITER ORCHESTRATOR
// ============================================================================
// Main entry point that coordinates the entire writing pipeline.
// Takes a WritingJob and produces a complete WritingOutput.
// Supports both legacy WritingJob format and new UnifiedWriterJobConfig.
// ============================================================================

import type {
  WritingJob,
  WritingOutput,
  WriterPlan,
  ContextPack,
  WordPressOutput,
  WPBlock,
  SocialOutput,
  AuditOutput,
  ImagePlacement,
  SEOPackage,
  ValidationWarning,
  SectionPlan,
  LinkedInPost,
  GMBPost,
  RedditPost,
  BrandToneProfile,
  UnifiedWriterJobConfig,
} from './types';

import {
  getToneProfile,
  mergeToneProfile,
} from './tones/profiles';

import {
  validateWordPressOutput,
  validateWriterTaskInputs,
  validateRewriteContext,
  generateContentHash,
} from './validators/wpValidator';

import {
  buildArticlePrompt,
  buildLinkedInPrompt,
  buildGmbPrompt,
  buildRedditPrompt,
} from './prompts';

import {
  adaptUnifiedToLegacyJob,
} from './context/adapter';

// ============================================================================
// ORCHESTRATOR OPTIONS
// ============================================================================

export interface OrchestratorOptions {
  /** LLM call function - injected dependency */
  llmCall: (prompt: string, schema?: object) => Promise<string>;
  
  /** Enable verbose logging */
  verbose?: boolean;
  
  /** Maximum retries for LLM calls */
  maxRetries?: number;
  
  /** Skip validation (for testing) */
  skipValidation?: boolean;
  
  /** Custom tone profile override */
  toneOverride?: Partial<BrandToneProfile>;
}

// ============================================================================
// ORCHESTRATOR RESULT
// ============================================================================

export interface OrchestratorResult {
  success: boolean;
  output?: WritingOutput;
  errors: ValidationWarning[];
  timing: {
    total: number;
    contextBuild: number;
    planGeneration: number;
    articleGeneration: number;
    socialGeneration: number;
    validation: number;
  };
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

export async function runWriterOrchestrator(
  job: WritingJob,
  options: OrchestratorOptions
): Promise<OrchestratorResult> {
  const startTime = Date.now();
  const timing = {
    total: 0,
    contextBuild: 0,
    planGeneration: 0,
    articleGeneration: 0,
    socialGeneration: 0,
    validation: 0,
  };

  const errors: ValidationWarning[] = [];
  const { llmCall, verbose, maxRetries = 2 } = options;

  const log = verbose ? console.log : () => {};

  try {
    // =========================================================================
    // STEP 1: VALIDATE INPUTS
    // =========================================================================
    log('[Writer] Step 1: Validating inputs...');

    const inputValidation = validateWriterTaskInputs(job.task);
    if (!inputValidation.valid && !options.skipValidation) {
      return {
        success: false,
        errors: inputValidation.errors,
        timing: { ...timing, total: Date.now() - startTime },
      };
    }

    if (inputValidation.errors.length > 0) {
      errors.push(...inputValidation.errors);
    }

    // =========================================================================
    // STEP 2: BUILD CONTEXT PACK
    // =========================================================================
    log('[Writer] Step 2: Building context pack...');
    const contextStart = Date.now();

    const contextPack = buildContextPack(job);
    timing.contextBuild = Date.now() - contextStart;

    log(`[Writer] Context pack built with ${contextPack.visionSummary.inlineCandidates.length} images`);

    // =========================================================================
    // STEP 3: GENERATE WRITER PLAN
    // =========================================================================
    log('[Writer] Step 3: Generating writer plan...');
    const planStart = Date.now();

    const plan = await generateWriterPlan(job, contextPack, llmCall, maxRetries);
    timing.planGeneration = Date.now() - planStart;

    log(`[Writer] Plan generated: "${plan.h1}" with ${plan.sections?.length || 0} sections`);

    // =========================================================================
    // STEP 4: GET TONE PROFILE
    // =========================================================================
    log('[Writer] Step 4: Resolving tone profile...');

    const baseTone = getToneProfile(
      job.userContext?.brandToneProfile?.id || 'friendly-expert'
    );
    const tone = options.toneOverride
      ? mergeToneProfile(baseTone, options.toneOverride)
      : baseTone;

    log(`[Writer] Using tone: ${tone.id}`);

    // =========================================================================
    // STEP 5: GENERATE WORDPRESS ARTICLE
    // =========================================================================
    log('[Writer] Step 5: Generating WordPress article...');
    const articleStart = Date.now();

    const articlePrompt = buildArticlePrompt(contextPack, plan, job.task, tone);
    const articleResponse = await retryLlmCall(
      () => llmCall(articlePrompt),
      maxRetries
    );

    const wordpressOutput = parseWordPressOutput(articleResponse, plan, contextPack);
    timing.articleGeneration = Date.now() - articleStart;

    log(`[Writer] Article generated: ${wordpressOutput.blocks.length} blocks`);

    // =========================================================================
    // STEP 6: VALIDATE WORDPRESS OUTPUT
    // =========================================================================
    log('[Writer] Step 6: Validating WordPress output...');
    const validationStart = Date.now();

    const validation = validateWordPressOutput(wordpressOutput, job.task);
    errors.push(...validation.warnings);
    timing.validation = Date.now() - validationStart;

    if (!validation.valid && !options.skipValidation) {
      log(`[Writer] Validation failed with ${validation.warnings.filter(w => w.severity === 'error').length} errors`);
    }

    log(`[Writer] Validation: ${validation.valid ? 'PASSED' : 'FAILED'} (${validation.warnings.length} warnings)`);

    // =========================================================================
    // STEP 7: GENERATE SOCIAL POSTS
    // =========================================================================
    log('[Writer] Step 7: Generating social posts...');
    const socialStart = Date.now();

    const articleUrl = buildArticleUrl(job, wordpressOutput.slug);
    const social: SocialOutput = {
      linkedinPost: createDefaultLinkedInPost(),
      gmbPost: createDefaultGmbPost(),
      redditPost: createDefaultRedditPost(),
    };

    // Generate LinkedIn if targeted
    if (job.publishingTargets.linkedin?.enabled) {
      log('[Writer] Generating LinkedIn post...');
      const linkedInPrompt = buildLinkedInPrompt(
        contextPack,
        plan,
        job.task,
        tone,
        wordpressOutput.title,
        articleUrl
      );
      const linkedInResponse = await retryLlmCall(
        () => llmCall(linkedInPrompt),
        maxRetries
      );
      social.linkedinPost = parseLinkedInOutput(linkedInResponse);
    }

    // Generate GMB if targeted
    if (job.publishingTargets.gmb?.enabled) {
      log('[Writer] Generating GMB post...');
      const gmbPrompt = buildGmbPrompt(
        contextPack,
        plan,
        job.task,
        tone,
        wordpressOutput.title,
        articleUrl,
        'update'
      );
      const gmbResponse = await retryLlmCall(
        () => llmCall(gmbPrompt),
        maxRetries
      );
      social.gmbPost = parseGmbOutput(gmbResponse);
    }

    // Generate Reddit if targeted
    if (job.publishingTargets.reddit?.enabled) {
      log('[Writer] Generating Reddit content...');
      const redditPrompt = buildRedditPrompt(
        contextPack,
        plan,
        job.task,
        tone,
        wordpressOutput.title,
        articleUrl
      );
      const redditResponse = await retryLlmCall(
        () => llmCall(redditPrompt),
        maxRetries
      );
      social.redditPost = parseRedditOutput(redditResponse);
    }

    timing.socialGeneration = Date.now() - socialStart;

    // =========================================================================
    // STEP 8: COMPILE FINAL OUTPUT
    // =========================================================================
    log('[Writer] Step 8: Compiling final output...');

    const audit: AuditOutput = {
      contextUsed: {
        businessContext: !!contextPack.businessReality.name,
        localSignals: contextPack.localSignals.locations.length > 0,
        reviews: contextPack.proofSummary.topQuotes.length > 0,
        proofAssets: contextPack.proofSummary.credentialsList.length > 0,
        rewriteContext: !!contextPack.rewriteSummary,
        visionContext: contextPack.visionSummary.inlineCandidates.length > 0,
      },
      eeatSignalsUsed: job.task.requiredEEATSignals,
      reviewThemesUsed: contextPack.proofSummary.reviewThemes,
      proofElementsUsed: job.task.requiredProofElements,
      tokenCostEstimate: {
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
      },
      safetyNotes: [],
      validationWarnings: errors,
      wordCount: validation.stats.wordCount,
      readingTimeMinutes: validation.stats.readingTimeMinutes,
      blockCount: validation.stats.blockCount,
      htmlBytes: validation.stats.htmlBytes,
    };

    const output: WritingOutput = {
      jobId: job.jobId,
      wordpress: wordpressOutput,
      social,
      audit,
      generatedAt: new Date().toISOString(),
      version: 1,
    };

    timing.total = Date.now() - startTime;

    log(`[Writer] Complete! Total time: ${timing.total}ms`);

    return {
      success: validation.valid || options.skipValidation === true,
      output,
      errors,
      timing,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push({
      code: 'ORCHESTRATOR_ERROR',
      message: `Orchestrator failed: ${errorMessage}`,
      severity: 'error',
    });

    timing.total = Date.now() - startTime;

    return {
      success: false,
      errors,
      timing,
    };
  }
}

// ============================================================================
// CONTEXT PACK BUILDER
// ============================================================================

function buildContextPack(job: WritingJob): ContextPack {
  const pack: ContextPack = {
    businessReality: {
      name: job.userContext?.businessName || '',
      services: job.userContext?.services || [],
      differentiators: job.userContext?.uspDifferentiators || [],
      beadsSummary: job.userContext?.beads?.map(b => `${b.label}: ${b.value}`).join('; ') || '',
      targetAudience: job.task.targetAudience || '',
    },
    localSignals: {
      locations: job.userContext?.locales || [],
      serviceAreas: job.userContext?.serviceAreas || [],
      localPhrasing: [],
    },
    proofSummary: {
      reviewThemes: job.proofContext?.reviewThemes?.map(t => t.theme) || [],
      topQuotes: job.proofContext?.reviews?.slice(0, 5).map(r => r.text) || [],
      caseStudyBullets: job.proofContext?.proofAssets?.caseStudies?.map(cs => `${cs.title}: ${cs.outcome}`) || [],
      credentialsList: job.proofContext?.proofAssets?.certifications?.map(c => c.name) || [],
    },
    visionSummary: {
      heroCandidate: job.visionContext?.selectedImages?.find(i => i.intendedUse === 'hero'),
      inlineCandidates: job.visionContext?.selectedImages?.filter(i => i.intendedUse !== 'hero') || [],
      emotionalCues: [],
    },
  };

  // Add rewrite summary if present
  if (job.siteContext?.rewrite) {
    pack.rewriteSummary = {
      keepHeadings: job.siteContext.rewrite.extractedHeadings,
      keepFAQs: job.siteContext.rewrite.extractedFAQs,
      keyPointsToPreserve: job.siteContext.rewrite.extractedKeyPoints,
      elementsToRemove: job.siteContext.rewrite.removeElements,
    };
  }

  return pack;
}

// ============================================================================
// WRITER PLAN GENERATOR
// ============================================================================

async function generateWriterPlan(
  job: WritingJob,
  contextPack: ContextPack,
  llmCall: (prompt: string) => Promise<string>,
  maxRetries: number
): Promise<WriterPlan> {
  const planPrompt = buildPlanPrompt(job, contextPack);

  const response = await retryLlmCall(() => llmCall(planPrompt), maxRetries);

  try {
    const parsed = JSON.parse(response);
    return normalizePlan(parsed, job, contextPack);
  } catch {
    return createDefaultPlan(job, contextPack);
  }
}

function buildPlanPrompt(job: WritingJob, contextPack: ContextPack): string {
  return `# TASK
Create a detailed content plan for a ${job.task.role} page about "${job.task.primaryService}".

# CONTEXT
Business: ${contextPack.businessReality.name || 'N/A'}
Services: ${contextPack.businessReality.services.join(', ') || 'N/A'}
Location: ${contextPack.localSignals.locations.join(', ') || 'N/A'}

# PAGE REQUIREMENTS
Role: ${job.task.role}
Intent: ${job.task.intent}
Audience: ${job.task.targetAudience}

# AVAILABLE IMAGES
${contextPack.visionSummary.inlineCandidates?.map((v) => `- ${v.imageId}: ${v.suggestedAlt}`).join('\n') || 'None'}

# OUTPUT
Return a JSON object with:
{
  "h1": "string - Compelling H1 title",
  "sections": [
    {
      "id": "string - unique id like section-1",
      "heading": "string",
      "level": 2,
      "intent": "string - What this section accomplishes",
      "estimatedWordCount": number,
      "imageSlot": { "required": boolean, "description": "string", "suggestedImageId": "string or null" } | null
    }
  ],
  "ctaPlacement": "after-intro" | "mid-content" | "end" | "multiple",
  "heroImageId": "string or null",
  "totalEstimatedWords": number,
  "keyphraseOccurrences": number
}`;
}

function normalizePlan(
  parsed: Record<string, unknown>,
  job: WritingJob,
  contextPack: ContextPack
): WriterPlan {
  const sections = (parsed.sections as unknown[] || []).map((s: unknown, i: number) => {
    const section = s as Record<string, unknown>;
    return {
      id: (section.id as string) || `section-${i + 1}`,
      heading: (section.heading as string) || 'Section',
      level: (section.level as 1 | 2 | 3) || 2,
      intent: (section.intent as string) || '',
      estimatedWordCount: (section.estimatedWordCount as number) || 150,
      imageSlot: section.imageSlot as SectionPlan['imageSlot'],
    };
  });

  return {
    h1: (parsed.h1 as string) || `${job.task.primaryService} Services`,
    sections,
    ctaPlacement: (parsed.ctaPlacement as WriterPlan['ctaPlacement']) || 'end',
    heroImageId: (parsed.heroImageId as string) || contextPack.visionSummary.heroCandidate?.imageId,
    totalEstimatedWords: (parsed.totalEstimatedWords as number) || 1200,
    keyphraseOccurrences: (parsed.keyphraseOccurrences as number) || 5,
  };
}

function createDefaultPlan(job: WritingJob, contextPack: ContextPack): WriterPlan {
  return {
    h1: `Professional ${job.task.primaryService} Services`,
    sections: [
      {
        id: 'section-1',
        heading: `What is ${job.task.primaryService}?`,
        level: 2,
        intent: 'Introduce the topic and establish relevance',
        estimatedWordCount: 200,
      },
      {
        id: 'section-2',
        heading: 'Our Approach',
        level: 2,
        intent: 'Differentiate and build trust',
        estimatedWordCount: 250,
      },
      {
        id: 'section-3',
        heading: 'Benefits',
        level: 2,
        intent: 'Value proposition',
        estimatedWordCount: 200,
      },
      {
        id: 'section-4',
        heading: 'Why Choose Us',
        level: 2,
        intent: 'Trust signals and CTA lead-in',
        estimatedWordCount: 200,
      },
    ],
    ctaPlacement: 'end',
    heroImageId: contextPack.visionSummary.heroCandidate?.imageId,
    totalEstimatedWords: 1200,
    keyphraseOccurrences: 5,
  };
}

// ============================================================================
// OUTPUT PARSERS
// ============================================================================

function parseWordPressOutput(
  response: string,
  plan: WriterPlan,
  contextPack: ContextPack
): WordPressOutput {
  try {
    const parsed = JSON.parse(cleanJsonResponse(response));

    return {
      title: parsed.title || plan.h1,
      slug: parsed.slug || slugify(parsed.title || plan.h1),
      excerpt: parsed.excerpt || '',
      blocks: normalizeBlocks(parsed.blocks || []),
      seo: normalizeSEO(parsed.seo, plan),
      images: normalizeImages(parsed.images, plan, contextPack),
      internalLinksUsed: (parsed.internalLinksUsed || []).map((link: Record<string, unknown>) => ({
        url: (link.url as string) || '',
        anchor: (link.anchor as string) || (link.anchorText as string) || '',
        sectionIndex: (link.sectionIndex as number) || 0,
      })),
      contentHash: generateContentHash({ blocks: parsed.blocks || [] } as WordPressOutput),
    };
  } catch {
    return {
      title: plan.h1,
      slug: slugify(plan.h1),
      excerpt: '',
      blocks: [],
      seo: {
        seoTitle: plan.h1,
        metaDescription: '',
        focusKeyphrase: '',
      },
      images: {
        inline: [],
      },
      internalLinksUsed: [],
      contentHash: '',
    };
  }
}

function parseLinkedInOutput(response: string): LinkedInPost {
  try {
    const parsed = JSON.parse(cleanJsonResponse(response));
    return {
      text: parsed.content || parsed.text || '',
      hashtags: parsed.hashtags || [],
      suggestedImageId: parsed.imageRef || parsed.suggestedImageId,
      hookInsight: parsed.engagementHook || parsed.hookInsight || '',
      cta: parsed.callToAction || parsed.cta || '',
    };
  } catch {
    return createDefaultLinkedInPost();
  }
}

function parseGmbOutput(response: string): GMBPost {
  try {
    const parsed = JSON.parse(cleanJsonResponse(response));
    return {
      text: parsed.content || parsed.text || '',
      cta: typeof parsed.callToAction === 'string' 
        ? parsed.callToAction 
        : parsed.callToAction?.type || 'LEARN_MORE',
      hashtags: parsed.hashtags || [],
      suggestedImageId: parsed.imageRef || parsed.suggestedImageId,
      callToActionUrl: typeof parsed.callToAction === 'object' 
        ? parsed.callToAction?.url 
        : undefined,
    };
  } catch {
    return createDefaultGmbPost();
  }
}

function parseRedditOutput(response: string): RedditPost {
  try {
    const parsed = JSON.parse(cleanJsonResponse(response));
    return {
      title: parsed.title || '',
      body: parsed.content || parsed.body || '',
      subredditSuggestions: (parsed.subredditSuggestions || []).map((s: unknown) =>
        typeof s === 'string' ? s : (s as Record<string, string>).subreddit
      ),
      disclosureLine: parsed.disclosureLine || 'I am affiliated with this business.',
      flairSuggestion: parsed.flairSuggestion,
    };
  } catch {
    return createDefaultRedditPost();
  }
}

// ============================================================================
// DEFAULT SOCIAL POSTS
// ============================================================================

function createDefaultLinkedInPost(): LinkedInPost {
  return {
    text: '',
    hashtags: [],
    hookInsight: '',
    cta: '',
  };
}

function createDefaultGmbPost(): GMBPost {
  return {
    text: '',
    cta: 'LEARN_MORE',
  };
}

function createDefaultRedditPost(): RedditPost {
  return {
    title: '',
    body: '',
    subredditSuggestions: [],
    disclosureLine: 'I am affiliated with this business.',
  };
}

// ============================================================================
// NORMALIZATION HELPERS
// ============================================================================

function normalizeBlocks(blocks: unknown[]): WPBlock[] {
  return blocks.map((block) => {
    const b = block as Record<string, unknown>;
    return {
      blockName: (b.blockName as WPBlock['blockName']) || 'core/paragraph',
      attrs: (b.attrs as Record<string, unknown>) || {},
      innerHTML: (b.innerHTML as string) || '',
      innerContent: (b.innerContent as string[]) || [(b.innerHTML as string) || ''],
      innerBlocks: b.innerBlocks ? normalizeBlocks(b.innerBlocks as unknown[]) : undefined,
    };
  });
}

function normalizeSEO(seo: unknown, plan: WriterPlan): SEOPackage {
  const s = (seo as Record<string, unknown>) || {};
  return {
    seoTitle: (s.seoTitle as string) || plan.h1,
    metaDescription: (s.metaDescription as string) || '',
    focusKeyphrase: (s.focusKeyphrase as string) || '',
    schemaJsonLd: s.schema as Record<string, unknown> | undefined,
    ogTitle: s.ogTitle as string | undefined,
    ogDescription: s.ogDescription as string | undefined,
  };
}

function normalizeImages(
  images: unknown,
  plan: WriterPlan,
  contextPack: ContextPack
): WordPressOutput['images'] {
  const imgs = (images as Record<string, unknown>) || {};
  
  let hero: ImagePlacement | undefined;
  if (imgs.hero) {
    const h = imgs.hero as Record<string, unknown>;
    hero = {
      imageId: (h.assetRef as string) || (h.imageId as string) || plan.heroImageId || '',
      alt: (h.alt as string) || '',
      caption: (h.caption as string) || '',
      filename: (h.suggestedFilename as string) || (h.filename as string) || 'hero.jpg',
      placement: 'hero',
    };
  } else if (plan.heroImageId) {
    const candidate = contextPack.visionSummary.heroCandidate;
    if (candidate) {
      hero = {
        imageId: candidate.imageId,
        alt: candidate.suggestedAlt,
        caption: candidate.suggestedCaption,
        filename: 'hero.jpg',
        placement: 'hero',
      };
    }
  }

  const inline: ImagePlacement[] = ((imgs.inline as unknown[]) || []).map((img, i) => {
    const im = img as Record<string, unknown>;
    return {
      imageId: (im.assetRef as string) || (im.imageId as string) || '',
      alt: (im.alt as string) || '',
      caption: (im.caption as string) || '',
      filename: (im.suggestedFilename as string) || (im.filename as string) || `image-${i + 1}.jpg`,
      placement: 'inline',
      sectionIndex: (im.sectionIndex as number) || i,
    };
  });

  return { hero, inline };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function cleanJsonResponse(response: string): string {
  let cleaned = response.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildArticleUrl(_job: WritingJob, slug: string): string {
  return `https://example.com/${slug}`;
}

async function retryLlmCall(
  fn: () => Promise<string>,
  maxRetries: number
): Promise<string> {
  let lastError: Error | null = null;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  throw lastError || new Error('LLM call failed');
}

// ============================================================================
// UNIFIED ORCHESTRATOR (NEW FORMAT)
// ============================================================================
// This version accepts the new UnifiedWriterJobConfig format from the API

export async function runUnifiedWriterOrchestrator(
  jobConfig: UnifiedWriterJobConfig,
  options: OrchestratorOptions
): Promise<OrchestratorResult> {
  const log = options.verbose ? console.log : () => {};
  
  log('[Writer] Running unified orchestrator...');
  log(`[Writer] Master Profile v${jobConfig.masterProfileVersion}`);
  log(`[Writer] Context Pack: ${jobConfig.taskContextPackId}`);
  log(`[Writer] Mode: ${jobConfig.taskContextPackSnapshot.mode}`);

  // Validate rewrite context if mode is 'update'
  const contextPack = jobConfig.taskContextPackSnapshot;
  if (contextPack.mode === 'update') {
    const rewriteValidation = validateRewriteContext(contextPack.rewriteContext);
    if (!rewriteValidation.valid && !options.skipValidation) {
      return {
        success: false,
        errors: rewriteValidation.errors,
        timing: {
          total: 0,
          contextBuild: 0,
          planGeneration: 0,
          articleGeneration: 0,
          socialGeneration: 0,
          validation: 0,
        },
      };
    }
  }

  // Convert to legacy job format for backward compatibility
  const legacyJob = adaptUnifiedToLegacyJob(
    contextPack,
    jobConfig.toneProfileId,
    jobConfig.targets
  );

  // Merge tone overrides
  const mergedOptions: OrchestratorOptions = {
    ...options,
    toneOverride: jobConfig.toneOverrides
      ? { ...options.toneOverride, ...jobConfig.toneOverrides }
      : options.toneOverride,
  };

  // Run the standard orchestrator
  return runWriterOrchestrator(legacyJob, mergedOptions);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { buildContextPack, generateWriterPlan, createDefaultPlan };
export { adaptUnifiedContextPack, adaptUnifiedToLegacyJob } from './context/adapter';
