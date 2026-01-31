import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { 
  generatePersonalizedPlan, 
  generateTaskBrief,
  generateMonthBriefs,
  GrowthPlannerOptions,
} from '@/lib/growth-planner';
import { refineSeoDraftsForPlan } from '@/lib/growth-planner/refineSeoDrafts';
import { enrichPlanWithResearch } from '@/lib/research';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const adminClient = createAdminClient();
    const isDev = process.env.NODE_ENV === 'development';

    // Parse request body for options
    const body = await request.json().catch(() => ({}));
    const { 
      useResearch = true,  // Enable research by default for intelligent headings
      runFreshResearch = false,
      researchReportId,
      startDate, // Optional: ISO date string for when plan should start
      enrichWithAeoGeo = true, // NEW: Enable AEO + GEO research enrichment
    } = body;

    // Check if project exists and has sufficient foundation score (or dev mode)
    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id, name, foundation_score, root_url, settings')
      .eq('id', params.projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Foundation score check (skip in dev mode)
    const foundationScore = project.foundation_score || 0;
    if (!isDev && foundationScore < 80) {
      return NextResponse.json(
        { error: `Foundation score must be at least 80 to generate growth plan (current: ${foundationScore})` },
        { status: 400 }
      );
    }

    console.log(`[GrowthPlan] Generating personalized plan for project: ${project.name} (foundation: ${foundationScore}, isDev: ${isDev})`);
    if (useResearch) {
      console.log(`[GrowthPlan] Research integration enabled (fresh: ${runFreshResearch})`);
    }
    if (enrichWithAeoGeo) {
      console.log(`[GrowthPlan] AEO + GEO research enrichment enabled`);
    }

    // Build planner options
    const plannerOptions: GrowthPlannerOptions = {
      includeDevMode: isDev,
      useResearch,
      runFreshResearch,
      researchReportId,
      startDate, // Cadence start date
      openaiApiKey: process.env.OPENAI_API_KEY,
    };

    // Generate the personalized growth plan
    const plan = await generatePersonalizedPlan(
      adminClient,
      params.projectId,
      plannerOptions
    );

    // ========================================
    // PHASE: AEO + GEO Research Enrichment
    // ========================================
    // Enrich tasks with Serper/Tavily/Geoapify research data
    let researchEnrichmentResult = null;
    if (enrichWithAeoGeo && plan.businessContext) {
      console.log(`[GrowthPlan] Running AEO + GEO research enrichment...`);
      try {
        researchEnrichmentResult = await enrichPlanWithResearch(
          plan.months,
          plan.businessContext,
          {
            enrichAllTasks: false, // Only first month to avoid long waits
            concurrency: 2,
            forceRefresh: runFreshResearch,
            onProgress: (completed, total, task) => {
              console.log(`[GrowthPlan] Research progress: ${completed}/${total} - ${task}`);
            },
          }
        );
        console.log(`[GrowthPlan] Research enrichment complete:
          - Tasks enriched: ${researchEnrichmentResult.tasksEnriched}
          - From cache: ${researchEnrichmentResult.fromCache}
          - Failed: ${researchEnrichmentResult.tasksFailed}
        `);
      } catch (error) {
        console.warn('[GrowthPlan] Research enrichment failed (non-fatal):', error);
      }
    }

    // ========================================
    // PHASE: SEO Title/H1/Meta Refinement (Finesse Layer)
    // ========================================
    // This makes the growth plan tasks the source of truth for refined titles.
    try {
      const businessName =
        plan.businessContext?.businessName ||
        project.name ||
        'Brand';
      const geo =
        plan.businessContext?.location ||
        plan.businessContext?.geo ||
        undefined;

      console.log(`[GrowthPlan] Refining SEO drafts (business: ${businessName}, geo: ${geo || 'none'})...`);
      plan.months = await refineSeoDraftsForPlan({
        months: plan.months,
        businessName,
        geo,
        openaiApiKey: process.env.OPENAI_API_KEY,
      });
      console.log('[GrowthPlan] SEO drafts refined and embedded into tasks');
    } catch (e) {
      console.warn('[GrowthPlan] SEO draft refinement failed (non-fatal):', e);
    }

    // Save the growth plan (including research-enriched tasks)
    const { data: savedPlan, error: saveError } = await adminClient
      .from('growth_plans')
      .upsert({
        project_id: params.projectId,
        months: plan.months,
        generated_at: new Date().toISOString(),
      }, {
        onConflict: 'project_id',
      })
      .select()
      .single();

    if (saveError) {
      console.error('[GrowthPlan] Error saving plan:', saveError);
      return NextResponse.json({ error: saveError.message }, { status: 400 });
    }

    console.log(`[GrowthPlan] Plan saved successfully:
      - Months: ${plan.months.length}
      - Tasks: ${plan.totalTasks}
      - Quality: ${plan.qualityScore.overall}/100
      - Cadence: ${plan.cadenceReport?.completeMonths || 0}/${plan.months.length} complete months
      - Research enriched: ${researchEnrichmentResult?.tasksEnriched || 0} tasks
    `);

    return NextResponse.json({
      data: {
        ...savedPlan,
        researchEnrichment: researchEnrichmentResult,
        qualityScore: plan.qualityScore,
        gapAnalysis: plan.gapAnalysis,
        assumptions: plan.assumptions,
        warnings: plan.warnings,
        cadenceReport: plan.cadenceReport,
        auditGateReport: plan.auditGateReport,
        cannibalisationReport: plan.cannibalisationReport,
      },
    });
  } catch (error) {
    console.error('[GrowthPlan] Error generating growth plan:', error);
    
    // Log the full error stack if available
    if (error instanceof Error) {
      console.error('[GrowthPlan] Error stack:', error.stack);
    }
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

// Get a brief for a specific task
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const month = searchParams.get('month');

    // If taskId provided, get specific task brief
    if (taskId) {
      const brief = await generateTaskBrief(adminClient, params.projectId, taskId);
      
      if (!brief) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      return NextResponse.json({ data: brief });
    }

    // If month provided, get all briefs for that month
    if (month) {
      const monthNum = parseInt(month, 10);
      const briefs = await generateMonthBriefs(adminClient, params.projectId, monthNum);
      
      return NextResponse.json({ data: briefs });
    }

    // Otherwise, return the full plan
    const { data: growthPlan, error } = await adminClient
      .from('growth_plans')
      .select('*')
      .eq('project_id', params.projectId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: growthPlan || null });
  } catch (error) {
    console.error('[GrowthPlan] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
