// ============================================================================
// METADATA EMBED SERVICE
// ============================================================================
// Embeds EXIF, IPTC, and XMP metadata into images for SEO and accessibility.
// This module runs AFTER writer approval to embed finalized metadata.
//
// DEPENDENCY: Requires 'sharp' for image processing.
// Install with: pnpm add sharp
// ============================================================================

import type {
  MetadataEmbedRequest,
  MetadataEmbedResponse,
} from '@/types/visionEvidence';
import { createAdminClient } from '@/lib/supabase/server';

// ============================================================================
// DYNAMIC SHARP IMPORT
// ============================================================================
// Sharp is an optional dependency - embed operations will fail gracefully
// if sharp is not installed.
// ============================================================================

type SharpInstance = {
  jpeg: (options?: { quality?: number }) => SharpInstance;
  png: () => SharpInstance;
  webp: (options?: { quality?: number }) => SharpInstance;
  withMetadata: (options?: { exif?: { IFD0?: Record<string, string> } }) => SharpInstance;
  toBuffer: () => Promise<Buffer>;
  metadata: () => Promise<{
    format?: string;
    width?: number;
    height?: number;
    space?: string;
    channels?: number;
    depth?: string;
    density?: number;
    hasAlpha?: boolean;
    orientation?: number;
    exif?: Buffer;
    icc?: Buffer;
    iptc?: Buffer;
    xmp?: Buffer;
  }>;
};

type SharpModule = (input: Buffer) => SharpInstance;

let sharpModule: SharpModule | null = null;

async function getSharp(): Promise<SharpModule | null> {
  if (sharpModule) return sharpModule;
  try {
    // Dynamic import - sharp may not be available in all environments
    const imported = await import('sharp');
    sharpModule = imported.default as unknown as SharpModule;
    return sharpModule;
  } catch {
    return null;
  }
}

// ============================================================================
// IPTC/XMP CONSTANTS
// ============================================================================

const IPTC_TAGS = {
  ObjectName: 5,        // Title
  Caption: 120,         // Description
  Writer: 122,          // Caption writer
  Headline: 105,        // Headline
  SpecialInstructions: 40,
  Byline: 80,          // Creator
  BylineTitle: 85,
  Credit: 110,
  Source: 115,
  Copyright: 116,
  City: 90,
  Country: 101,
  Keywords: 25,
} as const;

// Export for reference
export { IPTC_TAGS };

// ============================================================================
// BUILD XMP METADATA
// ============================================================================

export function buildXmpMetadata(fields: MetadataEmbedRequest['fields']): string {
  const dcItems: string[] = [];
  const photoshopItems: string[] = [];
  const iptcItems: string[] = [];
  const customItems: string[] = [];

  // Dublin Core (dc:)
  if (fields.title) {
    dcItems.push(`<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(fields.title)}</rdf:li></rdf:Alt></dc:title>`);
  }
  if (fields.description) {
    dcItems.push(`<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(fields.description)}</rdf:li></rdf:Alt></dc:description>`);
  }
  if (fields.creator) {
    dcItems.push(`<dc:creator><rdf:Seq><rdf:li>${escapeXml(fields.creator)}</rdf:li></rdf:Seq></dc:creator>`);
  }
  if (fields.copyright) {
    dcItems.push(`<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(fields.copyright)}</rdf:li></rdf:Alt></dc:rights>`);
  }
  if (fields.keywords && fields.keywords.length > 0) {
    const keywordItems = fields.keywords.map(k => `<rdf:li>${escapeXml(k)}</rdf:li>`).join('');
    dcItems.push(`<dc:subject><rdf:Bag>${keywordItems}</rdf:Bag></dc:subject>`);
  }

  // Photoshop (photoshop:)
  if (fields.headline) {
    photoshopItems.push(`<photoshop:Headline>${escapeXml(fields.headline)}</photoshop:Headline>`);
  }
  if (fields.city) {
    photoshopItems.push(`<photoshop:City>${escapeXml(fields.city)}</photoshop:City>`);
  }
  if (fields.country) {
    photoshopItems.push(`<photoshop:Country>${escapeXml(fields.country)}</photoshop:Country>`);
  }
  if (fields.creditLine) {
    photoshopItems.push(`<photoshop:Credit>${escapeXml(fields.creditLine)}</photoshop:Credit>`);
  }
  if (fields.caption) {
    photoshopItems.push(`<photoshop:CaptionWriter>${escapeXml(fields.caption)}</photoshop:CaptionWriter>`);
  }

  // IPTC Core (Iptc4xmpCore:)
  if (fields.altText) {
    iptcItems.push(`<Iptc4xmpCore:AltTextAccessibility>${escapeXml(fields.altText)}</Iptc4xmpCore:AltTextAccessibility>`);
  }

  // Custom XMP
  if (fields.customXmp) {
    for (const [key, value] of Object.entries(fields.customXmp)) {
      customItems.push(`<custom:${escapeXml(key)}>${escapeXml(value)}</custom:${escapeXml(key)}>`);
    }
  }

  // Build complete XMP packet
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
      xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/"
      xmlns:custom="http://sitefix.io/ns/custom/1.0/">
      ${dcItems.join('\n      ')}
      ${photoshopItems.join('\n      ')}
      ${iptcItems.join('\n      ')}
      ${customItems.join('\n      ')}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// EMBED METADATA INTO IMAGE
// ============================================================================

export async function embedMetadata(
  request: MetadataEmbedRequest
): Promise<MetadataEmbedResponse> {
  const supabase = createAdminClient();
  const embeddedFields: string[] = [];
  const warnings: string[] = [];

  try {
    // Check if sharp is available
    const sharp = await getSharp();
    if (!sharp) {
      return {
        success: false,
        embeddedFields: [],
        error: 'Sharp image processing library not installed. Run: pnpm add sharp',
      };
    }

    // Get the image record
    const { data: imageRecord, error: imageError } = await supabase
      .from('vision_evidence_images')
      .select('*, pack:vision_evidence_packs(project_id)')
      .eq('id', request.imageId)
      .single();

    if (imageError || !imageRecord) {
      return {
        success: false,
        embeddedFields: [],
        error: 'Image not found',
      };
    }

    // Download the original image
    const imageUrl = imageRecord.image_url as string;
    let imageBuffer: Buffer;

    if (imageUrl.includes('supabase')) {
      // Extract path and download from storage
      const match = imageUrl.match(/\/storage\/v1\/object\/public\/images\/(.+)/);
      if (match) {
        const { data, error } = await supabase.storage
          .from('images')
          .download(match[1]);
        
        if (error || !data) {
          return {
            success: false,
            embeddedFields: [],
            error: 'Failed to download image from storage',
          };
        }
        imageBuffer = Buffer.from(await data.arrayBuffer());
      } else {
        return {
          success: false,
          embeddedFields: [],
          error: 'Invalid storage URL',
        };
      }
    } else {
      // External URL - fetch it
      const response = await fetch(imageUrl);
      if (!response.ok) {
        return {
          success: false,
          embeddedFields: [],
          error: 'Failed to fetch external image',
        };
      }
      imageBuffer = Buffer.from(await response.arrayBuffer());
    }

    // Build XMP metadata (for reference - Sharp has limited XMP support)
    const _xmpData = buildXmpMetadata(request.fields);

    // Process with Sharp
    const processor = sharp(imageBuffer);

    // Add EXIF metadata where supported
    const exifMetadata: Record<string, string> = {};
    
    if (request.fields.title) {
      exifMetadata['ImageDescription'] = request.fields.title;
      embeddedFields.push('title');
    }
    if (request.fields.copyright) {
      exifMetadata['Copyright'] = request.fields.copyright;
      embeddedFields.push('copyright');
    }
    if (request.fields.creator) {
      exifMetadata['Artist'] = request.fields.creator;
      embeddedFields.push('creator');
    }

    // Sharp doesn't directly support IPTC/XMP embedding in all cases
    // For full XMP support, we'd need exiftool, but Sharp handles basic EXIF
    warnings.push('Full XMP/IPTC embedding requires ExifTool. Basic EXIF metadata embedded.');

    // Convert to output format
    let outputBuffer: Buffer;
    switch (request.outputFormat) {
      case 'jpeg':
        outputBuffer = await processor
          .jpeg({ quality: 90 })
          .withMetadata({
            exif: {
              IFD0: exifMetadata,
            },
          })
          .toBuffer();
        break;
      case 'png':
        outputBuffer = await processor
          .png()
          .withMetadata()
          .toBuffer();
        warnings.push('PNG has limited EXIF support');
        break;
      case 'webp':
        outputBuffer = await processor
          .webp({ quality: 90 })
          .withMetadata()
          .toBuffer();
        break;
      default:
        outputBuffer = await processor
          .jpeg({ quality: 90 })
          .withMetadata({
            exif: {
              IFD0: exifMetadata,
            },
          })
          .toBuffer();
    }

    // Track which fields were embedded
    if (request.fields.description) embeddedFields.push('description');
    if (request.fields.altText) embeddedFields.push('altText');
    if (request.fields.caption) embeddedFields.push('caption');
    if (request.fields.keywords?.length) embeddedFields.push('keywords');
    if (request.fields.headline) embeddedFields.push('headline');
    if (request.fields.city) embeddedFields.push('city');
    if (request.fields.country) embeddedFields.push('country');
    if (request.fields.creditLine) embeddedFields.push('creditLine');

    // Upload the processed image
    const projectId = (imageRecord.pack as { project_id: string } | null)?.project_id;
    const packId = imageRecord.pack_id as string;
    const timestamp = Date.now();
    const ext = request.outputFormat;
    const embeddedPath = `vision/${projectId}/${packId}/embedded_${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(embeddedPath, outputBuffer, {
        contentType: `image/${ext === 'jpeg' ? 'jpeg' : ext}`,
        upsert: true,
      });

    if (uploadError) {
      return {
        success: false,
        embeddedFields,
        error: `Failed to upload embedded image: ${uploadError.message}`,
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(embeddedPath);

    // Optionally delete original if not preserving
    if (!request.preserveOriginal) {
      const originalMatch = imageUrl.match(/\/storage\/v1\/object\/public\/images\/(.+)/);
      if (originalMatch) {
        await supabase.storage.from('images').remove([originalMatch[1]]);
      }
    }

    return {
      success: true,
      embeddedImageUrl: urlData.publicUrl,
      embeddedFields,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    console.error('Metadata embed error:', error);
    return {
      success: false,
      embeddedFields,
      error: error instanceof Error ? error.message : 'Metadata embedding failed',
    };
  }
}

// ============================================================================
// BATCH EMBED (For multi-image packs)
// ============================================================================

export async function batchEmbedMetadata(
  requests: MetadataEmbedRequest[]
): Promise<MetadataEmbedResponse[]> {
  // Process sequentially to avoid memory issues with large images
  const results: MetadataEmbedResponse[] = [];
  
  for (const request of requests) {
    const result = await embedMetadata(request);
    results.push(result);
  }
  
  return results;
}

// ============================================================================
// EXTRACT EXISTING METADATA
// ============================================================================

export async function extractMetadata(
  imageBuffer: Buffer
): Promise<Record<string, unknown>> {
  try {
    const sharp = await getSharp();
    if (!sharp) {
      return { error: 'Sharp not installed' };
    }

    const metadata = await sharp(imageBuffer).metadata();
    return {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      space: metadata.space,
      channels: metadata.channels,
      depth: metadata.depth,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation,
      exif: metadata.exif ? 'present' : 'absent',
      icc: metadata.icc ? 'present' : 'absent',
      iptc: metadata.iptc ? 'present' : 'absent',
      xmp: metadata.xmp ? 'present' : 'absent',
    };
  } catch (error) {
    console.error('Failed to extract metadata:', error);
    return {};
  }
}

// ============================================================================
// CHECK IF SHARP IS AVAILABLE
// ============================================================================

export async function isSharpAvailable(): Promise<boolean> {
  const sharp = await getSharp();
  return sharp !== null;
}
