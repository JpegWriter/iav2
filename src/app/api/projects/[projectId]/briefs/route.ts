import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const adminClient = createAdminClient();

    // First get all page IDs for this project
    const { data: pages, error: pagesError } = await adminClient
      .from('pages')
      .select('id')
      .eq('project_id', params.projectId);

    if (pagesError) {
      return NextResponse.json({ error: pagesError.message }, { status: 400 });
    }

    const pageIds = pages?.map(p => p.id) || [];

    if (pageIds.length === 0) {
      return NextResponse.json({ data: [], stats: { total: 0, moneyPages: 0, trustPages: 0 } });
    }

    // Get briefs for those pages
    const { data: briefs, error } = await adminClient
      .from('briefs')
      .select(`
        *,
        page:pages(id, url, title, role, health_score, priority_rank)
      `)
      .in('page_id', pageIds)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Calculate stats
    const stats = {
      total: briefs?.length || 0,
      moneyPages: briefs?.filter(b => b.page?.role === 'money').length || 0,
      trustPages: briefs?.filter(b => b.page?.role === 'trust').length || 0,
      authorityPages: briefs?.filter(b => b.page?.role === 'authority').length || 0,
    };

    return NextResponse.json({ data: briefs, stats });
  } catch (error) {
    console.error('Error fetching briefs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
