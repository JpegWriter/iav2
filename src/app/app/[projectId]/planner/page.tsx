'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { 
  Card, 
  CardHeader, 
  Button, 
  Badge, 
  ScoreCircle 
} from '@/components/ui';
import { 
  Filter, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  ChevronRight,
  Lock,
  Play,
  Pause,
  Search
} from 'lucide-react';
import { useState } from 'react';
import { cn, getSeverityColor, extractPath } from '@/lib/utils';

type TaskStatus = 'all' | 'open' | 'in_progress' | 'review' | 'done';
type Severity = 'all' | 'critical' | 'warning' | 'info';

export default function FixPlannerPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus>('all');
  const [severityFilter, setSeverityFilter] = useState<Severity>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const queryClient = useQueryClient();

  const { data: projectData } = useQuery({
    queryKey: ['project', params.projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}`);
      if (!res.ok) throw new Error('Failed to fetch project');
      return res.json();
    },
  });

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', params.projectId, statusFilter, severityFilter],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (statusFilter !== 'all') searchParams.set('status', statusFilter);
      if (severityFilter !== 'all') searchParams.set('severity', severityFilter);
      const res = await fetch(`/api/projects/${params.projectId}/tasks?${searchParams}`);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const res = await fetch(`/api/projects/${params.projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update task');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', params.projectId] });
    },
  });

  const project = projectData?.data;
  const tasks = tasksData?.data || [];
  const stats = tasksData?.stats || {};
  const foundationScore = project?.foundation_score || 0;

  const filteredTasks = tasks.filter((task: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.topIssue?.toLowerCase().includes(query) ||
      task.page?.url?.toLowerCase().includes(query) ||
      task.page?.title?.toLowerCase().includes(query)
    );
  });

  // Map status to display buckets
  const tasksByStatus = {
    open: tasks.filter((t: any) => t.status === 'queued').length,
    in_progress: tasks.filter((t: any) => ['assigned', 'draft_ready'].includes(t.status)).length,
    review: tasks.filter((t: any) => t.status === 'review_ready').length,
    done: tasks.filter((t: any) => ['publish_ready', 'published'].includes(t.status)).length,
  };

  const criticalOpen = tasks.filter((t: any) => t.severity === 'critical' && t.status === 'queued').length;
  const warningsOpen = tasks.filter((t: any) => t.severity === 'warning' && t.status === 'queued').length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'published':
      case 'publish_ready':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'assigned':
      case 'draft_ready':
        return <Play className="w-4 h-4 text-blue-500" />;
      case 'review_ready':
        return <Pause className="w-4 h-4 text-purple-500" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getNextStatus = (current: string) => {
    const flow = ['queued', 'assigned', 'draft_ready', 'review_ready', 'publish_ready', 'published'];
    const currentIndex = flow.indexOf(current);
    return flow[Math.min(currentIndex + 1, flow.length - 1)];
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      queued: 'Start',
      assigned: 'Mark Draft Ready',
      draft_ready: 'Send to Review',
      review_ready: 'Approve',
      publish_ready: 'Publish',
    };
    return labels[status] || 'Next';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fix Planner</h1>
          <p className="text-slate-600 mt-1">
            Work through fixes to improve your foundation score
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ScoreCircle score={foundationScore} size="md" showLabel label="Foundation" />
          {foundationScore >= 80 && (
            <Link href={`/app/${params.projectId}/growth`}>
              <Button>
                View Growth Planner
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button 
          className={cn(
            'text-left p-4 rounded-lg border bg-white cursor-pointer transition-all hover:shadow-sm',
            statusFilter === 'open' && 'ring-2 ring-primary-500'
          )}
          onClick={() => setStatusFilter(statusFilter === 'open' ? 'all' : 'open')}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Clock className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{tasksByStatus.open}</p>
              <p className="text-sm text-slate-600">To Do</p>
            </div>
          </div>
        </button>

        <button 
          className={cn(
            'text-left p-4 rounded-lg border bg-white cursor-pointer transition-all hover:shadow-sm',
            statusFilter === 'in_progress' && 'ring-2 ring-primary-500'
          )}
          onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Play className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{tasksByStatus.in_progress}</p>
              <p className="text-sm text-slate-600">In Progress</p>
            </div>
          </div>
        </button>

        <button 
          className={cn(
            'text-left p-4 rounded-lg border bg-white cursor-pointer transition-all hover:shadow-sm',
            statusFilter === 'review' && 'ring-2 ring-primary-500'
          )}
          onClick={() => setStatusFilter(statusFilter === 'review' ? 'all' : 'review')}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Pause className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{tasksByStatus.review}</p>
              <p className="text-sm text-slate-600">In Review</p>
            </div>
          </div>
        </button>

        <button 
          className={cn(
            'text-left p-4 rounded-lg border bg-white cursor-pointer transition-all hover:shadow-sm',
            statusFilter === 'done' && 'ring-2 ring-primary-500'
          )}
          onClick={() => setStatusFilter(statusFilter === 'done' ? 'all' : 'done')}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{tasksByStatus.done}</p>
              <p className="text-sm text-slate-600">Completed</p>
            </div>
          </div>
        </button>
      </div>

      {/* Progress to Growth Planner */}
      {foundationScore < 80 && (
        <Card className="bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-200 rounded-full">
                <Lock className="w-6 h-6 text-slate-500" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Growth Planner Locked</h3>
                <p className="text-sm text-slate-600">
                  Fix {criticalOpen} critical and {warningsOpen} warning issues to unlock
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">Progress to unlock</p>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (foundationScore / 80) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-slate-700">{foundationScore}/80</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Filters and Search */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search tasks or pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity)}
              className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Severity</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Tasks List */}
      <Card>
        <CardHeader 
          title="Fix Tasks" 
          description={`${filteredTasks.length} tasks`}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900">All caught up!</h3>
            <p className="text-slate-600">No tasks match your current filters</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task: any) => (
              <div
                key={task.id}
                className={cn(
                  'p-4 rounded-lg border transition-colors',
                  task.status === 'published' 
                    ? 'bg-slate-50 border-slate-200' 
                    : 'bg-white border-slate-200 hover:border-slate-300'
                )}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => {
                      if (task.status !== 'published') {
                        updateTaskMutation.mutate({
                          taskId: task.id,
                          status: getNextStatus(task.status),
                        });
                      }
                    }}
                    className="mt-1"
                  >
                    {getStatusIcon(task.status)}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={cn(
                        'font-medium',
                        task.status === 'published' ? 'text-slate-500 line-through' : 'text-slate-900'
                      )}>
                        {task.topIssue || task.page?.title || 'Fix Page'}
                      </h4>
                      <Badge className={getSeverityColor(task.severity)} size="sm">
                        {task.severity}
                      </Badge>
                      {task.page?.role && (
                        <Badge className="bg-slate-100 text-slate-700" size="sm">
                          {task.page.role}
                        </Badge>
                      )}
                    </div>
                    
                    {task.page?.url && (
                      <Link 
                        href={`/app/${params.projectId}/pages/${task.page_id}`}
                        className="text-sm text-primary-600 hover:text-primary-700"
                      >
                        {extractPath(task.page.url)}
                      </Link>
                    )}
                    
                    {task.fixItems && task.fixItems.length > 1 && (
                      <p className="text-sm text-slate-500 mt-1">
                        +{task.fixItems.length - 1} more issues
                      </p>
                    )}

                    {task.acceptance_criteria && task.acceptance_criteria.length > 0 && (
                      <p className="text-sm text-slate-500 mt-1">
                        ✓ {task.acceptance_criteria[0]}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {task.page?.health_score !== undefined && (
                      <ScoreCircle score={task.page.health_score} size="sm" />
                    )}
                    {task.status !== 'published' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          updateTaskMutation.mutate({
                            taskId: task.id,
                            status: getNextStatus(task.status),
                          });
                        }}
                      >
                        {getStatusLabel(task.status)}
                      </Button>
                    )}
                    <Link href={`/app/${params.projectId}/pages/${task.page_id}`}>
                      <Button variant="ghost" size="sm">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
