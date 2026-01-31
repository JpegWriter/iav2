'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { 
  Card, 
  CardHeader, 
  Button, 
  Badge, 
  ScoreCircle,
  ImageUploadButton 
} from '@/components/ui';
import { 
  Lock,
  Unlock,
  Calendar,
  Target,
  FileText,
  Plus,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Clock,
  Sparkles,
  TrendingUp,
  Download,
  AlertTriangle,
  Info,
  Zap,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { TaskDetailPanel } from '@/components/growth/TaskDetailPanel';

// ============================================================================
// TYPES - Support both new personalized and legacy template structures
// ============================================================================

// New personalized plan task structure
interface GrowthTask {
  id: string;
  month: number;
  title: string;
  slug: string;
  action: string;
  role: 'money' | 'trust' | 'support' | 'authority';
  supportsPage: string | null;
  supportType: string | null;
  primaryService: string;
  primaryLocation: string | null;
  targetAudience: string;
  searchIntent: 'buy' | 'compare' | 'trust' | 'learn';
  estimatedWords: number;
  channel: 'wp' | 'gmb' | 'li';
  status: 'planned' | 'briefed' | 'writing' | 'review' | 'published';
  briefId: string | null;
  localAnchoring: string | null;
  experienceRequired: string[];
  // SEO Options
  seoTitleOptions?: string[];
  h1Options?: string[];
  metaDescriptionOptions?: string[];
  selectedSeoTitleIndex?: number | null;
  selectedH1Index?: number | null;
  selectedMetaIndex?: number | null;
  seoLocked?: boolean;
  proofElements: string[];
  reviewThemesToUse: string[];
  internalLinksUp: string[];
  internalLinksDown: string[];
  conversionPath: string;
  // Cadence scheduling
  cadenceWeek?: 1 | 2 | 3 | 4;
  cadenceSlot?: 'money' | 'support' | 'case-study' | 'authority';
  publishAt?: string;
  // Vision evidence
  imagePackId?: string;
  imageCount?: number;
}

interface GrowthPlanMonth {
  month: number;
  theme: string;
  focus?: string;
  monthlyGoal?: string;
  kpis?: string[];
  tasks?: GrowthTask[];
  // Legacy support
  topics?: LegacyTopic[];
}

// Legacy template structure (for backwards compatibility)
interface LegacyTopic {
  id: string;
  title: string;
  page_type: 'money' | 'trust' | 'support';
  channel: 'wordpress' | 'gmb' | 'linkedin';
  status: 'planned' | 'briefed' | 'writing' | 'review' | 'published';
  brief_id?: string;
}

interface QualityScore {
  personalization: number;
  conversionAlignment: number;
  localRelevance: number;
  trustStrength: number;
  taskUniqueness: number;
  overall: number;
}

export default function GrowthPlannerPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [expandedMonth, setExpandedMonth] = useState<number | null>(1);
  const [selectedTask, setSelectedTask] = useState<GrowthTask | null>(null);

  const queryClient = useQueryClient();

  const { data: projectData } = useQuery({
    queryKey: ['project', params.projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}`);
      if (!res.ok) throw new Error('Failed to fetch project');
      return res.json();
    },
  });

  const { data: growthPlanData, isLoading } = useQuery({
    queryKey: ['growth-plan', params.projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}/growth-plan`);
      if (!res.ok) throw new Error('Failed to fetch growth plan');
      return res.json();
    },
    // DEV MODE: Always fetch in development
    enabled: process.env.NODE_ENV === 'development' || (projectData?.data?.foundation_score || 0) >= 80,
  });

  const generatePlanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}/growth-plan/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to generate growth plan');
      return res.json();
    },
    onSuccess: () => {
      // Force immediate refetch
      queryClient.invalidateQueries({ queryKey: ['growth-plan', params.projectId] });
    },
  });

  const clearPlanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}/growth-plan`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to clear growth plan');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['growth-plan', params.projectId] });
    },
  });

  // Generate brief and start writing job for a task
  const [generatingBriefTaskId, setGeneratingBriefTaskId] = useState<string | null>(null);
  
  const generateBriefMutation = useMutation({
    mutationFn: async (taskId: string) => {
      setGeneratingBriefTaskId(taskId);
      const res = await fetch(`/api/projects/${params.projectId}/writer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          publishingTargets: { wordpress: true, linkedin: false, gmb: false, reddit: false },
          toneProfileId: 'friendly-expert',
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to generate brief');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['growth-plan', params.projectId] });
      setGeneratingBriefTaskId(null);
    },
    onError: () => {
      setGeneratingBriefTaskId(null);
    },
  });

  const project = projectData?.data;
  const foundationScore = project?.foundation_score || 0;
  // DEV MODE: Always unlock growth planner for testing
  const isDev = process.env.NODE_ENV === 'development';
  const isUnlocked = isDev || foundationScore >= 80;
  const growthPlan = growthPlanData?.data;

  // Get months from the plan - supports both new (tasks) and legacy (topics) structures
  const planMonths: GrowthPlanMonth[] = growthPlan?.months || [];
  
  // Check if this is a personalized plan (has tasks) vs template (has topics)
  const isPersonalized = planMonths.length > 0 && (planMonths[0]?.tasks?.length ?? 0) > 0;

  // Helper to get items from a month (supports both structures)
  const getMonthItems = (month: GrowthPlanMonth) => {
    if (month.tasks && month.tasks.length > 0) {
      return month.tasks;
    }
    if (month.topics && month.topics.length > 0) {
      // Convert legacy topics to task-like structure for rendering
      return month.topics.map(t => ({
        id: t.id,
        title: t.title,
        role: t.page_type as any,
        channel: t.channel === 'wordpress' ? 'wp' : t.channel === 'linkedin' ? 'li' : t.channel,
        status: t.status,
        primaryService: '',
        primaryLocation: null,
        supportsPage: null,
        estimatedWords: 1500,
      }));
    }
    return [];
  };

  // Calculate stats
  const totalTasks = planMonths.reduce((acc, m) => acc + getMonthItems(m).length, 0);
  const briefedTasks = planMonths.reduce((acc, m) => 
    acc + getMonthItems(m).filter(t => t.status === 'briefed').length, 0);
  const publishedTasks = planMonths.reduce((acc, m) => 
    acc + getMonthItems(m).filter(t => t.status === 'published').length, 0);

  // Download plan as JSON for developer handoff
  const downloadPlan = () => {
    const planData = {
      projectId: params.projectId,
      projectName: project?.name || 'Unknown Project',
      exportedAt: new Date().toISOString(),
      foundationScore,
      isPersonalized,
      totalMonths: planMonths.length,
      totalTasks,
      qualityScore: growthPlan?.qualityScore || null,
      warnings: growthPlan?.warnings || [],
      assumptions: growthPlan?.assumptions || [],
      months: planMonths.map(month => ({
        month: month.month,
        theme: month.theme,
        focus: month.focus,
        monthlyGoal: month.monthlyGoal,
        kpis: month.kpis,
        tasks: getMonthItems(month),
      })),
    };

    const blob = new Blob([JSON.stringify(planData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `growth-plan-${params.projectId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800';
      case 'review':
        return 'bg-purple-100 text-purple-800';
      case 'writing':
        return 'bg-blue-100 text-blue-800';
      case 'briefed':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  // Handle image upload completion - refetch to update badge
  const handleImageUploadComplete = (packId: string, imageCount: number) => {
    // Refetch growth plan to update task with new image info
    queryClient.invalidateQueries({ queryKey: ['growth-plan', params.projectId] });
  };

  const getPageTypeColor = (type: string) => {
    switch (type) {
      case 'money':
        return 'bg-emerald-100 text-emerald-800';
      case 'trust':
        return 'bg-blue-100 text-blue-800';
      case 'authority':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getCadenceSlotColor = (slot: string) => {
    switch (slot) {
      case 'money':
        return 'bg-green-500 text-white';
      case 'support':
        return 'bg-amber-500 text-white';
      case 'case-study':
        return 'bg-blue-500 text-white';
      case 'authority':
        return 'bg-purple-500 text-white';
      default:
        return 'bg-slate-500 text-white';
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'wordpress':
      case 'wp':
        return '🌐';
      case 'gmb':
        return '📍';
      case 'linkedin':
      case 'li':
        return '💼';
      default:
        return '📄';
    }
  };

  const getFocusColor = (focus: string) => {
    switch (focus) {
      case 'foundation':
        return 'border-red-200 bg-red-50';
      case 'depth':
        return 'border-blue-200 bg-blue-50';
      case 'expansion':
        return 'border-green-200 bg-green-50';
      case 'authority':
        return 'border-purple-200 bg-purple-50';
      case 'optimization':
        return 'border-amber-200 bg-amber-50';
      default:
        return 'border-slate-200 bg-slate-50';
    }
  };

  // Locked state
  if (!isUnlocked) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Growth Planner</h1>
            <p className="text-slate-600 mt-1">
              12-month content strategy with ready-to-use briefs
            </p>
          </div>
        </div>

        <Card className="bg-slate-50 border-slate-200">
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              Growth Planner is Locked
            </h2>
            <p className="text-slate-600 max-w-md mx-auto mb-6">
              Complete your foundation fixes to unlock the 12-month growth planner. 
              You need a foundation score of 80 or higher.
            </p>

            <div className="max-w-sm mx-auto mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">Current Progress</span>
                <span className="text-sm font-medium text-slate-900">{foundationScore}/80</span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (foundationScore / 80) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {80 - foundationScore} points to go
              </p>
            </div>

            <Link href={`/app/${params.projectId}/planner`}>
              <Button size="lg">
                Go to Fix Planner
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </Card>

        {/* Preview of what's coming */}
        <Card className="opacity-50">
          <CardHeader 
            title="What's Included" 
            description="Here's what you'll unlock"
          />
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <Calendar className="w-8 h-8 text-primary-600 mb-3" />
              <h3 className="font-medium text-slate-900 mb-1">12-Month Calendar</h3>
              <p className="text-sm text-slate-600">Strategic content schedule with themes for each month</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <FileText className="w-8 h-8 text-primary-600 mb-3" />
              <h3 className="font-medium text-slate-900 mb-1">Ready Briefs</h3>
              <p className="text-sm text-slate-600">Each topic comes with GPT and human briefs</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <Target className="w-8 h-8 text-primary-600 mb-3" />
              <h3 className="font-medium text-slate-900 mb-1">Multi-Channel</h3>
              <p className="text-sm text-slate-600">WordPress, GMB posts, and LinkedIn content</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Unlocked state
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-full">
            <Unlock className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Growth Planner</h1>
            <p className="text-slate-600 mt-1">
              Your 12-month content roadmap is ready
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ScoreCircle score={foundationScore} size="md" showLabel label="Foundation" />
          {/* DEV: Master Profile Debug Link */}
          {isDev && (
            <a
              href={`/api/projects/${params.projectId}/master-profile`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 transition-colors"
              title="View Master Profile JSON (Dev Only)"
            >
              🔍 Master Profile
            </a>
          )}
          {!growthPlan && (
            <Button 
              onClick={() => generatePlanMutation.mutate()}
              disabled={generatePlanMutation.isPending}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Plan
            </Button>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Calendar className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">12</p>
              <p className="text-sm text-slate-600">Months Planned</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {totalTasks}
              </p>
              <p className="text-sm text-slate-600">Content Pieces</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {briefedTasks}
              </p>
              <p className="text-sm text-slate-600">Ready to Write</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {publishedTasks}
              </p>
              <p className="text-sm text-slate-600">Published</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Personalization Indicator */}
      {isPersonalized && (
        <Card className="p-4 bg-gradient-to-r from-primary-50 to-blue-50 border-primary-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Zap className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-medium text-slate-900">Personalized Plan</h3>
                <p className="text-sm text-slate-600">
                  Generated from your site structure, services, and business context
                </p>
              </div>
            </div>
            {growthPlan?.qualityScore && (
              <div className="text-right">
                <p className="text-2xl font-bold text-primary-600">{growthPlan.qualityScore.overall}/100</p>
                <p className="text-xs text-slate-500">Quality Score</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Cadence Schedule Info */}
      {growthPlan?.cadenceReport && (
        <Card className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-slate-900">4-Post Monthly Cadence</h3>
                <p className="text-sm text-slate-600">
                  Plan starts {new Date(growthPlan.cadenceReport.planStartDate).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 rounded bg-green-500 text-white font-medium">
                  💰 {growthPlan.cadenceReport.bySlot?.money || 0}
                </span>
                <span className="px-2 py-1 rounded bg-amber-500 text-white font-medium">
                  📚 {growthPlan.cadenceReport.bySlot?.support || 0}
                </span>
                <span className="px-2 py-1 rounded bg-blue-500 text-white font-medium">
                  📸 {growthPlan.cadenceReport.bySlot?.['case-study'] || 0}
                </span>
                <span className="px-2 py-1 rounded bg-purple-500 text-white font-medium">
                  🎓 {growthPlan.cadenceReport.bySlot?.authority || 0}
                </span>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-green-600">
                  {growthPlan.cadenceReport.completeMonths}/{planMonths.length}
                </p>
                <p className="text-xs text-slate-500">Complete Months</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Warnings/Missing Inputs */}
      {growthPlan?.warnings?.length > 0 && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-900">Improve Plan Quality</h3>
              <ul className="text-sm text-amber-700 mt-1 space-y-1">
                {growthPlan.warnings.slice(0, 3).map((warning: string, i: number) => (
                  <li key={i}>• {warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* No Plan Yet State */}
      {planMonths.length === 0 && (
        <Card className="p-8 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">No Growth Plan Yet</h2>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            Generate a personalized 12-month content strategy based on your website, 
            services, and business context.
          </p>
          <Button 
            onClick={() => generatePlanMutation.mutate()}
            disabled={generatePlanMutation.isPending}
            size="lg"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {generatePlanMutation.isPending ? 'Generating...' : 'Generate Personalized Plan'}
          </Button>
        </Card>
      )}

      {/* Monthly Breakdown */}
      {planMonths.length > 0 && (
        <Card>
          <CardHeader 
            title="Content Calendar" 
            description={isPersonalized ? "Personalized monthly content tasks" : "Click on a month to see tasks"}
            action={
              <div className="flex gap-2">
                {growthPlan && (
                  <>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        if (confirm('Are you sure you want to clear the plan? This cannot be undone.')) {
                          clearPlanMutation.mutate();
                        }
                      }}
                      disabled={clearPlanMutation.isPending}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      {clearPlanMutation.isPending ? 'Clearing...' : 'Clear Plan'}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => generatePlanMutation.mutate()}
                      disabled={generatePlanMutation.isPending}
                    >
                      <Sparkles className="w-4 h-4 mr-1" />
                      {generatePlanMutation.isPending ? 'Generating...' : 'Regenerate'}
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Task
                </Button>
              </div>
            }
          />

          <div className="space-y-3">
            {planMonths.map((month) => {
              const monthItems = getMonthItems(month);
              
              return (
                <div key={month.month} className={cn(
                  "border rounded-lg overflow-hidden",
                  month.focus ? getFocusColor(month.focus) : "border-slate-200"
                )}>
                  <button
                    onClick={() => setExpandedMonth(expandedMonth === month.month ? null : month.month)}
                    className="w-full px-4 py-3 hover:bg-white/50 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                        <span className="text-primary-700 font-bold">{month.month}</span>
                      </div>
                      <div className="text-left">
                        <h3 className="font-medium text-slate-900">
                          Month {month.month}: {month.theme}
                        </h3>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-slate-600">{monthItems.length} tasks</p>
                          {month.focus && (
                            <Badge className="bg-white/50 text-slate-600" size="sm">
                              {month.focus}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronDown className={cn(
                      'w-5 h-5 text-slate-400 transition-transform',
                      expandedMonth === month.month && 'rotate-180'
                    )} />
                  </button>

                  {expandedMonth === month.month && (
                    <div className="p-4 border-t border-slate-200 bg-white">
                      {/* Monthly Goal */}
                      {month.monthlyGoal && (
                        <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                          <p className="text-sm text-slate-600">
                            <strong>Goal:</strong> {month.monthlyGoal}
                          </p>
                        </div>
                      )}
                      
                      <div className="space-y-3">
                        {monthItems.map((task: any) => (
                          <div
                            key={task.id}
                            className="p-3 bg-white border border-slate-200 rounded-lg hover:border-primary-300 hover:shadow-sm transition-all cursor-pointer"
                            onClick={() => setSelectedTask(task)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="flex flex-col items-center">
                                  <span className="text-xl">{getChannelIcon(task.channel)}</span>
                                  {task.cadenceWeek && (
                                    <span className="text-[10px] font-medium text-slate-400 mt-0.5">
                                      Wk {task.cadenceWeek}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <h4 className="font-medium text-slate-900">{task.title}</h4>
                                  {/* Show personalization context */}
                                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                    {task.primaryService && (
                                      <span>
                                        {task.primaryService}
                                        {task.primaryLocation && ` • ${task.primaryLocation}`}
                                      </span>
                                    )}
                                    {task.publishAt && (
                                      <span className="flex items-center gap-1 text-primary-600">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(task.publishAt).toLocaleDateString('en-GB', {
                                          day: 'numeric',
                                          month: 'short',
                                        })}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    {task.cadenceSlot && (
                                      <Badge className={getCadenceSlotColor(task.cadenceSlot)} size="sm">
                                        {task.cadenceSlot}
                                      </Badge>
                                    )}
                                    <Badge className={getPageTypeColor(task.role || task.page_type)} size="sm">
                                      {task.role || task.page_type}
                                    </Badge>
                                    <Badge className={getStatusColor(task.status)} size="sm">
                                      {task.status}
                                    </Badge>
                                    {task.supportsPage && (
                                      <Badge className="bg-slate-100 text-slate-600" size="sm">
                                        → {task.supportsPage}
                                      </Badge>
                                    )}
                                    {task.imagePackId && (
                                      <Badge className="bg-emerald-100 text-emerald-700" size="sm">
                                        <ImageIcon className="w-3 h-3 mr-1" />
                                        {task.imageCount || 1} image{(task.imageCount || 1) > 1 ? 's' : ''}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <ImageUploadButton
                                  projectId={params.projectId}
                                  taskId={task.id}
                                  taskTitle={task.title}
                                  primaryService={task.primaryService}
                                  targetAudience={task.targetAudience}
                                  existingPackId={task.imagePackId}
                                  isCaseStudy={task.cadenceSlot === 'case-study' || task.role === 'trust'}
                                  onUploadComplete={handleImageUploadComplete}
                                />
                                {task.status === 'planned' && (
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      generateBriefMutation.mutate(task.id);
                                    }}
                                    disabled={generatingBriefTaskId === task.id}
                                  >
                                    {generatingBriefTaskId === task.id ? (
                                      <>
                                        <Sparkles className="w-4 h-4 mr-1 animate-spin" />
                                        Generating...
                                      </>
                                    ) : (
                                      'Generate Brief'
                                    )}
                                  </Button>
                                )}
                                {task.status === 'briefed' && (
                                  <Button 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTask(task);
                                    }}
                                  >
                                    Create Article
                                  </Button>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTask(task);
                                  }}
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Developer Export Section */}
      {isDev && (
        <Card className="p-6 bg-slate-50 border-dashed border-2 border-slate-300">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <Download className="w-5 h-5" />
                Developer Export
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Download the 12-month growth plan as JSON for backend handoff
              </p>
            </div>
            <Button onClick={downloadPlan} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Download Plan (JSON)
            </Button>
          </div>
        </Card>
      )}

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          projectId={params.projectId}
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onStatusChange={() => {
            queryClient.invalidateQueries({ queryKey: ['growth-plan', params.projectId] });
          }}
        />
      )}
    </div>
  );
}
