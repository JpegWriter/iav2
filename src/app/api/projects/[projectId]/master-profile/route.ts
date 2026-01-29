import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { buildMasterProfile, getLatestMasterProfile } from '@/lib/context/buildMasterProfile';

/**
 * GET /api/projects/[projectId]/master-profile
 * Returns the latest master profile for a project.
 * Query params:
 *   - refresh=true: Force rebuild the profile
 *   - version=N: Get a specific version
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const version = searchParams.get('version');

    // If specific version requested
    if (version) {
      const adminClient = createAdminClient();
      const { data, error } = await adminClient
        .from('project_master_profiles')
        .select('*')
        .eq('project_id', params.projectId)
        .eq('version', parseInt(version))
        .single();

      if (error) {
        return NextResponse.json(
          { error: `Version ${version} not found` },
          { status: 404 }
        );
      }

      return NextResponse.json({
        data: data.profile_json,
        meta: {
          id: data.id,
          version: data.version,
          profileHash: data.profile_hash,
          generatedAt: data.generated_at,
        },
      });
    }

    // Force refresh
    if (refresh) {
      const profile = await buildMasterProfile(params.projectId);
      return NextResponse.json({
        data: profile,
        meta: {
          id: profile.id,
          version: profile.version,
          profileHash: profile.profileHash,
          generatedAt: profile.generatedAt,
          refreshed: true,
        },
      });
    }

    // Get latest (or build if none exists)
    let profile = await getLatestMasterProfile(params.projectId);
    
    if (!profile) {
      profile = await buildMasterProfile(params.projectId);
    }

    return NextResponse.json({
      data: profile,
      meta: {
        id: profile.id,
        version: profile.version,
        profileHash: profile.profileHash,
        generatedAt: profile.generatedAt,
      },
    });
  } catch (error) {
    console.error('[MasterProfile] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[projectId]/master-profile
 * Force regenerate the master profile
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const profile = await buildMasterProfile(params.projectId);
    
    return NextResponse.json({
      data: profile,
      meta: {
        id: profile.id,
        version: profile.version,
        profileHash: profile.profileHash,
        generatedAt: profile.generatedAt,
      },
    });
  } catch (error) {
    console.error('[MasterProfile] Error rebuilding:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[projectId]/master-profile/versions
 * List all versions of the master profile
 */
