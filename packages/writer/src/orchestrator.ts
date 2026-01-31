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
  getSystemPrompt,
  DEFAULT_PROMPT_PROFILE,
  type SystemPromptId,
} from './prompts';

import {
  adaptUnifiedToLegacyJob,
} from './context/adapter';

import {
  runExpandPass,
  EXPAND_PASS_PROMPT_TEMPLATE,
  type LLMClient,
  type ExpandPassInput,
} from './runExpandPass';

import {
  bindVisionFacts,
  validateVisionBinding,
} from './vision';

// ============================================================================
// EXPAND PASS TRIGGER ERRORS
// These validation error codes trigger an expand pass
// ============================================================================

const EXPAND_PASS_TRIGGER_ERRORS = [
  'CONTENT_TOO_SHORT',
  'READING_TIME_TOO_LOW',
  'VISION_REQUIRED_NOT_USED',
  'EEAT_SCORE_TOO_LOW',
  'MISSING_DECISION_CHECKLIST',
  'MISSING_COMPARISON_TABLE',
  'MISSING_AEO_QA_SECTION',
  // SEO drafts validation errors
  'SEO_TITLE_NOT_APPLIED',
  'H1_NOT_APPLIED',
  'H1_MISSING',
  'META_DESCRIPTION_NOT_APPLIED',
  // Vision facts validation errors
  'VISION_FACTS_NOT_USED',
  'MISSING_EVIDENCE_MARKER',
  'MISSING_EVIDENCE_SECTION',
];

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
    
    // -------------------------------------------------------------------------
    // DIAGNOSTIC: Log vision facts and SEO drafts received from adapter
    // -------------------------------------------------------------------------
    log(`[Writer] === DIAGNOSTIC: Vision Facts ===`);
    log(`[Writer] visionFacts count: ${job.task.visionFacts?.length ?? 0}`);
    if (job.task.visionFacts && job.task.visionFacts.length > 0) {
      job.task.visionFacts.slice(0, 3).forEach((fact, i) => {
        log(`[Writer]   fact[${i}]: "${fact.substring(0, 100)}..."`);
      });
    }
    log(`[Writer] visionProvided: ${job.task.visionProvided}`);
    log(`[Writer] requiresVisionUsage: ${job.task.requiresVisionUsage}`);
    
    log(`[Writer] === DIAGNOSTIC: SEO Drafts ===`);
    log(`[Writer] seoDrafts present: ${!!job.task.seoDrafts}`);
    if (job.task.seoDrafts) {
      log(`[Writer]   seoTitleDraft: "${job.task.seoDrafts.seoTitleDraft}"`);
      log(`[Writer]   h1Draft: "${job.task.seoDrafts.h1Draft}"`);
      log(`[Writer]   metaDescriptionDraft: "${job.task.seoDrafts.metaDescriptionDraft?.substring(0, 80)}..."`);
    }
    log(`[Writer] enforceSeoDrafts: ${job.task.enforceSeoDrafts}`);

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

    let wordpressOutput = parseWordPressOutput(articleResponse, plan, contextPack);
    timing.articleGeneration = Date.now() - articleStart;

    log(`[Writer] Article generated: ${wordpressOutput.blocks.length} blocks`);

    // =========================================================================
    // STEP 5b: APPLY SEO DRAFTS (Force plan-time refinements)
    // =========================================================================
    if (job.task.seoDrafts && job.task.enforceSeoDrafts !== false) {
      log('[Writer] Step 5b: Applying SEO drafts from growth plan...');
      const { seoTitleDraft, h1Draft, metaDescriptionDraft } = job.task.seoDrafts;
      
      // Override SEO fields with plan-time drafts
      if (seoTitleDraft) {
        wordpressOutput.seo.seoTitle = seoTitleDraft;
        log(`[Writer] Applied SEO title: "${seoTitleDraft}"`);
      }
      
      if (metaDescriptionDraft) {
        wordpressOutput.seo.metaDescription = metaDescriptionDraft;
        log(`[Writer] Applied meta description: "${metaDescriptionDraft.substring(0, 50)}..."`);
      }
      
      // Apply H1 draft to title and first heading block
      if (h1Draft) {
        wordpressOutput.title = h1Draft;
        
        // Find and update first H1 block if present
        const h1BlockIndex = wordpressOutput.blocks.findIndex(
          (b) => b.blockName === 'core/heading' && (b.attrs?.level === 1 || !b.attrs?.level)
        );
        if (h1BlockIndex >= 0) {
          wordpressOutput.blocks[h1BlockIndex].innerHTML = h1Draft;
          wordpressOutput.blocks[h1BlockIndex].innerContent = [h1Draft];
        }
        log(`[Writer] Applied H1: "${h1Draft}"`);
      }
    }

    // =========================================================================
    // STEP 5c: BIND VISION FACTS (Inject visual evidence into content)
    // =========================================================================
    if (job.task.visionFacts && job.task.visionFacts.length > 0) {
      log(`[Writer] Step 5c: Binding ${job.task.visionFacts.length} vision facts...`);
      
      try {
        const bindingResult = await bindVisionFacts({
          output: wordpressOutput,
          visionFacts: job.task.visionFacts,
          // Uses OPENAI_API_KEY from env by default
        });
        
        wordpressOutput = bindingResult.output;
        log(`[Writer] Vision facts bound: ${bindingResult.factsInjected}/${job.task.visionFacts.length}, sections added: ${bindingResult.sectionsAdded.join(', ') || 'none'}`);
      } catch (visionError) {
        log(`[Writer] Vision binding error: ${visionError}`);
        errors.push({ code: 'VISION_BINDING_FAILED', message: String(visionError), severity: 'warning', field: 'visionFacts' });
        // Non-fatal - continue without vision facts
      }
    }

    // =========================================================================
    // STEP 6: VALIDATE WORDPRESS OUTPUT
    // =========================================================================
    log('[Writer] Step 6: Validating WordPress output...');
    const validationStart = Date.now();

    // validateWordPressOutput already handles SEO drafts and vision facts validation internally
    let validation = validateWordPressOutput(wordpressOutput, job.task);
    
    let finalWordpressOutput = wordpressOutput;
    errors.push(...validation.warnings);
    timing.validation = Date.now() - validationStart;

    // =========================================================================
    // STEP 6b: RUN EXPAND PASS IF VALIDATION FAILS
    // =========================================================================
    
    // Check if we need to trigger an expand pass
    const needsExpandPass = validation.warnings.some(
      (w) => w.severity === 'error' && EXPAND_PASS_TRIGGER_ERRORS.includes(w.code)
    );

    if (needsExpandPass && !options.skipValidation) {
      log('[Writer] Step 6b: Running expand pass to fix validation errors...');
      
      try {
        // Create LLM client adapter
        const llmClient: LLMClient = {
          generateJson: async <T>({ system, prompt, temperature }: { system: string; prompt: string; temperature?: number }) => {
            const fullPrompt = `${system}\n\n${prompt}`;
            const response = await retryLlmCall(() => llmCall(fullPrompt), maxRetries);
            return JSON.parse(response) as T;
          },
        };

        // Build expand pass input
        const expandInput: ExpandPassInput = {
          original: wordpressOutput,
          intent: (job.task.intentMode || 'INFORMATIONAL') as 'MONEY' | 'SERVICE' | 'INFORMATIONAL' | 'TRUST',
          targetWordsMin: job.task.targetWords?.min ?? job.task.targetWordCount ?? 1500,
          targetWordsMax: job.task.targetWords?.max ?? 1800,
          faqAnswerWordsMin: job.task.faqAnswerWords?.min ?? 80,
          faqAnswerWordsMax: job.task.faqAnswerWords?.max ?? 120,
          maxHtmlBytes: job.task.wordpress?.maxHtmlBytes,
          maxBlocks: job.task.wordpress?.maxBlocks,
          requiredInternalLinks: job.task.internalLinks?.upLinks?.map(l => ({
            url: l.targetUrl,
            anchorText: l.anchorSuggestion,
          })) ?? [],
          masterProfileContext: contextPack.masterProfile,
          sitemapContext: contextPack.sitemap,
          onboardingContext: contextPack.onboarding,
          visionAnalysisContext: job.task.visionAnalysis,
        };

        // Get system prompt from promptProfile or default
        const promptProfile = job.task.promptProfile || DEFAULT_PROMPT_PROFILE;
        const systemPromptId = promptProfile.systemPromptId as SystemPromptId;
        const systemPrompt = getSystemPrompt(systemPromptId);
        
        // Get expand pass prompt
        const expandPassPromptId = promptProfile.expandPassPromptId as SystemPromptId || 'EXPAND_PASS_V1';
        const expandPromptTemplate = getSystemPrompt(expandPassPromptId);

        // Run expand pass
        const expandedOutput = await runExpandPass({
          llm: llmClient,
          input: expandInput,
          systemPrompt,
          expandPromptTemplate,
        });

        log(`[Writer] Expand pass complete: ${expandedOutput.blocks.length} blocks`);

        // Re-validate expanded output
        const validation2 = validateWordPressOutput(expandedOutput as WordPressOutput, job.task);
        
        if (validation2.valid || validation2.warnings.filter(w => w.severity === 'error').length < 
            validation.warnings.filter(w => w.severity === 'error').length) {
          // Expand pass improved the output
          finalWordpressOutput = expandedOutput as WordPressOutput;
          validation = validation2;
          errors.length = 0; // Clear old errors
          errors.push(...validation2.warnings);
          log('[Writer] Expand pass improved validation');
        } else {
          log('[Writer] Expand pass did not improve validation, keeping original');
        }
      } catch (expandError) {
        log(`[Writer] Expand pass failed: ${expandError}`);
        // Continue with original output
      }
    }

    if (!validation.valid && !options.skipValidation) {
      log(`[Writer] Validation failed with ${validation.warnings.filter(w => w.severity === 'error').length} errors`);
    }

    log(`[Writer] Validation: ${validation.valid ? 'PASSED' : 'FAILED'} (${validation.warnings.length} warnings)`);

    // =========================================================================
    // STEP 7: GENERATE SOCIAL POSTS
    // =========================================================================
    log('[Writer] Step 7: Generating social posts...');
    const socialStart = Date.now();

    const articleUrl = buildArticleUrl(job, finalWordpressOutput.slug);
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
        finalWordpressOutput.title,
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
        finalWordpressOutput.title,
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
        finalWordpressOutput.title,
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
      wordpress: finalWordpressOutput,
      social,
      audit,
      generatedAt: new Date().toISOString(),
      version: 1,
    };

    timing.total = Date.now() - startTime;

    // =========================================================================
    // PASS/FAIL CHECKLIST (Final validation gate)
    // =========================================================================
    log(`[Writer] ========================================`);
    log(`[Writer] PASS/FAIL CHECKLIST`);
    log(`[Writer] ========================================`);
    
    const checklist: { item: string; pass: boolean; detail: string }[] = [];
    
    // 1. SEO Title: Must use seoDrafts if provided
    const seoTitleMatch = !job.task.seoDrafts?.seoTitleDraft || 
      finalWordpressOutput.seo.seoTitle === job.task.seoDrafts.seoTitleDraft;
    checklist.push({
      item: 'SEO Title uses draft',
      pass: seoTitleMatch,
      detail: seoTitleMatch 
        ? `✓ "${finalWordpressOutput.seo.seoTitle}"` 
        : `✗ Expected: "${job.task.seoDrafts?.seoTitleDraft}", Got: "${finalWordpressOutput.seo.seoTitle}"`,
    });
    
    // 2. H1: Must use h1Draft if provided
    const h1Match = !job.task.seoDrafts?.h1Draft || 
      finalWordpressOutput.title === job.task.seoDrafts.h1Draft;
    checklist.push({
      item: 'H1 uses draft',
      pass: h1Match,
      detail: h1Match 
        ? `✓ "${finalWordpressOutput.title}"` 
        : `✗ Expected: "${job.task.seoDrafts?.h1Draft}", Got: "${finalWordpressOutput.title}"`,
    });
    
    // 3. Meta Description: Must use metaDescriptionDraft if provided
    const metaMatch = !job.task.seoDrafts?.metaDescriptionDraft || 
      finalWordpressOutput.seo.metaDescription === job.task.seoDrafts.metaDescriptionDraft;
    checklist.push({
      item: 'Meta Description uses draft',
      pass: metaMatch,
      detail: metaMatch 
        ? `✓ (${finalWordpressOutput.seo.metaDescription?.substring(0, 50)}...)` 
        : `✗ MISMATCH`,
    });
    
    // 4. Vision Facts: If provided, at least 50% must appear in content
    const contentText = finalWordpressOutput.blocks
      .map(b => (typeof b.innerHTML === 'string' ? b.innerHTML : ''))
      .join(' ').toLowerCase();
    
    let visionFactsUsed = 0;
    const visionFactsRequired = job.task.visionFacts?.length || 0;
    if (visionFactsRequired > 0 && job.task.visionFacts) {
      for (const fact of job.task.visionFacts) {
        // Check if key words from the fact appear in content
        const factWords = fact.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        const matchCount = factWords.filter(w => contentText.includes(w)).length;
        if (matchCount >= Math.ceil(factWords.length * 0.3)) {
          visionFactsUsed++;
        }
      }
    }
    const visionMinRequired = Math.min(3, Math.ceil(visionFactsRequired * 0.5));
    const visionPass = visionFactsRequired === 0 || visionFactsUsed >= visionMinRequired;
    checklist.push({
      item: 'Vision Facts incorporated',
      pass: visionPass,
      detail: visionFactsRequired === 0 
        ? '✓ (No vision facts provided)'
        : visionPass 
          ? `✓ ${visionFactsUsed}/${visionFactsRequired} facts used (min: ${visionMinRequired})` 
          : `✗ Only ${visionFactsUsed}/${visionFactsRequired} facts used (min: ${visionMinRequired})`,
    });
    
    // 5. Word count target met
    const wordCountTarget = job.task.targetWords?.min ?? job.task.targetWordCount ?? 1500;
    const wordCountPass = validation.stats.wordCount >= wordCountTarget * 0.9;
    checklist.push({
      item: 'Word count target',
      pass: wordCountPass,
      detail: wordCountPass 
        ? `✓ ${validation.stats.wordCount} words (target: ${wordCountTarget})` 
        : `✗ ${validation.stats.wordCount} words (target: ${wordCountTarget}, min: ${Math.floor(wordCountTarget * 0.9)})`,
    });
    
    // 6. No critical validation errors
    const criticalErrors = errors.filter(e => e.severity === 'error');
    const noErrors = criticalErrors.length === 0;
    checklist.push({
      item: 'No critical errors',
      pass: noErrors,
      detail: noErrors 
        ? '✓ Clean validation' 
        : `✗ ${criticalErrors.length} error(s): ${criticalErrors.map(e => e.code).join(', ')}`,
    });
    
    // Print checklist
    const allPassed = checklist.every(c => c.pass);
    for (const check of checklist) {
      log(`[Writer] ${check.pass ? 'PASS' : 'FAIL'}: ${check.item}`);
      log(`[Writer]       ${check.detail}`);
    }
    log(`[Writer] ----------------------------------------`);
    log(`[Writer] OVERALL: ${allPassed ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS FAILED ✗'}`);
    log(`[Writer] ========================================`);
    
    // Add checklist to audit output
    audit.checklist = checklist;

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
  
  // =========================================================================
  // TRACE: Verify vision facts and SEO drafts survived adapter conversion
  // =========================================================================
  log(`[Writer] === TRACE: After adapter - legacyJob.task.visionFacts: ${legacyJob.task.visionFacts?.length ?? 0} ===`);
  if (legacyJob.task.seoDrafts) {
    log(`[Writer] === TRACE: After adapter - legacyJob.task.seoDrafts.seoTitle: "${legacyJob.task.seoDrafts.seoTitleDraft}" ===`);
  } else {
    log(`[Writer] === TRACE: After adapter - NO seoDrafts present ===`);
  }
  log(`[Writer] === TRACE: After adapter - visionProvided: ${legacyJob.task.visionProvided}, requiresVisionUsage: ${legacyJob.task.requiresVisionUsage} ===`);

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
