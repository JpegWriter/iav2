import Link from 'next/link';
import { Button } from '@/components/ui';
import { ArrowRight, CheckCircle, Zap, BarChart3, FileText } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex items-center justify-between">
        <div className="text-2xl font-bold text-primary-600">SiteFix Planner</div>
        <div className="flex items-center gap-4">
          <Link href="/login">
            <Button variant="ghost">Sign In</Button>
          </Link>
          <Link href="/signup">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-slate-900 mb-6">
            Crawl. Audit. Fix. Grow.
          </h1>
          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            Drop in your URL. We crawl your site, rank pages by business value, 
            run deep audits, and generate ready-to-run content briefs for every fix.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg">
                Start Free Audit
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button size="lg" variant="outline">
                Watch Demo
              </Button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-4 gap-8 mt-24">
          <FeatureCard
            icon={<Zap className="w-6 h-6" />}
            title="Smart Crawl"
            description="Crawl your entire site and build a link graph automatically"
          />
          <FeatureCard
            icon={<BarChart3 className="w-6 h-6" />}
            title="Priority Ranking"
            description="Pages ranked by business value: money pages first"
          />
          <FeatureCard
            icon={<CheckCircle className="w-6 h-6" />}
            title="Deep Audits"
            description="SEO, content, conversion, and AI-readiness checks"
          />
          <FeatureCard
            icon={<FileText className="w-6 h-6" />}
            title="GPT Briefs"
            description="Ready-to-paste briefs for fixing every issue"
          />
        </div>

        {/* How it works */}
        <div className="mt-32">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              number={1}
              title="Add Your Website"
              description="Enter your URL, select your business goals, add your beads (proof points) and reviews"
            />
            <StepCard
              number={2}
              title="We Crawl & Audit"
              description="We crawl every page, rank by priority, and run 50+ checks on each page"
            />
            <StepCard
              number={3}
              title="Fix & Grow"
              description="Use the Fix Planner to repair your site, then unlock the 12-month Growth Planner"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 mt-20 border-t border-slate-200">
        <div className="text-center text-slate-500">
          © 2026 SiteFix Planner. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="text-center p-6">
      <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="relative p-6 bg-white rounded-xl border border-slate-200">
      <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold mb-4">
        {number}
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600">{description}</p>
    </div>
  );
}
