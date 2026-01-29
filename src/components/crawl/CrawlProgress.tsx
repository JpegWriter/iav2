'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Globe, 
  FileText, 
  CheckCircle, 
  Loader2, 
  Zap,
  TrendingUp,
  Search,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface CrawlProgressProps {
  projectId: string;
  onComplete: () => void;
}

interface CrawlStats {
  status: 'starting' | 'discovering' | 'crawling' | 'analyzing' | 'complete' | 'error';
  pagesFound: number;
  pagesCrawled: number;
  currentUrl?: string;
  error?: string;
}

const PHASES = [
  { id: 'starting', label: 'Connecting', icon: Globe, color: 'text-blue-500' },
  { id: 'discovering', label: 'Discovering Pages', icon: Search, color: 'text-purple-500' },
  { id: 'crawling', label: 'Extracting Content', icon: FileText, color: 'text-amber-500' },
  { id: 'analyzing', label: 'Analyzing SEO', icon: TrendingUp, color: 'text-green-500' },
  { id: 'complete', label: 'Complete!', icon: CheckCircle, color: 'text-emerald-500' },
];

export function CrawlProgress({ projectId, onComplete }: CrawlProgressProps) {
  const [stats, setStats] = useState<CrawlStats>({
    status: 'starting',
    pagesFound: 0,
    pagesCrawled: 0,
  });
  const [recentPages, setRecentPages] = useState<string[]>([]);
  const [particles, setParticles] = useState<{ id: number; x: number; delay: number }[]>([]);

  // Generate floating particles
  useEffect(() => {
    const newParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 2,
    }));
    setParticles(newParticles);
  }, []);

  // Poll for crawl status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/crawl/status`);
        if (res.ok) {
          const data = await res.json();
          
          setStats(prev => {
            // Add new pages to recent list
            if (data.currentUrl && data.currentUrl !== prev.currentUrl) {
              setRecentPages(pages => [data.currentUrl, ...pages].slice(0, 5));
            }
            return {
              status: data.status || 'crawling',
              pagesFound: data.pagesFound || data.pages_found || 0,
              pagesCrawled: data.pagesCrawled || data.pages_crawled || 0,
              currentUrl: data.currentUrl,
            };
          });

          if (data.status === 'complete' || data.status === 'ready') {
            clearInterval(interval);
            setStats(s => ({ ...s, status: 'complete' }));
            timeout = setTimeout(onComplete, 2000);
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    };

    // Start polling after a short delay
    timeout = setTimeout(() => {
      pollStatus();
      interval = setInterval(pollStatus, 1500);
    }, 1000);

    // Simulate progress if no real updates
    const simulateProgress = () => {
      setStats(prev => {
        if (prev.status === 'starting') {
          return { ...prev, status: 'discovering' };
        }
        if (prev.status === 'discovering' && prev.pagesFound === 0) {
          return { ...prev, pagesFound: Math.floor(Math.random() * 5) + 1 };
        }
        if (prev.status === 'discovering' && prev.pagesFound > 3) {
          return { ...prev, status: 'crawling' };
        }
        return prev;
      });
    };

    const simInterval = setInterval(simulateProgress, 2000);

    return () => {
      clearInterval(interval);
      clearInterval(simInterval);
      clearTimeout(timeout);
    };
  }, [projectId, onComplete]);

  const currentPhaseIndex = PHASES.findIndex(p => p.id === stats.status);
  const progress = stats.pagesFound > 0 
    ? Math.min((stats.pagesCrawled / stats.pagesFound) * 100, 100)
    : 0;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center z-50 overflow-hidden">
      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute w-2 h-2 bg-blue-500/20 rounded-full"
            initial={{ 
              x: `${particle.x}%`, 
              y: '110%',
              scale: Math.random() * 0.5 + 0.5,
            }}
            animate={{ 
              y: '-10%',
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 8,
              delay: particle.delay,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}
      </div>

      {/* Glowing orb background */}
      <motion.div
        className="absolute w-96 h-96 rounded-full bg-blue-500/10 blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <div className="relative z-10 max-w-lg w-full mx-4">
        {/* Main card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20 shadow-2xl"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4"
              animate={{ 
                boxShadow: [
                  '0 0 20px rgba(59, 130, 246, 0.5)',
                  '0 0 40px rgba(59, 130, 246, 0.8)',
                  '0 0 20px rgba(59, 130, 246, 0.5)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              >
                <Globe className="w-10 h-10 text-white" />
              </motion.div>
            </motion.div>
            
            <h2 className="text-2xl font-bold text-white mb-2">
              Analyzing Your Website
            </h2>
            <p className="text-slate-400">
              Discovering pages and extracting SEO insights
            </p>
          </div>

          {/* Phase indicators */}
          <div className="flex justify-between mb-8">
            {PHASES.slice(0, -1).map((phase, index) => {
              const PhaseIcon = phase.icon;
              const isActive = index === currentPhaseIndex;
              const isComplete = index < currentPhaseIndex;
              
              return (
                <div key={phase.id} className="flex flex-col items-center">
                  <motion.div
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center
                      ${isComplete ? 'bg-emerald-500' : isActive ? 'bg-blue-500' : 'bg-slate-700'}
                    `}
                    animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    {isComplete ? (
                      <CheckCircle className="w-5 h-5 text-white" />
                    ) : isActive ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      >
                        <Loader2 className="w-5 h-5 text-white" />
                      </motion.div>
                    ) : (
                      <PhaseIcon className="w-5 h-5 text-slate-400" />
                    )}
                  </motion.div>
                  <span className={`text-xs mt-2 ${isActive ? 'text-white' : 'text-slate-500'}`}>
                    {phase.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(progress, 5)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <motion.div
              className="bg-slate-800/50 rounded-xl p-4 text-center"
              whileHover={{ scale: 1.02 }}
            >
              <motion.div
                className="text-3xl font-bold text-white"
                key={stats.pagesFound}
                initial={{ scale: 1.2, color: '#60a5fa' }}
                animate={{ scale: 1, color: '#ffffff' }}
              >
                {stats.pagesFound}
              </motion.div>
              <div className="text-sm text-slate-400">Pages Found</div>
            </motion.div>
            
            <motion.div
              className="bg-slate-800/50 rounded-xl p-4 text-center"
              whileHover={{ scale: 1.02 }}
            >
              <motion.div
                className="text-3xl font-bold text-white"
                key={stats.pagesCrawled}
                initial={{ scale: 1.2, color: '#34d399' }}
                animate={{ scale: 1, color: '#ffffff' }}
              >
                {stats.pagesCrawled}
              </motion.div>
              <div className="text-sm text-slate-400">Pages Analyzed</div>
            </motion.div>
          </div>

          {/* Recent pages feed */}
          <div className="bg-slate-800/30 rounded-xl p-4 h-32 overflow-hidden">
            <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Live Feed
            </div>
            <AnimatePresence mode="popLayout">
              {recentPages.length > 0 ? (
                recentPages.map((url, i) => (
                  <motion.div
                    key={url + i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1 - i * 0.2, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="text-sm text-slate-300 truncate py-1 flex items-center gap-2"
                  >
                    <FileText className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    <span className="truncate">{url}</span>
                  </motion.div>
                ))
              ) : (
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-sm text-slate-500 flex items-center gap-2"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Connecting to website...
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Status message */}
          {stats.status === 'complete' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 text-center"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-full">
                <Sparkles className="w-4 h-4" />
                Analysis complete! Redirecting...
                <ArrowRight className="w-4 h-4" />
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Tips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="mt-6 text-center text-slate-500 text-sm"
        >
          💡 Tip: We're using AI to classify each page by its business value
        </motion.div>
      </div>
    </div>
  );
}

export default CrawlProgress;
