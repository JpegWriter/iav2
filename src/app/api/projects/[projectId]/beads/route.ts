import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();

    const { data: beads, error } = await supabase
      .from('beads')
      .select('*')
      .eq('project_id', params.projectId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: beads });
  } catch (error) {
    console.error('Error fetching beads:', error);
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
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    // Build the bead object matching the schema
    const beadData: Record<string, unknown> = {
      project_id: params.projectId,
      type: body.type,
      label: body.label || body.type || 'Untitled',
      value: body.value || body.content || '',
      priority: body.priority || 50,
      channels: body.channels || ['wp', 'gmb', 'li'],
      where_to_use: body.whereToUse || body.where_to_use || [],
      tone: body.tone || [],
    };

    // Handle source as JSONB
    if (body.source && typeof body.source === 'string') {
      beadData.source = { kind: body.source, ref: null, lastVerifiedAt: null };
    } else if (body.source && typeof body.source === 'object') {
      beadData.source = body.source;
    }

    const { data: bead, error } = await supabase
      .from('beads')
      .insert(beadData)
      .select()
      .single();

    if (error) {
      console.error('Beads insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: bead });
  } catch (error) {
    console.error('Error creating bead:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
