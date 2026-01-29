import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');

    // Get tasks with page info
    let query = adminClient
      .from('tasks')
      .select(`
        *,
        page:pages(id, url, title, role, health_score, priority_rank)
      `)
      .eq('project_id', params.projectId)
      .order('priority_rank', { ascending: true })
      .order('created_at', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error('Tasks fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Get fix items for each task's page to determine severity
    const enrichedTasks = await Promise.all((tasks || []).map(async (task) => {
      if (task.page_id) {
        const { data: fixItems } = await adminClient
          .from('fix_items')
          .select('severity, title, description, category')
          .eq('page_id', task.page_id)
          .order('severity', { ascending: true })
          .limit(5);

        // Determine task severity from its fix items
        const hasCritical = fixItems?.some(f => f.severity === 'critical');
        const hasWarning = fixItems?.some(f => f.severity === 'warning');
        
        return {
          ...task,
          severity: hasCritical ? 'critical' : hasWarning ? 'warning' : 'info',
          fixItems: fixItems || [],
          topIssue: fixItems?.[0]?.title || null,
        };
      }
      return { ...task, severity: 'info', fixItems: [], topIssue: null };
    }));

    // Filter by severity if requested
    const filteredTasks = severity 
      ? enrichedTasks.filter(t => t.severity === severity)
      : enrichedTasks;

    // Calculate stats
    const stats = {
      total: filteredTasks.length,
      queued: filteredTasks.filter(t => t.status === 'queued').length,
      inProgress: filteredTasks.filter(t => ['assigned', 'draft_ready'].includes(t.status)).length,
      inReview: filteredTasks.filter(t => t.status === 'review_ready').length,
      completed: filteredTasks.filter(t => ['publish_ready', 'published'].includes(t.status)).length,
      critical: filteredTasks.filter(t => t.severity === 'critical').length,
      warning: filteredTasks.filter(t => t.severity === 'warning').length,
    };

    return NextResponse.json({ data: filteredTasks, stats });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        ...body,
        project_id: params.projectId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: task });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
