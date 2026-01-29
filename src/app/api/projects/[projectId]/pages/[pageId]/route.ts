import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();

    // Get page with related data
    const { data: page, error: pageError } = await supabase
      .from('pages')
      .select(`
        *,
        audits (*),
        fix_items (*),
        briefs (*),
        tasks (*)
      `)
      .eq('id', params.pageId)
      .eq('project_id', params.projectId)
      .single();

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 404 });
    }

    // Get incoming links (pages linking to this page)
    const { data: linksIn } = await supabase
      .from('page_links')
      .select('from_url, anchor_text')
      .eq('to_page_id', params.pageId);

    // Get outgoing links (pages this page links to)
    const { data: linksOut } = await supabase
      .from('page_links')
      .select('to_url, anchor_text')
      .eq('from_page_id', params.pageId)
      .eq('is_internal', true);

    return NextResponse.json({
      data: {
        ...page,
        linksIn: linksIn || [],
        linksOut: linksOut || [],
      },
    });
  } catch (error) {
    console.error('Error fetching page:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const { data: page, error } = await supabase
      .from('pages')
      .update(body)
      .eq('id', params.pageId)
      .eq('project_id', params.projectId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: page });
  } catch (error) {
    console.error('Error updating page:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
