import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { runQualityGate } from '@/lib/writer/validator/qualityGate';
import { repairWithNarrativeOutcome, getNarrativeOutcomePromptInstructions } from '@/lib/writer/validator/autoRepairNarrativeOutcome';

// ============================================================================
// ARTICLE GENERATION ROUTE
// ============================================================================
// POST /api/projects/[projectId]/writer/[jobId]/generate
// Takes the writer job's context pack and generates the full article via GPT
// ============================================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; jobId: string } }
) {
  try {
    const { projectId, jobId } = params;
    const adminClient = createAdminClient();

    // Fetch the writer job with its config
    const { data: job, error: jobError } = await adminClient
      .from('writer_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('project_id', projectId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Writer job not found' },
        { status: 404 }
      );
    }

    if (job.status === 'completed') {
      return NextResponse.json(
        { error: 'Article already generated' },
        { status: 400 }
      );
    }

    // Update status to processing
    await adminClient
      .from('writer_jobs')
      .update({ status: 'processing' })
      .eq('id', jobId);

    const jobConfig = job.job_config as any;
    const masterProfile = jobConfig.masterProfileSnapshot;
    const contextPack = jobConfig.taskContextPackSnapshot;
    const task = jobConfig.task;

    // Log context quality for debugging
    console.log(`[ArticleGen] === CONTEXT QUALITY CHECK ===`);
    console.log(`[ArticleGen] Business: ${masterProfile?.business?.name || 'MISSING'}`);
    console.log(`[ArticleGen] Services: ${masterProfile?.business?.services?.length || 0} defined`);
    console.log(`[ArticleGen] Locations: ${masterProfile?.business?.locations?.length || 0} defined`);
    console.log(`[ArticleGen] Brand voice: ${masterProfile?.brandVoice?.tone || 'MISSING'}`);
    console.log(`[ArticleGen] Proof atoms: ${masterProfile?.proofAtoms?.length || 0}`);
    // CRITICAL: Vision facts are in writerBrief, NOT visionAnalysis
    const briefVisionFacts = contextPack?.writerBrief?.visionFacts || [];
    const briefUserFacts = contextPack?.writerBrief?.userFacts || [];
    console.log(`[ArticleGen] Vision facts (writerBrief): ${briefVisionFacts.length}`);
    console.log(`[ArticleGen] User facts (writerBrief): ${briefUserFacts.length}`);
    if (briefVisionFacts.length > 0) {
      console.log(`[ArticleGen] First 3 vision facts:`);
      briefVisionFacts.slice(0, 3).forEach((f: string, i: number) => {
        console.log(`  [${i+1}] ${f.substring(0, 100)}...`);
      });
    }
    console.log(`[ArticleGen] Vision context pack: ${contextPack?.visionContext ? 'Present' : 'MISSING'}`);
    console.log(`[ArticleGen] EEAT pack: ${contextPack?.eeatPack ? 'Present' : 'MISSING'}`);
    console.log(`[ArticleGen] Link targets: ${(contextPack?.linkTargets?.upLinks?.length || 0) + (contextPack?.linkTargets?.downLinks?.length || 0)} links`);
    console.log(`[ArticleGen] ==============================`);

    console.log(`[ArticleGen] Generating article for: ${task?.title || 'Untitled'}`);

    // Determine intent mode from task/brief
    const intentMode = determineIntentMode(task, contextPack);
    console.log(`[ArticleGen] Intent mode: ${intentMode}`);

    // Build the prompt
    const prompt = buildMasterAuthorityPrompt(masterProfile, contextPack, task, intentMode);
    console.log(`[ArticleGen] Prompt length: ${prompt.length} chars (~${Math.round(prompt.length / 4)} tokens)`);

    // Retry loop for word count validation
    const MIN_WORD_COUNT = 1200; // Minimum acceptable (below 1500 target but acceptable)
    const TARGET_WORD_COUNT = 1500; // What we want
    const MAX_RETRIES = 2;
    let articleData: any = null;
    let wordCount = 0;
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
      attempts++;
      console.log(`[ArticleGen] Attempt ${attempts}/${MAX_RETRIES}...`);

      // Build messages with retry context if needed
      const messages: any[] = [
        {
          role: 'system',
          content: MASTER_AUTHORITY_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      // If retrying due to short content, use structured expand pass
      if (attempts > 1 && articleData) {
        const shortfall = TARGET_WORD_COUNT - wordCount;
        const expansionTarget = Math.ceil(shortfall / 5); // Distribute across ~5 sections
        
        messages.push({
          role: 'assistant',
          content: JSON.stringify(articleData),
        });
        messages.push({
          role: 'user',
          content: buildExpandPassInstruction(articleData, wordCount, TARGET_WORD_COUNT, intentMode, expansionTarget)
        });
      }

      // Call GPT-4o with master authority system
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        response_format: { type: 'json_object' },
        temperature: attempts === 1 ? 0.6 : 0.7, // Slightly higher on retry for variety
        max_tokens: 16000, // Increased to ensure room for full article
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from GPT');
      }

      // Parse the response
      try {
        articleData = JSON.parse(responseText);
      } catch (e) {
        console.error('[ArticleGen] Failed to parse GPT response:', responseText.substring(0, 500));
        throw new Error('Invalid JSON response from GPT');
      }

      // Calculate word count
      wordCount = countWords(articleData.blocks);
      console.log(`[ArticleGen] Attempt ${attempts} produced ${wordCount} words`);

      // Check if word count is acceptable
      if (wordCount >= MIN_WORD_COUNT) {
        console.log(`[ArticleGen] Word count acceptable (${wordCount} >= ${MIN_WORD_COUNT})`);
        break;
      }

      console.warn(`[ArticleGen] Word count too low (${wordCount} < ${MIN_WORD_COUNT}), ${attempts < MAX_RETRIES ? 'retrying with expand pass...' : 'accepting anyway'}`);
    }

    // Log final result
    if (wordCount < MIN_WORD_COUNT) {
      console.error(`[ArticleGen] WARNING: Final article is only ${wordCount} words (target: 1,500-1,800)`);
    }

    const readingTimeMinutes = Math.ceil(wordCount / 200);

    // =========================================================================
    // QUALITY GATE - Block publishing if SEO title or vision facts are bad
    // =========================================================================
    // CRITICAL: visionFacts are stored in writerBrief, NOT at top level of contextPack
    const visionFacts: string[] = contextPack?.writerBrief?.visionFacts || task?.visionFacts || [];
    const userFacts: string[] = contextPack?.writerBrief?.userFacts || contextPack?.userFacts || [];
    const geoTerms: string[] = masterProfile?.business?.locations || [];
    
    console.log(`[ArticleGen] Vision pipeline check: ${visionFacts.length} visionFacts, ${userFacts.length} userFacts`);
    const hasGeo = geoTerms.length > 0 || Boolean(task?.location || task?.geo);
    
    // SEO selection enforcement
    const seoTitleOptions: string[] = task?.seoTitleOptions || [];
    const selectedSeoTitleIndex: number | null = task?.selectedSeoTitleIndex ?? null;
    const seoLocked: boolean = task?.seoLocked ?? false;
    
    // Heading contract enforcement
    const requiredHeadings = task?.requiredHeadings || [];
    
    // Build service context for V2 narrative outcome detection
    const serviceContext = 
      task?.primaryService || 
      masterProfile?.business?.primaryService ||
      masterProfile?.business?.services?.[0] ||
      contextPack?.writerBrief?.businessContext?.primaryService ||
      masterProfile?.business?.niche ||
      'service';
    console.log(`[ArticleGen] Service context for V2 detection: "${serviceContext}"`);
    
    // Extract full text from blocks for validation
    let fullContent = articleData.blocks
      ?.map((b: any) => b.innerHTML || '')
      .join(' ')
      .replace(/<[^>]*>/g, '') || '';
    
    let qualityGate = runQualityGate({
      seoTitle: articleData.seoTitle || '',
      content: fullContent,
      visionFacts,
      userFacts,
      geoProvided: hasGeo,
      geoTerms,
      seoTitleOptions,
      selectedSeoTitleIndex,
      seoLocked,
      requiredHeadings,
      serviceContext,
    });
    
    // Log quality gate results
    console.log(`[ArticleGen] Quality gate: ${qualityGate.pass ? 'PASSED' : 'FAILED'}`);
    console.log(`[ArticleGen] Vision facts found: ${qualityGate.foundVisionFacts?.length || 0}/${visionFacts.length}`);
    console.log(`[ArticleGen] Required headings: ${qualityGate.foundHeadings?.length || 0}/${requiredHeadings.length} found`);
    if (qualityGate.missingHeadings?.length) {
      console.log(`[ArticleGen] Missing headings: ${qualityGate.missingHeadings.map(h => h.type).join(', ')}`);
    }
    if (qualityGate.seoSelectionRequired) {
      console.log(`[ArticleGen] SEO selection required: User must choose from ${seoTitleOptions.length} options`);
    }
    
    // =========================================================================
    // AUTO-REPAIR PASS - If gate fails due to missing vision facts, try repair
    // =========================================================================
    if (!qualityGate.pass && qualityGate.requiresRepair && (qualityGate.missingVisionFacts?.length || 0) > 0) {
      console.log(`[ArticleGen] Attempting auto-repair pass for ${qualityGate.missingVisionFacts?.length} missing vision facts...`);
      
      try {
        const repairResult = await runVisionFactRepairPass(
          openai,
          articleData,
          qualityGate.missingVisionFacts || [],
          userFacts
        );
        
        if (repairResult.success) {
          articleData = repairResult.articleData;
          wordCount = countWords(articleData.blocks);
          
          // Re-validate
          fullContent = articleData.blocks
            ?.map((b: any) => b.innerHTML || '')
            .join(' ')
            .replace(/<[^>]*>/g, '') || '';
          
          qualityGate = runQualityGate({
            seoTitle: articleData.seoTitle || '',
            content: fullContent,
            visionFacts,
            userFacts,
            geoProvided: hasGeo,
            geoTerms,
            seoTitleOptions,
            selectedSeoTitleIndex,
            seoLocked,
            requiredHeadings,
            serviceContext,
          });
          
          console.log(`[ArticleGen] Post-repair gate: ${qualityGate.pass ? 'PASSED' : 'STILL FAILED'}`);
          console.log(`[ArticleGen] Vision facts now found: ${qualityGate.foundVisionFacts?.length || 0}/${visionFacts.length}`);
        }
      } catch (repairError) {
        console.error('[ArticleGen] Auto-repair failed:', repairError);
      }
    }
    
    // =========================================================================
    // NARRATIVE OUTCOME REPAIR V2 - If vision signals but no narrative outcomes
    // Replaces old block-based "Observed Outcomes" injection
    // =========================================================================
    if (qualityGate.requiresNarrativeRepair || qualityGate.requiresOutcomeInjection) {
      console.log(`[ArticleGen] Narrative Outcome Repair V2 triggered...`);
      
      try {
        const location = geoTerms[0] || task?.location || 'this area';
        
        // Repair using narrative outcome injection (V2)
        const repairResult = repairWithNarrativeOutcome({
          content: fullContent,
          serviceContext,
          location,
          visionSignals: qualityGate.visionGateV2?.detectionResult?.visionSignals || 
                         qualityGate.visionEvidenceStatus?.visionSignalsFound || [],
          userFacts,
        });
        
        if (repairResult.success) {
          console.log(`[ArticleGen] Narrative outcome injected: "${repairResult.insertedNarrative.slice(0, 100)}..."`);
          
          // Find the paragraph block to insert the narrative into
          const blocks = articleData.blocks || [];
          const insertPosition = repairResult.insertPosition;
          
          // Calculate which block to insert after based on character position
          let charCount = 0;
          let injectionIndex = 1; // Default to after first block
          
          for (let i = 0; i < blocks.length; i++) {
            const blockText = (blocks[i].innerHTML || '').replace(/<[^>]*>/g, '');
            charCount += blockText.length;
            if (charCount >= insertPosition) {
              injectionIndex = i + 1;
              break;
            }
          }
          
          // Create a paragraph block for the narrative
          const narrativeBlock = {
            blockName: 'core/paragraph',
            attrs: {},
            innerHTML: `<p>${repairResult.insertedNarrative}</p>`,
            innerBlocks: [],
          };
          
          // Inject the narrative block
          articleData.blocks = [
            ...blocks.slice(0, injectionIndex),
            narrativeBlock,
            ...blocks.slice(injectionIndex),
          ];
          
          console.log(`[ArticleGen] Narrative block injected at position ${injectionIndex}`);
          
          // Re-validate
          fullContent = articleData.blocks
            ?.map((b: any) => b.innerHTML || '')
            .join(' ')
            .replace(/<[^>]*>/g, '') || '';
          
          qualityGate = runQualityGate({
            seoTitle: articleData.seoTitle || '',
            content: fullContent,
            visionFacts,
            userFacts,
            geoProvided: hasGeo,
            geoTerms,
            seoTitleOptions,
            selectedSeoTitleIndex,
            seoLocked,
            requiredHeadings,
            serviceContext,
          });
          
          console.log(`[ArticleGen] Post-narrative-repair gate: ${qualityGate.pass ? 'PASSED' : 'STILL FAILED'}`);
          if (qualityGate.visionGateV2) {
            console.log(`[ArticleGen] V2 Status: Vision=${qualityGate.visionGateV2.hasVision}, Outcome=${qualityGate.visionGateV2.hasNarrativeOutcome}, Score=${qualityGate.visionGateV2.bestOutcomeScore}/10`);
          }
        } else {
          console.log(`[ArticleGen] Narrative repair skipped: ${repairResult.repairReason}`);
        }
      } catch (repairError) {
        console.error('[ArticleGen] Narrative outcome repair failed:', repairError);
      }
    }
    
    // Log warnings
    if (qualityGate.warnings?.length) {
      console.warn(`[ArticleGen] Quality gate warnings:`, qualityGate.warnings);
    }
    
    if (!qualityGate.pass) {
      console.warn(`[ArticleGen] Quality gate errors:`, qualityGate.errors);
      
      // SEO selection required is a special case - return different status
      if (qualityGate.seoSelectionRequired) {
        return NextResponse.json(
          {
            error: 'SEO selection required',
            message: 'User must select an SEO title before generating article',
            seoTitleOptions,
            selectedSeoTitleIndex,
            taskId: task?.id,
          },
          { status: 428 } // Precondition Required
        );
      }
      
      // In dev mode, warn but don't block
      const isDev = process.env.NODE_ENV === 'development';
      if (!isDev) {
        // Update job status to failed with gate errors
        await adminClient
          .from('writer_jobs')
          .update({ 
            status: 'failed',
            error: `Quality gate failed: ${qualityGate.errors.join('; ')}`,
          })
          .eq('id', jobId);
        
        return NextResponse.json(
          {
            error: 'Quality gate failed',
            reasons: qualityGate.errors,
            missingVisionFacts: qualityGate.missingVisionFacts,
          },
          { status: 422 }
        );
      } else {
        console.warn('[ArticleGen] DEV MODE: Quality gate failed but continuing...');
      }
    }

    // Save the output
    const { data: output, error: outputError } = await adminClient
      .from('writer_outputs')
      .insert({
        job_id: jobId,
        project_id: projectId,
        wp_title: articleData.title,
        wp_slug: articleData.slug,
        wp_excerpt: articleData.excerpt,
        wp_blocks: articleData.blocks,
        wp_seo: {
          focusKeyphrase: articleData.focusKeyphrase,
          seoTitle: articleData.seoTitle,
          metaDescription: articleData.metaDescription,
        },
        wp_images: articleData.images || [],
        wp_internal_links: articleData.internalLinks || [],
        linkedin_output: articleData.linkedin || null,
        gmb_output: articleData.gmb || null,
        reddit_output: articleData.reddit || null,
        audit_data: {
          wordCount,
          readingTimeMinutes,
          headingCount: countHeadings(articleData.blocks),
          paragraphCount: countParagraphs(articleData.blocks),
          listCount: countLists(articleData.blocks),
        },
        validation_passed: true,
        validation_warnings: [],
        content_hash: hashContent(JSON.stringify(articleData)),
      })
      .select()
      .single();

    if (outputError) {
      console.error('[ArticleGen] Failed to save output:', outputError);
      throw new Error('Failed to save article output');
    }

    // Update job status to completed
    await adminClient
      .from('writer_jobs')
      .update({ status: 'completed' })
      .eq('id', jobId);

    // Update task status in growth plan
    if (job.task_id) {
      const { data: growthPlan } = await adminClient
        .from('growth_plans')
        .select('id, months')
        .eq('project_id', projectId)
        .single();

      if (growthPlan?.months) {
        const updatedMonths = (growthPlan.months as any[]).map(month => ({
          ...month,
          tasks: month.tasks?.map((t: any) => {
            if (t.id === job.task_id) {
              return { ...t, status: 'review' };
            }
            return t;
          }),
        }));

        await adminClient
          .from('growth_plans')
          .update({ months: updatedMonths })
          .eq('id', growthPlan.id);
      }
    }

    console.log(`[ArticleGen] Article generated: ${articleData.title} (${wordCount} words)`);

    return NextResponse.json({
      data: {
        outputId: output.id,
        title: articleData.title,
        wordCount,
        readingTimeMinutes,
      },
      message: 'Article generated successfully',
    });
  } catch (error) {
    console.error('[ArticleGen] Error:', error);
    
    // Update job status to failed
    const adminClient = createAdminClient();
    await adminClient
      .from('writer_jobs')
      .update({ status: 'failed' })
      .eq('id', params.jobId);

    return NextResponse.json(
      { error: (error as Error).message || 'Failed to generate article' },
      { status: 500 }
    );
  }
}

// ============================================================================
// MASTER AUTHORITY SYSTEM PROMPT
// ============================================================================

const MASTER_AUTHORITY_SYSTEM_PROMPT = `You are an expert authority content writer. You write decision-support content, not promotional material.

CORE PRINCIPLES:
- This is an authority system, not content writing
- Every page must stand as a quotable reference for AI answer engines
- Demonstrate expertise through reasoning and observed evidence, not claims
- Use provided vision analysis as first-party evidence
- Respect topical boundaries defined by the sitemap
- If it reads like marketing, it has failed

OUTPUT REQUIREMENTS:
- You ALWAYS output valid JSON matching the exact schema provided
- You NEVER invent facts, statistics, testimonials, or certifications
- You ONLY use information provided in the context
- You structure content for WordPress block compatibility

⚠️ CRITICAL LENGTH REQUIREMENT:
- MINIMUM: 1,500 words of actual content
- TARGET: 1,500-1,800 words
- This is NON-NEGOTIABLE - articles under 1,500 words FAIL validation
- Count: Introduction ~175w + 5 sections × 300w + Decision Support ~150w + FAQs 7×100w + Conclusion ~100w = 1,725w
- You MUST write all required sections completely - no shortcuts

SELF-CHECK (Perform before every output):
1. Did I use vision analysis correctly as evidence?
2. Did I respect the page's intent mode?
3. Did I avoid topic bleed from adjacent pages?
4. Did I show expertise through reasoning, not claims?
5. Would an AI trust this page as a source?
6. Is the word count between 1,500-1,800 words?`;

// ============================================================================
// INTENT MODE DETERMINATION
// ============================================================================

type IntentMode = 'MONEY' | 'SERVICE' | 'INFORMATIONAL' | 'TRUST';

function determineIntentMode(task: any, contextPack: any): IntentMode {
  const role = task?.role?.toLowerCase() || contextPack?.writerBrief?.role?.toLowerCase() || '';
  const slug = task?.slug?.toLowerCase() || '';
  const title = task?.title?.toLowerCase() || '';
  
  // Money pages: pricing, quotes, buy, order, hire
  if (role === 'money' || slug.includes('pric') || slug.includes('quote') || 
      slug.includes('cost') || slug.includes('hire') || slug.includes('book')) {
    return 'MONEY';
  }
  
  // Service pages: specific service offerings
  if (role === 'service' || slug.includes('service') || role === 'pillar') {
    return 'SERVICE';
  }
  
  // Trust pages: about, team, credentials, reviews
  if (role === 'trust' || slug.includes('about') || slug.includes('team') || 
      slug.includes('credential') || slug.includes('testimonial') || slug.includes('review')) {
    return 'TRUST';
  }
  
  // Default to informational for support pages, blogs, guides
  return 'INFORMATIONAL';
}

// ============================================================================
// EXPAND PASS INSTRUCTION BUILDER
// ============================================================================

function buildExpandPassInstruction(
  articleData: any,
  currentWordCount: number,
  targetWordCount: number,
  intentMode: IntentMode,
  expansionPerSection: number
): string {
  const shortfall = targetWordCount - currentWordCount;
  
  // Identify thin sections that need expansion
  const thinSections: string[] = [];
  let currentH2 = '';
  let sectionWords = 0;
  
  for (const block of articleData.blocks || []) {
    if (block.blockName === 'core/heading' && block.attrs?.level === 2) {
      if (currentH2 && sectionWords < 200) {
        thinSections.push(currentH2);
      }
      currentH2 = extractTextFromBlock(block);
      sectionWords = 0;
    } else {
      sectionWords += countWordsInBlock(block);
    }
  }
  
  // Intent-specific expansion guidance
  const intentExpansion: Record<IntentMode, string[]> = {
    MONEY: [
      'Add specific pricing examples or cost ranges',
      'Include ROI calculations or value comparisons',
      'Add decision-making criteria and buyer considerations',
      'Include competitive differentiation points',
    ],
    SERVICE: [
      'Expand process explanations with more steps',
      'Add local context and geographic specifics',
      'Include before/after scenarios',
      'Add equipment, materials, or methodology details',
    ],
    INFORMATIONAL: [
      'Add more examples and case illustrations',
      'Include expert opinions or industry standards',
      'Expand explanations of complex concepts',
      'Add troubleshooting or common mistake sections',
    ],
    TRUST: [
      'Add more credential details and certifications',
      'Include specific project examples',
      'Expand team expertise descriptions',
      'Add community involvement or industry recognition',
    ],
  };

  const expansionTips = intentExpansion[intentMode].slice(0, 3).join('\n- ');
  const thinSectionList = thinSections.length > 0 
    ? `\n\nTHESE SECTIONS ARE TOO THIN (under 200 words each):\n- ${thinSections.join('\n- ')}`
    : '';

  return `## EXPAND PASS REQUIRED

Your article is ${currentWordCount} words. The MINIMUM is ${targetWordCount} words.
You are SHORT by ${shortfall} words.

### EXPANSION REQUIREMENTS:

1. **Add ${expansionPerSection}+ words to EACH H2 section**
2. **Expand the FAQ section** - ensure each answer is 80-100 words minimum
3. **Add more specific examples** throughout${thinSectionList}

### INTENT-SPECIFIC ADDITIONS (${intentMode} PAGE):
- ${expansionTips}

### MANDATORY STRUCTURE CHECK:
- Introduction: 150+ words ✓
- 5-6 H2 sections: 250+ words EACH ✓
- Decision Support section: 150+ words ✓
- FAQ section: 5-7 questions, 80+ words each ✓
- Conclusion: 100+ words ✓

**Rewrite the COMPLETE article maintaining the same structure but with proper depth.**
**Output the full JSON with all blocks expanded.**`;
}

// Helper to extract text from a block
function extractTextFromBlock(block: any): string {
  if (typeof block.innerHTML === 'string') {
    return block.innerHTML.replace(/<[^>]*>/g, '').trim();
  }
  return '';
}

// Helper to count words in a single block
function countWordsInBlock(block: any): number {
  const text = extractTextFromBlock(block);
  return text.split(/\s+/).filter(Boolean).length;
}

// ============================================================================
// MASTER AUTHORITY PROMPT BUILDER
// ============================================================================

function buildMasterAuthorityPrompt(
  masterProfile: any, 
  contextPack: any, 
  task: any,
  intentMode: IntentMode
): string {
  const business = masterProfile?.business || {};
  const brandVoice = masterProfile?.brandVoice || {};
  const siteContent = masterProfile?.siteContentDigest || {};
  const sitemap = masterProfile?.sitemapContext || {};
  
  const writerBrief = contextPack?.writerBrief || task || {};
  const geo = contextPack?.geoPack || {};
  const eeat = contextPack?.eeatPack || {};
  const links = contextPack?.linkTargets || {};
  const proof = contextPack?.proofElements || [];
  const onboarding = masterProfile?.onboarding || contextPack?.onboarding || {};
  
  // CRITICAL: Build visionAnalysis from correct paths - NOT contextPack.visionAnalysis (doesn't exist)
  const visionFacts = writerBrief?.visionFacts || task?.visionFacts || [];
  const visionContext = contextPack?.visionContext || {};
  const visionAnalysis = {
    facts: visionFacts,
    narrative: visionContext.packNarrative || '',
    themes: visionContext.crossImageThemes || [],
    images: visionContext.inlineImages || [],
    userFacts: writerBrief?.userFacts || [],
  };
  
  console.log(`[ArticleGen] Vision injection: ${visionFacts.length} facts, ${visionAnalysis.themes?.length || 0} themes`);

  // Intent-specific focus guidance
  const intentGuidance = getIntentGuidance(intentMode);

  return `
# MASTER AUTHORITY ARTICLE GENERATION

## 🎛️ CONTEXT INPUTS

### 1️⃣ MASTER PROFILE CONTEXT
- Business Name: ${business.name || 'Business'}
- Brand Positioning: ${brandVoice.positioning || business.positioning || 'Professional local service provider'}
- Tone: ${brandVoice.tone || 'Professional, knowledgeable, trustworthy'}
- Years of Experience: ${business.yearsInBusiness || business.experience || 'Established business'}
- Values & Philosophy: ${business.values?.join(', ') || brandVoice.values?.join(', ') || 'Quality, reliability, customer focus'}
- Target Audiences: ${business.targetAudiences?.join('; ') || writerBrief.targetAudience || 'Local customers seeking quality service'}
- Key Differentiators: ${business.differentiators?.join('; ') || 'Local expertise, proven track record'}
- Constraints/Exclusions: ${brandVoice.mustNotSay?.join('; ') || 'No unverified claims, no competitor mentions'}

### 2️⃣ SITEMAP & PAGE CONTEXT
Current Page:
- Title: ${writerBrief.title || task?.title || 'Article'}
- Slug: ${writerBrief.slug || task?.slug || 'article'}
- Role: ${writerBrief.role || task?.role || 'support'}
- Intent Mode: ${intentMode}

Site Structure:
${buildSitemapContext(sitemap, siteContent)}

Internal Links (MUST preserve exactly):
${buildLinkContext(links)}

Adjacent Pages (for topical boundaries - do NOT duplicate):
${buildAdjacentContext(sitemap, writerBrief)}

### 3️⃣ USER ONBOARDING CONTEXT
- Services Offered: ${onboarding.services?.join(', ') || business.services?.join(', ') || business.primaryService || 'Local services'}
- Pricing Model: ${onboarding.pricingModel || 'Contact for quote'}
- Service Regions: ${geo.serviceAreas?.join(', ') || business.locations?.join(', ') || geo.primaryLocation || 'Local area'}
- Client Types: ${onboarding.clientTypes?.join(', ') || business.targetAudiences?.join(', ') || 'Local customers'}
- Known Objections/FAQs: ${onboarding.commonObjections?.join('; ') || 'Price concerns, timeline questions'}
- Business Maturity: ${onboarding.businessMaturity || business.yearsInBusiness || 'Established'}

### 4️⃣ VISION ANALYSIS CONTEXT (CRITICAL - MUST USE)
${buildVisionContext(visionAnalysis)}

⚠️ MANDATORY USAGE RULES FOR VISION DATA:
1. **ALL numbered facts above MUST appear in the article** - not paraphrased, the actual observations
2. **Create a dedicated "First-Hand Evidence" H2 section** that weaves these facts into a narrative
3. **Use observation-level language**: "we observed", "we saw", "during sessions", "on-site assessment revealed"
4. **Connect observations to outcomes**: "The [observed feature] resulted in [specific outcome]"
5. **Never genericize**: If we observed "12 bookings in 3 days", say exactly that - don't say "many bookings"

Acceptable vision phrases (adapt to your niche):
- "During our assessment, we observed..."
- "Visual inspection confirmed that..."
- "On-site, the [feature] was immediately apparent..."
- "Our documentation showed..."
- "Client feedback during consultations indicated..."

❌ NEVER write generic commentary when you have specific observations.
❌ NEVER use "typically", "often", "many" when you have exact numbers.
❌ NEVER assert expertise without referencing observed evidence.

### 5️⃣ INTENT MODE: ${intentMode}
${intentGuidance}

### 6️⃣ EEAT PROOF ELEMENTS
- Verified Claims: ${eeat.claimsAllowed?.slice(0, 5).join('; ') || proof.filter((p: any) => p.type === 'claim').map((p: any) => p.value).join('; ') || 'Use only facts from context'}
- Experience Markers: ${eeat.experienceMarkers?.slice(0, 5).join('; ') || 'Years of experience, local knowledge'}
- Trust Signals: ${eeat.trustSignals?.slice(0, 5).join('; ') || 'Established business, local reputation'}
${proof.length > 0 ? '\nProof Elements:\n' + proof.slice(0, 7).map((p: any) => `- ${p.type}: ${p.value}`).join('\n') : ''}

---

## 🎯 PURPOSE

Write a long-form authority page that:
1. Satisfies the ${intentMode} page intent
2. Demonstrates real-world expertise (EEAT) through reasoning
3. Uses vision analysis as supporting evidence where available
4. Is quotable by AI answer engines (AEO)
5. Fits precisely within the site's topical structure
6. Helps a real user make a confident decision

**This is decision-support content, not promotion.**

---

## 🏗️ MANDATORY STRUCTURE

### 1️⃣ INTRODUCTION (150-200 words)
Must accomplish:
- Define the business/entity clearly
- State the operating context
- Identify who this page is for
- Clarify the page's intent
- Preview what decisions or questions will be addressed

### 2️⃣ FIRST-HAND EVIDENCE SECTION (MANDATORY - 300-400 words)
**This section is NON-NEGOTIABLE if vision analysis context exists above.**

H2 Title Format: "What We've Observed in [Location] [Service Area]"
Examples (use pattern matching your niche):
- "What We've Captured First-Hand Across [Location] Weddings"
- "What Our Assessments Have Revealed Across [Location] Projects"
- "What We've Seen First-Hand in [Location] [Service] Work"

This section MUST include:
- **Specific outcomes observed**: booking speeds, enquiry patterns, client responses
- **Physical/visual attributes noted**: locations, setups, conditions, environments
- **Human behaviour observed**: client reactions, decision patterns, feedback themes
- **Causal connections**: "The [observed feature] combined with [factor] resulted in..."

Language requirements (USE THESE EXACT PATTERNS - adapt to your niche):
- "In one recent [location] session, we observed..."
- "During consultations, clients consistently noted..."
- "This [specific feature] directly contributed to..."
- "Visual inspection revealed that..."
- "On-site, we documented..."
- "The [attribute] resulted in [specific outcome]..."

❌ FORBIDDEN in this section:
- Generic market commentary
- Statistics without specific context
- Claims without observable basis
- "Many clients" / "often" / "typically" (use specific instances)

✅ REQUIRED: At least 3 specific facts from the VISION ANALYSIS CONTEXT above must appear here.

### 3️⃣ CORE EXPLANATION SECTIONS (3-5 × H2 sections)
Each section:
- 250-350 words
- Explains how things actually work
- Uses experience-based reasoning
- References vision evidence to support claims

${intentMode} Focus:
${intentGuidance}

### 4️⃣ LOCAL CONTEXT SECTION (MANDATORY for geo pages - 200-300 words)
H2 Title Format: "Why [Location] Changes the [Service] Equation"

This section MUST explain CAUSATION, not just mention places:
- Why proximity to [station/amenity] affects [outcome]
- How [micro-location] influences [buyer behaviour/timeline]
- What makes [specific area] different from nearby alternatives

❌ FORBIDDEN: Decorative location mentions without causal explanation
✅ REQUIRED: Each location mentioned must answer "so what?" with a specific impact

### 5️⃣ DECISION SUPPORT SECTION (MANDATORY)
Help the reader decide if / how / when this applies to them.
Format as one of:
- A practical checklist
- A comparison table
- A "right for you if..." framework

### 6️⃣ AEO QUESTION SECTION (MANDATORY)
Title EXACTLY: "Common Questions About [Topic/Service]"
Rules:
- 5-7 real user questions
- Each answer 80-120 words
- Neutral, quotable, self-contained
- Reference specific observations from vision analysis in at least 2 answers
- These answers should be directly quotable by AI systems

### 7️⃣ CONCLUSION WITH CTA
- Summarize key takeaways
- Reference 1-2 key observations that differentiate this content
- Clear next step/call to action
- No hard-sell language

---

## ✍️ STYLE RULES
1. Calm, professional, experienced voice
2. Neutral and helpful, not sales-led
3. Paragraphs ≤ 120 words
4. Scannable structure with clear hierarchy
5. WordPress block compatible
6. Preserve all internal links exactly as provided
7. NEVER mention SEO, AEO, EEAT, or AI
8. NEVER fabricate stats, testimonials, certifications, or outcomes

## 🔒 OBSERVATION-LEVEL WRITING (CRITICAL)

This article must pass the "competitor test":
**Could a competitor copy this, change the brand name, and publish it?**
If YES → the article fails. Rewrite with more specific observations.

To pass:
- Include at least 3 specific observations only YOU could make
- Reference specific outcomes (sale speeds, viewing counts, offer patterns)
- Connect physical attributes to measurable results
- Use "we observed", "during our assessment", "the property showed"
- Explain WHY locations matter, not just THAT they exist

---

## 📏 LENGTH REQUIREMENT (HARD - NON-NEGOTIABLE)

⚠️ THIS IS A STRICT VALIDATION GATE - ARTICLES UNDER 1,500 WORDS WILL BE REJECTED

**Minimum Word Count Breakdown:**
- Introduction: 150-200 words
- Core Section 1 (H2): 250-350 words
- Core Section 2 (H2): 250-350 words
- Core Section 3 (H2): 250-350 words
- Core Section 4 (H2): 250-350 words
- Core Section 5 (H2): 250-350 words (if needed)
- Decision Support: 100-150 words
- FAQ (5-7 questions × 80-120 words each): 400-840 words
- Conclusion: 80-120 words

**Total Target: 1,500-1,800 words**

Do NOT stop early. Complete ALL sections with full depth.

---

## 📤 OUTPUT FORMAT

Return a JSON object with this EXACT structure:
{
  "title": "H1 title (60-70 chars, includes focus keyphrase)",
  "slug": "${writerBrief.slug || task?.slug || 'article'}",
  "excerpt": "155 character summary for post excerpt",
  "focusKeyphrase": "${writerBrief.focusKeyphrase || writerBrief.targetKeyword || task?.targetKeyword || 'main keyword'}",
  "seoTitle": "SEO title under 60 chars",
  "metaDescription": "Meta description under 155 chars",
  "wordCount": 1650,
  "intentMode": "${intentMode}",
  "blocks": [
    {
      "blockName": "core/heading",
      "attrs": { "level": 2 },
      "innerHTML": "<h2>Section Heading</h2>"
    },
    {
      "blockName": "core/paragraph",
      "attrs": {},
      "innerHTML": "<p>Paragraph content with <a href='/page'>internal links</a> and <strong>emphasis</strong> as needed.</p>"
    },
    {
      "blockName": "core/list",
      "attrs": { "ordered": false },
      "innerHTML": "<ul><li>Decision point one</li><li>Decision point two</li></ul>"
    },
    {
      "blockName": "core/image",
      "attrs": { 
        "url": "PLACEHOLDER:descriptive-image-purpose",
        "alt": "Descriptive alt text explaining what this image shows"
      },
      "innerHTML": "<figure class='wp-block-image'><img src='PLACEHOLDER:descriptive-image-purpose' alt='Descriptive alt text'/></figure>",
      "innerBlocks": []
    },
    {
      "blockName": "core/table",
      "attrs": {},
      "innerHTML": "<table><thead><tr><th>Factor</th><th>Option A</th><th>Option B</th></tr></thead><tbody><tr><td>...</td><td>...</td><td>...</td></tr></tbody></table>"
    },
    {
      "blockName": "core/buttons",
      "attrs": {},
      "innerHTML": "<div class='wp-block-buttons'><div class='wp-block-button'><a class='wp-block-button__link' href='/contact'>Clear CTA Text</a></div></div>"
    }
  ],
  "internalLinks": [
    { "path": "/contact", "anchorText": "descriptive anchor" }
  ],
  "images": [
    { "position": "hero", "alt": "Primary image alt", "prompt": "Photo description for image generation" }
  ],
  "aeoQuestions": [
    { "question": "Question text?", "answer": "80-120 word quotable answer" }
  ]
}

---

## 🖼️ IMAGE & VISION OUTPUT RULES (NON-NEGOTIABLE)

Vision analysis and images are related but not interchangeable.

### 1️⃣ Vision Analysis Usage
- Vision analysis is used for reasoning, explanation, and EEAT signals
- Vision analysis does NOT automatically require an image block

### 2️⃣ When to Include a WordPress Image Block
Only include a \`core/image\` block if:
- An image asset reference (URL, ID, or placeholder token) is explicitly provided
- OR the system instructs you to place an image at a specific position

If no usable image reference exists:
- DO NOT output a \`core/image\` block
- DO NOT output an empty or partial image block

### 3️⃣ Valid Image Block Requirements
If a \`core/image\` block is included, it MUST contain:

- A valid \`url\` in attrs, OR a placeholder token: \`PLACEHOLDER:image-description\`
- Meaningful \`alt\` text in attrs
- Complete \`innerHTML\` using: \`<figure class='wp-block-image'><img src='...' alt='...'/></figure>\`
- \`innerBlocks: []\`

❌ NEVER output:
- Empty \`innerHTML\` ("")
- Image blocks with only \`alt\` attribute
- Image blocks without a resolvable source

### 4️⃣ Placeholder Strategy (Preferred)
If an image exists conceptually but URL is not yet available:
- Use placeholder reference: \`PLACEHOLDER:descriptive-image-purpose\`
- Ensure the block is structurally valid
- Downstream systems will hydrate the image later

Example valid placeholder block:
\`\`\`json
{
  "blockName": "core/image",
  "attrs": { 
    "url": "PLACEHOLDER:team-working-on-property-valuation",
    "alt": "Our team conducting a property valuation"
  },
  "innerHTML": "<figure class='wp-block-image'><img src='PLACEHOLDER:team-working-on-property-valuation' alt='Our team conducting a property valuation'/></figure>",
  "innerBlocks": []
}
\`\`\`

### 5️⃣ Vision ≠ Decoration
- Do NOT add images "for SEO"
- Do NOT force images into every section
- Images must support understanding, not pad content
- If you have vision analysis but no image asset, use the analysis for text reasoning only

---

## ✅ FINAL SELF-CHECK (Mandatory before output)

Before generating, verify:
1. ✓ Vision analysis used correctly as evidence (not marketing)?
2. ✓ Page intent (${intentMode}) respected throughout?
3. ✓ No topic bleed from adjacent pages?
4. ✓ Expertise shown through reasoning, not claims?
5. ✓ Would an AI trust this page as a quotable source?
6. ✓ Word count is 1,500-1,800?
7. ✓ All internal links preserved exactly?
8. ✓ All image blocks have valid url/placeholder AND complete innerHTML?
9. ✓ No empty or partial image blocks exist?

**If it reads like marketing, rewrite it.**
**If any image block has empty innerHTML, remove it or fix it.**

---

## 🚨 FINAL REMINDER: WORD COUNT IS MANDATORY

You MUST produce 1,500-1,800 words. This is a hard requirement.
- Introduction: ~175 words ✓
- 5 Core H2 Sections: ~1,250 words total (250w each) ✓  
- Decision Support: ~125 words ✓
- 5-7 FAQ Answers: ~600 words total (100w each) ✓
- Conclusion: ~100 words ✓
= Total: ~2,250 words target (trim if needed, but NEVER go below 1,500)

Generate the COMPLETE authority article now. Write EVERY section in full:`;
}

// ============================================================================
// HELPER FUNCTIONS FOR PROMPT BUILDING
// ============================================================================

function getIntentGuidance(intentMode: IntentMode): string {
  const guidance: Record<IntentMode, string> = {
    MONEY: `MONEY PAGE FOCUS:
- Emphasize outcomes and results users can expect
- Address suitability ("Is this right for you?")
- Focus on risk reduction and confidence building
- Include decision criteria and value clarity
- Help users understand what they're getting`,
    
    SERVICE: `SERVICE PAGE FOCUS:
- Explain the process clearly and completely
- Define scope and what's included/excluded
- Set proper expectations for timeline and results
- Address common variations and customizations
- Help users understand how the service works`,
    
    INFORMATIONAL: `INFORMATIONAL PAGE FOCUS:
- Explain mechanisms and how things work
- Identify patterns and principles
- Provide reasoning-based explanations
- Build foundational understanding
- Answer "why" and "how" questions thoroughly`,
    
    TRUST: `TRUST PAGE FOCUS:
- Emphasize transparency and openness
- Explain safeguards and quality measures
- Build credibility through specifics
- Share relevant background and context
- Address concerns proactively`,
  };
  
  return guidance[intentMode];
}

function buildSitemapContext(sitemap: any, siteContent: any): string {
  if (!sitemap?.pages && !siteContent?.pages) {
    return '- Full sitemap not provided';
  }
  
  const pages = sitemap?.pages || siteContent?.pages || [];
  if (pages.length === 0) return '- Full sitemap not provided';
  
  const categorized = {
    money: pages.filter((p: any) => p.role === 'money' || p.type === 'money'),
    service: pages.filter((p: any) => p.role === 'service' || p.role === 'pillar'),
    trust: pages.filter((p: any) => p.role === 'trust'),
    support: pages.filter((p: any) => p.role === 'support' || p.role === 'informational'),
  };
  
  let context = '';
  if (categorized.money.length > 0) {
    context += `Money Pages: ${categorized.money.slice(0, 3).map((p: any) => p.title || p.path).join(', ')}\n`;
  }
  if (categorized.service.length > 0) {
    context += `Service Pages: ${categorized.service.slice(0, 5).map((p: any) => p.title || p.path).join(', ')}\n`;
  }
  if (categorized.trust.length > 0) {
    context += `Trust Pages: ${categorized.trust.slice(0, 3).map((p: any) => p.title || p.path).join(', ')}\n`;
  }
  if (categorized.support.length > 0) {
    context += `Support Pages: ${categorized.support.slice(0, 5).map((p: any) => p.title || p.path).join(', ')}\n`;
  }
  
  return context || '- Sitemap structure available';
}

function buildLinkContext(links: any): string {
  if (!links) return '- No specific internal links required';
  
  const allLinks = [
    ...(links.upLinks || []).slice(0, 3),
    ...(links.downLinks || []).slice(0, 3),
    ...(links.siblingLinks || []).slice(0, 2),
  ];
  
  if (allLinks.length === 0) return '- Link to relevant service and contact pages';
  
  return allLinks.map((l: any) => 
    `- MUST link to: ${l.path} with anchor text: "${l.anchorText || 'relevant text'}"`
  ).join('\n');
}

function buildAdjacentContext(sitemap: any, brief: any): string {
  const adjacent = brief?.adjacentPages || sitemap?.adjacentPages || [];
  
  if (adjacent.length === 0) {
    return '- Avoid duplicating content that belongs on main service or about pages';
  }
  
  return adjacent.slice(0, 4).map((p: any) => 
    `- ${p.title || p.path}: ${p.summary || 'Related page - do not duplicate its content'}`
  ).join('\n');
}

function buildVisionContext(visionAnalysis: any): string {
  const facts = visionAnalysis?.facts || [];
  const narrative = visionAnalysis?.narrative || '';
  const themes = visionAnalysis?.themes || [];
  const userFacts = visionAnalysis?.userFacts || [];
  const images = visionAnalysis?.images || [];
  
  // Check if we have ANY vision data
  if (facts.length === 0 && !narrative && themes.length === 0 && userFacts.length === 0) {
    return 'No vision analysis provided for this content.';
  }
  
  let context = '';
  
  // MOST IMPORTANT: User-provided facts (from onboarding)
  if (userFacts.length > 0) {
    context += `📋 USER-PROVIDED FACTS (MUST include in output):\n`;
    context += userFacts.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n');
    context += '\n\n';
  }
  
  // Combined narrative from vision pack
  if (narrative) {
    context += `📷 VISUAL NARRATIVE:\n${narrative}\n\n`;
  }
  
  // Individual vision facts extracted from images
  if (facts.length > 0) {
    context += `🔍 OBSERVED EVIDENCE (weave into content as first-hand observations):\n`;
    context += facts.slice(0, 10).map((f: string, i: number) => `${i + 1}. ${f}`).join('\n');
    context += '\n\n';
  }
  
  // Cross-image themes
  if (themes.length > 0) {
    context += `🎨 CROSS-IMAGE THEMES: ${themes.join(', ')}\n\n`;
  }
  
  // Image descriptions for context
  if (images.length > 0) {
    context += `📸 ANALYSED IMAGES:\n`;
    images.slice(0, 5).forEach((img: any, i: number) => {
      const desc = img.altText || img.description || img.caption || 'Image analysed';
      context += `${i + 1}. ${desc}\n`;
    });
  }
  
  return context;
}

// ============================================================================
// LEGACY PROMPT (Kept for reference, not used)
// ============================================================================

function buildArticlePrompt(masterProfile: any, contextPack: any, task: any): string {
  // Legacy prompt - redirects to new master prompt
  return buildMasterAuthorityPrompt(masterProfile, contextPack, task, 'INFORMATIONAL');
}

// ============================================================================
// HELPERS
// ============================================================================

function countWords(blocks: any[]): number {
  if (!blocks) return 0;
  
  let text = '';
  for (const block of blocks) {
    if (block.innerHTML) {
      // Strip HTML tags
      text += ' ' + block.innerHTML.replace(/<[^>]*>/g, ' ');
    }
  }
  
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function countHeadings(blocks: any[]): number {
  if (!blocks) return 0;
  return blocks.filter(b => b.blockName === 'core/heading').length;
}

function countParagraphs(blocks: any[]): number {
  if (!blocks) return 0;
  return blocks.filter(b => b.blockName === 'core/paragraph').length;
}

function countLists(blocks: any[]): number {
  if (!blocks) return 0;
  return blocks.filter(b => b.blockName === 'core/list').length;
}

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// ============================================================================
// VISION FACT REPAIR PASS
// ============================================================================
// When quality gate fails due to missing vision facts, this pass
// instructs GPT to inject the missing facts into appropriate sections

interface RepairResult {
  success: boolean;
  articleData: any;
  factsInjected: number;
}

async function runVisionFactRepairPass(
  openaiClient: OpenAI,
  articleData: any,
  missingFacts: string[],
  userFacts: string[]
): Promise<RepairResult> {
  console.log(`[VisionRepair] Starting repair pass for ${missingFacts.length} missing vision facts`);
  
  const allMissingFacts = [...missingFacts, ...userFacts].filter(Boolean);
  if (allMissingFacts.length === 0) {
    return { success: false, articleData, factsInjected: 0 };
  }

  const repairPrompt = `## VISION FACT REPAIR PASS

The following vision/user-provided facts were NOT found in the article content.
These are REAL facts from actual observations and MUST be integrated.

### MISSING FACTS (MUST ALL APPEAR IN OUTPUT):
${allMissingFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

### CURRENT ARTICLE:
${JSON.stringify(articleData, null, 2)}

### REPAIR INSTRUCTIONS:

1. **Check if article has an evidence/observation section** (H2 containing "observed", "seen", "first-hand", "evidence")
   - If NO such section exists: CREATE one after the introduction with H2 like "What We've Observed First-Hand"
   
2. **In the evidence section**, weave ALL missing facts using this pattern:
   - "During our assessment, we observed [fact]..."
   - "Visual inspection revealed [fact]..."
   - "On-site, [fact] was immediately apparent..."
   - "The [feature] resulted in [outcome]..."

3. **Use observation-level language throughout**:
   - ✅ "we observed", "we saw", "during viewings", "on-site inspection"
   - ❌ "typically", "often", "many buyers" (generic language)

4. **Connect facts to outcomes**:
   - Don't just state facts, explain their IMPACT
   - "The [observed feature] directly contributed to [result]"

5. **Preserve all existing content** - only ADD, never remove
6. **Maintain JSON structure exactly**

### OUTPUT:
Return the COMPLETE updated article JSON with:
- All facts integrated naturally
- An evidence/observation section (create if missing)
- Observation-level language throughout

The output MUST be valid JSON matching the original structure.`;

  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a precision editor. Your job is to integrate specific facts into existing content without disrupting flow or structure. Always output valid JSON.',
        },
        {
          role: 'user',
          content: repairPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Low temp for precise edits
      max_tokens: 16000,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      console.error('[VisionRepair] No response from GPT');
      return { success: false, articleData, factsInjected: 0 };
    }

    const repairedData = JSON.parse(responseText);
    
    console.log(`[VisionRepair] Repair complete, verifying integration...`);
    
    return {
      success: true,
      articleData: repairedData,
      factsInjected: allMissingFacts.length,
    };
  } catch (error) {
    console.error('[VisionRepair] Repair pass failed:', error);
    return { success: false, articleData, factsInjected: 0 };
  }
}
