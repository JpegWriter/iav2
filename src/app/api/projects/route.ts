import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createProjectSchema = z.object({
  rootUrl: z.string().url(),
  name: z.string().min(1).max(100),
  settings: z.object({
    respectRobotsTxt: z.boolean().default(true),
    includeSubdomains: z.boolean().default(false),
    languages: z.array(z.string()).default(['en']),
    primaryGoal: z.enum(['leads', 'ecommerce', 'bookings', 'local']).default('leads'),
    maxPages: z.number().min(1).max(1000).default(200),
    maxDepth: z.number().min(1).max(10).default(5),
  }).optional(),
});

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: projects });
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createProjectSchema.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
  }

  const { rootUrl, name, settings } = parsed.data;

  // Normalize URL
  let normalizedUrl = rootUrl;
  try {
    const url = new URL(rootUrl);
    normalizedUrl = `${url.protocol}//${url.host}`;
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      root_url: normalizedUrl,
      name,
      settings: settings || {
        respectRobotsTxt: true,
        includeSubdomains: false,
        languages: ['en'],
        primaryGoal: 'leads',
        maxPages: 200,
        maxDepth: 5,
      },
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create empty user_context for this project
  await supabase.from('user_context').insert({
    project_id: project.id,
    business: {
      name: name,
      website: normalizedUrl,
      niche: '',
      primaryGoal: settings?.primaryGoal || 'leads',
      primaryCTA: 'Contact us',
      locations: [],
      serviceAreaKm: 25,
      languages: settings?.languages || ['en'],
    },
    offers: {
      coreServices: [],
      pricePositioning: 'mid',
      startingFrom: '',
      packages: [],
      guarantees: [],
      differentiators: [],
    },
    audience: {
      segments: [],
      topPainPoints: [],
      topObjections: [],
    },
    brand_voice: {
      tone: ['professional', 'clear'],
      styleRules: ['Use short paragraphs', 'Be direct'],
      avoid: ['Buzzwords', 'Hype'],
    },
    compliance: {
      doNotSay: [],
      legalNotes: [],
    },
  });

  return NextResponse.json({ data: project }, { status: 201 });
}
