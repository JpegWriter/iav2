/**
 * POST /api/fix/preview
 * 
 * Generates a preview of page improvements without publishing.
 * Returns original snapshot, proposed output, diff, and validation warnings.
 * Creates a draft version that can be published or discarded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  runPageFix,
  buildPageSnapshot,
  type PageFixRequest,
  type PreviewResponse,
  DEFAULT_GUARDRAILS,
  DEFAULT_VOICE_PROFILE,
} from '@/lib/pageFixWriter';
import { scorePageContent } from '@/lib/content-scorer';
import { generateFixBrief } from '@/lib/fix-brief/generator';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    
    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { projectId, pageId, taskId } = body;

    if (!projectId || !pageId) {
      return NextResponse.json(
        { error: 'projectId and pageId are required' },
        { status: 400 }
      );
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, root_url, name, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Fetch page data
    const { data: page, error: pageError } = await supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .eq('project_id', projectId)
      .single();

    if (pageError || !page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Check if page is locked
    if (page.fix_locked_until && new Date(page.fix_locked_until) > new Date()) {
      return NextResponse.json(
        { 
          error: 'Page is locked from fixes',
          lockedUntil: page.fix_locked_until,
        },
        { status: 423 }
      );
    }

    // Fetch user context for voice profile
    const { data: userContext } = await supabase
      .from('user_context')
      .select('*')
      .eq('project_id', projectId)
      .single();

    // Fetch internal link opportunities (other pages on site)
    const { data: sitePages } = await supabase
      .from('pages')
      .select('url, title, role, health_score')
      .eq('project_id', projectId)
      .neq('id', pageId)
      .order('health_score', { ascending: false })
      .limit(20);

    // Build page snapshot
    const originalSnapshot = buildPageSnapshot({
      url: page.url,
      title: page.title || page.seo_data?.title,
      meta_description: page.seo_data?.meta_description,
      h1: page.seo_data?.h1,
      headings: page.seo_data?.headings || [],
      body_html: page.body_html,
      cleaned_text: page.cleaned_text,
      images: page.images || [],
      links_in: page.internal_links_in || [],
      links_out: page.internal_links_out || [],
    });

    // Score content
    const contentScore = scorePageContent({
      url: page.url,
      title: page.title || page.seo_data?.title,
      metaDescription: page.seo_data?.meta_description,
      h1: page.seo_data?.h1,
      headings: page.seo_data?.headings || [],
      bodyText: page.cleaned_text || '',
      wordCount: (page.cleaned_text || '').split(/\s+/).length,
      focusKeyword: page.focus_keyword,
    });

    // Generate fix brief
    const fixBrief = generateFixBrief(
      page.url,
      page.title || 'Untitled',
      page.cleaned_text || '',
      contentScore,
      page.focus_keyword
    );

    // Build voice profile from user context
    const voiceProfile = userContext?.tone_profile 
      ? { ...DEFAULT_VOICE_PROFILE, ...userContext.tone_profile }
      : DEFAULT_VOICE_PROFILE;

    // Build guardrails
    const guardrails = {
      ...DEFAULT_GUARDRAILS,
      ...(userContext?.prohibited_phrases && {
        prohibitedPhrases: [...DEFAULT_GUARDRAILS.prohibitedPhrases, ...userContext.prohibited_phrases],
      }),
    };

    // Build internal link opportunities
    const internalLinkOpportunities = (sitePages || []).map(p => ({
      url: p.url,
      title: p.title || '',
      role: p.role || 'support',
      relevance: (p.health_score || 50) / 100,
    }));

    // Build business context
    const businessContext = userContext ? {
      businessName: userContext.business_name || project.name,
      location: userContext.location,
      yearsInBusiness: userContext.years_in_business,
      credentials: userContext.credentials || [],
      specialties: userContext.specialties || [],
    } : undefined;

    // Build fix request
    const fixRequest: PageFixRequest = {
      projectId,
      pageId,
      url: page.url,
      pageRole: page.role || 'support',
      originalSnapshot,
      fixBrief: {
        currentScore: fixBrief.currentScore,
        targetScore: fixBrief.targetScore,
        priority: fixBrief.priority,
        issues: fixBrief.fixSections.flatMap(section => 
          section.specificActions.map(action => ({
            category: section.category,
            severity: section.priority === 'critical' ? 'critical' : 
                     section.priority === 'high' ? 'warning' : 'info',
            title: section.categoryLabel,
            description: section.currentState,
            suggestedAction: action,
          }))
        ),
        successCriteria: fixBrief.successCriteria,
      },
      focusKeyword: page.focus_keyword,
      voiceProfile,
      guardrails,
      businessContext,
      internalLinkOpportunities,
    };

    // Run the fix generation
    const result = await runPageFix(fixRequest);

    if (!result.success || !result.output || !result.diff) {
      return NextResponse.json(
        { 
          error: result.error || 'Fix generation failed',
          validation: result.validation,
        },
        { status: 422 }
      );
    }

    // Get next version number
    const { data: lastVersion } = await supabase
      .from('page_fix_versions')
      .select('version')
      .eq('page_id', pageId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (lastVersion?.version || 0) + 1;

    // Delete any existing draft for this page
    await supabase
      .from('page_fix_versions')
      .delete()
      .eq('page_id', pageId)
      .eq('status', 'draft');

    // Save as draft version
    const { data: version, error: versionError } = await supabase
      .from('page_fix_versions')
      .insert({
        page_id: pageId,
        project_id: projectId,
        url: page.url,
        version: nextVersion,
        status: 'draft',
        original_snapshot: originalSnapshot,
        proposed_output: result.output,
        diff_summary: result.diff,
        validation_warnings: result.diff.warnings || [],
        created_by: user.id,
        fix_task_id: taskId || null,
      })
      .select()
      .single();

    if (versionError) {
      console.error('Failed to save version:', versionError);
      return NextResponse.json(
        { error: 'Failed to save preview version' },
        { status: 500 }
      );
    }

    // Update page fix status
    await supabase
      .from('pages')
      .update({ fix_status: 'in_progress' })
      .eq('id', pageId);

    // Build response
    const response: PreviewResponse = {
      success: true,
      versionId: version.id,
      original: originalSnapshot,
      proposed: result.output,
      diff: result.diff,
      warnings: result.diff.warnings || [],
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Preview generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
