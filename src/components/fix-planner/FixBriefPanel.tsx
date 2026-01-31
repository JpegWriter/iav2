'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge, Button, Card } from '@/components/ui';
import { 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check,
  Clock,
  FileText,
  AlertTriangle,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FixBriefPanelProps {
  projectId: string;
  pageId: string;
  taskId?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

export function FixBriefPanel({ projectId, pageId, taskId }: FixBriefPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [brief, setBrief] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);
  
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pages/${pageId}/fix-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to generate brief');
      return res.json();
    },
    onSuccess: (data) => {
      setBrief(data.brief);
      setExpanded(true);
    },
  });
  
  const copyPrompt = async () => {
    if (!brief?.writerPrompt) return;
    await navigator.clipboard.writeText(brief.writerPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Build the preview link
  const previewHref = taskId 
    ? `/app/${projectId}/fix/${pageId}?taskId=${taskId}`
    : `/app/${projectId}/fix/${pageId}`;
  
  if (!brief) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => generateMutation.mutate()}
        disabled={generateMutation.isPending}
        className="mt-2"
      >
        {generateMutation.isPending ? (
          <>
            <div className="w-4 h-4 border-2 border-slate-300 border-t-primary-500 rounded-full animate-spin mr-2" />
            Analyzing...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Fix Brief
          </>
        )}
      </Button>
    );
  }
  
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {/* Primary CTA - Preview Improvements */}
      <Link href={previewHref} className="block mb-4">
        <Button className="w-full bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600">
          <Sparkles className="w-4 h-4 mr-2" />
          Preview Improvements
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </Link>
      
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary-500" />
          <span className="text-sm font-medium text-slate-700">Fix Brief</span>
          <Badge className={cn('text-xs', PRIORITY_COLORS[brief.priority])}>
            {brief.priority}
          </Badge>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {brief.estimatedFixTime}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      
      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Score Summary */}
          <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-700">{brief.currentScore}</p>
              <p className="text-xs text-slate-500">Current</p>
            </div>
            <div className="text-slate-300">→</div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{brief.targetScore}</p>
              <p className="text-xs text-slate-500">Target</p>
            </div>
          </div>
          
          {/* Current Content Preview */}
          <div className="space-y-2">
            <button
              onClick={() => setContentExpanded(!contentExpanded)}
              className="flex items-center gap-2 text-sm font-medium text-slate-700"
            >
              <span>Current Page Content</span>
              {contentExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {contentExpanded && (
              <div className="p-3 bg-slate-50 rounded-lg max-h-48 overflow-y-auto">
                <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono">
                  {brief.currentContent || 'No content available'}
                </pre>
              </div>
            )}
          </div>
          
          {/* Fix Sections */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Required Improvements</p>
            {brief.fixSections?.map((section: any, idx: number) => (
              <div 
                key={idx} 
                className="p-3 bg-white border border-slate-200 rounded-lg space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full', PRIORITY_DOT[section.priority])} />
                    <span className="text-sm font-medium text-slate-700">
                      {section.categoryLabel}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {section.currentScore} → {section.targetScore}
                  </span>
                </div>
                
                <p className="text-xs text-slate-600">
                  <span className="font-medium">Current:</span> {section.currentState}
                </p>
                <p className="text-xs text-green-600">
                  <span className="font-medium">Target:</span> {section.targetState}
                </p>
                
                <ul className="space-y-1 mt-2">
                  {section.specificActions?.map((action: string, actionIdx: number) => (
                    <li key={actionIdx} className="text-xs text-slate-600 flex items-start gap-2">
                      <span className="text-primary-500 mt-0.5">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          
          {/* Writer Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Writer Prompt</p>
              <Button
                variant="outline"
                size="sm"
                onClick={copyPrompt}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-1 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1" />
                    Copy Prompt
                  </>
                )}
              </Button>
            </div>
            <div className="p-3 bg-slate-900 rounded-lg max-h-64 overflow-y-auto">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                {brief.writerPrompt?.substring(0, 1500)}
                {brief.writerPrompt?.length > 1500 && '\n\n[... click Copy to get full prompt ...]'}
              </pre>
            </div>
          </div>
          
          {/* Success Criteria */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Success Criteria</p>
            <ul className="space-y-1">
              {brief.successCriteria?.map((criteria: string, idx: number) => (
                <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                  <span className="text-slate-300">☐</span>
                  <span>{criteria}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default FixBriefPanel;
