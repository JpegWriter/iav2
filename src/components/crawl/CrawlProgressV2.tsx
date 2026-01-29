'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Globe, 
  FileText, 
  CheckCircle, 
  Loader2, 
  Zap,
  Search,
  Sparkles,
  ArrowRight,
  Database,
  Brain,
  BarChart3,
  Eye,
  AlertCircle
} from 'lucide-react';

interface CrawlProgressProps {
  projectId: string;
  onComplete: () => void;
}

interface CrawlStats {
  status: 'connecting' | 'discovering' | 'crawling' | 'extracting' | 'analyzing' | 'ranking' | 'complete' | 'error';
  pagesFound: number;
  pagesCrawled: number;
  currentUrl?: string;
  currentTitle?: string;
  error?: string;
}

interface PageSnippet {
  url: string;
  title: string;
  snippet: string;
  role: string;
  score: number;
}

const PHASE_DETAILS = {
  connecting: {
    label: 'Connecting',
    description: 'Establishing connection to your website...',
    icon: Globe,
    color: 'blue',
  },
  discovering: {
    label: 'Discovering Pages',
    description: 'Mapping your site structure...',
    icon: Search,
    color: 'purple',
  },
  crawling: {
    label: 'Crawling Content',
    description: 'Fetching page content via Jina Reader API...',
    icon: FileText,
    color: 'amber',
  },
  extracting: {
    label: 'Extracting Data',
    description: 'Processing headings, links, and content...',
    icon: Database,
    color: 'cyan',
  },
  analyzing: {
    label: 'AI Analysis',
    description: 'Classifying pages and scoring business value...',
    icon: Brain,
    color: 'pink',
  },
  ranking: {
    label: 'Ranking Pages',
    description: 'Ordering pages by SEO priority...',
    icon: BarChart3,
    color: 'green',
  },
  complete: {
    label: 'Complete!',
    description: 'Analysis finished successfully',
    icon: CheckCircle,
    color: 'emerald',
  },
  error: {
    label: 'Error',
    description: 'Something went wrong',
    icon: AlertCircle,
    color: 'red',
  }
};

const PAGE_ROLES: Record<string, { label: string; color: string }> = {
  homepage: { label: 'Homepage', color: 'blue' },
  service: { label: 'Service', color: 'green' },
  product: { label: 'Product', color: 'purple' },
  blog: { label: 'Blog Post', color: 'amber' },
  about: { label: 'About', color: 'cyan' },
  contact: { label: 'Contact', color: 'pink' },
  landing: { label: 'Landing', color: 'indigo' },
  category: { label: 'Category', color: 'orange' },
  legal: { label: 'Legal', color: 'slate' },
  other: { label: 'Other', color: 'gray' },
};

export function CrawlProgressV2({ projectId, onComplete }: CrawlProgressProps) {
  const [stats, setStats] = useState<CrawlStats>({
    status: 'connecting',
    pagesFound: 0,
    pagesCrawled: 0,
  });
  const [pageSnippets, setPageSnippets] = useState<PageSnippet[]>([]);
  const [particles, setParticles] = useState<{ id: number; x: number; delay: number }[]>([]);

  // Generate floating particles
  useEffect(() => {
    const newParticles = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 3,
    }));
    setParticles(newParticles);
  }, []);

  // Poll for crawl status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;
    let lastPageCount = 0;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/crawl/status`);
        if (res.ok) {
          const data = await res.json();
          
          // Determine granular status
          let newStatus: CrawlStats['status'] = 'crawling';
          if (data.status === 'complete' || data.status === 'ready') {
            newStatus = 'complete';
          } else if (data.status === 'error') {
            newStatus = 'error';
          } else {
            const pagesCrawled = data.pagesCrawled || data.pages_crawled || 0;
            const pagesFound = data.pagesFound || data.pages_found || 0;
            
            if (pagesCrawled === 0) {
              newStatus = 'discovering';
            } else if (pagesCrawled < pagesFound) {
              newStatus = Math.random() > 0.5 ? 'crawling' : 'extracting';
            } else if (pagesCrawled >= pagesFound && pagesFound > 0) {
              newStatus = 'analyzing';
            }
          }

          const currentPagesCrawled = data.pagesCrawled || data.pages_crawled || 0;
          
          // Use real page snippets from API if available, otherwise generate mock
          if (data.recentPages && data.recentPages.length > 0) {
            setPageSnippets(data.recentPages.map((p: any) => ({
              url: p.url,
              title: p.title || 'Untitled',
              snippet: p.snippet || 'Content being analyzed...',
              role: p.role || 'other',
              score: p.score || 0,
            })));
          } else if (currentPagesCrawled > 0 && data.currentUrl) {
            // Fallback to mock if API doesn't return snippets yet
            const snippet = generateMockSnippet(data.currentUrl, data.currentTitle || '');
            setPageSnippets(prev => {
              const exists = prev.some(p => p.url === snippet.url);
              if (exists) return prev;
              return [snippet, ...prev].slice(0, 5);
            });
          }

          setStats({
            status: newStatus,
            pagesFound: data.pagesFound || data.pages_found || 0,
            pagesCrawled: currentPagesCrawled,
            currentUrl: data.currentUrl,
            currentTitle: data.currentTitle,
            error: data.error,
          });

          if (newStatus === 'complete') {
            clearInterval(interval);
            timeout = setTimeout(onComplete, 2500);
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    };

    timeout = setTimeout(() => {
      pollStatus();
      interval = setInterval(pollStatus, 2000);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [projectId, onComplete]);

  const currentPhase = PHASE_DETAILS[stats.status];
  const PhaseIcon = currentPhase.icon;
  const progress = stats.pagesFound > 0 
    ? Math.min((stats.pagesCrawled / stats.pagesFound) * 100, 100)
    : 0;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center z-50 overflow-hidden">
      {/* Animated grid background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }} />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute w-1 h-1 bg-blue-400/40 rounded-full"
            initial={{ x: `${particle.x}%`, y: '110%', scale: Math.random() * 0.8 + 0.2 }}
            animate={{ y: '-10%', opacity: [0, 0.8, 0.8, 0] }}
            transition={{ duration: 10, delay: particle.delay, repeat: Infinity, ease: 'linear' }}
          />
        ))}
      </div>

      {/* Glowing orbs */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full bg-blue-500/5 blur-3xl"
        animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2], x: [-50, 50, -50] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full bg-purple-500/5 blur-3xl"
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.2, 0.3], x: [50, -50, 50] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 max-w-md w-full mx-4">
          {/* Main Progress Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl"
          >
            {/* Header */}
            <div className="text-center mb-6">
              <motion.div
                className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-${currentPhase.color}-500 to-${currentPhase.color}-600 mb-4`}
                animate={{ 
                  boxShadow: [
                    `0 0 20px rgba(59, 130, 246, 0.4)`,
                    `0 0 40px rgba(59, 130, 246, 0.6)`,
                    `0 0 20px rgba(59, 130, 246, 0.4)`,
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <motion.div
                  animate={stats.status !== 'complete' ? { rotate: 360 } : {}}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                >
                  <PhaseIcon className="w-8 h-8 text-white" />
                </motion.div>
              </motion.div>
              
              <h2 className="text-xl font-bold text-white mb-1">{currentPhase.label}</h2>
              <p className="text-slate-400 text-sm">{currentPhase.description}</p>
            </div>

            {/* Progress Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <motion.div 
                className="bg-slate-800/30 rounded-xl p-3 text-center border border-slate-700/30"
                whileHover={{ scale: 1.02, borderColor: 'rgba(59, 130, 246, 0.3)' }}
              >
                <motion.div
                  className="text-2xl font-bold text-white"
                  key={stats.pagesFound}
                  initial={{ scale: 1.3, color: '#60a5fa' }}
                  animate={{ scale: 1, color: '#ffffff' }}
                >
                  {stats.pagesFound}
                </motion.div>
                <div className="text-xs text-slate-500">Pages Found</div>
              </motion.div>
              
              <motion.div 
                className="bg-slate-800/30 rounded-xl p-3 text-center border border-slate-700/30"
                whileHover={{ scale: 1.02, borderColor: 'rgba(52, 211, 153, 0.3)' }}
              >
                <motion.div
                  className="text-2xl font-bold text-white"
                  key={stats.pagesCrawled}
                  initial={{ scale: 1.3, color: '#34d399' }}
                  animate={{ scale: 1, color: '#ffffff' }}
                >
                  {stats.pagesCrawled}
                </motion.div>
                <div className="text-xs text-slate-500">Analyzed</div>
              </motion.div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6)',
                    backgroundSize: '200% 100%',
                  }}
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${Math.max(progress, 5)}%`,
                    backgroundPosition: ['0% 0%', '100% 0%'],
                  }}
                  transition={{ 
                    width: { duration: 0.5 },
                    backgroundPosition: { duration: 3, repeat: Infinity, ease: 'linear' }
                  }}
                />
              </div>
            </div>

            {/* Page Snippets Feed */}
            <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
              <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                <Eye className="w-3 h-3" />
                Content Preview
              </div>
              <div className="space-y-2 max-h-[180px] overflow-hidden">
                <AnimatePresence mode="popLayout">
                  {pageSnippets.length > 0 ? (
                    pageSnippets.map((snippet, i) => (
                      <motion.div
                        key={snippet.url}
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1 - i * 0.15, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: 10, height: 0 }}
                        className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/30"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${PAGE_ROLES[snippet.role]?.color || 'gray'}-500/20 text-${PAGE_ROLES[snippet.role]?.color || 'gray'}-400`}>
                            {PAGE_ROLES[snippet.role]?.label || 'Page'}
                          </span>
                          <span className="text-xs text-slate-400 truncate flex-1">{snippet.title}</span>
                          <span className="text-[10px] text-emerald-400 font-mono">{snippet.score}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2">{snippet.snippet}</p>
                      </motion.div>
                    ))
                  ) : (
                    <motion.div
                      animate={{ opacity: [0.3, 0.7, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-sm text-slate-600 text-center py-4"
                    >
                      Waiting for first page...
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Complete State */}
            {stats.status === 'complete' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 text-center"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">
                  <Sparkles className="w-4 h-4" />
                  Redirecting to dashboard...
                  <ArrowRight className="w-4 h-4" />
                </div>
              </motion.div>
            )}
          </motion.div>

        {/* Bottom Tips */}
      </div>
    </div>
  );
}

// Mock snippet generator - in production, this would come from the API
function generateMockSnippet(url: string, title: string): PageSnippet {
  const path = new URL(url).pathname.toLowerCase();
  
  let role = 'other';
  if (path === '/' || path === '') role = 'homepage';
  else if (path.includes('service') || path.includes('what-we-do')) role = 'service';
  else if (path.includes('product')) role = 'product';
  else if (path.includes('blog') || path.includes('news') || path.includes('article')) role = 'blog';
  else if (path.includes('about')) role = 'about';
  else if (path.includes('contact')) role = 'contact';
  else if (path.includes('pricing') || path.includes('plans')) role = 'landing';
  else if (path.includes('categor') || path.includes('collection')) role = 'category';
  else if (path.includes('privacy') || path.includes('terms') || path.includes('legal')) role = 'legal';

  const snippets = [
    'Discover how our solutions can transform your business with cutting-edge technology and expert support...',
    'Our team of professionals is dedicated to delivering exceptional results that exceed expectations...',
    'With over 10 years of experience, we provide trusted services to clients worldwide...',
    'Learn more about our comprehensive approach to solving complex challenges...',
    'Get started today and see the difference our expertise can make for your organization...',
  ];

  return {
    url,
    title: title || path,
    snippet: snippets[Math.floor(Math.random() * snippets.length)],
    role,
    score: Math.floor(Math.random() * 30) + 70,
  };
}

export default CrawlProgressV2;
