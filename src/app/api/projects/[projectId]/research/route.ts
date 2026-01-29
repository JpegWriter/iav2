import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { runSiteResearch, researchGapsToPageGaps, ResearchReport, ResearchBusinessContext } from '@/lib/research';

// ============================================================================
// POST /api/projects/[projectId]/research
// Run deep research on the project's website
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = createAdminClient();

  try {
    // Get project details
    const { data: project, error: projectError } = await supabase
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

    if (!project.website_url) {
      return NextResponse.json(
        { error: 'Project has no website URL configured' },
        { status: 400 }
      );
    }

    // Parse request options
    const body = await request.json().catch(() => ({}));
    const { 
      maxPages = 50, 
      excludePatterns = [],
      useAI = true,
    } = body;

    // Build business reality from project context
    const businessContext = project.business_context || {};
    const businessReality: ResearchBusinessContext = {
      name: project.name || businessContext.business_name || 'Business',
      niche: businessContext.niche || businessContext.industry || 'services',
      coreServices: businessContext.coreServices || businessContext.services || [],
      primaryLocations: businessContext.primaryLocations || businessContext.locations || [],
      reviewThemes: businessContext.reviewThemes || [],
      differentiators: businessContext.differentiators || [],
      volumeIndicators: businessContext.volumeIndicators || [],
      scenarioProof: businessContext.scenarioProof || [],
      yearsActive: businessContext.yearsActive || businessContext.years_active,
    };

    console.log(`[Research API] Starting research for project ${projectId}`);
    console.log(`[Research API] Website: ${project.website_url}`);
    console.log(`[Research API] Business: ${businessReality.name}`);

    // Run research
    const report = await runSiteResearch(
      project.website_url,
      businessReality,
      {
        maxPages,
        excludePatterns: excludePatterns.map((p: string) => new RegExp(p)),
        openaiApiKey: useAI ? process.env.OPENAI_API_KEY : undefined,
        useJinaReader: true,
      }
    );

    // Store report in database
    const { data: savedReport, error: saveError } = await supabase
      .from('research_reports')
      .upsert({
        project_id: projectId,
        site_url: report.siteUrl,
        analyzed_at: report.analyzedAt,
        total_pages: report.totalPages,
        pages_by_role: report.pagesByRole,
        keywords: report.keywords,
        topic_clusters: report.topicClusters,
        content_gaps: report.contentGaps,
        heading_suggestions: report.headingSuggestions,
        thin_content_pages: report.thinContentPages,
        orphaned_pages: report.orphanedPages,
        duplicate_topics: report.duplicateTopics,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'project_id',
      })
      .select()
      .single();

    if (saveError) {
      console.error('[Research API] Failed to save report:', saveError);
      // Continue anyway - return the report even if save failed
    }

    // Return summary with full report
    return NextResponse.json({
      success: true,
      reportId: savedReport?.id || null,
      summary: {
        totalPages: report.totalPages,
        pagesByRole: report.pagesByRole,
        keywordsFound: report.keywords.length,
        gapsIdentified: report.contentGaps.length,
        headingSuggestions: report.headingSuggestions.length,
        qualityIssues: {
          thinContent: report.thinContentPages.length,
          orphanedPages: report.orphanedPages.length,
          duplicateTopics: report.duplicateTopics.length,
        },
      },
      report,
    });
  } catch (error) {
    console.error('[Research API] Error:', error);
    return NextResponse.json(
      { error: 'Research failed', details: String(error) },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET /api/projects/[projectId]/research
// Get the latest research report for a project
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = createAdminClient();

  try {
    const { data: report, error } = await supabase
      .from('research_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !report) {
      return NextResponse.json(
        { error: 'No research report found for this project' },
        { status: 404 }
      );
    }

    // Parse JSONB fields
    const parsedReport: ResearchReport = {
      siteUrl: report.site_url,
      analyzedAt: report.analyzed_at,
      totalPages: report.total_pages,
      pagesByRole: report.pages_by_role,
      keywords: report.keywords,
      topicClusters: report.topic_clusters,
      contentGaps: report.content_gaps,
      headingSuggestions: report.heading_suggestions,
      thinContentPages: report.thin_content_pages,
      orphanedPages: report.orphaned_pages,
      duplicateTopics: report.duplicate_topics,
    };

    return NextResponse.json({
      success: true,
      reportId: report.id,
      createdAt: report.created_at,
      updatedAt: report.updated_at,
      report: parsedReport,
    });
  } catch (error) {
    console.error('[Research API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve research report' },
      { status: 500 }
    );
  }
}
