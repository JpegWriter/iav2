import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'score-excellent';
  if (score >= 60) return 'score-good';
  if (score >= 40) return 'score-warning';
  return 'score-poor';
}

export function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-score-excellent';
  if (score >= 60) return 'bg-score-good';
  if (score >= 40) return 'bg-score-warning';
  return 'bg-score-poor';
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return url;
  }
}

export function extractPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || '/';
  } catch {
    return url;
  }
}

export function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    money: 'bg-emerald-100 text-emerald-700',
    trust: 'bg-blue-100 text-blue-700',
    authority: 'bg-purple-100 text-purple-700',
    support: 'bg-slate-100 text-slate-700',
  };
  return colors[role] || colors.support;
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    warning: 'bg-amber-100 text-amber-700',
    info: 'bg-blue-100 text-blue-700',
  };
  return colors[severity] || colors.info;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    queued: 'bg-slate-100 text-slate-700',
    assigned: 'bg-blue-100 text-blue-700',
    draft_ready: 'bg-amber-100 text-amber-700',
    review_ready: 'bg-purple-100 text-purple-700',
    publish_ready: 'bg-emerald-100 text-emerald-700',
    published: 'bg-green-100 text-green-700',
  };
  return colors[status] || colors.queued;
}
