import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { 
  scrapeSite, 
  classifyPageRole, 
  calculatePriorityScore 
} from '@/lib/scraper';
import { runAudit, generateFixItems } from '@/lib/audit';
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

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', params.projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Update project status
    await adminClient
      .from('projects')
      .update({ status: 'crawling' })
      .eq('id', params.projectId);

    // Clean up old data before re-crawling to avoid foreign key conflicts
    console.log('[Crawl] Cleaning up old crawl data...');
    
    // Get existing page IDs
    const { data: existingPages } = await adminClient
      .from('pages')
      .select('id')
      .eq('project_id', params.projectId);
    
    const existingPageIds = existingPages?.map(p => p.id) || [];
    
    if (existingPageIds.length > 0) {
      console.log(`[Crawl] Cleaning up ${existingPageIds.length} existing pages and related data...`);
      
      // Delete tasks first (references pages)
      const { error: taskDelError } = await adminClient
        .from('tasks')
        .delete()
        .eq('project_id', params.projectId);
      if (taskDelError) console.error('[Crawl] Task delete error:', taskDelError);
      
      // Delete briefs (references pages)
      const { error: briefDelError } = await adminClient
        .from('briefs')
        .delete()
        .in('page_id', existingPageIds);
      if (briefDelError) console.error('[Crawl] Brief delete error:', briefDelError);
      
      // Delete fix_items (references pages via audits)
      const { error: fixDelError } = await adminClient
        .from('fix_items')
        .delete()
        .in('page_id', existingPageIds);
      if (fixDelError) console.error('[Crawl] Fix items delete error:', fixDelError);
      
      // Delete audits (references pages)
      const { error: auditDelError } = await adminClient
        .from('audits')
        .delete()
        .in('page_id', existingPageIds);
      if (auditDelError) console.error('[Crawl] Audit delete error:', auditDelError);
      
      // Delete page_links
      const { error: linkDelError } = await adminClient
        .from('page_links')
        .delete()
        .eq('project_id', params.projectId);
      if (linkDelError) console.error('[Crawl] Page links delete error:', linkDelError);
      
      // Now we can safely delete old pages
      const { error: pageDelError } = await adminClient
        .from('pages')
        .delete()
        .eq('project_id', params.projectId);
      if (pageDelError) console.error('[Crawl] Page delete error:', pageDelError);
      
      console.log('[Crawl] Cleanup complete');
    }

    // Create crawl run
    const crawlRunId = uuid();
    await adminClient
      .from('crawl_runs')
      .insert({
        id: crawlRunId,
        project_id: params.projectId,
        status: 'running',
        started_at: new Date().toISOString(),
        limits: {
          maxPages: project.settings?.maxPages || 50,
          maxDepth: project.settings?.maxDepth || 3,
        },
      });

    const settings = project.settings || {};
    const errors: string[] = [];

    try {
      console.log(`[Crawl] Starting crawl for ${project.root_url}`);
      
      // Use the new scraper service with Jina Reader for reliable content extraction
      // Limit to 21 pages to stay within Jina free tier rate limits
      const scrapedPages = await scrapeSite(project.root_url, {
        maxPages: Math.min(settings.maxPages || 21, 21),
        maxDepth: Math.min(settings.maxDepth || 2, 2),
        useJinaReader: true,
      });

      console.log(`[Crawl] Discovered ${scrapedPages.length} pages`);

      // Update crawl_runs immediately with pages_found so UI shows progress
      await adminClient
        .from('crawl_runs')
        .update({ 
          pages_found: scrapedPages.length,
          pages_crawled: 0,
        })
        .eq('id', crawlRunId);

      // Process each scraped page
      for (let i = 0; i < scrapedPages.length; i++) {
        const pageData = scrapedPages[i];
        
        console.log(`[Crawl] Processing page ${i + 1}/${scrapedPages.length}: ${pageData.url}`);
        
        try {
          if (pageData.error) {
            console.log(`[Crawl] Error on ${pageData.url}: ${pageData.error}`);
            errors.push(`${pageData.url}: ${pageData.error}`);
            continue;
          }

          // Classify page role based on URL and content
          const role = classifyPageRole(pageData.url, pageData);
          const priorityScore = calculatePriorityScore(pageData, role);

          const pageId = uuid();

        // Insert page with full content for AI context
        const { error: insertError } = await adminClient
          .from('pages')
          .upsert({
            id: pageId,
            project_id: params.projectId,
            url: pageData.url,
            path: new URL(pageData.url).pathname,
            status_code: pageData.statusCode,
            title: pageData.title,
            h1: pageData.h1,
            meta_description: pageData.metaDescription,
            canonical: pageData.canonical,
            lang: pageData.lang,
            word_count: pageData.wordCount,
            text_hash: pageData.textHash,
            cleaned_text: pageData.cleanedText?.slice(0, 100000) || '', // Store content for AI context
            role: role,
            priority_score: Math.round(priorityScore),
            internal_links_out: pageData.internalLinks?.length || 0,
            crawled_at: new Date().toISOString(),
          }, {
            onConflict: 'project_id,url',
          });

        if (insertError) {
          console.log(`[Crawl] Insert error for ${pageData.url}:`, insertError.message);
          errors.push(`${pageData.url}: ${insertError.message}`);
        } else {
          console.log(`[Crawl] Saved page: ${pageData.title}`);
        }

        // Update crawl run progress
        await adminClient
          .from('crawl_runs')
          .update({ 
            pages_crawled: i + 1,
            pages_found: scrapedPages.length,
          })
          .eq('id', crawlRunId);

        // Store internal links for link graph analysis
        for (const linkUrl of (pageData.internalLinks || []).slice(0, 100)) {
          try {
            await adminClient
              .from('page_links')
              .insert({
                project_id: params.projectId,
                from_page_id: pageId,
                from_url: pageData.url,
                to_url: linkUrl,
                anchor_text: '',
                is_internal: true,
              });
          } catch {
            // Ignore duplicate links
          }
        }
        } catch (pageError: any) {
          console.log(`[Crawl] Exception processing ${pageData.url}:`, pageError.message);
          errors.push(`${pageData.url}: ${pageError.message}`);
        }
      }

      // Calculate incoming links count for each page
      const { data: pages } = await adminClient
        .from('pages')
        .select('id, url')
        .eq('project_id', params.projectId);

      if (pages) {
        for (const page of pages) {
          const { count } = await adminClient
            .from('page_links')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', params.projectId)
            .eq('to_url', page.url);

          await adminClient
            .from('pages')
            .update({ 
              internal_links_in: count || 0,
              is_orphan: (count || 0) === 0,
            })
            .eq('id', page.id);
        }
      }

      // Rank pages by priority score
      const { data: rankedPages } = await adminClient
        .from('pages')
        .select('id')
        .eq('project_id', params.projectId)
        .order('priority_score', { ascending: false });

      if (rankedPages) {
        for (let i = 0; i < rankedPages.length; i++) {
          await adminClient
            .from('pages')
            .update({ priority_rank: i + 1 })
            .eq('id', rankedPages[i].id);
        }
      }

      // Update crawl run as completed
      await adminClient
        .from('crawl_runs')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          pages_found: scrapedPages.length,
          pages_crawled: scrapedPages.filter(p => !p.error).length,
          errors: errors.slice(0, 50), // Keep first 50 errors
        })
        .eq('id', crawlRunId);

      // ========================================================================
      // AUTO-RUN AUDIT ON ALL PAGES
      // ========================================================================
      console.log('[Audit] Starting automatic audit...');
      
      await adminClient
        .from('projects')
        .update({ status: 'auditing' })
        .eq('id', params.projectId);

      // Get all pages with their data for audit
      const { data: allPagesForAudit } = await adminClient
        .from('pages')
        .select('*')
        .eq('project_id', params.projectId)
        .order('priority_rank', { ascending: true });

      if (allPagesForAudit && allPagesForAudit.length > 0) {
        // Get beads for brief generation
        const { data: beads } = await adminClient
          .from('beads')
          .select('*')
          .eq('project_id', params.projectId);

        // Get user context for briefs
        const { data: userContext } = await adminClient
          .from('user_context')
          .select('*')
          .eq('project_id', params.projectId)
          .single();

        let totalHealthScore = 0;
        let criticalCount = 0;
        let warningCount = 0;

        for (const page of allPagesForAudit) {
          console.log(`[Audit] Auditing: ${page.title || page.url}`);

          // Build audit context
          const auditContext = {
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
            allPages: allPagesForAudit.map(p => ({
              id: p.id,
              url: p.url,
              title: p.title,
              h1: p.h1,
              textHash: p.text_hash,
            })),
            internalLinksIn: page.internal_links_in || 0,
            internalLinksOut: page.internal_links_out || 0,
          };

          // Run audit
          const auditResult = runAudit(auditContext);
          
          // Count issues
          const criticalIssues = auditResult.checks.filter(c => !c.passed && c.severity === 'critical').length;
          const warningIssues = auditResult.checks.filter(c => !c.passed && c.severity === 'warning').length;
          criticalCount += criticalIssues;
          warningCount += warningIssues;

          // Save audit (insert or update)
          // First check if audit exists for this page
          const { data: existingAudit } = await adminClient
            .from('audits')
            .select('id')
            .eq('page_id', page.id)
            .single();

          let auditId: string;
          
          if (existingAudit) {
            // Update existing audit
            auditId = existingAudit.id;
            await adminClient
              .from('audits')
              .update({
                checks: auditResult.checks,
                health_score: auditResult.healthScore,
                content_score: auditResult.contentScore,
                technical_score: auditResult.technicalScore,
                trust_score: auditResult.trustScore,
                linking_score: auditResult.linkingScore,
              })
              .eq('id', auditId);
            
            // Delete old fix items for this audit before creating new ones
            await adminClient
              .from('fix_items')
              .delete()
              .eq('audit_id', auditId);
          } else {
            // Create new audit
            auditId = uuid();
            await adminClient
              .from('audits')
              .insert({
                id: auditId,
                page_id: page.id,
                checks: auditResult.checks,
                health_score: auditResult.healthScore,
                content_score: auditResult.contentScore,
                technical_score: auditResult.technicalScore,
                trust_score: auditResult.trustScore,
                linking_score: auditResult.linkingScore,
              });
          }

          // Update page health score
          await adminClient
            .from('pages')
            .update({ health_score: auditResult.healthScore })
            .eq('id', page.id);

          totalHealthScore += auditResult.healthScore;

          // Generate fix items from failed checks
          const fixItems = generateFixItems(auditResult.checks);
          console.log(`[Audit] Generated ${fixItems.length} fix items for ${page.url}`);
          
          for (const item of fixItems) {
            const fixItemId = uuid();
            const { error: fixError } = await adminClient
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
            
            if (fixError) {
              console.error(`[Audit] Error saving fix item:`, fixError);
            }
          }

          // Create ONE task per page (not per fix item) if there are critical/warning issues
          const hasCriticalOrWarning = fixItems.some(item => 
            item.severity === 'critical' || item.severity === 'warning'
          );
          
          if (hasCriticalOrWarning) {
            // Combine all acceptance criteria from fix items
            const allAcceptanceCriteria = fixItems
              .filter(item => item.severity === 'critical' || item.severity === 'warning')
              .flatMap(item => item.acceptanceCriteria || [])
              .filter((v, i, a) => a.indexOf(v) === i); // dedupe
            
            await adminClient
              .from('tasks')
              .insert({
                project_id: params.projectId,
                page_id: page.id,
                type: 'fix',
                priority_rank: page.priority_rank,
                status: 'queued',
                inputs_needed: { images: 0, notes: [] },
                acceptance_criteria: allAcceptanceCriteria,
              });
          }

          // Generate briefs for pages with issues
          if (fixItems.length > 0) {
            try {
              const briefs = generateBriefs(
                {
                  url: page.url,
                  title: page.title || '',
                  h1: page.h1 || '',
                  role: page.role,
                  wordCount: page.word_count || 0,
                  cleanedText: page.cleaned_text || '',
                },
                fixItems.map(f => ({
                  title: f.title,
                  severity: f.severity,
                  category: f.category,
                  fixActions: f.fixActions,
                })),
                {
                  businessName: userContext?.business?.name || '',
                  industry: userContext?.business?.niche || '',
                  services: userContext?.offers?.coreServices || [],
                  brandVoice: userContext?.brand_voice?.tone?.join(', ') || '',
                  primaryCTA: userContext?.business?.primaryCTA || 'Contact us',
                  locations: userContext?.business?.locations || [],
                },
                beads?.map(b => ({
                  type: b.type,
                  label: b.label,
                  value: b.value,
                  priority: b.priority,
                })) || []
              );

              await adminClient
                .from('briefs')
                .upsert({
                  page_id: page.id,
                  human_brief_md: briefs.humanBrief,
                  gpt_brief_md: briefs.gptBrief,
                  inputs_needed: briefs.inputsNeeded,
                  beads_to_include: beads?.slice(0, 5).map(b => b.id) || [],
                }, {
                  onConflict: 'page_id',
                });
            } catch (briefError) {
              console.error(`[Brief] Error generating brief for ${page.url}:`, briefError);
            }
          }
        }

        // Calculate foundation score (average health across all pages)
        const foundationScore = allPagesForAudit.length > 0
          ? Math.round(totalHealthScore / allPagesForAudit.length)
          : 0;

        // Check if growth planner should be unlocked
        // Unlock when: foundation >= 80 OR all money pages >= 80
        const { data: moneyPages } = await adminClient
          .from('pages')
          .select('health_score')
          .eq('project_id', params.projectId)
          .eq('role', 'money');

        const allMoneyPagesHealthy = moneyPages && moneyPages.length > 0 
          ? moneyPages.every(p => p.health_score >= 80)
          : false;

        const unlockGrowthPlanner = foundationScore >= 80 || allMoneyPagesHealthy;

        // Update project with final status
        await adminClient
          .from('projects')
          .update({
            status: 'ready',
            foundation_score: foundationScore,
            growth_planner_unlocked: unlockGrowthPlanner,
          })
          .eq('id', params.projectId);

        // Verify fix items were saved
        const { count: fixItemCount } = await adminClient
          .from('fix_items')
          .select('*', { count: 'exact', head: true })
          .in('page_id', allPagesForAudit.map(p => p.id));
        
        console.log(`[Audit] Complete! Foundation score: ${foundationScore}, Critical: ${criticalCount}, Warnings: ${warningCount}, Fix items saved: ${fixItemCount || 0}`);
      }

    } catch (crawlError: any) {
      console.error('Crawl error:', crawlError);
      
      await adminClient
        .from('crawl_runs')
        .update({
          status: 'failed',
          ended_at: new Date().toISOString(),
          errors: [crawlError.message || 'Unknown error'],
        })
        .eq('id', crawlRunId);

      await adminClient
        .from('projects')
        .update({ status: 'ready' })
        .eq('id', params.projectId);

      return NextResponse.json({ 
        error: 'Crawl failed', 
        details: crawlError.message 
      }, { status: 500 });
    }

    // Get final stats
    const { count: totalPages } = await adminClient
      .from('pages')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', params.projectId);

    const { data: finalProject } = await adminClient
      .from('projects')
      .select('foundation_score, growth_planner_unlocked')
      .eq('id', params.projectId)
      .single();

    return NextResponse.json({
      success: true,
      crawlRunId,
      pagesFound: totalPages || 0,
      foundationScore: finalProject?.foundation_score || 0,
      growthPlannerUnlocked: finalProject?.growth_planner_unlocked || false,
    });
  } catch (error) {
    console.error('Error in crawl endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Check crawl status
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const supabase = createServerSupabaseClient();

    const { data: crawlRun } = await supabase
      .from('crawl_runs')
      .select('*')
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ data: crawlRun });
  } catch (error) {
    console.error('Error checking crawl status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
