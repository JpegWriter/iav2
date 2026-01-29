import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';

/**
 * GET - Export all page data for a project
 * Returns structured JSON that can be sent to external backend
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify project access
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', params.projectId)
      .eq('user_id', user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get all pages with content
    const { data: pages } = await supabase
      .from('pages')
      .select('*')
      .eq('project_id', params.projectId)
      .order('priority_rank', { ascending: true });

    // Get user context
    const { data: context } = await supabase
      .from('user_context')
      .select('*')
      .eq('project_id', params.projectId)
      .single();

    // Get beads
    const { data: beads } = await supabase
      .from('beads')
      .select('*')
      .eq('project_id', params.projectId);

    // Structure export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        rootUrl: project.root_url,
        status: project.status,
        createdAt: project.created_at,
      },
      summary: {
        totalPages: pages?.length || 0,
        totalWords: pages?.reduce((sum, p) => sum + (p.word_count || 0), 0) || 0,
        pagesByRole: {
          money: pages?.filter(p => p.role === 'money').length || 0,
          trust: pages?.filter(p => p.role === 'trust').length || 0,
          support: pages?.filter(p => p.role === 'support').length || 0,
        },
      },
      pages: pages?.map(p => ({
        id: p.id,
        url: p.url,
        path: p.path,
        title: p.title,
        h1: p.h1,
        metaDescription: p.meta_description,
        wordCount: p.word_count,
        role: p.role,
        priorityRank: p.priority_rank,
        priorityScore: p.priority_score,
        cleanedText: p.cleaned_text, // Full content for AI context
        crawledAt: p.crawled_at,
      })) || [],
      context: context || null,
      beads: beads || [],
    };

    return NextResponse.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST - Push data to external backend
 * Sends all page data to a specified webhook URL
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { webhookUrl, apiKey } = body;

    if (!webhookUrl) {
      return NextResponse.json({ error: 'webhookUrl is required' }, { status: 400 });
    }

    // Get export data (reuse GET logic)
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', params.projectId)
      .eq('user_id', user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { data: pages } = await supabase
      .from('pages')
      .select('*')
      .eq('project_id', params.projectId)
      .order('priority_rank', { ascending: true });

    const { data: context } = await supabase
      .from('user_context')
      .select('*')
      .eq('project_id', params.projectId)
      .single();

    const { data: beads } = await supabase
      .from('beads')
      .select('*')
      .eq('project_id', params.projectId);

    const exportData = {
      exportedAt: new Date().toISOString(),
      source: 'sitefix-planner',
      project: {
        id: project.id,
        name: project.name,
        rootUrl: project.root_url,
      },
      summary: {
        totalPages: pages?.length || 0,
        totalWords: pages?.reduce((sum, p) => sum + (p.word_count || 0), 0) || 0,
      },
      pages: pages?.map(p => ({
        id: p.id,
        url: p.url,
        path: p.path,
        title: p.title,
        h1: p.h1,
        metaDescription: p.meta_description,
        wordCount: p.word_count,
        role: p.role,
        priorityRank: p.priority_rank,
        cleanedText: p.cleaned_text,
        crawledAt: p.crawled_at,
      })) || [],
      context: context || null,
      beads: beads || [],
    };

    // Send to external backend
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(exportData),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: 'Failed to push to external backend',
        status: response.status,
        details: errorText,
      }, { status: 502 });
    }

    const result = await response.json().catch(() => ({ success: true }));

    return NextResponse.json({
      success: true,
      message: 'Data pushed to external backend',
      pagesExported: pages?.length || 0,
      wordsExported: pages?.reduce((sum, p) => sum + (p.word_count || 0), 0) || 0,
      externalResponse: result,
    });
  } catch (error) {
    console.error('Error pushing to external backend:', error);
    return NextResponse.json(
      { error: 'Failed to push data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
