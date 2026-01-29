import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; beadId: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const { data: bead, error } = await supabase
      .from('beads')
      .update(body)
      .eq('id', params.beadId)
      .eq('project_id', params.projectId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: bead });
  } catch (error) {
    console.error('Error updating bead:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; beadId: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('beads')
      .delete()
      .eq('id', params.beadId)
      .eq('project_id', params.projectId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting bead:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
