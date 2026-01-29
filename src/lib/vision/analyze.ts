// ============================================================================
// VISION ANALYSIS SERVICE
// ============================================================================
// Analyzes images using OpenAI Vision API to extract structured evidence
// for the Growth Planner writing pipeline.
// ============================================================================

import OpenAI from 'openai';
import type {
  VisionEvidence,
  VisionEvidencePack,
  VisionEvidenceImage,
  VisionContextSnapshot,
  VisionAnalysisRequest,
  DetectedEntity,
  DetectedExpression,
  StoryAngle,
  TechnicalFlags,
  ComplianceNotes,
} from '@/types/visionEvidence';
import { createAdminClient } from '@/lib/supabase/server';

// ============================================================================
// DATABASE RECORD TYPES
// ============================================================================

interface VisionEvidenceImageRecord {
  id: string;
  pack_id: string;
  image_url: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  width: number;
  height: number;
  evidence: VisionEvidence;
  order_index: number;
  created_at: string;
}

interface VisionEvidencePackRecord {
  id: string;
  project_id: string;
  context_snapshot: VisionContextSnapshot;
  combined_narrative: string;
  primary_hero_image_id: string | null;
  cross_image_themes: string[];
  used_in_brief_ids: string[];
  used_in_task_ids: string[];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// OPENAI CLIENT
// ============================================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// VISION ANALYSIS PROMPT
// ============================================================================

const buildAnalysisPrompt = (context: VisionContextSnapshot): string => `
You are an expert image analyst for a content marketing platform. Analyze this image and extract structured data for use in writing briefs.

CONTEXT:
- Topic: ${context.topic}
- Primary Service: ${context.primaryService}
- Location: ${context.location || 'Not specified'}
- Brand Tone: ${context.brandTone.join(', ')}
- Target Audience: ${context.targetAudience}
- Content Intent: ${context.contentIntent}

Analyze the image and return a JSON object with the following structure:

{
  "sceneSummary": "2-3 sentence description of what's happening in the image",
  "sceneType": "work_in_progress|completed_project|team_at_work|equipment|before_after|customer_interaction|facility|product|other",
  "entities": [
    {
      "name": "entity name",
      "type": "person|object|location|equipment|vehicle|product|material|animal|other",
      "confidence": 0-100,
      "attributes": {"key": "value"}
    }
  ],
  "expressions": [
    {
      "emotion": "happy|focused|confident|satisfied|neutral|determined|collaborative",
      "confidence": 0-100,
      "personIndex": 0
    }
  ],
  "storyAngles": [
    {
      "angle": "Brief description of the story angle",
      "applicableContentTypes": ["blog", "social", "gmb", "case_study", "testimonial"],
      "suggestedHook": "Opening line suggestion",
      "emotionalAppeal": "What emotion this targets"
    }
  ],
  "heroSuitabilityScore": 0-100,
  "technicalFlags": {
    "resolution": "low|medium|high|excellent",
    "aspectRatio": "16:9",
    "lighting": "poor|acceptable|good|professional",
    "blur": "none|slight|moderate|severe",
    "noise": "none|slight|moderate|severe",
    "composition": "poor|acceptable|good|excellent",
    "webOptimized": true,
    "estimatedFileSizeMB": 0.0,
    "colorProfile": "sRGB|Adobe RGB|ProPhoto RGB|unknown",
    "hasTransparency": false,
    "warnings": []
  },
  "suggestedAlt": "Factual, screen-reader friendly alt text",
  "suggestedCaption": "Engaging, branded caption",
  "suggestedKeywords": ["keyword1", "keyword2"],
  "suggestedHashtags": ["#hashtag1", "#hashtag2"],
  "complianceNotes": {
    "hasIdentifiableFaces": false,
    "hasMinors": false,
    "hasLicensePlates": false,
    "hasBrandLogos": [],
    "hasText": [],
    "potentialIssues": [],
    "recommendedActions": [],
    "usageRisk": "low|medium|high"
  }
}

Return ONLY valid JSON, no markdown formatting.
`;

// ============================================================================
// ANALYZE SINGLE IMAGE
// ============================================================================

export async function analyzeImage(
  imageData: { base64?: string; url?: string },
  context: VisionContextSnapshot
): Promise<VisionEvidence> {
  // Build the image content
  const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart = imageData.base64
    ? {
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${imageData.base64}`,
          detail: 'high',
        },
      }
    : {
        type: 'image_url',
        image_url: {
          url: imageData.url!,
          detail: 'high',
        },
      };

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildAnalysisPrompt(context) },
          imageContent,
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  
  // Parse the JSON response
  let parsed: Record<string, unknown>;
  try {
    // Remove any markdown code block formatting if present
    const cleanedContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    parsed = JSON.parse(cleanedContent);
  } catch (e) {
    console.error('Failed to parse Vision API response:', e);
    parsed = {};
  }

  // Build structured VisionEvidence
  const evidence: VisionEvidence = {
    sceneSummary: (parsed.sceneSummary as string) || 'Image analysis unavailable',
    sceneType: (parsed.sceneType as VisionEvidence['sceneType']) || 'other',
    entities: (parsed.entities as DetectedEntity[]) || [],
    expressions: (parsed.expressions as DetectedExpression[]) || [],
    storyAngles: (parsed.storyAngles as StoryAngle[]) || [],
    heroSuitabilityScore: (parsed.heroSuitabilityScore as number) || 50,
    technicalFlags: (parsed.technicalFlags as TechnicalFlags) || getDefaultTechnicalFlags(),
    suggestedAlt: (parsed.suggestedAlt as string) || '',
    suggestedCaption: (parsed.suggestedCaption as string) || '',
    suggestedKeywords: (parsed.suggestedKeywords as string[]) || [],
    suggestedHashtags: (parsed.suggestedHashtags as string[]) || [],
    complianceNotes: (parsed.complianceNotes as ComplianceNotes) || getDefaultComplianceNotes(),
    rawAnalysisJson: parsed,
  };

  return evidence;
}

// ============================================================================
// ANALYZE MULTIPLE IMAGES (BUILD PACK)
// ============================================================================

export async function analyzeImagePack(
  request: VisionAnalysisRequest
): Promise<VisionEvidencePack> {
  const supabase = createAdminClient();
  
  // Analyze all images in parallel
  const analysisPromises = request.images.map(async (img, index) => {
    const evidence = await analyzeImage(
      { base64: img.base64, url: img.url },
      request.context
    );
    return { evidence, filename: img.filename, index };
  });

  const analysisResults = await Promise.all(analysisPromises);

  // Create the pack first (to get ID for images)
  const { data: packData, error: packError } = await supabase
    .from('vision_evidence_packs')
    .insert({
      project_id: request.projectId,
      context_snapshot: request.context,
      combined_narrative: '',
      cross_image_themes: [],
      used_in_brief_ids: [],
      used_in_task_ids: request.taskId ? [request.taskId] : [],
    })
    .select('id')
    .single();

  if (packError || !packData) {
    throw new Error(`Failed to create vision evidence pack: ${packError?.message}`);
  }

  const packId = packData.id;

  // Upload images and create image records
  const imageRecords: VisionEvidenceImage[] = [];
  
  for (const result of analysisResults) {
    const { evidence, filename, index } = result;
    const img = request.images[index];

    // Upload image to Supabase Storage
    let imageUrl = img.url;
    
    if (img.base64) {
      const buffer = Buffer.from(img.base64, 'base64');
      const storagePath = `vision/${request.projectId}/${packId}/${filename}`;
      
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(storagePath, buffer, {
          contentType: getMimeType(filename),
          upsert: true,
        });

      if (uploadError) {
        console.error(`Failed to upload image ${filename}:`, uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(storagePath);
      
      imageUrl = urlData.publicUrl;
    }

    // Insert image record
    const { data: imageData, error: imageError } = await supabase
      .from('vision_evidence_images')
      .insert({
        pack_id: packId,
        image_url: imageUrl,
        original_filename: filename,
        mime_type: getMimeType(filename),
        file_size_bytes: img.base64 ? Buffer.from(img.base64, 'base64').length : 0,
        width: 0, // Would need actual image processing to determine
        height: 0,
        evidence: evidence,
        order_index: index,
      })
      .select()
      .single();

    if (imageError || !imageData) {
      console.error(`Failed to create image record for ${filename}:`, imageError);
      continue;
    }

    imageRecords.push({
      id: imageData.id,
      packId,
      imageUrl: imageUrl || '',
      originalFilename: filename,
      mimeType: getMimeType(filename),
      fileSizeBytes: imageData.file_size_bytes,
      width: imageData.width,
      height: imageData.height,
      evidence,
      orderIndex: index,
      createdAt: imageData.created_at,
    });
  }

  // Find the best hero image
  const primaryHeroImageId = findBestHeroImage(imageRecords);

  // Extract cross-image themes
  const crossImageThemes = extractCrossImageThemes(imageRecords);

  // Generate combined narrative
  const combinedNarrative = generateCombinedNarrative(imageRecords, request.context);

  // Update pack with aggregated data
  await supabase
    .from('vision_evidence_packs')
    .update({
      primary_hero_image_id: primaryHeroImageId,
      cross_image_themes: crossImageThemes,
      combined_narrative: combinedNarrative,
    })
    .eq('id', packId);

  // Fetch the complete pack
  const { data: completePack } = await supabase
    .from('vision_evidence_packs')
    .select('*')
    .eq('id', packId)
    .single();

  return {
    id: packId,
    projectId: request.projectId,
    contextSnapshot: request.context,
    images: imageRecords,
    combinedNarrative,
    primaryHeroImageId,
    crossImageThemes,
    usedInBriefIds: [],
    usedInTaskIds: [],
    createdAt: completePack?.created_at || new Date().toISOString(),
    updatedAt: completePack?.updated_at || new Date().toISOString(),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDefaultTechnicalFlags(): TechnicalFlags {
  return {
    resolution: 'medium',
    aspectRatio: '16:9',
    lighting: 'acceptable',
    blur: 'none',
    noise: 'none',
    composition: 'acceptable',
    webOptimized: true,
    estimatedFileSizeMB: 0,
    colorProfile: 'sRGB',
    hasTransparency: false,
    warnings: [],
  };
}

function getDefaultComplianceNotes(): ComplianceNotes {
  return {
    hasIdentifiableFaces: false,
    hasMinors: false,
    hasLicensePlates: false,
    hasBrandLogos: [],
    hasText: [],
    potentialIssues: [],
    recommendedActions: [],
    usageRisk: 'low',
  };
}

function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    raw: 'image/raw',
    cr2: 'image/x-canon-cr2',
    nef: 'image/x-nikon-nef',
    arw: 'image/x-sony-arw',
  };
  return mimeTypes[ext || ''] || 'image/jpeg';
}

function findBestHeroImage(images: VisionEvidenceImage[]): string | null {
  if (images.length === 0) return null;
  
  // Sort by hero suitability score (descending)
  const sorted = [...images].sort(
    (a, b) => b.evidence.heroSuitabilityScore - a.evidence.heroSuitabilityScore
  );
  
  // Return the best one, but only if score is >= 60
  const best = sorted[0];
  if (best.evidence.heroSuitabilityScore >= 60) {
    return best.id;
  }
  
  return null;
}

function extractCrossImageThemes(images: VisionEvidenceImage[]): string[] {
  if (images.length <= 1) return [];
  
  // Collect all keywords from all images
  const allKeywords = images.flatMap(img => img.evidence.suggestedKeywords);
  
  // Count occurrences
  const counts: Record<string, number> = {};
  for (const keyword of allKeywords) {
    const normalized = keyword.toLowerCase().trim();
    counts[normalized] = (counts[normalized] || 0) + 1;
  }
  
  // Find themes that appear in at least 2 images
  const crossThemes = Object.entries(counts)
    .filter(([, count]) => count >= 2)
    .map(([keyword]) => keyword);
  
  return crossThemes.slice(0, 10); // Limit to top 10
}

function generateCombinedNarrative(
  images: VisionEvidenceImage[],
  context: VisionContextSnapshot
): string {
  if (images.length === 0) return '';
  
  if (images.length === 1) {
    return images[0].evidence.sceneSummary;
  }
  
  // Combine scene summaries
  const sceneTypes = images.map(img => img.evidence.sceneType);
  const uniqueSceneTypes = Array.from(new Set(sceneTypes));
  
  const narrative = images.length > 1
    ? `This image set (${images.length} images) showcases ${uniqueSceneTypes.join(' and ')} scenes for ${context.primaryService}. ${images.map((img, i) => `Image ${i + 1}: ${img.evidence.sceneSummary}`).join(' ')}`
    : images[0].evidence.sceneSummary;
  
  return narrative;
}

// ============================================================================
// GET PACK BY ID
// ============================================================================

export async function getVisionEvidencePack(packId: string): Promise<VisionEvidencePack | null> {
  const supabase = createAdminClient();
  
  const { data: pack, error: packError } = await supabase
    .from('vision_evidence_packs')
    .select('*')
    .eq('id', packId)
    .single();

  if (packError || !pack) {
    return null;
  }

  const { data: images, error: imagesError } = await supabase
    .from('vision_evidence_images')
    .select('*')
    .eq('pack_id', packId)
    .order('order_index', { ascending: true });

  if (imagesError) {
    console.error('Failed to fetch vision evidence images:', imagesError);
  }

  const imageRecords: VisionEvidenceImage[] = ((images || []) as VisionEvidenceImageRecord[]).map((img: VisionEvidenceImageRecord) => ({
    id: img.id,
    packId: img.pack_id,
    imageUrl: img.image_url,
    originalFilename: img.original_filename,
    mimeType: img.mime_type,
    fileSizeBytes: img.file_size_bytes,
    width: img.width,
    height: img.height,
    evidence: img.evidence as VisionEvidence,
    orderIndex: img.order_index,
    createdAt: img.created_at,
  }));

  return {
    id: pack.id,
    projectId: pack.project_id,
    contextSnapshot: pack.context_snapshot as VisionContextSnapshot,
    images: imageRecords,
    combinedNarrative: pack.combined_narrative,
    primaryHeroImageId: pack.primary_hero_image_id,
    crossImageThemes: pack.cross_image_themes,
    usedInBriefIds: pack.used_in_brief_ids,
    usedInTaskIds: pack.used_in_task_ids,
    createdAt: pack.created_at,
    updatedAt: pack.updated_at,
  };
}

// ============================================================================
// LIST PACKS BY PROJECT
// ============================================================================

export async function listVisionEvidencePacks(projectId: string): Promise<VisionEvidencePack[]> {
  const supabase = createAdminClient();
  
  const { data: packs, error } = await supabase
    .from('vision_evidence_packs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error || !packs) {
    return [];
  }

  const typedPacks = packs as VisionEvidencePackRecord[];

  // Fetch all images for all packs
  const packIds = typedPacks.map((p: VisionEvidencePackRecord) => p.id);
  const { data: allImages } = await supabase
    .from('vision_evidence_images')
    .select('*')
    .in('pack_id', packIds)
    .order('order_index', { ascending: true });

  const typedImages = (allImages || []) as VisionEvidenceImageRecord[];

  const imagesByPack: Record<string, VisionEvidenceImage[]> = {};
  for (const img of typedImages) {
    if (!imagesByPack[img.pack_id]) {
      imagesByPack[img.pack_id] = [];
    }
    imagesByPack[img.pack_id].push({
      id: img.id,
      packId: img.pack_id,
      imageUrl: img.image_url,
      originalFilename: img.original_filename,
      mimeType: img.mime_type,
      fileSizeBytes: img.file_size_bytes,
      width: img.width,
      height: img.height,
      evidence: img.evidence as VisionEvidence,
      orderIndex: img.order_index,
      createdAt: img.created_at,
    });
  }

  return typedPacks.map((pack: VisionEvidencePackRecord) => ({
    id: pack.id,
    projectId: pack.project_id,
    contextSnapshot: pack.context_snapshot as VisionContextSnapshot,
    images: imagesByPack[pack.id] || [],
    combinedNarrative: pack.combined_narrative,
    primaryHeroImageId: pack.primary_hero_image_id,
    crossImageThemes: pack.cross_image_themes,
    usedInBriefIds: pack.used_in_brief_ids,
    usedInTaskIds: pack.used_in_task_ids,
    createdAt: pack.created_at,
    updatedAt: pack.updated_at,
  }));
}
