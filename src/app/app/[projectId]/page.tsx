import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, Badge, ScoreCircle, ScoreBar, Button } from '@/components/ui';
import { formatRelativeTime, getRoleColor, getSeverityColor } from '@/lib/utils';
import Link from 'next/link';
import { ReCrawlButton } from '@/components/crawl/ReCrawlButton';
import { 
  RefreshCw, 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  ArrowRight,
  TrendingUp,
  Target,
  Zap
} from 'lucide-react';

export default async function ProjectOverviewPage({
  params,
}: {
  params: { projectId: string };
}) {
  const supabase = createServerSupabaseClient();
  const { createAdminClient } = await import('@/lib/supabase/server');
  const adminClient = createAdminClient();

  // Get project data
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.projectId)
    .single();

  // Get latest crawl run
  const { data: crawlRuns } = await supabase
    .from('crawl_runs')
    .select('*')
    .eq('project_id', params.projectId)
    .order('created_at', { ascending: false })
    .limit(1);

  const latestCrawl = crawlRuns?.[0];

  // Get page stats
  const { data: pages } = await adminClient
    .from('pages')
    .select('id, url, role, health_score, priority_rank')
    .eq('project_id', params.projectId)
    .order('priority_rank', { ascending: true });

  // Get page IDs for this project
  const pageIds = pages?.map(p => p.id) || [];
  console.log(`[Overview] Found ${pages?.length || 0} pages, pageIds:`, pageIds.slice(0, 3));

  // Get fix items summary (filter by pages in this project)
  const { data: fixItems, error: fixError } = pageIds.length > 0 
    ? await adminClient
        .from('fix_items')
        .select('id, severity, status, page_id, title, description, category')
        .in('page_id', pageIds)
        .eq('status', 'open')
        .order('severity', { ascending: true })
    : { data: [], error: null };

  console.log(`[Overview] Fix items query result:`, { count: fixItems?.length, error: fixError, sample: fixItems?.slice(0, 2) });

  // Create a map of page_id to page for quick lookup
  const pageMap = new Map(pages?.map(p => [p.id, p]) || []);

  // Enrich fix items with page info
  const enrichedFixItems = (fixItems || []).map(item => ({
    ...item,
    page: pageMap.get(item.page_id),
  }));

  // Get tasks
  const { data: tasks } = await adminClient
    .from('tasks')
    .select('*, page:pages(url, role)')
    .eq('project_id', params.projectId)
    .eq('type', 'fix')
    .in('status', ['queued', 'assigned'])
    .order('priority_rank', { ascending: true })
    .limit(7);

  // Calculate stats
  const totalPages = pages?.length || 0;
  const avgHealth = totalPages > 0 
    ? Math.round(pages!.reduce((sum, p) => sum + (p.health_score || 0), 0) / totalPages)
    : 0;

  const roleStats = {
    money: pages?.filter(p => p.role === 'money') || [],
    trust: pages?.filter(p => p.role === 'trust') || [],
    authority: pages?.filter(p => p.role === 'authority') || [],
    support: pages?.filter(p => p.role === 'support') || [],
  };

  const criticalIssues = fixItems?.filter(f => f.severity === 'critical').length || 0;
  const warningIssues = fixItems?.filter(f => f.severity === 'warning').length || 0;

  // Get critical and warning items for display
  const criticalItems = enrichedFixItems.filter(f => f.severity === 'critical').slice(0, 10);
  const warningItems = enrichedFixItems.filter(f => f.severity === 'warning').slice(0, 10);

  // Top pages needing fixes
  const topPagesNeedingFixes = pages
    ?.filter(p => p.health_score < 70)
    .slice(0, 5) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
          <p className="text-slate-600">{project?.root_url}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={
              project?.status === 'ready' ? 'success' :
              project?.status === 'crawling' || project?.status === 'auditing' ? 'warning' :
              'default'
            }
            size="md"
          >
            {project?.status}
          </Badge>
          <ReCrawlButton projectId={params.projectId} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-4">
            <ScoreCircle score={avgHealth} />
            <div>
              <p className="text-sm text-slate-600">Foundation Score</p>
              <p className="text-lg font-semibold text-slate-900">{avgHealth}/100</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Pages Crawled</p>
              <p className="text-lg font-semibold text-slate-900">{totalPages}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Critical Issues</p>
              <p className="text-lg font-semibold text-slate-900">{criticalIssues}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
              <Target className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Warnings</p>
              <p className="text-lg font-semibold text-slate-900">{warningIssues}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Score Breakdown */}
        <Card>
          <CardHeader title="Health by Page Type" />
          <div className="space-y-4">
            <ScoreBar
              score={roleStats.money.length > 0 
                ? Math.round(roleStats.money.reduce((s, p) => s + p.health_score, 0) / roleStats.money.length)
                : 0}
              label={`Money Pages (${roleStats.money.length})`}
            />
            <ScoreBar
              score={roleStats.trust.length > 0 
                ? Math.round(roleStats.trust.reduce((s, p) => s + p.health_score, 0) / roleStats.trust.length)
                : 0}
              label={`Trust Pages (${roleStats.trust.length})`}
            />
            <ScoreBar
              score={roleStats.authority.length > 0 
                ? Math.round(roleStats.authority.reduce((s, p) => s + p.health_score, 0) / roleStats.authority.length)
                : 0}
              label={`Authority Pages (${roleStats.authority.length})`}
            />
            <ScoreBar
              score={roleStats.support.length > 0 
                ? Math.round(roleStats.support.reduce((s, p) => s + p.health_score, 0) / roleStats.support.length)
                : 0}
              label={`Support Pages (${roleStats.support.length})`}
            />
          </div>
        </Card>

        {/* Top Pages Needing Fixes */}
        <Card>
          <CardHeader 
            title="Top Pages Needing Fixes" 
            action={
              <Link href={`/app/${params.projectId}/pages`}>
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            }
          />
          {topPagesNeedingFixes.length > 0 ? (
            <div className="space-y-3">
              {topPagesNeedingFixes.map((page) => (
                <Link
                  key={page.id}
                  href={`/app/${params.projectId}/pages/${page.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ScoreCircle score={page.health_score} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {new URL(page.url).pathname || '/'}
                      </p>
                      <Badge className={getRoleColor(page.role)} size="sm">
                        {page.role}
                      </Badge>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p>All pages are healthy!</p>
            </div>
          )}
        </Card>

        {/* Next Actions */}
        <Card>
          <CardHeader 
            title="Next 7 Actions" 
            action={
              <Link href={`/app/${params.projectId}/planner`}>
                <Button variant="ghost" size="sm">View Planner</Button>
              </Link>
            }
          />
          {tasks && tasks.length > 0 ? (
            <div className="space-y-2">
              {tasks.map((task, index) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50"
                >
                  <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 truncate">
                      Fix: {task.page?.url ? new URL(task.page.url).pathname : '/'}
                    </p>
                  </div>
                  <Badge className={getRoleColor(task.page?.role || 'support')} size="sm">
                    {task.page?.role || 'support'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <Zap className="w-8 h-8 mx-auto mb-2" />
              <p>No pending tasks</p>
            </div>
          )}
        </Card>
      </div>

      {/* Critical Issues & Warnings Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Critical Issues */}
        <Card className="border-red-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Critical Issues ({criticalIssues})
            </h3>
            <Link href={`/app/${params.projectId}/planner`}>
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>
          {criticalItems.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {criticalItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-red-50 border border-red-100"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AlertTriangle className="w-3 h-3 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{item.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge size="sm">{item.category}</Badge>
                        {item.page && (
                          <span className="text-xs text-slate-500 truncate">
                            {new URL(item.page.url).pathname}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p>No critical issues!</p>
            </div>
          )}
        </Card>

        {/* Warnings */}
        <Card className="border-amber-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-600" />
              Warnings ({warningIssues})
            </h3>
            <Link href={`/app/${params.projectId}/planner`}>
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>
          {warningItems.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {warningItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-amber-50 border border-amber-100"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Target className="w-3 h-3 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{item.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge size="sm">{item.category}</Badge>
                        {item.page && (
                          <span className="text-xs text-slate-500 truncate">
                            {new URL(item.page.url).pathname}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p>No warnings!</p>
            </div>
          )}
        </Card>
      </div>

      {/* Growth Planner CTA */}
      {!project?.growth_planner_unlocked && (
        <Card className="bg-gradient-to-r from-primary-50 to-blue-50 border-primary-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Unlock Growth Planner</h3>
                <p className="text-sm text-slate-600">
                  Fix your money pages to unlock the 12-month content growth planner.
                  Current average: {Math.round(roleStats.money.reduce((s, p) => s + p.health_score, 0) / (roleStats.money.length || 1))}/80 required.
                </p>
              </div>
            </div>
            <Link href={`/app/${params.projectId}/planner`}>
              <Button>
                View Fix Plan
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Crawl Info */}
      {latestCrawl && (
        <div className="text-sm text-slate-500 flex items-center gap-4">
          <span>Last crawl: {formatRelativeTime(latestCrawl.created_at)}</span>
          <span>•</span>
          <span>{latestCrawl.pages_crawled} pages crawled</span>
          {latestCrawl.errors?.length > 0 && (
            <>
              <span>•</span>
              <span className="text-amber-600">{latestCrawl.errors.length} errors</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
