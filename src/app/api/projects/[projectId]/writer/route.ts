import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { 
  buildMasterProfile, 
  buildTaskContextPack,
  type TaskInput,
  type WriterJobConfig,
} from '@/lib/context';

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
    // BUILD MASTER PROFILE
    // =========================================================================
    console.log('[Writer] Building master profile...');
    const masterProfile = await buildMasterProfile(projectId);
    console.log(`[Writer] Master profile v${masterProfile.version} ready`);

    // =========================================================================
    // BUILD TASK CONTEXT PACK
    // =========================================================================
    console.log('[Writer] Building task context pack...');
    
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
    };

    const contextPack = await buildTaskContextPack({
      projectId,
      task: taskInput,
      forceRefreshMasterProfile,
    });
    console.log(`[Writer] Context pack ${contextPack.id} ready (mode: ${contextPack.mode})`);

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
    const { data: writerJob, error: jobError } = await adminClient
      .from('writer_jobs')
      .insert({
        project_id: projectId,
        task_id: taskInput.id || null,
        page_id: pageId || null,
        job_config: jobConfig,
        target_wordpress: publishingTargets.wordpress ?? true,
        target_linkedin: publishingTargets.linkedin ?? false,
        target_gmb: publishingTargets.gmb ?? false,
        target_reddit: publishingTargets.reddit ?? false,
        tone_profile_id: toneProfileId,
        tone_overrides: toneOverrides,
        status: 'pending',
        // NEW: Link to context pack and master profile
        context_pack_id: contextPack.id,
        master_profile_id: masterProfile.id,
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
