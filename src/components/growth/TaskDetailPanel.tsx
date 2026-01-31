'use client';

// SEO Heading Scorer Integration - v2
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Card, 
  Button, 
  Badge,
  Textarea 
} from '@/components/ui';
import { 
  X,
  Sparkles,
  FileText,
  Send,
  Edit3,
  Eye,
  Check,
  AlertCircle,
  ExternalLink,
  Copy,
  Clock,
  Loader2,
  Globe,
  RefreshCw,
  Lock,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SeoHeadingSelector } from './SeoHeadingSelector';
import { scoreHeadingSet, scoreH1WithAlignment, validateTitleH1Alignment, type ScoreResult } from '@/lib/writer/seoHeadingScorer';

// ============================================================================
// TYPES
// ============================================================================

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
  cadenceSlot?: 'money' | 'support' | 'case-study' | 'authority';
  publishAt?: string;
  imagePackId?: string;
  // SEO Options
  seoTitleOptions?: string[];
  h1Options?: string[];
  metaDescriptionOptions?: string[];
  selectedSeoTitleIndex?: number | null;
  selectedH1Index?: number | null;
  selectedMetaIndex?: number | null;
  seoLocked?: boolean;
}

interface WriterJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  writer_outputs?: WriterOutput[];
}

interface WriterOutput {
  id: string;
  wp_title: string;
  wp_slug: string;
  wp_excerpt: string;
  wp_blocks: any[];
  wp_seo: {
    focusKeyphrase: string;
    seoTitle: string;
    metaDescription: string;
  };
  audit_data: {
    wordCount: number;
    readingTimeMinutes: number;
  };
}

interface TaskDetailPanelProps {
  projectId: string;
  task: GrowthTask;
  onClose: () => void;
  onStatusChange?: () => void;
}

// ============================================================================
// SCORED SEO SELECTION CARD
// ============================================================================

interface ScoredSeoSelectionCardProps {
  task: GrowthTask;
  seoSelection: {
    selectedTitleIndex: number | null;
    selectedH1Index: number | null;
    selectedMetaIndex: number | null;
  };
  setSeoSelection: React.Dispatch<React.SetStateAction<{
    selectedTitleIndex: number | null;
    selectedH1Index: number | null;
    selectedMetaIndex: number | null;
  }>>;
  seoLocked: boolean;
  seoSaved: boolean;
  savingSeo: boolean;
  onSave: () => Promise<void>;
}

function ScoredSeoSelectionCard({
  task,
  seoSelection,
  setSeoSelection,
  seoLocked,
  seoSaved,
  savingSeo,
  onSave,
}: ScoredSeoSelectionCardProps) {
  // Build focus keyword from task
  const focusKeyword = useMemo(() => {
    const parts: string[] = [];
    if (task.primaryService) parts.push(task.primaryService);
    if (task.primaryLocation) parts.push(task.primaryLocation);
    return parts.join(' ');
  }, [task.primaryService, task.primaryLocation]);

  const location = task.primaryLocation || '';
  
  // Score all options
  const titleScores = useMemo((): ScoreResult[] => {
    if (!task.seoTitleOptions) return [];
    const set = scoreHeadingSet(task.seoTitleOptions, { focusKeyword, location, headingType: 'title' });
    return set.results;
  }, [task.seoTitleOptions, focusKeyword, location]);

  const h1Scores = useMemo((): ScoreResult[] => {
    if (!task.h1Options) return [];
    const set = scoreHeadingSet(task.h1Options, { focusKeyword, location, headingType: 'h1' });
    return set.results;
  }, [task.h1Options, focusKeyword, location]);

  const metaScores = useMemo((): ScoreResult[] => {
    if (!task.metaDescriptionOptions) return [];
    const set = scoreHeadingSet(task.metaDescriptionOptions, { focusKeyword, location, headingType: 'meta' });
    return set.results;
  }, [task.metaDescriptionOptions, focusKeyword, location]);

  // Find best options for auto-selection
  const bestTitleIndex = useMemo(() => {
    if (titleScores.length === 0) return 0;
    return titleScores.reduce((best: number, curr: ScoreResult, idx: number) => 
      curr.score > titleScores[best].score ? idx : best, 0);
  }, [titleScores]);

  const bestH1Index = useMemo(() => {
    if (h1Scores.length === 0) return 0;
    return h1Scores.reduce((best: number, curr: ScoreResult, idx: number) => 
      curr.score > h1Scores[best].score ? idx : best, 0);
  }, [h1Scores]);

  const bestMetaIndex = useMemo(() => {
    if (metaScores.length === 0) return 0;
    return metaScores.reduce((best: number, curr: ScoreResult, idx: number) => 
      curr.score > metaScores[best].score ? idx : best, 0);
  }, [metaScores]);

  // Handler to select option by text (used by SeoHeadingSelector)
  const handleTitleSelect = (text: string) => {
    const idx = task.seoTitleOptions?.findIndex(t => t === text) ?? -1;
    if (idx >= 0) {
      setSeoSelection(prev => ({ ...prev, selectedTitleIndex: idx }));
    }
  };

  const handleH1Select = (text: string) => {
    const idx = task.h1Options?.findIndex(h => h === text) ?? -1;
    if (idx >= 0) {
      setSeoSelection(prev => ({ ...prev, selectedH1Index: idx }));
    }
  };

  const handleMetaSelect = (text: string) => {
    const idx = task.metaDescriptionOptions?.findIndex(m => m === text) ?? -1;
    if (idx >= 0) {
      setSeoSelection(prev => ({ ...prev, selectedMetaIndex: idx }));
    }
  };

  // Get selected values
  const selectedTitle = task.seoTitleOptions?.[seoSelection.selectedTitleIndex ?? -1] || '';
  const selectedH1 = task.h1Options?.[seoSelection.selectedH1Index ?? -1] || '';
  const selectedMeta = task.metaDescriptionOptions?.[seoSelection.selectedMetaIndex ?? -1] || '';

  return (
    <Card className="border-blue-200 bg-blue-50/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-slate-900 flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-600" />
          SEO Optimization Scores
        </h4>
        {seoLocked && !seoSaved && (
          <Badge className="bg-amber-100 text-amber-700 border-amber-300">
            <Lock className="w-3 h-3 mr-1" />
            Selection Required
          </Badge>
        )}
        {seoSaved && (
          <Badge className="bg-green-100 text-green-700 border-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            Saved
          </Badge>
        )}
      </div>
      <p className="text-sm text-slate-600 mb-4">
        Options are scored 0-100 based on SEO best practices. Higher scores = better ranking potential.
      </p>
      
      <div className="space-y-5">
        {/* SEO Title Selector */}
        {task.seoTitleOptions && task.seoTitleOptions.length > 0 && (
          <SeoHeadingSelector
            label="SEO Title Tag"
            options={task.seoTitleOptions}
            focusKeyword={focusKeyword}
            location={location}
            headingType="title"
            value={selectedTitle}
            onChange={handleTitleSelect}
            autoPickBest
            showConfirmOnRisky
          />
        )}

        {/* H1 Selector */}
        {task.h1Options && task.h1Options.length > 0 && (
          <>
            <SeoHeadingSelector
              label="H1 Heading"
              options={task.h1Options}
              focusKeyword={focusKeyword}
              location={location}
              headingType="h1"
              value={selectedH1}
              onChange={handleH1Select}
              autoPickBest
              showConfirmOnRisky
            />
            {/* Alignment Warning */}
            {selectedTitle && selectedH1 && (() => {
              const alignment = validateTitleH1Alignment(
                selectedTitle,
                selectedH1,
                task.primaryService,
                location
              );
              if (!alignment.aligned) {
                return (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">
                          {alignment.warning}
                        </p>
                        {alignment.suggestedH1 && (
                          <p className="text-xs text-amber-700 mt-1">
                            Suggested: <span className="font-medium">"{alignment.suggestedH1}"</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </>
        )}

        {/* Meta Description Selector */}
        {task.metaDescriptionOptions && task.metaDescriptionOptions.length > 0 && (
          <SeoHeadingSelector
            label="Meta Description"
            options={task.metaDescriptionOptions}
            focusKeyword={focusKeyword}
            location={location}
            headingType="meta"
            value={selectedMeta}
            onChange={handleMetaSelect}
            autoPickBest
            showConfirmOnRisky
          />
        )}

        {/* Save Button */}
        <Button
          onClick={onSave}
          disabled={savingSeo || seoSelection.selectedTitleIndex === null}
          className="w-full"
          variant={seoSaved ? 'outline' : 'primary'}
        >
          {savingSeo ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : seoSaved ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Selection Saved
            </>
          ) : (
            <>
              <Lock className="w-4 h-4 mr-2" />
              Lock SEO Selection
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TaskDetailPanel({ 
  projectId, 
  task, 
  onClose,
  onStatusChange 
}: TaskDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'brief' | 'article' | 'preview'>('brief');
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'success' | 'error'>('idle');
  
  // SEO Selection state
  const [seoSelection, setSeoSelection] = useState({
    selectedTitleIndex: task.selectedSeoTitleIndex ?? null,
    selectedH1Index: task.selectedH1Index ?? null,
    selectedMetaIndex: task.selectedMetaIndex ?? null,
  });
  const [savingSeo, setSavingSeo] = useState(false);
  const [seoSaved, setSeoSaved] = useState(false);

  const queryClient = useQueryClient();

  // Reset SEO selection when task changes
  useEffect(() => {
    setSeoSelection({
      selectedTitleIndex: task.selectedSeoTitleIndex ?? null,
      selectedH1Index: task.selectedH1Index ?? null,
      selectedMetaIndex: task.selectedMetaIndex ?? null,
    });
    setSeoSaved(task.selectedSeoTitleIndex !== null && task.selectedSeoTitleIndex !== undefined);
  }, [task.id, task.selectedSeoTitleIndex, task.selectedH1Index, task.selectedMetaIndex]);

  // SEO options detection
  const hasSeoOptions = task.seoTitleOptions && task.seoTitleOptions.length > 0;
  const seoLocked = task.seoLocked !== false && seoSelection.selectedTitleIndex === null;

  // Save SEO selection to API
  const handleSaveSeoSelection = async () => {
    setSavingSeo(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/growth-plan/tasks/${task.id}/seo-selection`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedSeoTitleIndex: seoSelection.selectedTitleIndex,
            selectedH1Index: seoSelection.selectedH1Index,
            selectedMetaIndex: seoSelection.selectedMetaIndex,
          }),
        }
      );
      if (response.ok) {
        setSeoSaved(true);
        queryClient.invalidateQueries({ queryKey: ['growth-plan', projectId] });
        onStatusChange?.();
      }
    } catch (error) {
      console.error('Failed to save SEO selection:', error);
    } finally {
      setSavingSeo(false);
    }
  };

  // Fetch writer job for this task
  const { data: writerJobData, isLoading: loadingJob } = useQuery({
    queryKey: ['writer-job', projectId, task.id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/writer?taskId=${task.id}`);
      if (!res.ok) return null;
      const data = await res.json();
      // Return the most recent job for this task
      const jobs = data.data || [];
      return jobs.find((j: WriterJob) => j.status === 'completed') || jobs[0] || null;
    },
    enabled: task.status !== 'planned',
  });

  const writerJob = writerJobData as WriterJob | null;
  const writerOutput = writerJob?.writer_outputs?.[0];

  // Generate brief mutation
  const generateBriefMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/writer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          publishingTargets: { wordpress: true, linkedin: false, gmb: false, reddit: false },
          toneProfileId: 'friendly-expert',
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to generate brief');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['writer-job', projectId, task.id] });
      queryClient.invalidateQueries({ queryKey: ['growth-plan', projectId] });
      onStatusChange?.();
    },
  });

  // Create article mutation (calls GPT to generate content)
  const createArticleMutation = useMutation({
    mutationFn: async () => {
      if (!writerJob?.id) throw new Error('No writer job found');
      
      const res = await fetch(`/api/projects/${projectId}/writer/${writerJob.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to generate article');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['writer-job', projectId, task.id] });
      setActiveTab('preview');
    },
  });

  // Regenerate article mutation (creates new job and generates fresh)
  const regenerateArticleMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Create a new writer job
      const briefRes = await fetch(`/api/projects/${projectId}/writer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          publishingTargets: { wordpress: true, linkedin: false, gmb: false, reddit: false },
          toneProfileId: 'friendly-expert',
        }),
      });
      if (!briefRes.ok) {
        const error = await briefRes.json();
        throw new Error(error.error || 'Failed to create new brief');
      }
      const briefData = await briefRes.json();
      const newJobId = briefData.data?.id;
      if (!newJobId) throw new Error('No job ID returned');
      
      // Step 2: Generate the article
      const genRes = await fetch(`/api/projects/${projectId}/writer/${newJobId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!genRes.ok) {
        const error = await genRes.json();
        throw new Error(error.error || 'Failed to regenerate article');
      }
      return genRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['writer-job', projectId, task.id] });
      setActiveTab('preview');
    },
  });

  // Publish to WordPress mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!writerOutput) throw new Error('No article to publish');
      
      setPublishStatus('publishing');
      const res = await fetch(`/api/projects/${projectId}/publishes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          channel: 'wordpress',
          title: writerOutput.wp_title,
          slug: writerOutput.wp_slug,
          excerpt: writerOutput.wp_excerpt,
          blocks: writerOutput.wp_blocks,
          seo: writerOutput.wp_seo,
          status: 'draft', // Publish as draft first
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to publish');
      }
      return res.json();
    },
    onSuccess: () => {
      setPublishStatus('success');
      queryClient.invalidateQueries({ queryKey: ['growth-plan', projectId] });
      onStatusChange?.();
    },
    onError: () => {
      setPublishStatus('error');
    },
  });

  // Render WordPress blocks as HTML preview
  const renderBlocksAsHtml = (blocks: any[]) => {
    if (!blocks || blocks.length === 0) return '<p>No content generated yet.</p>';
    
    return blocks.map((block, i) => {
      const { blockName, innerHTML, attrs } = block;
      
      switch (blockName) {
        case 'core/heading':
          const level = attrs?.level || 2;
          return `<h${level} class="text-${level === 2 ? '2xl' : level === 3 ? 'xl' : 'lg'} font-bold mb-3 mt-6">${innerHTML}</h${level}>`;
        
        case 'core/paragraph':
          return `<p class="mb-4 text-slate-700 leading-relaxed">${innerHTML}</p>`;
        
        case 'core/list':
          const listType = attrs?.ordered ? 'ol' : 'ul';
          return `<${listType} class="mb-4 pl-6 ${attrs?.ordered ? 'list-decimal' : 'list-disc'} space-y-2">${innerHTML}</${listType}>`;
        
        case 'core/quote':
          return `<blockquote class="border-l-4 border-primary-500 pl-4 italic my-6 text-slate-600">${innerHTML}</blockquote>`;
        
        case 'core/table':
          return `<div class="overflow-x-auto my-6"><table class="min-w-full border border-slate-200">${innerHTML}</table></div>`;
        
        case 'core/buttons':
          return `<div class="my-6">${innerHTML}</div>`;
        
        case 'core/image':
          return `<figure class="my-6"><div class="bg-slate-100 rounded-lg h-48 flex items-center justify-center text-slate-400">[Image: ${attrs?.alt || 'Image placeholder'}]</div></figure>`;
        
        default:
          return innerHTML ? `<div class="mb-4">${innerHTML}</div>` : '';
      }
    }).join('\n');
  };

  // Calculate workflow step
  const getWorkflowStep = () => {
    if (task.status === 'planned') return 1;
    if (task.status === 'briefed' && !writerOutput) return 2;
    if (writerOutput && task.status !== 'published') return 3;
    if (task.status === 'published') return 4;
    return 1;
  };

  const workflowStep = getWorkflowStep();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={cn(
                task.role === 'money' && 'bg-green-100 text-green-700',
                task.role === 'trust' && 'bg-blue-100 text-blue-700',
                task.role === 'support' && 'bg-purple-100 text-purple-700',
                task.role === 'authority' && 'bg-amber-100 text-amber-700'
              )}>
                {task.role}
              </Badge>
              <Badge className={cn(
                task.status === 'planned' && 'bg-slate-100 text-slate-600',
                task.status === 'briefed' && 'bg-amber-100 text-amber-700',
                task.status === 'writing' && 'bg-blue-100 text-blue-700',
                task.status === 'review' && 'bg-purple-100 text-purple-700',
                task.status === 'published' && 'bg-green-100 text-green-700'
              )}>
                {task.status}
              </Badge>
            </div>
            <h2 className="text-xl font-bold text-slate-900">{task.title}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {task.primaryService}
              {task.primaryLocation && ` • ${task.primaryLocation}`}
              {task.estimatedWords && ` • ~${task.estimatedWords} words`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Workflow Steps */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            {[
              { step: 1, label: 'Generate Brief', icon: FileText },
              { step: 2, label: 'Create Article', icon: Sparkles },
              { step: 3, label: 'Preview & Edit', icon: Eye },
              { step: 4, label: 'Publish', icon: Send },
            ].map(({ step, label, icon: Icon }, idx) => (
              <div key={step} className="flex items-center">
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  workflowStep === step && 'bg-primary-100 text-primary-700',
                  workflowStep > step && 'bg-green-100 text-green-700',
                  workflowStep < step && 'bg-slate-100 text-slate-400'
                )}>
                  {workflowStep > step ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {idx < 3 && (
                  <div className={cn(
                    'w-8 h-0.5 mx-1',
                    workflowStep > step ? 'bg-green-300' : 'bg-slate-200'
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Generate Brief */}
          {workflowStep === 1 && (
            <div className="space-y-6">
              {/* SEO Title Selection (if available) */}
              {hasSeoOptions && (
                <ScoredSeoSelectionCard
                  task={task}
                  seoSelection={seoSelection}
                  setSeoSelection={setSeoSelection}
                  seoLocked={seoLocked}
                  seoSaved={seoSaved}
                  savingSeo={savingSeo}
                  onSave={handleSaveSeoSelection}
                />
              )}

              <div className="text-center py-8">
                <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Ready to Generate Brief
                </h3>
                <p className="text-slate-600 max-w-md mx-auto mb-6">
                  Click below to create a detailed content brief using your business context, 
                  Master Profile, and SEO requirements.
                </p>
                <Button 
                  size="lg"
                  onClick={() => generateBriefMutation.mutate()}
                  disabled={generateBriefMutation.isPending || (hasSeoOptions && seoLocked && !seoSaved)}
                >
                  {generateBriefMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Generating Brief...
                    </>
                  ) : hasSeoOptions && seoLocked && !seoSaved ? (
                    <>
                      <Lock className="w-5 h-5 mr-2" />
                      Select SEO Options First
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      Generate Brief
                    </>
                  )}
                </Button>
              </div>
              
              {/* Task Details */}
              <Card className="p-4">
                <h4 className="font-semibold text-slate-900 mb-3">Task Details</h4>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Target Audience</dt>
                    <dd className="font-medium">{task.targetAudience || 'General'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Search Intent</dt>
                    <dd className="font-medium capitalize">{task.searchIntent}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Content Type</dt>
                    <dd className="font-medium capitalize">{task.cadenceSlot || task.role}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Word Target</dt>
                    <dd className="font-medium">{task.estimatedWords} words</dd>
                  </div>
                </dl>
              </Card>
            </div>
          )}

          {/* Step 2: Create Article */}
          {workflowStep === 2 && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <Sparkles className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Brief Ready - Create Article
                </h3>
                <p className="text-slate-600 max-w-md mx-auto mb-6">
                  Your content brief has been generated. Now let's create the full article 
                  with SEO-optimized WordPress blocks.
                </p>
                <Button 
                  size="lg"
                  onClick={() => createArticleMutation.mutate()}
                  disabled={createArticleMutation.isPending}
                >
                  {createArticleMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Creating Article...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      Create Article
                    </>
                  )}
                </Button>
              </div>

              {/* Brief Summary */}
              {writerJob && (
                <Card className="p-4">
                  <h4 className="font-semibold text-slate-900 mb-3">Brief Summary</h4>
                  <div className="text-sm text-slate-600 space-y-2">
                    <p><strong>Title:</strong> {task.title}</p>
                    <p><strong>Slug:</strong> /{task.slug}</p>
                    <p><strong>Word Target:</strong> {task.estimatedWords} words</p>
                    <p><strong>Role:</strong> {task.role} page</p>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Step 3: Preview & Edit */}
          {workflowStep === 3 && writerOutput && (
            <div className="space-y-6">
              {/* Tabs + Regenerate */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex gap-2">
                  <Button
                    variant={activeTab === 'preview' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('preview')}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant={activeTab === 'article' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('article')}
                  >
                    <Edit3 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => regenerateArticleMutation.mutate()}
                  disabled={regenerateArticleMutation.isPending}
                  className="text-amber-600 border-amber-300 hover:bg-amber-50"
                >
                  {regenerateArticleMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Regenerate
                    </>
                  )}
                </Button>
              </div>

              {/* Word Count Warning */}
              {(writerOutput.audit_data?.wordCount || 0) < 1200 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-800">Low Word Count Detected</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      This article is only {writerOutput.audit_data?.wordCount || 0} words. 
                      Target is 1,500-1,800 words for authority content. 
                      Click "Regenerate" to create a full-length article with the improved prompt.
                    </p>
                  </div>
                </div>
              )}

              {/* SEO Summary */}
              <Card className="p-4 bg-slate-50">
                <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  SEO Details
                </h4>
                <dl className="text-sm space-y-1">
                  <div className="flex">
                    <dt className="w-32 text-slate-500">Title Tag:</dt>
                    <dd className="flex-1 font-medium">{writerOutput.wp_seo?.seoTitle || writerOutput.wp_title}</dd>
                  </div>
                  <div className="flex">
                    <dt className="w-32 text-slate-500">Focus Keyword:</dt>
                    <dd className="flex-1 font-medium">{writerOutput.wp_seo?.focusKeyphrase}</dd>
                  </div>
                  <div className="flex">
                    <dt className="w-32 text-slate-500">Meta Description:</dt>
                    <dd className="flex-1 text-slate-600">{writerOutput.wp_seo?.metaDescription}</dd>
                  </div>
                  <div className="flex">
                    <dt className="w-32 text-slate-500">Word Count:</dt>
                    <dd className="flex-1">{writerOutput.audit_data?.wordCount || '—'} words</dd>
                  </div>
                </dl>
              </Card>

              {/* Content Preview */}
              {activeTab === 'preview' && (
                <Card className="p-6">
                  <h1 className="text-3xl font-bold mb-4">{writerOutput.wp_title}</h1>
                  <p className="text-slate-500 italic mb-6">{writerOutput.wp_excerpt}</p>
                  <div 
                    className="prose prose-slate max-w-none"
                    dangerouslySetInnerHTML={{ 
                      __html: renderBlocksAsHtml(writerOutput.wp_blocks) 
                    }}
                  />
                </Card>
              )}

              {/* Edit Mode */}
              {activeTab === 'article' && (
                <Card className="p-4">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Edit Article Content (Markdown)
                    </label>
                    <Textarea
                      rows={20}
                      value={editedContent || JSON.stringify(writerOutput.wp_blocks, null, 2)}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Note: Full rich text editing coming soon. For now, you can edit the WordPress blocks JSON directly.
                  </p>
                </Card>
              )}
            </div>
          )}

          {/* Step 4: Published */}
          {workflowStep === 4 && (
            <div className="text-center py-12">
              <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Published Successfully!
              </h3>
              <p className="text-slate-600 max-w-md mx-auto mb-6">
                Your article has been published to WordPress.
              </p>
              <Button variant="outline">
                <ExternalLink className="w-4 h-4 mr-2" />
                View on Website
              </Button>
            </div>
          )}

          {/* Error Display */}
          {(generateBriefMutation.isError || createArticleMutation.isError) && (
            <Card className="p-4 bg-red-50 border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-800">Error</h4>
                  <p className="text-sm text-red-600">
                    {(generateBriefMutation.error as Error)?.message || 
                     (createArticleMutation.error as Error)?.message || 
                     'An error occurred'}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Footer Actions */}
        {workflowStep === 3 && writerOutput && (
          <div className="border-t border-slate-200 p-4 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Clock className="w-4 h-4" />
                ~{writerOutput.audit_data?.readingTimeMinutes || 5} min read
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(writerOutput.wp_blocks, null, 2));
                }}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Blocks
                </Button>
                <Button 
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending || publishStatus === 'success'}
                >
                  {publishMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Publishing...
                    </>
                  ) : publishStatus === 'success' ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Published!
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Publish to WordPress
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
