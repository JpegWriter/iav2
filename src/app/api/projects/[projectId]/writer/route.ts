import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

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
      pageId,
      publishingTargets = { wordpress: true, linkedin: false, gmb: false, reddit: false },
      toneProfileId = 'friendly-expert',
      toneOverrides = null,
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

    // Fetch user context
    const { data: userContext } = await adminClient
      .from('user_context')
      .select('*')
      .eq('project_id', projectId)
      .single();

    // Fetch task if provided
    let task = null;
    if (taskId) {
      const { data: taskData } = await adminClient
        .from('tasks')
        .select('*, briefs(*)')
        .eq('id', taskId)
        .single();
      task = taskData;
    }

    // Fetch page if provided
    let page = null;
    if (pageId) {
      const { data: pageData } = await adminClient
        .from('pages')
        .select('*')
        .eq('id', pageId)
        .single();
      page = pageData;
    }

    // Fetch beads for proof context
    const { data: beads } = await adminClient
      .from('beads')
      .select('*')
      .eq('project_id', projectId)
      .order('priority', { ascending: false });

    // Fetch reviews
    const { data: reviews } = await adminClient
      .from('reviews')
      .select('*')
      .eq('project_id', projectId)
      .order('rating', { ascending: false })
      .limit(10);

    // Fetch vision evidence
    const { data: visionPacks } = await adminClient
      .from('vision_evidence_packs')
      .select('*, vision_evidence_images(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1);

    // Build the job config
    const jobConfig = buildJobConfig({
      project,
      userContext,
      task,
      page,
      beads: beads || [],
      reviews: reviews || [],
      visionPacks: visionPacks || [],
      publishingTargets,
    });

    // Create the writer job
    const { data: writerJob, error: jobError } = await adminClient
      .from('writer_jobs')
      .insert({
        project_id: projectId,
        task_id: taskId || null,
        page_id: pageId || null,
        job_config: jobConfig,
        target_wordpress: publishingTargets.wordpress ?? true,
        target_linkedin: publishingTargets.linkedin ?? false,
        target_gmb: publishingTargets.gmb ?? false,
        target_reddit: publishingTargets.reddit ?? false,
        tone_profile_id: toneProfileId,
        tone_overrides: toneOverrides,
        status: 'pending',
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

    // Queue the job for processing (in production, this would go to a job queue)
    // For now, we'll just return the created job
    // The actual processing would be handled by a separate worker

    return NextResponse.json({
      data: writerJob,
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
// HELPER FUNCTIONS
// ============================================================================

interface BuildJobConfigParams {
  project: any;
  userContext: any;
  task: any;
  page: any;
  beads: any[];
  reviews: any[];
  visionPacks: any[];
  publishingTargets: {
    wordpress?: boolean;
    linkedin?: boolean;
    gmb?: boolean;
    reddit?: boolean;
  };
}

function buildJobConfig(params: BuildJobConfigParams) {
  const {
    project,
    userContext,
    task,
    page,
    beads,
    reviews,
    visionPacks,
    publishingTargets,
  } = params;

  // Build task configuration
  const taskConfig = buildTaskConfig(task, page);

  // Build user context
  const userContextConfig = buildUserContext(userContext);

  // Build site context
  const siteContextConfig = buildSiteContext(project);

  // Build proof context
  const proofContextConfig = buildProofContext(beads || [], reviews || []);

  // Build vision context
  const visionContextConfig = buildVisionContext(visionPacks || []);

  return {
    task: taskConfig,
    userContext: userContextConfig,
    siteContext: siteContextConfig,
    proofContext: proofContextConfig,
    visionContext: visionContextConfig,
    publishingTargets,
  };
}

function buildTaskConfig(task: any, page: any) {
  // Determine page role
  const role = page?.role || task?.page?.role || 'support';
  
  // Determine primary service from task or page
  const primaryService = 
    task?.briefs?.[0]?.human_brief_md?.match(/Primary Service:\s*(.+)/)?.[1] ||
    page?.title ||
    'General Service';

  // Build internal links from page links
  const upLinks: any[] = [];
  const downLinks: any[] = [];
  const siblingLinks: any[] = [];

  // Build WordPress constraints from defaults
  const wordpress = {
    maxBlocks: 60,
    maxHtmlBytes: 50000,
    excerptLength: 155,
    targetWordCount: 1200,
    maxTableRows: 8,
    maxH2Count: 10,
  };

  // Determine required proof elements based on page role
  const requiredProofElements: string[] = [];
  const requiredEEATSignals: string[] = [];

  if (role === 'money' || role === 'trust') {
    requiredProofElements.push('testimonial', 'credential');
    requiredEEATSignals.push('expertise', 'trustworthiness');
  }

  // Build media requirements
  const mediaRequirements = {
    heroRequired: true,
    inlineImagesMin: 2,
    inlineImagesMax: 5,
    preferredAspectRatio: '16:9',
  };

  return {
    role,
    intent: determineIntent(role, task),
    primaryService,
    supportsPage: null, // Would be filled for support pages
    supportType: null,
    internalLinks: {
      upLinks,
      downLinks,
      siblingLinks,
    },
    mediaRequirements,
    wordpress,
    requiredProofElements,
    requiredEEATSignals,
  };
}

function determineIntent(role: string, task: any): string {
  switch (role) {
    case 'money':
      return 'transactional';
    case 'trust':
      return 'trust-building';
    case 'authority':
      return 'informational';
    case 'support':
    default:
      return 'informational';
  }
}

function buildUserContext(userContext: any) {
  if (!userContext) {
    return null;
  }

  const business = userContext.business || {};
  const audience = userContext.audience || {};
  const offers = userContext.offers || {};
  const brandVoice = userContext.brand_voice || {};

  return {
    businessName: business.name,
    industry: business.industry,
    location: business.location?.fullAddress || business.location?.city,
    services: offers.products || offers.services || [],
    targetAudience: audience.targetAudience || [],
    uniqueValueProps: business.uniqueValueProps || [],
    yearsInBusiness: business.yearsInBusiness,
    certifications: business.certifications || [],
    tonePreference: brandVoice.toneProfile || 'friendly-expert',
  };
}

function buildSiteContext(project: any) {
  return {
    domain: extractDomain(project.root_url),
    primaryService: project.settings?.primaryService || null,
    serviceAreas: project.settings?.serviceAreas || [],
    existingPages: [], // Would be populated from pages table
    landmarks: project.settings?.landmarks || [],
  };
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function buildProofContext(beads: any[], reviews: any[]) {
  const proofContext: any = {
    reviews: [],
    caseStudies: [],
    credentials: [],
    stats: [],
    eeatSignals: [],
  };

  // Map reviews
  proofContext.reviews = (reviews || []).map((r: any) => ({
    text: r.text,
    author: r.author,
    rating: r.rating,
    source: r.source,
    date: r.date,
  }));

  // Map beads to appropriate categories
  for (const bead of beads || []) {
    switch (bead.type) {
      case 'proof':
        proofContext.stats.push({
          label: bead.label,
          value: bead.value,
        });
        break;
      case 'authority':
        proofContext.credentials.push({
          name: bead.label,
          issuer: null,
          year: null,
        });
        proofContext.eeatSignals.push({
          type: 'expertise',
          description: `${bead.label}: ${bead.value}`,
          source: bead.source?.ref || 'bead',
        });
        break;
      case 'differentiator':
        proofContext.eeatSignals.push({
          type: 'trustworthiness',
          description: `${bead.label}: ${bead.value}`,
          source: 'bead',
        });
        break;
      case 'local':
        if (bead.local_signals) {
          proofContext.eeatSignals.push({
            type: 'experience',
            description: bead.value,
            source: 'local-signal',
          });
        }
        break;
    }
  }

  return proofContext;
}

function buildVisionContext(visionPacks: any[]) {
  if (!visionPacks || visionPacks.length === 0) {
    return [];
  }

  const latestPack = visionPacks[0];
  const images = latestPack.vision_evidence_images || [];

  return images.map((img: any) => {
    const evidence = img.evidence || {};
    return {
      assetRef: img.id,
      description: evidence.description || '',
      subjects: evidence.subjects || [],
      mood: evidence.mood || '',
      technicalQuality: evidence.technical_quality || 'good',
      suggestedKeywords: evidence.keywords || [],
      recommendedUse: evidence.recommended_use || 'general',
      imageUrl: img.image_url,
    };
  });
}
