import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; channelId: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('channel_connections')
      .delete()
      .eq('id', params.channelId)
      .eq('project_id', params.projectId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting channel connection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
