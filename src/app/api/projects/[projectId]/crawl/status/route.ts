import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const adminClient = createAdminClient();

    // Get latest crawl run
    const { data: crawlRun } = await adminClient
      .from('crawl_runs')
      .select('*')
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!crawlRun) {
      return NextResponse.json({ 
        status: 'not_started',
        pagesFound: 0,
        pagesCrawled: 0,
        recentPages: [],
      });
    }

    // Get page count
    const { count: pageCount } = await adminClient
      .from('pages')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', params.projectId);

    // Get project status
    const { data: project } = await adminClient
      .from('projects')
      .select('status')
      .eq('id', params.projectId)
      .single();

    // Get the most recently crawled pages (up to 5 for the activity feed)
    const { data: recentPages } = await adminClient
      .from('pages')
      .select('url, title, role, priority_score, cleaned_text, word_count, h1')
      .eq('project_id', params.projectId)
      .order('crawled_at', { ascending: false })
      .limit(5);

    // Transform recent pages into snippets for the UI
    const pageSnippets = (recentPages || []).map(page => ({
      url: page.url,
      title: page.title || page.h1 || new URL(page.url).pathname,
      role: page.role || 'other',
      score: page.priority_score || 0,
      wordCount: page.word_count || 0,
      snippet: page.cleaned_text 
        ? page.cleaned_text.slice(0, 150).replace(/\n/g, ' ').trim() + '...'
        : '',
    }));

    // Determine status with more granular phases
    let status = 'crawling';
    let phase = 'crawling';
    
    if (project?.status === 'ready' || project?.status === 'auditing') {
      status = 'complete';
      phase = 'complete';
    } else if (crawlRun.status === 'complete' || crawlRun.status === 'completed') {
      status = 'complete';
      phase = 'complete';
    } else if (crawlRun.status === 'running') {
      status = 'crawling';
      const crawled = crawlRun.pages_crawled || 0;
      const found = crawlRun.pages_found || 0;
      
      if (crawled === 0) {
        phase = 'discovering';
      } else if (crawled < found * 0.3) {
        phase = 'crawling';
      } else if (crawled < found * 0.7) {
        phase = 'extracting';
      } else if (crawled < found) {
        phase = 'analyzing';
      } else {
        phase = 'ranking';
      }
    } else if (crawlRun.status === 'error' || crawlRun.status === 'failed') {
      status = 'error';
      phase = 'error';
    }

    const latestPage = recentPages?.[0];

    return NextResponse.json({
      status,
      phase,
      pagesFound: crawlRun.pages_found || pageCount || 0,
      pagesCrawled: crawlRun.pages_crawled || pageCount || 0,
      currentUrl: latestPage?.url,
      currentTitle: latestPage?.title || latestPage?.h1,
      currentRole: latestPage?.role,
      currentScore: latestPage?.priority_score,
      recentPages: pageSnippets,
      startedAt: crawlRun.started_at,
      error: crawlRun.error,
      // Include stats for display
      stats: {
        totalWords: (recentPages || []).reduce((sum, p) => sum + (p.word_count || 0), 0),
        avgScore: recentPages?.length 
          ? Math.round((recentPages.reduce((sum, p) => sum + (p.priority_score || 0), 0) / recentPages.length))
          : 0,
      }
    });
  } catch (error) {
    console.error('Error fetching crawl status:', error);
    return NextResponse.json(
      { error: 'Internal server error', status: 'error' },
      { status: 500 }
    );
  }
}
