'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card } from '@/components/ui';
import { 
  ChevronDown, 
  ChevronUp, 
  CheckCircle, 
  AlertCircle,
  BookOpen,
  Search,
  FileText,
  Award,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContentScoreCardProps {
  projectId: string;
  pageId: string;
  defaultExpanded?: boolean;
}

const CATEGORY_ICONS: Record<string, typeof BookOpen> = {
  readability: BookOpen,
  seoStructure: Search,
  keywordOptimization: FileText,
  contentDepth: BarChart3,
  eeatSignals: Award,
};

const CATEGORY_LABELS: Record<string, string> = {
  readability: 'Readability',
  seoStructure: 'SEO Structure',
  keywordOptimization: 'Keywords',
  contentDepth: 'Content Depth',
  eeatSignals: 'E-E-A-T',
};

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-green-100 text-green-700';
    case 'B': return 'bg-blue-100 text-blue-700';
    case 'C': return 'bg-yellow-100 text-yellow-700';
    case 'D': return 'bg-orange-100 text-orange-700';
    case 'F': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

export function ContentScoreCard({ projectId, pageId, defaultExpanded = false }: ContentScoreCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['content-score', projectId, pageId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pages/${pageId}/content-score`);
      if (!res.ok) throw new Error('Failed to fetch content score');
      return res.json();
    },
    enabled: expanded, // Only fetch when expanded
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  
  return (
    <div className="border-t border-slate-100 pt-3 mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Content Quality</span>
          {data && !isLoading && (
            <Badge className={cn('text-xs', getGradeColor(data.grade))}>
              {data.score}/100 ({data.grade})
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      
      {expanded && (
        <div className="mt-3 space-y-3">
          {isLoading && (
            <div className="text-sm text-slate-500 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-primary-500 rounded-full animate-spin" />
              Analyzing content quality...
            </div>
          )}
          
          {error && (
            <div className="text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Failed to analyze content
            </div>
          )}
          
          {data && !isLoading && (
            <>
              {/* Factor Breakdown */}
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(data.factors || {}).map(([key, factor]: [string, any]) => {
                  const Icon = CATEGORY_ICONS[key] || BarChart3;
                  return (
                    <div key={key} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <Icon className="w-4 h-4 text-slate-400" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 truncate">
                            {CATEGORY_LABELS[key] || key}
                          </span>
                          <span className={cn('text-xs font-medium', getScoreColor(factor.score))}>
                            {factor.score}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1 mt-1">
                          <div 
                            className={cn(
                              'h-1 rounded-full',
                              factor.score >= 80 ? 'bg-green-500' :
                              factor.score >= 60 ? 'bg-blue-500' :
                              factor.score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                            )}
                            style={{ width: `${factor.score}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Issues Summary */}
              {data.recommendations && data.recommendations.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Top Issues
                  </p>
                  <ul className="space-y-1">
                    {data.recommendations.slice(0, 3).map((rec: any, idx: number) => (
                      <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                        <span className={cn(
                          'mt-0.5 flex-shrink-0',
                          rec.priority === 'critical' ? 'text-red-500' :
                          rec.priority === 'high' ? 'text-orange-500' :
                          rec.priority === 'medium' ? 'text-yellow-500' : 'text-slate-400'
                        )}>
                          •
                        </span>
                        <span>{rec.action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Passed Checks */}
              {Object.values(data.factors || {}).some((f: any) => f.passed?.length > 0) && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Passing
                  </p>
                  <ul className="space-y-1">
                    {Object.values(data.factors || {}).flatMap((f: any) => f.passed || []).slice(0, 3).map((item: string, idx: number) => (
                      <li key={idx} className="text-xs text-green-600 flex items-start gap-2">
                        <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ContentScoreCard;
