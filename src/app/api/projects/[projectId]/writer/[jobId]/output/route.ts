import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// ============================================================================
// WRITER JOB OUTPUT ROUTE
// ============================================================================
// GET /api/projects/[projectId]/writer/[jobId]/output - Get the generated output
// POST /api/projects/[projectId]/writer/[jobId]/output - Apply output to task
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; jobId: string } }
) {
  try {
    const { projectId, jobId } = params;
    const adminClient = createAdminClient();

    // Fetch the output
    const { data: output, error } = await adminClient
      .from('writer_outputs')
      .select('*')
      .eq('job_id', jobId)
      .eq('project_id', projectId)
      .single();

    if (error || !output) {
      return NextResponse.json(
        { error: 'Writer output not found' },
        { status: 404 }
      );
    }

    // Format the response
    const formattedOutput = {
      wordpress: {
        title: output.wp_title,
        slug: output.wp_slug,
        excerpt: output.wp_excerpt,
        blocks: output.wp_blocks,
        seo: output.wp_seo,
        images: output.wp_images,
        internalLinksUsed: output.wp_internal_links,
      },
      social: {
        linkedin: output.linkedin_output,
        gmb: output.gmb_output,
        reddit: output.reddit_output,
      },
      audit: output.audit_data,
      validation: {
        passed: output.validation_passed,
        warnings: output.validation_warnings,
      },
      contentHash: output.content_hash,
      createdAt: output.created_at,
    };

    return NextResponse.json({ data: formattedOutput });
  } catch (error) {
    console.error('Error fetching writer output:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; jobId: string } }
) {
  try {
    const { projectId, jobId } = params;
    const body = await request.json();
    const adminClient = createAdminClient();

    const { applyTo } = body; // 'task' | 'brief' | 'both'

    // Fetch the job and output
    const { data: job, error: jobError } = await adminClient
      .from('writer_jobs')
      .select('*, writer_outputs(*)')
      .eq('id', jobId)
      .eq('project_id', projectId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Writer job not found' },
        { status: 404 }
      );
    }

    if (!job.writer_outputs || job.writer_outputs.length === 0) {
      return NextResponse.json(
        { error: 'No output available for this job' },
        { status: 404 }
      );
    }

    const output = job.writer_outputs[0];
    const results: any = {};

    // Apply to task outputs
    if (applyTo === 'task' || applyTo === 'both') {
      if (job.task_id) {
        // Create WordPress task output
        if (job.target_wordpress) {
          const { data: wpOutput, error: wpError } = await adminClient
            .from('task_outputs')
            .upsert({
              task_id: job.task_id,
              channel: 'wp',
              content_md: blocksToMarkdown(output.wp_blocks),
              wp_blocks: output.wp_blocks,
              seo_fields: output.wp_seo,
              image_refs: extractImageRefs(output.wp_images),
              writer_output_id: output.id,
              status: 'ready',
            }, {
              onConflict: 'task_id,channel',
            })
            .select()
            .single();

          results.wordpress = wpOutput || null;
        }

        // Create LinkedIn task output
        if (job.target_linkedin && output.linkedin_output) {
          const { data: liOutput } = await adminClient
            .from('task_outputs')
            .upsert({
              task_id: job.task_id,
              channel: 'li',
              content_md: output.linkedin_output.content || '',
              seo_fields: {
                hashtags: output.linkedin_output.hashtags,
              },
              image_refs: output.linkedin_output.imageRef ? [output.linkedin_output.imageRef] : [],
              writer_output_id: output.id,
              status: 'ready',
            }, {
              onConflict: 'task_id,channel',
            })
            .select()
            .single();

          results.linkedin = liOutput || null;
        }

        // Create GMB task output
        if (job.target_gmb && output.gmb_output) {
          const { data: gmbOutput } = await adminClient
            .from('task_outputs')
            .upsert({
              task_id: job.task_id,
              channel: 'gmb',
              content_md: output.gmb_output.content || '',
              seo_fields: {
                postType: output.gmb_output.postType,
                callToAction: output.gmb_output.callToAction,
              },
              image_refs: output.gmb_output.imageRef ? [output.gmb_output.imageRef] : [],
              writer_output_id: output.id,
              status: 'ready',
            }, {
              onConflict: 'task_id,channel',
            })
            .select()
            .single();

          results.gmb = gmbOutput || null;
        }

        // Create Reddit task output
        if (job.target_reddit && output.reddit_output) {
          const { data: redditOutput } = await adminClient
            .from('task_outputs')
            .upsert({
              task_id: job.task_id,
              channel: 'reddit',
              content_md: output.reddit_output.content || '',
              seo_fields: {
                title: output.reddit_output.title,
                subredditSuggestions: output.reddit_output.subredditSuggestions,
              },
              image_refs: output.reddit_output.imageRef ? [output.reddit_output.imageRef] : [],
              writer_output_id: output.id,
              status: 'ready',
            }, {
              onConflict: 'task_id,channel',
            })
            .select()
            .single();

          results.reddit = redditOutput || null;
        }

        // Update task status
        await adminClient
          .from('tasks')
          .update({
            status: 'draft_ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.task_id);
      }
    }

    // Apply to brief
    if (applyTo === 'brief' || applyTo === 'both') {
      if (job.task_id) {
        // Update brief with writer output reference
        const { data: brief } = await adminClient
          .from('briefs')
          .update({
            writer_job_id: job.id,
            writer_output_id: output.id,
            gpt_brief_md: generateBriefMarkdown(output),
            updated_at: new Date().toISOString(),
          })
          .eq('task_id', job.task_id)
          .select()
          .single();

        results.brief = brief || null;
      }
    }

    return NextResponse.json({
      data: results,
      message: 'Output applied successfully',
    });
  } catch (error) {
    console.error('Error applying writer output:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function blocksToMarkdown(blocks: any[]): string {
  if (!blocks || blocks.length === 0) return '';

  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.blockName) {
      case 'core/heading':
        const level = block.attrs?.level || 2;
        const headingText = stripHtml(block.innerHTML || '');
        lines.push(`${'#'.repeat(level)} ${headingText}`);
        lines.push('');
        break;

      case 'core/paragraph':
        lines.push(stripHtml(block.innerHTML || ''));
        lines.push('');
        break;

      case 'core/list':
        const items = (block.innerHTML || '')
          .match(/<li[^>]*>(.*?)<\/li>/gi) || [];
        for (const item of items) {
          lines.push(`- ${stripHtml(item)}`);
        }
        lines.push('');
        break;

      case 'core/image':
        lines.push(`![Image](${extractImageSrc(block.innerHTML || '')})`);
        lines.push('');
        break;

      case 'core/quote':
        const quoteText = stripHtml(block.innerHTML || '');
        lines.push(`> ${quoteText}`);
        lines.push('');
        break;

      case 'core/buttons':
        if (block.innerBlocks) {
          for (const button of block.innerBlocks) {
            const buttonText = stripHtml(button.innerHTML || '');
            lines.push(`[${buttonText}](button)`);
          }
          lines.push('');
        }
        break;

      default:
        if (block.innerHTML) {
          lines.push(stripHtml(block.innerHTML));
          lines.push('');
        }
    }

    // Process inner blocks
    if (block.innerBlocks && block.innerBlocks.length > 0) {
      lines.push(blocksToMarkdown(block.innerBlocks));
    }
  }

  return lines.join('\n').trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function extractImageSrc(html: string): string {
  const match = html.match(/src=["']([^"']+)["']/);
  return match ? match[1] : 'image.jpg';
}

function extractImageRefs(images: any): string[] {
  const refs: string[] = [];

  if (images?.hero?.assetRef) {
    refs.push(images.hero.assetRef);
  }

  if (images?.inline) {
    for (const img of images.inline) {
      if (img.assetRef) {
        refs.push(img.assetRef);
      }
    }
  }

  return refs;
}

function generateBriefMarkdown(output: any): string {
  const lines: string[] = [];

  lines.push('# Generated Content Brief');
  lines.push('');
  lines.push('## Article');
  lines.push(`**Title:** ${output.wp_title}`);
  lines.push(`**Slug:** ${output.wp_slug}`);
  lines.push('');

  if (output.wp_seo) {
    lines.push('## SEO');
    lines.push(`**Focus Keyphrase:** ${output.wp_seo.focusKeyphrase || 'N/A'}`);
    lines.push(`**Meta Title:** ${output.wp_seo.seoTitle || 'N/A'}`);
    lines.push(`**Meta Description:** ${output.wp_seo.metaDescription || 'N/A'}`);
    lines.push('');
  }

  if (output.audit_data) {
    lines.push('## Stats');
    lines.push(`- Word Count: ${output.audit_data.wordCount || 'N/A'}`);
    lines.push(`- Reading Time: ${output.audit_data.readingTimeMinutes || 'N/A'} minutes`);
    lines.push(`- Internal Links: ${output.audit_data.internalLinkCount || 0}`);
    lines.push(`- Images: ${output.audit_data.imageCount || 0}`);
    lines.push('');
  }

  lines.push('## Social Posts');
  if (output.linkedin_output) lines.push('- ✅ LinkedIn post generated');
  if (output.gmb_output) lines.push('- ✅ GMB post generated');
  if (output.reddit_output) lines.push('- ✅ Reddit content generated');

  return lines.join('\n');
}
