import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// ============================================================================
// WRITER JOB DETAIL ROUTES
// ============================================================================
// GET /api/projects/[projectId]/writer/[jobId] - Get job details
// DELETE /api/projects/[projectId]/writer/[jobId] - Cancel/delete job
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; jobId: string } }
) {
  try {
    const { projectId, jobId } = params;
    const adminClient = createAdminClient();

    // Fetch job with output
    const { data: job, error } = await adminClient
      .from('writer_jobs')
      .select(`
        *,
        writer_outputs(*),
        writer_runs(*)
      `)
      .eq('id', jobId)
      .eq('project_id', projectId)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: 'Writer job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: job });
  } catch (error) {
    console.error('Error fetching writer job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; jobId: string } }
) {
  try {
    const { projectId, jobId } = params;
    const adminClient = createAdminClient();

    // Check if job exists and can be cancelled
    const { data: job, error: fetchError } = await adminClient
      .from('writer_jobs')
      .select('status')
      .eq('id', jobId)
      .eq('project_id', projectId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json(
        { error: 'Writer job not found' },
        { status: 404 }
      );
    }

    // Only allow cancellation of pending/processing jobs
    if (job.status === 'completed' || job.status === 'failed') {
      // Delete the job and its outputs
      const { error: deleteError } = await adminClient
        .from('writer_jobs')
        .delete()
        .eq('id', jobId);

      if (deleteError) {
        return NextResponse.json(
          { error: 'Failed to delete writer job' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        message: 'Writer job deleted successfully',
      });
    }

    // Cancel the job if still processing
    const { error: updateError } = await adminClient
      .from('writer_jobs')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to cancel writer job' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Writer job cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling writer job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; jobId: string } }
) {
  try {
    const { projectId, jobId } = params;
    const body = await request.json();
    const adminClient = createAdminClient();

    const { action } = body;

    if (action === 'retry') {
      // Retry a failed job
      const { data: job, error: fetchError } = await adminClient
        .from('writer_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('project_id', projectId)
        .single();

      if (fetchError || !job) {
        return NextResponse.json(
          { error: 'Writer job not found' },
          { status: 404 }
        );
      }

      if (job.status !== 'failed') {
        return NextResponse.json(
          { error: 'Can only retry failed jobs' },
          { status: 400 }
        );
      }

      if (job.retry_count >= job.max_retries) {
        return NextResponse.json(
          { error: 'Maximum retries exceeded' },
          { status: 400 }
        );
      }

      // Reset job status for retry
      const { data: updatedJob, error: updateError } = await adminClient
        .from('writer_jobs')
        .update({
          status: 'pending',
          retry_count: job.retry_count + 1,
          error_message: null,
          error_details: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to retry writer job' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        data: updatedJob,
        message: 'Writer job queued for retry',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating writer job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
