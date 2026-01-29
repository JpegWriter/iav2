import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const updateData: any = { ...body };
    
    // If marking as done, set completed_at
    if (body.status === 'done') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', params.taskId)
      .eq('project_id', params.projectId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Recalculate foundation score after task completion
    if (body.status === 'done') {
      await recalculateFoundationScore(supabase, params.projectId);
    }

    return NextResponse.json({ data: task });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; taskId: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', params.taskId)
      .eq('project_id', params.projectId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function recalculateFoundationScore(supabase: any, projectId: string) {
  // Get all pages with their health scores
  const { data: pages } = await supabase
    .from('pages')
    .select('health_score, role')
    .eq('project_id', projectId);

  if (!pages || pages.length === 0) return;

  // Weight by role (money pages count more)
  const roleWeights: Record<string, number> = {
    money: 3,
    trust: 2,
    support: 1,
  };

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const page of pages) {
    const weight = roleWeights[page.role] || 1;
    totalWeightedScore += (page.health_score || 0) * weight;
    totalWeight += weight;
  }

  const foundationScore = totalWeight > 0 
    ? Math.round(totalWeightedScore / totalWeight) 
    : 0;

  // Update project foundation score
  await supabase
    .from('projects')
    .update({ foundation_score: foundationScore })
    .eq('id', projectId);
}
