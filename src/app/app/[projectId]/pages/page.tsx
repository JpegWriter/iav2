'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Badge, Input, Select, ScoreCircle } from '@/components/ui';
import { Search, Filter, ArrowUpDown, ExternalLink, ArrowRight } from 'lucide-react';
import { cn, getRoleColor, extractPath, getScoreColor } from '@/lib/utils';

interface PageData {
  id: string;
  url: string;
  path: string;
  title: string | null;
  h1: string | null;
  role: string;
  priority_rank: number;
  health_score: number;
  word_count: number;
  internal_links_in: number;
  internal_links_out: number;
  is_orphan: boolean;
  audits: Array<{ id: string }>;
}

export default function PagesListPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sortBy, setSortBy] = useState('priority_rank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data, isLoading } = useQuery({
    queryKey: ['pages', params.projectId, roleFilter, sortBy, sortOrder],
    queryFn: async () => {
      const queryParams = new URLSearchParams({
        sortBy,
        sortOrder,
        limit: '100',
      });
      if (roleFilter) queryParams.set('role', roleFilter);

      const res = await fetch(`/api/projects/${params.projectId}/pages?${queryParams}`);
      if (!res.ok) throw new Error('Failed to fetch pages');
      return res.json();
    },
  });

  const pages: PageData[] = data?.data || [];
  const filteredPages = search
    ? pages.filter(p => 
        p.url.toLowerCase().includes(search.toLowerCase()) ||
        p.title?.toLowerCase().includes(search.toLowerCase())
      )
    : pages;

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pages</h1>
        <p className="text-slate-600">All crawled pages ranked by business priority</p>
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search pages..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <Select
            options={[
              { value: '', label: 'All Roles' },
              { value: 'money', label: 'Money Pages' },
              { value: 'trust', label: 'Trust Pages' },
              { value: 'authority', label: 'Authority Pages' },
              { value: 'support', label: 'Support Pages' },
            ]}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-40"
          />
        </div>
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        {['money', 'trust', 'authority', 'support'].map((role) => {
          const rolePages = pages.filter(p => p.role === role);
          const avgScore = rolePages.length > 0
            ? Math.round(rolePages.reduce((s, p) => s + p.health_score, 0) / rolePages.length)
            : 0;
          return (
            <button
              key={role}
              onClick={() => setRoleFilter(roleFilter === role ? '' : role)}
              className={cn(
                'p-4 rounded-lg border text-left transition-colors',
                roleFilter === role
                  ? 'border-primary-300 bg-primary-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <Badge className={getRoleColor(role)}>{role}</Badge>
                <span className="text-lg font-bold text-slate-900">{rolePages.length}</span>
              </div>
              <div className="text-sm text-slate-600">
                Avg Score: <span className={cn('font-medium', getScoreColor(avgScore))}>{avgScore}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('priority_rank')}
                    className="flex items-center gap-1 hover:text-slate-700"
                  >
                    Rank
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Page
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('health_score')}
                    className="flex items-center gap-1 hover:text-slate-700"
                  >
                    Health
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Words
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Links
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Issues
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Loading pages...
                  </td>
                </tr>
              ) : filteredPages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No pages found
                  </td>
                </tr>
              ) : (
                filteredPages.map((page) => (
                  <tr key={page.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-sm font-medium text-slate-600">
                        {page.priority_rank}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-md">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {page.title || extractPath(page.url)}
                        </p>
                        <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                          {extractPath(page.url)}
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-slate-600"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={getRoleColor(page.role)}>{page.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreCircle score={page.health_score} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {page.word_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <span className="text-green-600">{page.internal_links_in}↓</span>
                        {' '}
                        <span className="text-blue-600">{page.internal_links_out}↑</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {page.is_orphan && (
                        <Badge variant="warning" size="sm">Orphan</Badge>
                      )}
                      {page.health_score < 50 && (
                        <Badge variant="danger" size="sm">Critical</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/app/${params.projectId}/pages/${page.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
