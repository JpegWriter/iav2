import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const adminClient = createAdminClient();

    const { data: context, error } = await adminClient
      .from('user_context')
      .select('*')
      .eq('project_id', params.projectId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: context || null });
  } catch (error) {
    console.error('Error fetching context:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const adminClient = createAdminClient();
    const body = await request.json();

    console.log('[Context] Saving context for project:', params.projectId);

    // Transform camelCase keys to snake_case for database
    const dbData: Record<string, any> = {};
    if (body.business) dbData.business = body.business;
    if (body.offers) dbData.offers = body.offers;
    if (body.audience) dbData.audience = body.audience;
    if (body.brandVoice) dbData.brand_voice = body.brandVoice;
    if (body.brand_voice) dbData.brand_voice = body.brand_voice;
    if (body.assets) dbData.assets = body.assets;
    if (body.compliance) dbData.compliance = body.compliance;

    console.log('[Context] Transformed data:', JSON.stringify(dbData, null, 2).slice(0, 500));

    // Check if context exists
    const { data: existing } = await adminClient
      .from('user_context')
      .select('id')
      .eq('project_id', params.projectId)
      .single();

    let result;
    if (existing) {
      result = await adminClient
        .from('user_context')
        .update(dbData)
        .eq('project_id', params.projectId)
        .select()
        .single();
    } else {
      result = await adminClient
        .from('user_context')
        .insert({
          ...dbData,
          project_id: params.projectId,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('[Context] Error:', result.error);
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error('Error updating context:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Alias PUT to PATCH for compatibility
export { PATCH as PUT };
