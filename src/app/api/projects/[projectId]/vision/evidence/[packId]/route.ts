import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getVisionEvidencePack } from '@/lib/vision/analyze';

// ============================================================================
// GET /api/projects/[projectId]/vision/evidence/[packId]
// ============================================================================
// Get a specific VisionEvidencePack by ID
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; packId: string } }
) {
  try {
    const adminClient = createAdminClient();
    const { projectId, packId } = params;

    // Verify pack exists and belongs to project
    const { data: packCheck, error: checkError } = await adminClient
      .from('vision_evidence_packs')
      .select('id, project_id')
      .eq('id', packId)
      .eq('project_id', projectId)
      .single();

    if (checkError || !packCheck) {
      return NextResponse.json(
        { success: false, error: 'Vision evidence pack not found' },
        { status: 404 }
      );
    }

    // Get the full pack with images
    const pack = await getVisionEvidencePack(packId);

    if (!pack) {
      return NextResponse.json(
        { success: false, error: 'Failed to load vision evidence pack' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      pack,
    });
  } catch (error) {
    console.error('Failed to get vision evidence pack:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get vision evidence pack' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/projects/[projectId]/vision/evidence/[packId]
// ============================================================================
// Delete a VisionEvidencePack and its images
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; packId: string } }
) {
  try {
    const adminClient = createAdminClient();
    const { projectId, packId } = params;

    // Verify pack exists and belongs to project
    const { data: pack, error: checkError } = await adminClient
      .from('vision_evidence_packs')
      .select('id, project_id')
      .eq('id', packId)
      .eq('project_id', projectId)
      .single();

    if (checkError || !pack) {
      return NextResponse.json(
        { success: false, error: 'Vision evidence pack not found' },
        { status: 404 }
      );
    }

    // Get images to delete from storage
    const { data: images } = await adminClient
      .from('vision_evidence_images')
      .select('image_url')
      .eq('pack_id', packId);

    // Delete images from storage
    if (images && images.length > 0) {
      const storagePaths = images
        .map(img => {
          // Extract path from URL
          const match = img.image_url.match(/\/storage\/v1\/object\/public\/images\/(.+)/);
          return match ? match[1] : null;
        })
        .filter(Boolean) as string[];

      if (storagePaths.length > 0) {
        await adminClient.storage.from('images').remove(storagePaths);
      }
    }

    // Delete the pack (cascade will delete images)
    const { error: deleteError } = await adminClient
      .from('vision_evidence_packs')
      .delete()
      .eq('id', packId);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Vision evidence pack deleted',
    });
  } catch (error) {
    console.error('Failed to delete vision evidence pack:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete vision evidence pack' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/projects/[projectId]/vision/evidence/[packId]
// ============================================================================
// Update pack usage (link to briefs/tasks)
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; packId: string } }
) {
  try {
    const adminClient = createAdminClient();
    const { projectId, packId } = params;

    // Verify pack exists and belongs to project
    const { data: pack, error: checkError } = await adminClient
      .from('vision_evidence_packs')
      .select('*')
      .eq('id', packId)
      .eq('project_id', projectId)
      .single();

    if (checkError || !pack) {
      return NextResponse.json(
        { success: false, error: 'Vision evidence pack not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Allow updating usage references
    if (body.addBriefId) {
      const existingBriefIds = pack.used_in_brief_ids || [];
      if (!existingBriefIds.includes(body.addBriefId)) {
        updates.used_in_brief_ids = [...existingBriefIds, body.addBriefId];
      }
    }

    if (body.addTaskId) {
      const existingTaskIds = pack.used_in_task_ids || [];
      if (!existingTaskIds.includes(body.addTaskId)) {
        updates.used_in_task_ids = [...existingTaskIds, body.addTaskId];
      }
    }

    if (body.removeBriefId) {
      const existingBriefIds = pack.used_in_brief_ids || [];
      updates.used_in_brief_ids = existingBriefIds.filter((id: string) => id !== body.removeBriefId);
    }

    if (body.removeTaskId) {
      const existingTaskIds = pack.used_in_task_ids || [];
      updates.used_in_task_ids = existingTaskIds.filter((id: string) => id !== body.removeTaskId);
    }

    // Allow updating primary hero image
    if (body.primaryHeroImageId !== undefined) {
      updates.primary_hero_image_id = body.primaryHeroImageId;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No updates provided',
      });
    }

    const { error: updateError } = await adminClient
      .from('vision_evidence_packs')
      .update(updates)
      .eq('id', packId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Vision evidence pack updated',
    });
  } catch (error) {
    console.error('Failed to update vision evidence pack:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update vision evidence pack' },
      { status: 500 }
    );
  }
}
