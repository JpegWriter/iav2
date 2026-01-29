import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: publishes, error } = await supabase
      .from('publishes')
      .select(`
        *,
        task:tasks(
          id,
          title,
          page:pages(url, title)
        )
      `)
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: publishes });
  } catch (error) {
    console.error('Error fetching publishes:', error);
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

    // Get channel connection
    const { data: connection } = await supabase
      .from('channel_connections')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('channel', body.channel)
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: 'Channel not connected' },
        { status: 400 }
      );
    }

    // Create publish record
    const { data: publish, error } = await supabase
      .from('publishes')
      .insert({
        project_id: params.projectId,
        task_id: body.task_id,
        channel: body.channel,
        payload: body.payload,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // TODO: Queue the actual publishing job
    // For now, we'll simulate publishing based on channel

    if (body.channel === 'wordpress') {
      // Publish to WordPress
      try {
        const wpResult = await publishToWordPress(connection.config, body.payload);
        
        await supabase
          .from('publishes')
          .update({
            status: 'published',
            published_url: wpResult.url,
            published_at: new Date().toISOString(),
          })
          .eq('id', publish.id);
      } catch (wpError: any) {
        await supabase
          .from('publishes')
          .update({
            status: 'failed',
            error_message: wpError.message,
          })
          .eq('id', publish.id);
      }
    }

    return NextResponse.json({ data: publish });
  } catch (error) {
    console.error('Error creating publish:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function publishToWordPress(config: any, payload: any): Promise<{ url: string }> {
  const { url, username, password } = config;
  
  const apiUrl = `${url.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: payload.title,
      content: payload.html,
      status: payload.status || 'draft',
      slug: payload.slug,
      excerpt: payload.excerpt,
      meta: payload.meta,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WordPress API error: ${error}`);
  }
  
  const post = await response.json();
  return { url: post.link };
}
