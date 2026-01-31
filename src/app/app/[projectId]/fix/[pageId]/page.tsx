'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Card, 
  Button, 
  Badge,
} from '@/components/ui';
import { 
  ArrowLeft,
  RefreshCw,
  Save,
  Send,
  RotateCcw,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FixWorkspaceProps {
  params: {
    projectId: string;
    pageId: string;
  };
  searchParams: {
    taskId?: string;
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function FixWorkspacePage({ params, searchParams }: FixWorkspaceProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [categories, setCategories] = useState({
    titleMeta: true,
    headings: true,
    contentDepth: true,
    eeat: true,
    internalLinks: true,
  });
  
  const [showOriginal, setShowOriginal] = useState(true);
  const [showProposed, setShowProposed] = useState(true);
  const [expandedExplanations, setExpandedExplanations] = useState(true);

  // Fetch preview
  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/fix/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: params.projectId,
          pageId: params.pageId,
          taskId: searchParams.taskId,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Preview generation failed');
      }
      return res.json();
    },
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await fetch('/api/fix/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId,
          appliedCategories: categories,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Publish failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', params.projectId] });
      router.push(`/app/${params.projectId}/planner?published=true`);
    },
  });

  // Revert mutation
  const revertMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await fetch('/api/fix/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Revert failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', params.projectId] });
      previewMutation.reset();
    },
  });

  // Auto-generate preview on mount
  useEffect(() => {
    previewMutation.mutate();
  }, [params.pageId]);

  const preview = previewMutation.data;
  const isLoading = previewMutation.isPending;
  const error = previewMutation.error;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/app/${params.projectId}/planner`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Fix Planner
                </Button>
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">
                  Page Rehabilitation Mode
                </h1>
                <p className="text-sm text-slate-600">
                  Improving clarity, trust, and search understanding — without changing your voice.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {preview?.versionId && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => previewMutation.mutate()}
                    disabled={isLoading}
                  >
                    <RefreshCw className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
                    Regenerate
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => publishMutation.mutate(preview.versionId)}
                    disabled={publishMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                  </Button>
                  <Button
                    onClick={() => publishMutation.mutate(preview.versionId)}
                    disabled={publishMutation.isPending}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {publishMutation.isPending ? 'Publishing...' : 'Publish Improvements'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="max-w-7xl mx-auto px-4 py-12">
          <Card className="p-12 text-center">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-medium text-slate-900 mb-2">
              Analyzing and improving your page...
            </h2>
            <p className="text-slate-600">
              This may take 15-30 seconds. We're being careful not to change your voice.
            </p>
          </Card>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-12">
          <Card className="p-8 border-red-200 bg-red-50">
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-medium text-red-900 mb-2">
                  Failed to generate improvements
                </h2>
                <p className="text-red-700 mb-4">
                  {error instanceof Error ? error.message : 'Unknown error'}
                </p>
                <Button onClick={() => previewMutation.mutate()}>
                  Try Again
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Main Content */}
      {preview && !isLoading && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Category Toggles */}
          <Card className="mb-6">
            <div className="p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3">
                Choose which improvements to apply:
              </h3>
              <div className="flex flex-wrap gap-3">
                <CategoryToggle
                  label="Title & Meta"
                  checked={categories.titleMeta}
                  onChange={(v) => setCategories(c => ({ ...c, titleMeta: v }))}
                />
                <CategoryToggle
                  label="H1 & Headings"
                  checked={categories.headings}
                  onChange={(v) => setCategories(c => ({ ...c, headings: v }))}
                />
                <CategoryToggle
                  label="Content & Depth"
                  checked={categories.contentDepth}
                  onChange={(v) => setCategories(c => ({ ...c, contentDepth: v }))}
                />
                <CategoryToggle
                  label="Experience Signals (E-E-A-T)"
                  checked={categories.eeat}
                  onChange={(v) => setCategories(c => ({ ...c, eeat: v }))}
                />
                <CategoryToggle
                  label="Internal Linking"
                  checked={categories.internalLinks}
                  onChange={(v) => setCategories(c => ({ ...c, internalLinks: v }))}
                />
              </div>
            </div>
          </Card>

          {/* Three-Panel View */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Original */}
            <div className="lg:col-span-1">
              <Card>
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-medium text-slate-900">Current Page</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowOriginal(!showOriginal)}
                  >
                    {showOriginal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                {showOriginal && (
                  <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                    <FieldDisplay 
                      label="Title" 
                      value={preview.original.title} 
                      changed={preview.diff.fields.title.changed}
                    />
                    <FieldDisplay 
                      label="Meta Description" 
                      value={preview.original.metaDescription}
                      changed={preview.diff.fields.metaDescription.changed}
                    />
                    <FieldDisplay 
                      label="H1" 
                      value={preview.original.h1}
                      changed={preview.diff.fields.h1.changed}
                    />
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Content Preview</p>
                      <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded max-h-64 overflow-y-auto">
                        {preview.original.bodyText?.substring(0, 1000) || '[No content]'}
                        {(preview.original.bodyText?.length || 0) > 1000 && '...'}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Center: Proposed */}
            <div className="lg:col-span-1">
              <Card className="border-primary-200">
                <div className="p-4 border-b border-primary-200 bg-primary-50 flex items-center justify-between">
                  <h3 className="font-medium text-primary-900">Proposed Improvements</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowProposed(!showProposed)}
                  >
                    {showProposed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                {showProposed && (
                  <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                    <FieldDisplay 
                      label="Title" 
                      value={preview.proposed.title}
                      isNew={preview.diff.fields.title.changed}
                      enabled={categories.titleMeta}
                    />
                    <FieldDisplay 
                      label="Meta Description" 
                      value={preview.proposed.metaDescription}
                      isNew={preview.diff.fields.metaDescription.changed}
                      enabled={categories.titleMeta}
                    />
                    <FieldDisplay 
                      label="H1" 
                      value={preview.proposed.h1}
                      isNew={preview.diff.fields.h1.changed}
                      enabled={categories.headings}
                    />
                    
                    {/* Sections */}
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-2">Content Sections</p>
                      <div className="space-y-3">
                        {preview.proposed.sections?.map((section: any, idx: number) => (
                          <div 
                            key={idx}
                            className={cn(
                              'text-sm p-3 rounded border',
                              section.isNew 
                                ? 'bg-green-50 border-green-200' 
                                : 'bg-slate-50 border-slate-200',
                              !isSectionEnabled(section.type, categories) && 'opacity-50'
                            )}
                          >
                            {section.heading && (
                              <p className="font-medium text-slate-700 mb-1">{section.heading}</p>
                            )}
                            <div 
                              className="text-slate-600 prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: section.html?.substring(0, 300) + '...' }}
                            />
                            {section.isNew && (
                              <Badge className="mt-2 bg-green-100 text-green-700">New Section</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Internal Links */}
                    {preview.proposed.internalLinks?.length > 0 && (
                      <div className={cn(!categories.internalLinks && 'opacity-50')}>
                        <p className="text-xs font-medium text-slate-500 mb-2">Suggested Internal Links</p>
                        <ul className="space-y-2">
                          {preview.proposed.internalLinks.map((link: any, idx: number) => (
                            <li key={idx} className="text-sm">
                              <span className="text-primary-600">{link.anchor}</span>
                              <span className="text-slate-400 mx-2">→</span>
                              <span className="text-slate-600">{link.targetUrl}</span>
                              <p className="text-xs text-slate-500 mt-0.5">{link.reason}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>

            {/* Right: What Changed */}
            <div className="lg:col-span-1">
              <Card>
                <button
                  className="w-full p-4 border-b border-slate-200 flex items-center justify-between text-left"
                  onClick={() => setExpandedExplanations(!expandedExplanations)}
                >
                  <h3 className="font-medium text-slate-900">What Changed & Why</h3>
                  {expandedExplanations ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>
                
                {expandedExplanations && (
                  <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-green-50 rounded">
                        <p className="text-lg font-bold text-green-700">
                          +{preview.diff.summary.sectionsAdded}
                        </p>
                        <p className="text-xs text-green-600">Added</p>
                      </div>
                      <div className="p-2 bg-blue-50 rounded">
                        <p className="text-lg font-bold text-blue-700">
                          {preview.diff.summary.sectionsModified}
                        </p>
                        <p className="text-xs text-blue-600">Modified</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded">
                        <p className="text-lg font-bold text-slate-700">
                          +{preview.diff.summary.wordsAdded}
                        </p>
                        <p className="text-xs text-slate-600">Words</p>
                      </div>
                    </div>

                    {/* Explanations */}
                    <div className="space-y-3">
                      {preview.diff.explanations?.map((exp: any, idx: number) => (
                        <ExplanationCard key={idx} explanation={exp} />
                      ))}
                    </div>

                    {/* Warnings */}
                    {preview.warnings?.length > 0 && (
                      <div className="border-t border-slate-200 pt-4 mt-4">
                        <h4 className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          Validation Notes
                        </h4>
                        <ul className="space-y-2">
                          {preview.warnings.map((warning: any, idx: number) => (
                            <li key={idx} className="text-sm text-amber-600">
                              {warning.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Claims to Verify */}
                    {preview.proposed.notes?.claimsToVerify?.length > 0 && (
                      <div className="border-t border-slate-200 pt-4 mt-4">
                        <h4 className="text-sm font-medium text-slate-700 mb-2">
                          Claims to Verify
                        </h4>
                        <ul className="space-y-1">
                          {preview.proposed.notes.claimsToVerify.map((claim: string, idx: number) => (
                            <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                              <span className="text-slate-400">☐</span>
                              {claim}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Confidence Footer */}
          <Card className="mt-6 bg-slate-50 border-slate-200">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-700">
                  <Check className="w-4 h-4 inline-block text-green-500 mr-1" />
                  This page will improve clarity for visitors and search engines.
                </p>
                <p className="text-sm text-slate-500">
                  Your visual content and tone remain unchanged.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/app/${params.projectId}/planner`)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => publishMutation.mutate(preview.versionId)}
                  disabled={publishMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {publishMutation.isPending ? 'Publishing...' : 'Publish Improvements'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function CategoryToggle({ 
  label, 
  checked, 
  onChange 
}: { 
  label: string; 
  checked: boolean; 
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded-full border text-sm font-medium transition-colors',
        checked 
          ? 'bg-primary-100 border-primary-300 text-primary-700' 
          : 'bg-slate-100 border-slate-200 text-slate-500'
      )}
      onClick={() => onChange(!checked)}
    >
      {checked && <Check className="w-4 h-4 inline-block mr-1" />}
      {label}
    </button>
  );
}

function FieldDisplay({ 
  label, 
  value, 
  changed = false,
  isNew = false,
  enabled = true,
}: { 
  label: string; 
  value?: string;
  changed?: boolean;
  isNew?: boolean;
  enabled?: boolean;
}) {
  return (
    <div className={cn(!enabled && 'opacity-50')}>
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {isNew && <Badge className="text-xs bg-green-100 text-green-700">Changed</Badge>}
      </div>
      <p className={cn(
        'text-sm',
        value ? 'text-slate-900' : 'text-slate-400 italic'
      )}>
        {value || '[Missing]'}
      </p>
    </div>
  );
}

function ExplanationCard({ explanation }: { explanation: any }) {
  return (
    <div className="p-3 bg-slate-50 rounded-lg">
      <p className="text-xs font-medium text-primary-600 mb-1">{explanation.category}</p>
      {explanation.before && (
        <p className="text-xs text-slate-500 line-through mb-1">
          {explanation.before}
        </p>
      )}
      {explanation.after && (
        <p className="text-sm text-slate-700 mb-2">
          {explanation.after}
        </p>
      )}
      <p className="text-xs text-slate-600 italic">
        {explanation.reason}
      </p>
    </div>
  );
}

function isSectionEnabled(sectionType: string, categories: any): boolean {
  if (sectionType === 'intro' || sectionType === 'context') {
    return categories.contentDepth;
  }
  if (sectionType === 'experience' || sectionType === 'testimonial') {
    return categories.eeat;
  }
  return categories.contentDepth;
}
