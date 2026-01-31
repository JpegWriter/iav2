/**
 * POST /api/fix/revert
 * 
 * Reverts a published page fix back to its original state.
 * Creates a new version marked as 'reverted' for audit trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { RevertResponse } from '@/lib/pageFixWriter';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    
    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { versionId } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: 'versionId is required' },
        { status: 400 }
      );
    }

    // Fetch the version to revert
    const { data: version, error: versionError } = await supabase
      .from('page_fix_versions')
      .select(`
        *,
        pages!inner(id, project_id),
        projects!inner(id, user_id)
      `)
      .eq('id', versionId)
      .single();

    if (versionError || !version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Verify ownership
    if (version.projects.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check version status - can only revert published versions
    if (version.status !== 'published') {
      return NextResponse.json(
        { error: `Cannot revert version with status: ${version.status}. Only published versions can be reverted.` },
        { status: 400 }
      );
    }

    const originalSnapshot = version.original_snapshot;
    const revertedAt = new Date().toISOString();

    // Get next version number
    const { data: lastVersion } = await supabase
      .from('page_fix_versions')
      .select('version')
      .eq('page_id', version.page_id)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (lastVersion?.version || 0) + 1;

    // Create revert version for audit trail
    const { data: revertVersion, error: revertError } = await supabase
      .from('page_fix_versions')
      .insert({
        page_id: version.page_id,
        project_id: version.project_id,
        url: version.url,
        version: nextVersion,
        status: 'reverted',
        original_snapshot: version.proposed_output, // The "original" for revert is what we're reverting FROM
        proposed_output: originalSnapshot, // Reverting TO the original
        diff_summary: {
          summary: {
            sectionsAdded: 0,
            sectionsModified: 0,
            sectionsRemoved: 0,
            wordsAdded: 0,
            wordsRemoved: 0,
          },
          explanations: [{
            category: 'Revert',
            before: 'AI-improved version',
            after: 'Original content',
            reason: 'User requested revert to original state',
          }],
        },
        applied_categories: {
          titleMeta: true,
          headings: true,
          contentDepth: true,
          eeat: true,
          internalLinks: true,
        },
        validation_warnings: [],
        created_by: user.id,
        reverted_at: revertedAt,
        rollback_of_version_id: versionId,
      })
      .select()
      .single();

    if (revertError) {
      console.error('Failed to create revert version:', revertError);
      return NextResponse.json(
        { error: 'Failed to create revert record' },
        { status: 500 }
      );
    }

    // Mark original version as reverted
    await supabase
      .from('page_fix_versions')
      .update({ 
        status: 'reverted',
        reverted_at: revertedAt,
      })
      .eq('id', versionId);

    // Restore original page data
    const { error: updatePageError } = await supabase
      .from('pages')
      .update({
        fix_status: 'pending',
        last_fix_version_id: revertVersion.id,
        fix_locked_until: null, // Remove lock on revert
        title: originalSnapshot.title,
        seo_data: {
          title: originalSnapshot.title,
          meta_description: originalSnapshot.metaDescription,
          h1: originalSnapshot.h1,
          headings: originalSnapshot.headings,
        },
      })
      .eq('id', version.page_id);

    if (updatePageError) {
      console.error('Failed to restore page:', updatePageError);
    }

    // Update linked task if exists
    if (version.fix_task_id) {
      await supabase
        .from('tasks')
        .update({ 
          status: 'queued', // Back to queue for re-work
          output_id: null,
        })
        .eq('id', version.fix_task_id);
    }

    // Build response
    const response: RevertResponse = {
      success: true,
      versionId: revertVersion.id,
      revertedToVersion: 0, // Original (pre-fix)
      revertedAt,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Revert error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
