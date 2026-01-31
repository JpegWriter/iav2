/**
 * POST /api/fix/publish
 * 
 * Publishes a previewed page fix.
 * Applies the proposed improvements and integrates with task_outputs for WordPress publishing.
 * Locks the page from re-fixing for a configurable period.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { PublishResponse, PageFixOutput, PageFixSection } from '@/lib/pageFixWriter';

// Lock period after publishing (prevents immediate re-fix)
const FIX_LOCK_DAYS = 7;

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
    const { versionId, appliedCategories } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: 'versionId is required' },
        { status: 400 }
      );
    }

    // Fetch the version
    const { data: version, error: versionError } = await supabase
      .from('page_fix_versions')
      .select(`
        *,
        pages!inner(id, project_id, url, title),
        projects!inner(id, user_id, name)
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

    // Check version status
    if (version.status !== 'draft') {
      return NextResponse.json(
        { error: `Cannot publish version with status: ${version.status}` },
        { status: 400 }
      );
    }

    const proposedOutput = version.proposed_output as PageFixOutput;
    const finalCategories = appliedCategories || version.applied_categories;

    // Filter output based on applied categories
    const filteredOutput = filterOutputByCategories(proposedOutput, finalCategories);

    // Convert to WordPress blocks format for task_outputs integration
    const wpContent = convertToWordPressFormat(filteredOutput);

    // Create task_output entry for WordPress integration
    const { data: taskOutput, error: outputError } = await supabase
      .from('task_outputs')
      .insert({
        task_id: version.fix_task_id,
        project_id: version.project_id,
        output_type: 'page_fix',
        content_json: {
          type: 'page_fix',
          version_id: versionId,
          url: version.url,
          title: filteredOutput.title,
          meta_description: filteredOutput.metaDescription,
          h1: filteredOutput.h1,
          content_blocks: wpContent.blocks,
          internal_links: filteredOutput.internalLinks,
          image_instructions: filteredOutput.imageInstructions,
          author_block: filteredOutput.authorBlock,
        },
        content_html: wpContent.html,
        content_md: wpContent.markdown,
        status: 'ready',
        created_by: user.id,
      })
      .select()
      .single();

    if (outputError) {
      console.error('Failed to create task output:', outputError);
      return NextResponse.json(
        { error: 'Failed to create publish output' },
        { status: 500 }
      );
    }

    // Update version status
    const publishedAt = new Date().toISOString();
    const { error: updateVersionError } = await supabase
      .from('page_fix_versions')
      .update({
        status: 'published',
        published_at: publishedAt,
        applied_categories: finalCategories,
        task_output_id: taskOutput.id,
      })
      .eq('id', versionId);

    if (updateVersionError) {
      console.error('Failed to update version:', updateVersionError);
    }

    // Update page with new SEO data and lock
    const lockUntil = new Date();
    lockUntil.setDate(lockUntil.getDate() + FIX_LOCK_DAYS);

    const { error: updatePageError } = await supabase
      .from('pages')
      .update({
        fix_status: 'fixed',
        last_fix_version_id: versionId,
        fix_locked_until: lockUntil.toISOString(),
        // Update SEO fields if title/meta categories applied
        ...(finalCategories.titleMeta && {
          title: filteredOutput.title,
          seo_data: {
            title: filteredOutput.title,
            meta_description: filteredOutput.metaDescription,
            h1: filteredOutput.h1,
          },
        }),
      })
      .eq('id', version.page_id);

    if (updatePageError) {
      console.error('Failed to update page:', updatePageError);
    }

    // Update fix task status if linked
    if (version.fix_task_id) {
      await supabase
        .from('tasks')
        .update({ 
          status: 'publish_ready',
          output_id: taskOutput.id,
        })
        .eq('id', version.fix_task_id);
    }

    // Build response
    const fieldsUpdated: string[] = [];
    if (finalCategories.titleMeta) fieldsUpdated.push('title', 'meta_description');
    if (finalCategories.headings) fieldsUpdated.push('h1', 'headings');
    if (finalCategories.contentDepth) fieldsUpdated.push('content_sections');
    if (finalCategories.eeat) fieldsUpdated.push('author_block', 'experience_signals');
    if (finalCategories.internalLinks) fieldsUpdated.push('internal_links');

    const response: PublishResponse = {
      success: true,
      versionId,
      taskOutputId: taskOutput.id,
      publishedAt,
      summary: {
        fieldsUpdated,
        sectionsModified: (version.diff_summary as any)?.summary?.sectionsModified || 0,
      },
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Publish error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface AppliedCategories {
  titleMeta: boolean;
  headings: boolean;
  contentDepth: boolean;
  eeat: boolean;
  internalLinks: boolean;
}

function filterOutputByCategories(
  output: PageFixOutput,
  categories: AppliedCategories
): PageFixOutput {
  return {
    ...output,
    title: categories.titleMeta ? output.title : '',
    metaDescription: categories.titleMeta ? output.metaDescription : '',
    h1: categories.headings ? output.h1 : '',
    sections: output.sections.filter(section => {
      // Map section types to categories
      if (section.type === 'intro' || section.type === 'context') {
        return categories.contentDepth;
      }
      if (section.type === 'experience' || section.type === 'testimonial') {
        return categories.eeat;
      }
      return categories.contentDepth;
    }),
    internalLinks: categories.internalLinks ? output.internalLinks : [],
    authorBlock: categories.eeat ? output.authorBlock : undefined,
  };
}

interface WordPressFormat {
  blocks: any[];
  html: string;
  markdown: string;
}

function convertToWordPressFormat(output: PageFixOutput): WordPressFormat {
  const blocks: any[] = [];
  let html = '';
  let markdown = '';

  // H1 as title (WordPress handles this separately usually)
  if (output.h1) {
    blocks.push({
      type: 'heading',
      attrs: { level: 1 },
      content: output.h1,
    });
    html += `<h1>${output.h1}</h1>\n`;
    markdown += `# ${output.h1}\n\n`;
  }

  // Sections
  for (const section of output.sections) {
    if (section.heading) {
      blocks.push({
        type: 'heading',
        attrs: { level: 2 },
        content: section.heading,
      });
      html += `<h2>${section.heading}</h2>\n`;
      markdown += `## ${section.heading}\n\n`;
    }

    blocks.push({
      type: 'paragraph',
      content: section.html,
    });
    html += section.html + '\n';
    markdown += stripHtml(section.html) + '\n\n';
  }

  // Author block
  if (output.authorBlock?.html) {
    blocks.push({
      type: 'html',
      content: output.authorBlock.html,
    });
    html += output.authorBlock.html + '\n';
    markdown += '\n---\n' + stripHtml(output.authorBlock.html) + '\n';
  }

  return { blocks, html, markdown };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
