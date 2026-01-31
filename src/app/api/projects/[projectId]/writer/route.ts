import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { 
  buildMasterProfile, 
  buildTaskContextPack,
  type TaskInput,
  type WriterJobConfig,
} from '@/lib/context';
import { refineSeoDraftsForTask } from '@/lib/growth-planner/refineSeoDrafts';

// ============================================================================
// UUID VALIDATION & CONVERSION
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

/**
 * Converts a string task ID to a deterministic UUID.
 * For task IDs that are already UUIDs, returns as-is.
 * For string IDs like "task-6-case-study-XXX", generates a v5-style UUID.
 */
function toDbTaskId(taskId: string): string {
  if (isValidUUID(taskId)) {
    return taskId;
  }
  // Generate a deterministic UUID from the string
  const hash = crypto.createHash('sha256').update(taskId).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Resolve vision pack ID for a task even when task IDs are not UUIDs.
 * Falls back to searching by linkedTaskId in context_snapshot.
 */
async function resolveVisionPackIdForTask(
  adminClient: any,
  projectId: string,
  taskId: string
): Promise<string | null> {
  // If the taskId is not a UUID, vision pack linking happens via context_snapshot.linkedTaskId
  // We fetch the most recent pack for that task.
  const { data, error } = await adminClient
    .from('vision_evidence_packs')
    .select('id, created_at, context_snapshot')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error || !data) return null;

  const match = data.find((p: any) => p?.context_snapshot?.linkedTaskId === taskId);
  return match?.id || null;
}

// ============================================================================
// WRITER API ROUTES
// ============================================================================
// POST /api/projects/[projectId]/writer - Create a new writer job
// GET /api/projects/[projectId]/writer - List writer jobs for project
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const body = await request.json();
    const adminClient = createAdminClient();

    // Validate required fields
    const {
      taskId,
      taskData: inlineTaskData, // Allow passing task data directly
      pageId,
      mode = 'create', // 'create' or 'update'
      originalUrl = null, // For rewrite mode
      publishingTargets = { wordpress: true, linkedin: false, gmb: false, reddit: false },
      toneProfileId = 'friendly-expert',
      toneOverrides = null,
      forceRefreshMasterProfile = false,
    } = body;

    // Fetch project with context
    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Fetch task - first try the tasks table, then growth plan
    let task: any = null;
    if (taskId) {
      // Try tasks table first
      const { data: taskData } = await adminClient
        .from('tasks')
        .select('*, briefs(*)')
        .eq('id', taskId)
        .single();
      
      if (taskData) {
        task = taskData;
      } else {
        // Task not in tasks table - look in growth plan
        const { data: growthPlan } = await adminClient
          .from('growth_plans')
          .select('months')
          .eq('project_id', projectId)
          .single();
        
        if (growthPlan?.months) {
          // Find the task in the growth plan months
          for (const month of growthPlan.months as any[]) {
            const foundTask = month.tasks?.find((t: any) => t.id === taskId);
            if (foundTask) {
              task = foundTask;
              break;
            }
          }
        }
      }
    }
    
    // If still no task but inline data provided, use that
    if (!task && inlineTaskData) {
      task = inlineTaskData;
    }

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found. Provide taskId or taskData.' },
        { status: 400 }
      );
    }

    // =========================================================================
    // EXTRACT VISION FACTS FROM IMAGE PACKS
    // =========================================================================
    let visionFacts: string[] = [];
    let userFacts: string[] = []; // User-provided facts like "Sold in 3 days"
    
    // Resolve pack ID even if task.imagePackId wasn't persisted
    const taskImagePackId = task.imagePackId || task.image_pack_id;
    console.log(`[Writer] === VISION PACK RESOLUTION ===`);
    console.log(`[Writer] task.imagePackId: ${task.imagePackId || 'undefined'}`);
    console.log(`[Writer] task.image_pack_id: ${task.image_pack_id || 'undefined'}`);
    console.log(`[Writer] taskId for fallback: ${taskId || 'none'}`);
    
    const resolvedPackId = taskImagePackId || 
      (taskId ? await resolveVisionPackIdForTask(adminClient, projectId, taskId) : null);
    
    console.log(`[Writer] resolvedPackId: ${resolvedPackId || 'NONE - NO VISION PACK FOUND'}`);
    
    if (resolvedPackId) {
      console.log(`[Writer] Fetching vision facts from pack: ${resolvedPackId}${!taskImagePackId ? ' (resolved by linkedTaskId)' : ''}`);
      
      // Get the vision evidence pack with its images
      const { data: visionPack } = await adminClient
        .from('vision_evidence_packs')
        .select('id, context_snapshot, combined_narrative, cross_image_themes')
        .eq('id', resolvedPackId)
        .single();
      
      if (visionPack) {
        // Extract userFacts from context_snapshot (first-party evidence, MUST appear in output)
        const snapshot = visionPack.context_snapshot as any;
        if (snapshot?.userFacts && Array.isArray(snapshot.userFacts)) {
          userFacts = snapshot.userFacts;
          console.log(`[Writer] Found ${userFacts.length} user-provided facts from userFacts array:`, userFacts);
        }
        
        // ALSO check writerNotes (the "Image Context" text from UI)
        if (snapshot?.writerNotes && typeof snapshot.writerNotes === 'string' && userFacts.length === 0) {
          // Parse writerNotes into facts (split by newlines or semicolons)
          const notesAsFacts = snapshot.writerNotes
            .split(/[\n;]+/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
          if (notesAsFacts.length > 0) {
            userFacts = notesAsFacts;
            console.log(`[Writer] Extracted ${userFacts.length} user facts from writerNotes:`, userFacts);
          }
        }
        
        // Add combined narrative as a fact
        if (visionPack.combined_narrative) {
          visionFacts.push(visionPack.combined_narrative);
        }
        
        // Add cross-image themes as facts
        if (visionPack.cross_image_themes && Array.isArray(visionPack.cross_image_themes)) {
          visionFacts.push(...visionPack.cross_image_themes);
        }
        
        // Get the images and their evidence
        const { data: images } = await adminClient
          .from('vision_evidence_images')
          .select('evidence')
          .eq('pack_id', resolvedPackId);
        
        if (images && images.length > 0) {
          for (const img of images) {
            const evidence = img.evidence as any;
            if (evidence) {
              // Scene summary is a key fact
              if (evidence.sceneSummary) {
                visionFacts.push(evidence.sceneSummary);
              }
              // Story angles have hooks we can use
              if (evidence.storyAngles && Array.isArray(evidence.storyAngles)) {
                for (const angle of evidence.storyAngles) {
                  if (angle.suggestedHook) {
                    visionFacts.push(angle.suggestedHook);
                  }
                }
              }
              // Detected entities provide concrete details
              if (evidence.entities && Array.isArray(evidence.entities)) {
                const entityFacts = evidence.entities
                  .filter((e: any) => e.confidence >= 70)
                  .map((e: any) => {
                    const attrs = e.attributes ? Object.entries(e.attributes).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
                    return attrs ? `${e.name} (${attrs})` : e.name;
                  });
                if (entityFacts.length > 0) {
                  visionFacts.push(`Observed in the images: ${entityFacts.join(', ')}`);
                }
              }
            }
          }
        }
        
        console.log(`[Writer] Extracted ${visionFacts.length} vision facts from pack`);
      }
    } else {
      console.log(`[Writer] ⚠️ NO VISION PACK ATTACHED - Article will lack first-hand evidence!`);
      console.log(`[Writer] To fix: Attach images to this task in the Growth Plan, or create a vision_evidence_pack linked to this taskId.`);
    }
    
    // Also check for vision facts directly on the task (from growth plan)
    if (task.visionFacts && Array.isArray(task.visionFacts)) {
      visionFacts = [...visionFacts, ...task.visionFacts];
    }
    
    // Merge userFacts into visionFacts - these are first-party evidence and MUST appear in output
    // Place them at the start so they have the highest priority
    if (userFacts.length > 0) {
      console.log(`[Writer] Prepending ${userFacts.length} user-provided facts (MUST appear in output)`);
      visionFacts = [...userFacts, ...visionFacts];
    }
    
    console.log(`[Writer] === FINAL VISION FACTS: ${visionFacts.length} total ===`);
    if (visionFacts.length === 0) {
      console.log(`[Writer] ❌ CRITICAL: No vision facts will be injected. Output will be GENERIC.`);
    } else {
      visionFacts.slice(0, 5).forEach((f, i) => console.log(`  [${i+1}] ${f.substring(0, 100)}`));
    }

    // =========================================================================
    // BUILD MASTER PROFILE
    // =========================================================================
    console.log('[Writer] Building master profile...');
    const masterProfile = await buildMasterProfile(projectId);
    console.log(`[Writer] Master profile v${masterProfile.version} ready`);

    // =========================================================================
    // BUILD TASK CONTEXT PACK
    // =========================================================================
    console.log('[Writer] Building task context pack...');
    
    // Extract SEO drafts from growth plan task (if present)
    let seoDrafts = (task.seoTitleDraft && task.h1Draft && task.metaDescriptionDraft) ? {
      seoTitleDraft: task.seoTitleDraft,
      h1Draft: task.h1Draft,
      metaDescriptionDraft: task.metaDescriptionDraft,
    } : undefined;
    
    // If no SEO drafts in growth plan, generate them on-the-fly
    if (!seoDrafts) {
      console.log('[Writer] No SEO drafts in growth plan - generating on-the-fly...');
      try {
        const businessName = masterProfile.business.name;
        const geo = masterProfile.business.locations?.[0];
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        const refinedDrafts = await refineSeoDraftsForTask(task, businessName, geo, openai);
        
        if (refinedDrafts.seoTitleDraft && refinedDrafts.h1Draft && refinedDrafts.metaDescriptionDraft) {
          seoDrafts = {
            seoTitleDraft: refinedDrafts.seoTitleDraft,
            h1Draft: refinedDrafts.h1Draft,
            metaDescriptionDraft: refinedDrafts.metaDescriptionDraft,
          };
          console.log(`[Writer] Generated SEO drafts: "${seoDrafts.seoTitleDraft}"`)
        }
      } catch (seoError) {
        console.warn('[Writer] Failed to generate SEO drafts on-the-fly:', seoError);
        // Continue without SEO drafts - writer will generate its own
      }
    } else {
      console.log(`[Writer] SEO drafts from growth plan: "${seoDrafts.seoTitleDraft}"`);
    }
    
    if (visionFacts.length > 0) {
      console.log(`[Writer] Vision facts to inject: ${visionFacts.length}`);
      visionFacts.forEach((f, i) => console.log(`  [${i+1}] ${f.substring(0, 80)}...`));
    }
    
    // Convert task to TaskInput format
    const taskInput: TaskInput = {
      id: taskId || task.id || crypto.randomUUID(),
      slug: task.slug || task.title?.toLowerCase().replace(/\s+/g, '-') || 'untitled',
      title: task.title,
      role: task.role || 'support',
      intent: task.intent,
      primaryService: task.primaryService || task.primary_service || masterProfile.business.primaryService,
      location: task.location || task.primaryLocation || masterProfile.business.locations[0],
      targetAudience: task.targetAudience || task.target_audience,
      targetKeyword: task.targetKeyword || task.target_keyword,
      secondaryKeywords: task.secondaryKeywords || [],
      estimatedWords: task.estimatedWords || task.estimated_words || 1500,
      toneProfileId: toneProfileId,
      ctaType: task.ctaType || task.cta_type,
      ctaTarget: task.ctaTarget || task.cta_target || '/contact',
      imagePackId: task.imagePackId || task.image_pack_id,
      mode: mode as 'create' | 'update',
      originalUrl: originalUrl || task.originalUrl || task.original_url,
      requiredProofElements: task.requiredProofElements || [],
      requiredEEATSignals: task.requiredEEATSignals || [],
      // SEO drafts from growth plan (source of truth)
      seoDrafts,
      // Vision facts from image analysis
      visionFacts: visionFacts.length > 0 ? visionFacts : undefined,
    };
    
    // Log before context pack building
    console.log(`[Writer] === TRACE: TaskInput visionFacts: ${taskInput.visionFacts?.length ?? 0} ===`);
    if (taskInput.seoDrafts) {
      console.log(`[Writer] === TRACE: TaskInput seoDrafts.seoTitle: "${taskInput.seoDrafts.seoTitleDraft}" ===`);
    }

    const contextPack = await buildTaskContextPack({
      projectId,
      task: taskInput,
      forceRefreshMasterProfile,
    });
    console.log(`[Writer] Context pack ${contextPack.id} ready (mode: ${contextPack.mode})`);
    
    // Verify vision facts carried through to context pack
    console.log(`[Writer] === TRACE: WriterBrief visionFacts: ${contextPack.writerBrief.visionFacts?.length ?? 0} ===`);
    if (contextPack.writerBrief.seoDrafts) {
      console.log(`[Writer] === TRACE: WriterBrief seoDrafts.seoTitle: "${contextPack.writerBrief.seoDrafts.seoTitleDraft}" ===`);
    }

    // =========================================================================
    // VALIDATE REWRITE MODE
    // =========================================================================
    if (contextPack.mode === 'update') {
      if (!contextPack.rewriteContext?.originalUrl) {
        return NextResponse.json(
          { error: 'Update mode requires originalUrl' },
          { status: 400 }
        );
      }
      if ((contextPack.rewriteContext?.originalWordCount || 0) < 200) {
        console.warn('[Writer] Warning: Original content is very short (<200 words)');
      }
    }

    // =========================================================================
    // BUILD JOB CONFIG (NEW FORMAT)
    // =========================================================================
    const jobConfig: WriterJobConfig = {
      task: contextPack.writerBrief,
      masterProfileId: masterProfile.id,
      masterProfileVersion: masterProfile.version,
      masterProfileSnapshot: masterProfile,
      taskContextPackId: contextPack.id,
      taskContextPackSnapshot: contextPack,
      toneProfileId,
      toneOverrides: toneOverrides || undefined,
      targets: {
        wordpress: publishingTargets.wordpress ?? true,
        linkedin: publishingTargets.linkedin ?? false,
        gmb: publishingTargets.gmb ?? false,
        reddit: publishingTargets.reddit ?? false,
      },
      options: {
        verbose: true,
        maxRetries: 2,
      },
    };

    // Create the writer job
    // Convert task ID to UUID for database storage (handle non-UUID task IDs)
    const dbTaskId = taskInput.id ? toDbTaskId(taskInput.id) : null;
    
    const { data: writerJob, error: jobError } = await adminClient
      .from('writer_jobs')
      .insert({
        project_id: projectId,
        task_id: dbTaskId,
        page_id: pageId || null,
        job_config: jobConfig,
        target_wordpress: publishingTargets.wordpress ?? true,
        target_linkedin: publishingTargets.linkedin ?? false,
        target_gmb: publishingTargets.gmb ?? false,
        target_reddit: publishingTargets.reddit ?? false,
        tone_profile_id: toneProfileId,
        tone_overrides: toneOverrides,
        status: 'pending',
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error creating writer job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create writer job' },
        { status: 500 }
      );
    }

    // Update the task status in the growth plan to 'briefed'
    if (taskInput.id) {
      const { data: growthPlan } = await adminClient
        .from('growth_plans')
        .select('id, months')
        .eq('project_id', projectId)
        .single();
      
      if (growthPlan?.months) {
        let updated = false;
        const updatedMonths = (growthPlan.months as any[]).map(month => ({
          ...month,
          tasks: month.tasks?.map((t: any) => {
            if (t.id === taskInput.id) {
              updated = true;
              return { ...t, status: 'briefed' };
            }
            return t;
          }),
        }));
        
        if (updated) {
          await adminClient
            .from('growth_plans')
            .update({ months: updatedMonths })
            .eq('id', growthPlan.id);
        }
      }
    }

    // Queue the job for processing (in production, this would go to a job queue)
    // For now, we'll just return the created job
    // The actual processing would be handled by a separate worker

    return NextResponse.json({
      data: {
        ...writerJob,
        masterProfileVersion: masterProfile.version,
        contextPackId: contextPack.id,
        mode: contextPack.mode,
      },
      message: 'Writer job created and queued for processing',
    });
  } catch (error) {
    console.error('Error in writer POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query = adminClient
      .from('writer_jobs')
      .select('*, writer_outputs(*)', { count: 'exact' })
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: jobs, error, count } = await query;

    if (error) {
      console.error('Error fetching writer jobs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch writer jobs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: jobs,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error in writer GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Note: Legacy helper functions have been removed.
// All context building is now handled by:
// - buildMasterProfile() in @/lib/context
// - buildTaskContextPack() in @/lib/context
// ============================================================================
