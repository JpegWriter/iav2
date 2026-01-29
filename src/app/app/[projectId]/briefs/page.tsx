'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { 
  Card, 
  CardHeader, 
  Button, 
  Badge,
  Textarea
} from '@/components/ui';
import { 
  FileText,
  Copy,
  Check,
  Zap,
  Users,
  ChevronRight,
  ChevronDown,
  Download,
  RefreshCw,
  Search
} from 'lucide-react';
import { useState } from 'react';
import { cn, extractPath, formatDate } from '@/lib/utils';

interface Brief {
  id: string;
  page_id: string;
  human_brief_md: string;
  gpt_brief_md: string;
  channel_payloads: any;
  inputs_needed: any;
  created_at: string;
  page?: {
    url: string;
    title: string;
    role: string;
  };
}

export default function BriefsPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<{ id: string; type: 'human' | 'gpt' } | null>(null);

  const queryClient = useQueryClient();

  const { data: briefsData, isLoading } = useQuery({
    queryKey: ['briefs', params.projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${params.projectId}/briefs`);
      if (!res.ok) throw new Error('Failed to fetch briefs');
      return res.json();
    },
  });

  const regenerateBriefMutation = useMutation({
    mutationFn: async (pageId: string) => {
      const res = await fetch(`/api/projects/${params.projectId}/briefs/${pageId}/regenerate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to regenerate brief');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs', params.projectId] });
    },
  });

  const briefs: Brief[] = briefsData?.data || [];

  const filteredBriefs = briefs.filter((brief) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      brief.page?.title?.toLowerCase().includes(query) ||
      brief.page?.url?.toLowerCase().includes(query)
    );
  });

  const handleCopy = async (briefId: string, type: 'human' | 'gpt', content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedType({ id: briefId, type });
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleExportAll = () => {
    const exportData = briefs.map(brief => ({
      page: brief.page?.url,
      title: brief.page?.title,
      human_brief: brief.human_brief_md,
      gpt_brief: brief.gpt_brief_md,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'briefs-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'money':
        return 'bg-emerald-100 text-emerald-800';
      case 'trust':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Brief Builder</h1>
          <p className="text-slate-600 mt-1">
            Ready-to-use content briefs for your pages
          </p>
        </div>
        <Button variant="outline" onClick={handleExportAll} disabled={briefs.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export All Briefs
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <FileText className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{briefs.length}</p>
              <p className="text-sm text-slate-600">Total Briefs</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Zap className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {briefs.filter(b => b.page?.role === 'money').length}
              </p>
              <p className="text-sm text-slate-600">Money Pages</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {briefs.filter(b => b.page?.role === 'trust').length}
              </p>
              <p className="text-sm text-slate-600">Trust Pages</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search briefs by page title or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </Card>

      {/* Briefs List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : filteredBriefs.length === 0 ? (
        <Card className="text-center py-12">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            {briefs.length === 0 ? 'No briefs generated yet' : 'No matching briefs'}
          </h3>
          <p className="text-slate-600">
            {briefs.length === 0 
              ? 'Run an audit on your pages to generate content briefs'
              : 'Try a different search term'
            }
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBriefs.map((brief) => (
            <Card key={brief.id} className="overflow-hidden">
              {/* Brief Header */}
              <button
                onClick={() => setExpandedBrief(expandedBrief === brief.id ? null : brief.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary-100 rounded-lg">
                    <FileText className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-medium text-slate-900">
                      {brief.page?.title || extractPath(brief.page?.url || '')}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={getRoleColor(brief.page?.role || '')} size="sm">
                        {brief.page?.role}
                      </Badge>
                      <span className="text-sm text-slate-500">
                        {formatDate(brief.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronDown className={cn(
                  'w-5 h-5 text-slate-400 transition-transform',
                  expandedBrief === brief.id && 'rotate-180'
                )} />
              </button>

              {/* Brief Content */}
              {expandedBrief === brief.id && (
                <div className="border-t border-slate-200 p-4">
                  <div className="flex items-center justify-end gap-2 mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => regenerateBriefMutation.mutate(brief.page_id)}
                      disabled={regenerateBriefMutation.isPending}
                    >
                      <RefreshCw className={cn(
                        'w-4 h-4 mr-1',
                        regenerateBriefMutation.isPending && 'animate-spin'
                      )} />
                      Regenerate
                    </Button>
                    <Link href={`/app/${params.projectId}/pages/${brief.page_id}`}>
                      <Button variant="outline" size="sm">
                        View Page
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-6">
                    {/* Human Brief */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Human Brief
                        </h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(brief.id, 'human', brief.human_brief_md)}
                        >
                          {copiedType?.id === brief.id && copiedType.type === 'human' ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4 max-h-80 overflow-y-auto">
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                          {brief.human_brief_md}
                        </pre>
                      </div>
                    </div>

                    {/* GPT Brief */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          GPT Brief
                        </h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(brief.id, 'gpt', brief.gpt_brief_md)}
                        >
                          {copiedType?.id === brief.id && copiedType.type === 'gpt' ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4 max-h-80 overflow-y-auto">
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                          {brief.gpt_brief_md.slice(0, 1500)}
                          {brief.gpt_brief_md.length > 1500 && '...'}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* Inputs Needed */}
                  {brief.inputs_needed && (
                    <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <h4 className="text-sm font-medium text-amber-800 mb-2">
                        Inputs needed from client:
                      </h4>
                      <ul className="text-sm text-amber-700 space-y-1">
                        <li>• {brief.inputs_needed.images} images required</li>
                        {brief.inputs_needed.notes?.map((note: string, i: number) => (
                          <li key={i}>• {note}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
