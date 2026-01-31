// ============================================================================
// BUILD TASK CONTEXT PACK
// ============================================================================
// Creates a per-task context bundle for the writer orchestrator.
// Includes: master profile, task brief, vision packs, rewrite context
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { buildMasterProfile, getLatestMasterProfile } from './buildMasterProfile';
import type {
  TaskContextPack,
  WriterBrief,
  InternalLinkTarget,
  ImagePlan,
  RewriteContext,
  ProofAtom,
  MasterProfile,
  TaskContextPackRow,
} from './types';

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
  // Using SHA-256 hash, then formatting as UUID v4
  const hash = crypto.createHash('sha256').update(taskId).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface BuildContextPackInput {
  projectId: string;
  task: TaskInput;
  forceRefreshMasterProfile?: boolean;
}

export interface TaskInput {
  id: string;
  slug: string;
  title?: string;
  role: 'money' | 'support' | 'trust' | 'authority' | 'operational';
  intent?: 'buy' | 'compare' | 'trust' | 'learn';
  primaryService: string;
  location?: string;
  targetAudience?: string;
  targetKeyword?: string;
  secondaryKeywords?: string[];
  estimatedWords?: number;
  toneProfileId?: string;
  ctaType?: string;
  ctaTarget?: string;
  imagePackId?: string;
  mode?: 'create' | 'update';
  originalUrl?: string;
  requiredProofElements?: string[];
  requiredEEATSignals?: string[];
  // SEO drafts from plan-time refinement (source of truth)
  seoDrafts?: {
    seoTitleDraft: string;
    h1Draft: string;
    metaDescriptionDraft: string;
  };
  // Vision facts extracted from image analysis
  visionFacts?: string[];
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function buildTaskContextPack(
  input: BuildContextPackInput
): Promise<TaskContextPack> {
  const { projectId, task, forceRefreshMasterProfile } = input;
  const supabase = await createServerSupabaseClient();

  // Step 1: Get or build master profile
  let masterProfile: MasterProfile | null = null;
  
  if (forceRefreshMasterProfile) {
    masterProfile = await buildMasterProfile(projectId);
  } else {
    masterProfile = await getLatestMasterProfile(projectId);
    if (!masterProfile) {
      masterProfile = await buildMasterProfile(projectId);
    }
  }

  // Step 2: Determine mode
  const mode = task.mode || (task.originalUrl ? 'update' : 'create');

  // Step 3: Build writer brief from task
  const writerBrief = buildWriterBrief(task, masterProfile);

  // Step 4: Build internal linking plan
  const internalLinking = await buildInternalLinkingPlan(
    supabase,
    projectId,
    task,
    masterProfile
  );

  // Step 5: Build proof requirements
  const proofRequirements = buildProofRequirements(task, masterProfile);

  // Step 6: Build vision context if images are attached
  const visionContext = task.imagePackId
    ? await buildVisionContext(supabase, projectId, task.imagePackId, task)
    : undefined;

  // Step 7: Build rewrite context if mode is 'update'
  const rewriteContext = mode === 'update'
    ? await buildRewriteContext(supabase, projectId, task)
    : undefined;

  // Build the context pack (without metadata yet)
  const packContent = {
    mode,
    masterProfileId: masterProfile.id,
    masterProfileVersion: masterProfile.version,
    masterProfile,
    writerBrief,
    internalLinking,
    proofRequirements,
    visionContext,
    rewriteContext,
  };

  // Compute hash
  const contextHash = computeContextHash(packContent);

  // Convert task ID to UUID for database storage
  const dbTaskId = toDbTaskId(task.id);

  // Check if this exact pack already exists
  const existingPack = await findExistingPack(supabase, projectId, dbTaskId, contextHash);
  
  if (existingPack) {
    return existingPack.context_json;
  }

  // Create the full pack with metadata
  const fullPack: TaskContextPack = {
    id: crypto.randomUUID(),
    projectId,
    taskId: task.id, // Keep original task ID in the JSON for reference
    contextHash,
    generatedAt: new Date().toISOString(),
    ...packContent,
  };

  // Insert new pack
  const { error: insertError } = await supabase
    .from('task_context_packs')
    .insert({
      id: fullPack.id,
      project_id: projectId,
      task_id: dbTaskId, // Use converted UUID for database
      mode,
      original_url: task.originalUrl || null,
      original_content: rewriteContext?.originalContent || null,
      context_json: fullPack,
      context_hash: contextHash,
      master_profile_id: masterProfile.id,
      generated_at: fullPack.generatedAt,
    });

  if (insertError) {
    // If duplicate error, fetch existing
    if (insertError.code === '23505') {
      const existing = await findExistingPack(supabase, projectId, dbTaskId, contextHash);
      if (existing) {
        return existing.context_json;
      }
    }
    throw new Error(`Failed to insert context pack: ${insertError.message}`);
  }

  return fullPack;
}

// ============================================================================
// BUILDER FUNCTIONS
// ============================================================================

function buildWriterBrief(task: TaskInput, masterProfile: MasterProfile): WriterBrief {
  return {
    slug: task.slug,
    role: task.role,
    intent: task.intent || inferIntent(task.role),
    primaryService: task.primaryService,
    location: task.location || masterProfile.business.locations[0],
    targetAudience: task.targetAudience || masterProfile.audience.primary,
    targetKeyword: task.targetKeyword || buildDefaultKeyword(task, masterProfile),
    secondaryKeywords: task.secondaryKeywords || [],
    estimatedWords: task.estimatedWords || getDefaultWordCount(task.role),
    toneProfileId: task.toneProfileId || masterProfile.brandVoice.toneProfileId,
    ctaType: task.ctaType || getDefaultCtaType(task.role),
    ctaTarget: task.ctaTarget || '/contact',
    // SEO drafts from plan-time refinement (source of truth)
    seoDrafts: task.seoDrafts,
    // Vision facts from image analysis
    visionFacts: task.visionFacts,
    // Enforce SEO drafts by default
    enforceSeoDrafts: true,
  };
}

function inferIntent(role: string): 'buy' | 'compare' | 'trust' | 'learn' {
  switch (role) {
    case 'money':
      return 'buy';
    case 'trust':
      return 'trust';
    case 'authority':
      return 'learn';
    default:
      return 'learn';
  }
}

function buildDefaultKeyword(task: TaskInput, masterProfile: MasterProfile): string {
  const parts = [task.primaryService];
  if (task.location) {
    parts.push(task.location);
  } else if (masterProfile.business.locations[0]) {
    parts.push(masterProfile.business.locations[0]);
  }
  return parts.join(' ').toLowerCase();
}

function getDefaultWordCount(role: string): number {
  switch (role) {
    case 'money':
      return 2000;
    case 'trust':
      return 1500;
    case 'authority':
      return 2500;
    case 'support':
      return 1200;
    default:
      return 1500;
  }
}

function getDefaultCtaType(role: string): string {
  switch (role) {
    case 'money':
      return 'quote_request';
    case 'trust':
      return 'contact';
    case 'support':
      return 'related_service';
    default:
      return 'contact';
  }
}

async function buildInternalLinkingPlan(
  supabase: any,
  projectId: string,
  task: TaskInput,
  masterProfile: MasterProfile
): Promise<TaskContextPack['internalLinking']> {
  // Get money pages for uplinks
  const upLinks: InternalLinkTarget[] = masterProfile.siteMap.moneyPages
    .slice(0, 3)
    .map((page) => ({
      url: page.url,
      title: page.title,
      role: page.role,
      priorityScore: page.priorityScore,
      anchorSuggestion: page.title,
      required: task.role === 'support',
      context: 'Link to primary service page',
    }));

  // Get support pages for downlinks
  const downLinks: InternalLinkTarget[] = masterProfile.siteMap.supportPages
    .filter((p) => p.url !== `/${task.slug}`)
    .slice(0, 5)
    .map((page) => ({
      url: page.url,
      title: page.title,
      role: page.role,
      priorityScore: page.priorityScore,
      anchorSuggestion: page.title,
      required: false,
      context: 'Link to related support content',
    }));

  // Get related pages for sidelinks
  const sideLinks: InternalLinkTarget[] = masterProfile.siteMap.trustPages
    .slice(0, 2)
    .map((page) => ({
      url: page.url,
      title: page.title,
      role: page.role,
      priorityScore: page.priorityScore,
      anchorSuggestion: page.title,
      required: false,
      context: 'Link to trust-building content',
    }));

  // Required anchors based on services
  const requiredAnchors = [
    masterProfile.business.primaryService,
    ...masterProfile.business.allServices.slice(0, 2),
  ].filter(Boolean);

  return {
    upLinks,
    downLinks,
    sideLinks,
    requiredAnchors,
  };
}

function buildProofRequirements(
  task: TaskInput,
  masterProfile: MasterProfile
): TaskContextPack['proofRequirements'] {
  // Default proof elements based on role
  const defaultProofElements = getDefaultProofElements(task.role);
  const requiredProofElements = (task.requiredProofElements || defaultProofElements) as any[];

  // Default EEAT signals based on role
  const defaultEEAT = getDefaultEEATSignals(task.role);
  const requiredEEATSignals = (task.requiredEEATSignals || defaultEEAT) as any[];

  // Filter proof atoms that match requirements
  const selectedProofAtoms = masterProfile.proofAtoms
    .filter((atom) => {
      // Include if high priority
      if (atom.priority >= 80) return true;
      // Include if type matches proof elements
      if (requiredProofElements.includes(atom.type)) return true;
      // Include if suitable for WordPress
      if (atom.channels.includes('wp')) return true;
      return false;
    })
    .slice(0, 10);

  return {
    requiredProofElements,
    requiredEEATSignals,
    selectedProofAtoms,
  };
}

function getDefaultProofElements(role: string): string[] {
  switch (role) {
    case 'money':
      return ['review_quote', 'guarantee', 'testimonial', 'case_study_reference'];
    case 'trust':
      return ['testimonial', 'case_study_reference', 'before_after', 'award_mention'];
    case 'authority':
      return ['statistic', 'case_study_reference', 'certification_badge'];
    default:
      return ['review_quote', 'statistic'];
  }
}

function getDefaultEEATSignals(role: string): string[] {
  switch (role) {
    case 'money':
      return ['years_active', 'credentials', 'local_presence', 'client_count'];
    case 'trust':
      return ['case_studies', 'awards', 'certifications', 'projects_completed'];
    case 'authority':
      return ['publications', 'speaking_engagements', 'industry_memberships'];
    default:
      return ['years_active', 'local_presence'];
  }
}

async function buildVisionContext(
  supabase: any,
  projectId: string,
  imagePackId: string,
  task: TaskInput
): Promise<TaskContextPack['visionContext'] | undefined> {
  // Fetch the vision pack
  const { data: pack } = await supabase
    .from('vision_evidence_packs')
    .select('*')
    .eq('id', imagePackId)
    .single();

  if (!pack) return undefined;

  // Fetch images in the pack
  const { data: images } = await supabase
    .from('vision_evidence_images')
    .select('*')
    .eq('pack_id', imagePackId)
    .order('created_at', { ascending: true });

  if (!images || images.length === 0) return undefined;

  // Score and select hero image
  const heroImage = selectHeroImage(images, task);
  
  // Select inline images (exclude hero)
  const inlineImages = images
    .filter((img: any) => img.id !== heroImage?.imageId)
    .slice(0, 4)
    .map((img: any, index: number) => buildImagePlan(img, 'inline', index));

  return {
    packId: imagePackId,
    packNarrative: pack.combined_narrative || '',
    heroImage: heroImage ? heroImage : undefined,
    inlineImages,
    crossImageThemes: pack.cross_image_themes || [],
  };
}

function selectHeroImage(images: any[], task: TaskInput): ImagePlan | undefined {
  if (images.length === 0) return undefined;

  // Score each image
  const scored = images.map((img) => {
    const evidence = img.evidence || {};
    let score = evidence.heroSuitabilityScore || 50;
    
    // Boost for technical quality
    if (evidence.technicalFlags?.resolution === 'high') score += 10;
    if (evidence.technicalFlags?.composition === 'excellent') score += 10;
    
    // Boost for emotional impact
    if (evidence.emotionalAppeal === 'trust') score += 15;
    if (evidence.emotionalAppeal === 'confidence') score += 10;

    return { img, score };
  });

  // Sort by score and pick best
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  return buildImagePlan(best.img, 'hero', 0);
}

function buildImagePlan(img: any, placement: 'hero' | 'section' | 'inline', index: number): ImagePlan {
  const evidence = img.evidence || {};
  
  return {
    imageId: img.id,
    imageUrl: img.image_url,
    placement,
    sectionHint: placement === 'inline' ? `After section ${index + 1}` : undefined,
    alt: evidence.suggestedAlt || img.original_filename || 'Image',
    caption: evidence.suggestedCaption,
    title: evidence.suggestedAlt || img.original_filename || 'Image',
    suggestedFilename: buildSeoFilename(img, evidence),
    technicalScore: evidence.technicalFlags?.overallScore || 70,
    emotionalScore: evidence.heroSuitabilityScore || 50,
  };
}

function buildSeoFilename(img: any, evidence: any): string {
  if (evidence.suggestedKeywords?.length > 0) {
    return evidence.suggestedKeywords[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '.jpg';
  }
  return img.original_filename || 'image.jpg';
}

async function buildRewriteContext(
  supabase: any,
  projectId: string,
  task: TaskInput
): Promise<RewriteContext | undefined> {
  if (!task.originalUrl) return undefined;

  // Fetch the existing page from crawl data
  const { data: page } = await supabase
    .from('pages')
    .select('*')
    .eq('project_id', projectId)
    .eq('url', task.originalUrl)
    .single();

  if (!page) {
    // Try by path
    const path = new URL(task.originalUrl, 'http://placeholder').pathname;
    const { data: pageByPath } = await supabase
      .from('pages')
      .select('*')
      .eq('project_id', projectId)
      .eq('path', path)
      .single();
    
    if (!pageByPath) return undefined;
    Object.assign(page || {}, pageByPath);
  }

  // Fetch incoming link anchors
  const { data: incomingLinks } = await supabase
    .from('page_links')
    .select('anchor_text')
    .eq('to_url', task.originalUrl)
    .limit(20);

  const incomingLinkAnchors = (incomingLinks || [])
    .map((l: any) => l.anchor_text)
    .filter(Boolean);

  return {
    originalUrl: task.originalUrl,
    originalTitle: page?.title || '',
    originalH1: page?.h1 || '',
    originalMeta: page?.meta_description,
    originalContent: page?.content_text || '', // Assumes crawl stores cleaned text
    originalWordCount: page?.word_count || 0,
    internalLinksIn: page?.internal_links_in || 0,
    internalLinksOut: page?.internal_links_out || 0,
    incomingLinkAnchors,
    preserveElements: [],  // Can be populated from task config
    removeElements: [],    // Can be populated from task config
    currentHealthScore: page?.health_score,
    currentIssues: page?.issues || [],
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function computeContextHash(content: any): string {
  const stableJson = JSON.stringify(content, Object.keys(content).sort());
  return crypto.createHash('sha256').update(stableJson).digest('hex').slice(0, 32);
}

async function findExistingPack(
  supabase: any,
  projectId: string,
  taskId: string,
  contextHash: string
): Promise<TaskContextPackRow | null> {
  const { data } = await supabase
    .from('task_context_packs')
    .select('*')
    .eq('project_id', projectId)
    .eq('task_id', taskId)
    .eq('context_hash', contextHash)
    .single();
  
  return data;
}

// ============================================================================
// GET CONTEXT PACK BY ID
// ============================================================================

export async function getContextPackById(packId: string): Promise<TaskContextPack | null> {
  const supabase = await createServerSupabaseClient();
  
  const { data } = await supabase
    .from('task_context_packs')
    .select('*')
    .eq('id', packId)
    .single();
  
  return data?.context_json || null;
}

// ============================================================================
// GET LATEST CONTEXT PACK FOR TASK
// ============================================================================

export async function getLatestContextPackForTask(
  projectId: string,
  taskId: string
): Promise<TaskContextPack | null> {
  const supabase = await createServerSupabaseClient();
  
  const { data } = await supabase
    .from('task_context_packs')
    .select('*')
    .eq('project_id', projectId)
    .eq('task_id', taskId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();
  
  return data?.context_json || null;
}
