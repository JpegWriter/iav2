import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { runAudit, generateFixItems, type AuditContext } from '@/lib/audit';
import { generateBriefs } from '@/lib/brief';
import { v4 as uuid } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const adminClient = createAdminClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*, user_context(*)')
      .eq('id', params.projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get all pages for this project
    const { data: pages, error: pagesError } = await adminClient
      .from('pages')
      .select('*')
      .eq('project_id', params.projectId)
      .order('priority_rank', { ascending: true });

    if (pagesError || !pages) {
      return NextResponse.json({ error: 'No pages found' }, { status: 404 });
    }

    // Get all pages for duplicate detection
    const allPagesForAudit = pages.map(p => ({
      id: p.id,
      url: p.url,
      title: p.title,
      h1: p.h1,
      textHash: p.text_hash,
    }));

    // Get beads for brief generation
    const { data: beads } = await adminClient
      .from('beads')
      .select('*')
      .eq('project_id', params.projectId);

    let totalScore = 0;
    let auditedPages = 0;

    for (const page of pages) {
      // Get incoming links count
      const { count: incomingLinks } = await adminClient
        .from('page_links')
        .select('*', { count: 'exact', head: true })
        .eq('to_url', page.url)
        .eq('project_id', params.projectId);

      // Build audit context
      const auditContext: AuditContext = {
        page: {
          id: page.id,
          url: page.url,
          statusCode: page.status_code || 200,
          title: page.title,
          h1: page.h1,
          metaDescription: page.meta_description,
          canonical: page.canonical,
          wordCount: page.word_count || 0,
          textHash: page.text_hash,
          role: page.role,
        },
        allPages: allPagesForAudit,
        internalLinksIn: incomingLinks || 0,
        internalLinksOut: page.internal_links_out || 0,
      };

      // Run audit
      const auditResult = runAudit(auditContext);

      // Save audit
      const auditId = uuid();
      await adminClient
        .from('audits')
        .upsert({
          id: auditId,
          page_id: page.id,
          checks: auditResult.checks,
          health_score: auditResult.healthScore,
          content_score: auditResult.contentScore,
          technical_score: auditResult.technicalScore,
          trust_score: auditResult.trustScore,
          linking_score: auditResult.linkingScore,
        }, {
          onConflict: 'page_id',
        });

      // Update page health score
      await adminClient
        .from('pages')
        .update({ health_score: auditResult.healthScore })
        .eq('id', page.id);

      // Generate fix items
      const fixItems = generateFixItems(auditResult.checks);
      
      for (const item of fixItems) {
        const fixItemId = uuid();
        await adminClient
          .from('fix_items')
          .insert({
            id: fixItemId,
            page_id: page.id,
            audit_id: auditId,
            severity: item.severity,
            category: item.category,
            title: item.title,
            description: item.description,
            why_it_matters: item.whyItMatters,
            fix_actions: item.fixActions,
            acceptance_criteria: item.acceptanceCriteria,
            effort_estimate: item.effortEstimate,
          });

        // Create task for critical/warning items
        if (item.severity === 'critical' || item.severity === 'warning') {
          await adminClient
            .from('tasks')
            .insert({
              project_id: params.projectId,
              page_id: page.id,
              type: 'fix',
              title: item.title,
              severity: item.severity,
              status: 'open',
              acceptance: item.acceptanceCriteria[0] || '',
            });
        }
      }

      // Generate briefs for pages with issues
      if (fixItems.length > 0) {
        const userContext = project.user_context || {};
        const briefResult = generateBriefs(
          {
            url: page.url,
            title: page.title || '',
            h1: page.h1 || '',
            role: page.role,
            wordCount: page.word_count,
          },
          fixItems.map(f => ({
            title: f.title,
            severity: f.severity,
            category: f.category,
            fixActions: f.fixActions,
          })),
          {
            businessName: userContext.business?.name || '',
            industry: userContext.business?.industry || '',
            services: userContext.offers?.services || [],
            brandVoice: userContext.brand_voice?.description || '',
            primaryCTA: userContext.brand_voice?.primaryCTA || '',
            locations: userContext.business?.locations || [],
          },
          beads?.map(b => ({
            type: b.type,
            label: b.label || b.type,
            value: b.value,
            priority: b.priority,
          })) || []
        );

        await adminClient
          .from('briefs')
          .upsert({
            page_id: page.id,
            human_brief_md: briefResult.humanBrief,
            gpt_brief_md: briefResult.gptBrief,
            inputs_needed: briefResult.inputsNeeded,
          }, {
            onConflict: 'page_id',
          });
      }

      totalScore += auditResult.healthScore;
      auditedPages++;
    }

    // Calculate foundation score
    const foundationScore = auditedPages > 0 
      ? Math.round(totalScore / auditedPages) 
      : 0;

    // Update project
    await adminClient
      .from('projects')
      .update({
        status: 'ready',
        foundation_score: foundationScore,
        growth_planner_unlocked: foundationScore >= 80,
      })
      .eq('id', params.projectId);

    return NextResponse.json({
      success: true,
      pagesAudited: auditedPages,
      foundationScore,
    });
  } catch (error) {
    console.error('Error running audit:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
