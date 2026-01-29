import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { analyzeImagePack, getVisionEvidencePack, listVisionEvidencePacks } from '@/lib/vision/analyze';
import type { VisionAnalysisRequest, VisionContextSnapshot } from '@/types/visionEvidence';
import type { BrandTone } from '@/types';

// ============================================================================
// POST /api/projects/[projectId]/vision/evidence
// ============================================================================
// Analyze 1-3 images and create a VisionEvidencePack
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const adminClient = createAdminClient();
    const { projectId } = params;

    // Verify project exists and user has access
    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    
    // Validate required fields
    if (!body.images || !Array.isArray(body.images) || body.images.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one image is required' },
        { status: 400 }
      );
    }

    if (body.images.length > 3) {
      return NextResponse.json(
        { success: false, error: 'Maximum 3 images allowed per pack' },
        { status: 400 }
      );
    }

    // Validate each image has base64 or url
    for (const img of body.images) {
      if (!img.base64 && !img.url) {
        return NextResponse.json(
          { success: false, error: 'Each image must have either base64 data or a URL' },
          { status: 400 }
        );
      }
      if (!img.filename) {
        return NextResponse.json(
          { success: false, error: 'Each image must have a filename' },
          { status: 400 }
        );
      }
    }

    // Validate context
    if (!body.context) {
      return NextResponse.json(
        { success: false, error: 'Context is required' },
        { status: 400 }
      );
    }

    const context: VisionContextSnapshot = {
      topic: body.context.topic || '',
      primaryService: body.context.primaryService || '',
      location: body.context.location || null,
      brandTone: (body.context.brandTone as BrandTone[]) || ['professional'],
      targetAudience: body.context.targetAudience || '',
      contentIntent: body.context.contentIntent || 'showcase',
    };

    // Build the analysis request
    const analysisRequest: VisionAnalysisRequest = {
      projectId,
      taskId: body.taskId, // Link to specific growth plan task
      images: body.images.map((img: { base64?: string; url?: string; filename: string }) => ({
        base64: img.base64,
        url: img.url,
        filename: img.filename,
      })),
      context,
    };

    // Run the analysis
    const pack = await analyzeImagePack(analysisRequest);

    return NextResponse.json({
      success: true,
      pack,
    });
  } catch (error) {
    console.error('Vision analysis error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Vision analysis failed' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET /api/projects/[projectId]/vision/evidence
// ============================================================================
// List all VisionEvidencePacks for a project
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const adminClient = createAdminClient();
    const { projectId } = params;

    // Verify project exists
    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get all packs for this project
    const packs = await listVisionEvidencePacks(projectId);

    return NextResponse.json({
      success: true,
      packs,
      count: packs.length,
    });
  } catch (error) {
    console.error('Failed to list vision evidence packs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list vision evidence packs' },
      { status: 500 }
    );
  }
}
