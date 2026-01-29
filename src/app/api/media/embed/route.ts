import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { embedMetadata, batchEmbedMetadata } from '@/lib/vision';
import type { MetadataEmbedRequest, MetadataEmbedResponse } from '@/types/visionEvidence';

// ============================================================================
// POST /api/media/embed
// ============================================================================
// Embed metadata (EXIF, IPTC, XMP) into an image
// This endpoint is used AFTER writer approval to finalize image metadata
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle batch requests
    if (Array.isArray(body.requests)) {
      // Validate batch
      if (body.requests.length === 0) {
        return NextResponse.json(
          { success: false, error: 'At least one embed request is required' },
          { status: 400 }
        );
      }

      if (body.requests.length > 10) {
        return NextResponse.json(
          { success: false, error: 'Maximum 10 images per batch' },
          { status: 400 }
        );
      }

      // Validate each request
      for (const req of body.requests) {
        const validation = validateEmbedRequest(req);
        if (!validation.valid) {
          return NextResponse.json(
            { success: false, error: validation.error },
            { status: 400 }
          );
        }
      }

      // Process batch
      const results = await batchEmbedMetadata(body.requests);
      
      const successCount = results.filter((r: MetadataEmbedResponse) => r.success).length;
      const failureCount = results.filter((r: MetadataEmbedResponse) => !r.success).length;

      return NextResponse.json({
        success: failureCount === 0,
        results,
        summary: {
          total: results.length,
          succeeded: successCount,
          failed: failureCount,
        },
      });
    }

    // Single request
    const validation = validateEmbedRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const embedRequest: MetadataEmbedRequest = {
      imageId: body.imageId,
      fields: body.fields || {},
      outputFormat: body.outputFormat || 'jpeg',
      preserveOriginal: body.preserveOriginal ?? true,
    };

    // Verify image exists and user has access
    const adminClient = createAdminClient();
    const { data: image, error: imageError } = await adminClient
      .from('vision_evidence_images')
      .select(`
        id,
        pack:vision_evidence_packs(
          id,
          project:projects(id, user_id)
        )
      `)
      .eq('id', embedRequest.imageId)
      .single();

    if (imageError || !image) {
      return NextResponse.json(
        { success: false, error: 'Image not found' },
        { status: 404 }
      );
    }

    // Run the embed operation
    const result = await embedMetadata(embedRequest);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Metadata embed error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Metadata embedding failed' },
      { status: 500 }
    );
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateEmbedRequest(req: unknown): { valid: boolean; error?: string } {
  if (!req || typeof req !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const body = req as Record<string, unknown>;

  if (!body.imageId || typeof body.imageId !== 'string') {
    return { valid: false, error: 'imageId is required and must be a string' };
  }

  if (body.outputFormat && !['jpeg', 'png', 'webp'].includes(body.outputFormat as string)) {
    return { valid: false, error: 'outputFormat must be jpeg, png, or webp' };
  }

  if (body.fields && typeof body.fields !== 'object') {
    return { valid: false, error: 'fields must be an object' };
  }

  return { valid: true };
}

// ============================================================================
// GET /api/media/embed
// ============================================================================
// Get supported metadata fields and formats
// ============================================================================

export async function GET() {
  return NextResponse.json({
    success: true,
    supportedFields: {
      basic: ['title', 'description', 'copyright', 'creator'],
      keywords: 'Array of strings for tagging',
      accessibility: ['altText', 'caption'],
      iptc: ['headline', 'city', 'country', 'creditLine'],
      custom: 'Key-value pairs in customXmp object',
    },
    supportedFormats: ['jpeg', 'png', 'webp'],
    notes: [
      'JPEG has best metadata support (EXIF, IPTC, XMP)',
      'PNG has limited EXIF support',
      'WebP has basic EXIF support',
      'For full XMP/IPTC embedding, consider using external tools like ExifTool',
    ],
  });
}
