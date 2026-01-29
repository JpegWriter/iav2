'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { 
  Card, 
  CardHeader, 
  Button, 
  Badge, 
  ScoreCircle, 
  ScoreBar 
} from '@/components/ui';
import { 
  ArrowLeft, 
  ExternalLink, 
  Copy, 
  Check, 
  AlertTriangle, 
  CheckCircle,
  FileText,
  Link2,
  Zap
} from 'lucide-react';
import { useState } from 'react';
import { cn, getRoleColor, getSeverityColor, extractPath } from '@/lib/utils';

export default function PageDetailPage({
  params,
}: {
  params: { projectId: string; pageId: string };
}) {
  const [copiedBrief, setCopiedBrief] = useState<'human' | 'gpt' | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['page', params.pageId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}/pages/${params.pageId}`);
      if (!res.ok) throw new Error('Failed to fetch page');
      return res.json();
    },
  });

  const page = data?.data;
  const audit = page?.audits?.[0];
  const fixItems = page?.fix_items || [];
  const brief = page?.briefs?.[0];
  const linksIn = page?.linksIn || [];
  const linksOut = page?.linksOut || [];

  const handleCopyBrief = async (type: 'human' | 'gpt') => {
    if (!brief) return;
    const text = type === 'human' ? brief.human_brief_md : brief.gpt_brief_md;
    await navigator.clipboard.writeText(text);
    setCopiedBrief(type);
    setTimeout(() => setCopiedBrief(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">Page not found</p>
        <Link href={`/app/${params.projectId}/pages`}>
          <Button variant="outline" className="mt-4">
            Back to Pages
          </Button>
        </Link>
      </div>
    );
  }

  const criticalFixes = fixItems.filter((f: any) => f.severity === 'critical' && f.status === 'open');
  const warningFixes = fixItems.filter((f: any) => f.severity === 'warning' && f.status === 'open');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href={`/app/${params.projectId}/pages`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {page.title || extractPath(page.url)}
              </h1>
              <Badge className={getRoleColor(page.role)} size="md">
                {page.role}
              </Badge>
              <span className="text-slate-400">#{page.priority_rank}</span>
            </div>
            <a
              href={page.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 mt-1"
            >
              {page.url}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        <ScoreCircle score={page.health_score} size="lg" showLabel label="Health" />
      </div>

      {/* Score Breakdown */}
      <Card>
        <CardHeader title="Health Score Breakdown" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <ScoreBar score={audit?.technical_score || 0} label="Technical (30%)" />
          <ScoreBar score={audit?.content_score || 0} label="Content (40%)" />
          <ScoreBar score={audit?.trust_score || 0} label="Trust (20%)" />
          <ScoreBar score={audit?.linking_score || 0} label="Linking (10%)" />
        </div>
      </Card>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Fix Items */}
        <Card>
          <CardHeader 
            title="Issues to Fix" 
            description={`${criticalFixes.length} critical, ${warningFixes.length} warnings`}
          />
          
          {criticalFixes.length === 0 && warningFixes.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="text-slate-600">No issues found!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {[...criticalFixes, ...warningFixes].map((fix: any) => (
                <div
                  key={fix.id}
                  className={cn(
                    'p-4 rounded-lg border',
                    fix.severity === 'critical' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={cn(
                      'w-5 h-5 mt-0.5',
                      fix.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                    )} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-slate-900">{fix.title}</h4>
                        <Badge className={getSeverityColor(fix.severity)} size="sm">
                          {fix.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{fix.description}</p>
                      <p className="text-sm text-slate-500 italic">{fix.why_it_matters}</p>
                      
                      {fix.fix_actions?.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-slate-700 mb-1">Fix actions:</p>
                          <ul className="text-sm text-slate-600 list-disc list-inside">
                            {fix.fix_actions.map((action: string, i: number) => (
                              <li key={i}>{action}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Page Details */}
        <div className="space-y-6">
          {/* Meta Info */}
          <Card>
            <CardHeader title="Page Information" />
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-600">Title</dt>
                <dd className="text-sm font-medium text-slate-900 max-w-[60%] text-right">
                  {page.title || <span className="text-red-500">Missing</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-600">H1</dt>
                <dd className="text-sm font-medium text-slate-900 max-w-[60%] text-right">
                  {page.h1 || <span className="text-red-500">Missing</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-600">Meta Description</dt>
                <dd className="text-sm text-slate-900 max-w-[60%] text-right truncate">
                  {page.meta_description || <span className="text-red-500">Missing</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-600">Word Count</dt>
                <dd className="text-sm font-medium text-slate-900">
                  {page.word_count.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-600">Language</dt>
                <dd className="text-sm font-medium text-slate-900">
                  {page.lang || 'Not specified'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-600">Canonical</dt>
                <dd className="text-sm text-slate-900 max-w-[60%] text-right truncate">
                  {page.canonical || <span className="text-amber-500">Not set</span>}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Internal Links */}
          <Card>
            <CardHeader 
              title="Internal Links" 
              description={`${linksIn.length} incoming, ${linksOut.length} outgoing`}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                  <Link2 className="w-4 h-4" />
                  Links pointing here ({linksIn.length})
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {linksIn.slice(0, 10).map((link: any, i: number) => (
                    <p key={i} className="text-xs text-slate-600 truncate">
                      {extractPath(link.from_url)}
                    </p>
                  ))}
                  {linksIn.length === 0 && (
                    <p className="text-xs text-red-500">No incoming links (orphan)</p>
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                  <Link2 className="w-4 h-4" />
                  Links from this page ({linksOut.length})
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {linksOut.slice(0, 10).map((link: any, i: number) => (
                    <p key={i} className="text-xs text-slate-600 truncate">
                      {extractPath(link.to_url)}
                    </p>
                  ))}
                  {linksOut.length === 0 && (
                    <p className="text-xs text-amber-500">No outgoing internal links</p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* GPT Brief Section */}
      {brief && (
        <Card>
          <CardHeader 
            title="Content Brief" 
            description="Copy these briefs to generate improved content"
            action={
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleCopyBrief('human')}
                >
                  {copiedBrief === 'human' ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  Copy Human Brief
                </Button>
                <Button 
                  size="sm"
                  onClick={() => handleCopyBrief('gpt')}
                >
                  {copiedBrief === 'gpt' ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  Copy GPT Brief
                </Button>
              </div>
            }
          />
          
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Human Brief (for writers)
              </h4>
              <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                  {brief.human_brief_md}
                </pre>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                GPT Brief (for AI generation)
              </h4>
              <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                  {brief.gpt_brief_md.slice(0, 2000)}
                  {brief.gpt_brief_md.length > 2000 && '...'}
                </pre>
              </div>
            </div>
          </div>

          {brief.inputs_needed && (
            <div className="mt-4 p-4 bg-amber-50 rounded-lg">
              <h4 className="text-sm font-medium text-amber-800 mb-2">Inputs needed from client:</h4>
              <ul className="text-sm text-amber-700">
                <li>• {brief.inputs_needed.images} images required</li>
                {brief.inputs_needed.notes?.map((note: string, i: number) => (
                  <li key={i}>• {note}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
