import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

interface GrowthPlanTask {
  id: string;
  [key: string]: unknown;
}

interface VisionEvidencePack {
  id: string;
  used_in_task_ids: string[];
  images?: { id: string }[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const adminClient = createAdminClient();

    const { data: growthPlan, error } = await adminClient
      .from('growth_plans')
      .select('*')
      .eq('project_id', params.projectId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // If we have a growth plan, enrich tasks with image pack info
    if (growthPlan?.months) {
      // Fetch all vision evidence packs for this project
      const { data: packs, error: packsError } = await adminClient
        .from('vision_evidence_packs')
        .select('id, used_in_task_ids')
        .eq('project_id', params.projectId);

      console.log('[GrowthPlan] Vision packs found:', packs?.length || 0, 'error:', packsError?.message || 'none');
      if (packs?.length) {
        console.log('[GrowthPlan] Pack task IDs:', packs.map((p: VisionEvidencePack) => ({ id: p.id, taskIds: p.used_in_task_ids })));
      }

      // Also get image counts per pack
      const { data: imageCounts } = await adminClient
        .from('vision_evidence_images')
        .select('pack_id');

      console.log('[GrowthPlan] Images found:', imageCounts?.length || 0);

      // Build a map of taskId -> { packId, imageCount }
      const taskImageMap: Record<string, { packId: string; imageCount: number }> = {};
      
      if (packs) {
        for (const pack of packs as VisionEvidencePack[]) {
          const imageCount = imageCounts?.filter((img: { pack_id: string }) => img.pack_id === pack.id).length || 0;
          
          for (const taskId of pack.used_in_task_ids || []) {
            taskImageMap[taskId] = {
              packId: pack.id,
              imageCount,
            };
          }
        }
      }

      console.log('[GrowthPlan] Task image map:', Object.keys(taskImageMap).length, 'tasks with images');

      // Enrich tasks with image data
      for (const month of growthPlan.months) {
        if (month.tasks) {
          for (const task of month.tasks as GrowthPlanTask[]) {
            const imageInfo = taskImageMap[task.id];
            if (imageInfo) {
              task.imagePackId = imageInfo.packId;
              task.imageCount = imageInfo.imageCount;
              console.log('[GrowthPlan] Enriched task:', task.id, 'with pack:', imageInfo.packId, 'images:', imageInfo.imageCount);
            }
          }
        }
      }
    }

    return NextResponse.json({ data: growthPlan || null });
  } catch (error) {
    console.error('Error fetching growth plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Clear existing growth plan
 * Allows user to start fresh with a new plan
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from('growth_plans')
      .delete()
      .eq('project_id', params.projectId);

    if (error) {
      console.error('[GrowthPlan] Error deleting plan:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log(`[GrowthPlan] Plan cleared for project: ${params.projectId}`);
    return NextResponse.json({ success: true, message: 'Growth plan cleared' });
  } catch (error) {
    console.error('Error deleting growth plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
