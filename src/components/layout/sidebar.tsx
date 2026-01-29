'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Wrench,
  TrendingUp,
  FileEdit,
  Settings,
  ChevronLeft,
  Lock,
  Boxes,
  Star,
  Share2,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  locked?: boolean;
}

export function Sidebar({ projectId, growthUnlocked }: { projectId: string; growthUnlocked: boolean }) {
  const pathname = usePathname();
  
  // DEV MODE: Always show as unlocked
  const isDev = process.env.NODE_ENV === 'development';
  const isGrowthUnlocked = isDev || growthUnlocked;

  const navItems: NavItem[] = [
    {
      href: `/app/${projectId}`,
      label: 'Overview',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      href: `/app/${projectId}/pages`,
      label: 'Pages',
      icon: <FileText className="w-5 h-5" />,
    },
    {
      href: `/app/${projectId}/planner`,
      label: 'Fix Planner',
      icon: <Wrench className="w-5 h-5" />,
    },
    {
      href: `/app/${projectId}/growth`,
      label: 'Growth Planner',
      icon: <TrendingUp className="w-5 h-5" />,
      locked: !isGrowthUnlocked,
    },
    {
      href: `/app/${projectId}/briefs`,
      label: 'Brief Builder',
      icon: <FileEdit className="w-5 h-5" />,
    },
    {
      href: `/app/${projectId}/beads`,
      label: 'Beads & Reviews',
      icon: <Boxes className="w-5 h-5" />,
    },
    {
      href: `/app/${projectId}/publishing`,
      label: 'Publishing',
      icon: <Share2 className="w-5 h-5" />,
    },
    {
      href: `/app/${projectId}/settings`,
      label: 'Settings',
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen">
      {/* Header */}
      <div className="h-16 flex items-center px-4 border-b border-slate-200">
        <Link href="/app" className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm">All Projects</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          
          if (item.locked) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 cursor-not-allowed"
              >
                {item.icon}
                <span className="text-sm font-medium">{item.label}</span>
                <Lock className="w-4 h-4 ml-auto" />
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              {item.icon}
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>Crawler ready</span>
        </div>
      </div>
    </aside>
  );
}
