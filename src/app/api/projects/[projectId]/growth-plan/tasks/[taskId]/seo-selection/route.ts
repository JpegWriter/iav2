import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// ============================================================================
// SEO SELECTION API
// ============================================================================
// PATCH /api/projects/[projectId]/growth-plan/tasks/[taskId]/seo-selection
// Updates the selected SEO title, H1, and meta description for a task
// ============================================================================

interface SeoSelectionBody {
  selectedSeoTitleIndex?: number;
  selectedH1Index?: number;
  selectedMetaIndex?: number;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  try {
    const { projectId, taskId } = params;
    const body = (await request.json()) as SeoSelectionBody;
    const adminClient = createAdminClient();

    // Validate input
    if (
      typeof body.selectedSeoTitleIndex !== 'number' &&
      typeof body.selectedH1Index !== 'number' &&
      typeof body.selectedMetaIndex !== 'number'
    ) {
      return NextResponse.json(
        { error: 'At least one selection index required' },
        { status: 400 }
      );
    }

    // Fetch growth plan
    const { data: growthPlan, error: planError } = await adminClient
      .from('growth_plans')
      .select('id, months')
      .eq('project_id', projectId)
      .single();

    if (planError || !growthPlan) {
      return NextResponse.json(
        { error: 'Growth plan not found' },
        { status: 404 }
      );
    }

    // Find and update the task
    let taskFound = false;
    let updatedTask: any = null;
    
    const updatedMonths = (growthPlan.months as any[]).map(month => ({
      ...month,
      tasks: month.tasks?.map((task: any) => {
        if (task.id === taskId) {
          taskFound = true;
          
          // Validate selection indices
          if (typeof body.selectedSeoTitleIndex === 'number') {
            if (body.selectedSeoTitleIndex < 0 || body.selectedSeoTitleIndex >= (task.seoTitleOptions?.length || 0)) {
              throw new Error(`Invalid SEO title index: ${body.selectedSeoTitleIndex}`);
            }
          }
          if (typeof body.selectedH1Index === 'number') {
            if (body.selectedH1Index < 0 || body.selectedH1Index >= (task.h1Options?.length || 0)) {
              throw new Error(`Invalid H1 index: ${body.selectedH1Index}`);
            }
          }
          if (typeof body.selectedMetaIndex === 'number') {
            if (body.selectedMetaIndex < 0 || body.selectedMetaIndex >= (task.metaDescriptionOptions?.length || 0)) {
              throw new Error(`Invalid meta description index: ${body.selectedMetaIndex}`);
            }
          }
          
          // Update selections and drafts
          const updated = { ...task };
          
          if (typeof body.selectedSeoTitleIndex === 'number') {
            updated.selectedSeoTitleIndex = body.selectedSeoTitleIndex;
            updated.seoTitleDraft = task.seoTitleOptions?.[body.selectedSeoTitleIndex] || updated.seoTitleDraft;
          }
          if (typeof body.selectedH1Index === 'number') {
            updated.selectedH1Index = body.selectedH1Index;
            updated.h1Draft = task.h1Options?.[body.selectedH1Index] || updated.h1Draft;
          }
          if (typeof body.selectedMetaIndex === 'number') {
            updated.selectedMetaIndex = body.selectedMetaIndex;
            updated.metaDescriptionDraft = task.metaDescriptionOptions?.[body.selectedMetaIndex] || updated.metaDescriptionDraft;
          }
          
          // Unlock if SEO title is selected
          if (typeof updated.selectedSeoTitleIndex === 'number') {
            updated.seoLocked = false;
          }
          
          updatedTask = updated;
          return updated;
        }
        return task;
      }),
    }));

    if (!taskFound) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Save updated plan
    const { error: updateError } = await adminClient
      .from('growth_plans')
      .update({ months: updatedMonths })
      .eq('id', growthPlan.id);

    if (updateError) {
      console.error('[SeoSelection] Failed to update plan:', updateError);
      return NextResponse.json(
        { error: 'Failed to save selection' },
        { status: 500 }
      );
    }

    console.log(`[SeoSelection] Updated task ${taskId} - SEO title: ${updatedTask?.seoTitleDraft?.slice(0, 40)}...`);

    return NextResponse.json({
      success: true,
      task: {
        id: updatedTask?.id,
        selectedSeoTitleIndex: updatedTask?.selectedSeoTitleIndex,
        selectedH1Index: updatedTask?.selectedH1Index,
        selectedMetaIndex: updatedTask?.selectedMetaIndex,
        seoTitleDraft: updatedTask?.seoTitleDraft,
        h1Draft: updatedTask?.h1Draft,
        metaDescriptionDraft: updatedTask?.metaDescriptionDraft,
        seoLocked: updatedTask?.seoLocked,
      },
    });
  } catch (error) {
    console.error('[SeoSelection] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to update SEO selection' },
      { status: 500 }
    );
  }
}

// GET - Fetch current SEO options and selection for a task
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  try {
    const { projectId, taskId } = params;
    const adminClient = createAdminClient();

    // Fetch growth plan
    const { data: growthPlan, error: planError } = await adminClient
      .from('growth_plans')
      .select('months')
      .eq('project_id', projectId)
      .single();

    if (planError || !growthPlan) {
      return NextResponse.json(
        { error: 'Growth plan not found' },
        { status: 404 }
      );
    }

    // Find the task
    let foundTask: any = null;
    for (const month of growthPlan.months as any[]) {
      for (const task of month.tasks || []) {
        if (task.id === taskId) {
          foundTask = task;
          break;
        }
      }
      if (foundTask) break;
    }

    if (!foundTask) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      taskId: foundTask.id,
      title: foundTask.title,
      seoTitleOptions: foundTask.seoTitleOptions || [],
      h1Options: foundTask.h1Options || [],
      metaDescriptionOptions: foundTask.metaDescriptionOptions || [],
      selectedSeoTitleIndex: foundTask.selectedSeoTitleIndex ?? null,
      selectedH1Index: foundTask.selectedH1Index ?? null,
      selectedMetaIndex: foundTask.selectedMetaIndex ?? null,
      seoTitleDraft: foundTask.seoTitleDraft,
      h1Draft: foundTask.h1Draft,
      metaDescriptionDraft: foundTask.metaDescriptionDraft,
      seoLocked: foundTask.seoLocked ?? false,
    });
  } catch (error) {
    console.error('[SeoSelection] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SEO options' },
      { status: 500 }
    );
  }
}
