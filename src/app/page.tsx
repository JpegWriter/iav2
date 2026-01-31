'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@/components/ui';
import { 
  ArrowRight, 
  CheckCircle, 
  Zap, 
  BarChart3, 
  FileText, 
  Shield,
  Eye,
  Lock,
  Target,
  ChevronDown,
  X,
  Check
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* Header */}
      <Header />

      <main>
        {/* Hero */}
        <Hero />

        {/* Built For Section */}
        <BuiltForSection />

        {/* The Problem */}
        <TheProblemSection />

        {/* What IA Is */}
        <WhatIAIsSection />

        {/* The Authority Loop */}
        <AuthorityLoopSection />

        {/* What You Get */}
        <WhatYouGetSection />

        {/* Who This Is For */}
        <WhoThisIsForSection />

        {/* Why This Beats Content Tools */}
        <WhyThisBeatsSection />

        {/* Transparency */}
        <TransparencySection />

        {/* Final CTA */}
        <CTASection />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

/* ============================================
   HEADER
============================================ */
function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-slate-900 tracking-tight">
          Infinite Authority
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign In</Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Get Started</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ============================================
   HERO
============================================ */
function Hero() {
  return (
    <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16">
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-sm font-semibold text-primary-600 uppercase tracking-wide mb-3">
          Infinite Authority
        </p>
        <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-4 tracking-tight">
          Fix Your WordPress Site
        </h1>
        <p className="text-xl md:text-2xl font-semibold text-primary-600 mb-8">
          Audit. Fix. Prove. Rank.
        </p>
        
        <div className="text-left max-w-xl mx-auto mb-10 space-y-4 text-slate-600 text-base md:text-lg leading-relaxed">
          <p>
            Most WordPress sites don't fail because of design.<br />
            They fail because search engines <span className="text-slate-900 font-medium">can't understand or trust them</span>.
          </p>
          <p className="text-slate-900 font-semibold">
            Infinite Authority fixes that.
          </p>
          <p>
            Not by publishing more content.<br />
            Not by rewriting everything you already have.
          </p>
          <p>
            But by <span className="text-slate-900 font-medium">proving authority</span> through structure, evidence, and sequence.
          </p>
          <p className="text-slate-900 font-semibold">
            Real fixes. Real proof. Real rankings.
          </p>
        </div>

        <Link href="/signup" className="inline-block">
          <Button size="lg" className="text-base px-8">
            👉 Run Your Site Diagnosis
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </Link>
      </div>
    </section>
  );
}

/* ============================================
   BUILT FOR SECTION
============================================ */
function BuiltForSection() {
  return (
    <section className="container mx-auto px-4 pb-16">
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-lg font-semibold text-slate-900 mb-4">
          Built for real businesses.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
          <span className="px-4 py-2 bg-slate-100 rounded-full text-sm font-medium text-slate-700">
            Designed for WordPress
          </span>
          <span className="px-4 py-2 bg-slate-100 rounded-full text-sm font-medium text-slate-700">
            Focused on evidence — not output
          </span>
        </div>
        <div className="text-left max-w-lg mx-auto text-slate-600 leading-relaxed">
          <p className="mb-4">If your site can't clearly prove:</p>
          <ul className="space-y-2 mb-4">
            <li className="flex items-center gap-2">
              <span className="text-primary-600">•</span>
              <span className="font-medium text-slate-900">what it does</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary-600">•</span>
              <span className="font-medium text-slate-900">who it serves</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary-600">•</span>
              <span className="font-medium text-slate-900">and why it's trusted</span>
            </li>
          </ul>
          <p>it won't rank — locally, nationally, or globally.</p>
          <p className="mt-4 text-slate-900 font-semibold">
            Infinite Authority makes that proof explicit.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ============================================
   THE PROBLEM SECTION
============================================ */
function TheProblemSection() {
  const failures = [
    'Services buried under blogs',
    'Pages competing with each other',
    'Content published in the wrong order',
    'Authority assumed, not demonstrated',
    'AI-written pages with no evidence',
    'Old content quietly dragging everything down',
  ];

  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
          The Problem
        </h2>
        <p className="text-lg text-slate-600 mb-8">
          Why Most WordPress Sites Don't Rank (Even With "SEO")
        </p>
        
        <p className="text-slate-600 mb-6 leading-relaxed">
          Most WordPress sites are busy — but <span className="text-slate-900 font-medium">incoherent</span>.
        </p>
        <p className="text-slate-600 mb-6">We see the same failures repeatedly:</p>
        
        <ul className="space-y-3 mb-8">
          {failures.map((failure, i) => (
            <li key={i} className="flex items-start gap-3">
              <X className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-slate-700">{failure}</span>
            </li>
          ))}
        </ul>
        
        <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
          <p className="text-slate-900 font-semibold">
            These sites don't need more content.
          </p>
          <p className="text-slate-600 mt-2">
            They need <span className="font-medium text-slate-900">structure, sequence, and proof</span>.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ============================================
   WHAT IA IS SECTION
============================================ */
function WhatIAIsSection() {
  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8">
          What Infinite Authority Actually Is
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* What it's NOT */}
          <div className="p-6 bg-red-50 rounded-2xl border border-red-100">
            <p className="font-semibold text-red-900 mb-4">Infinite Authority is not:</p>
            <ul className="space-y-2 text-sm text-red-800">
              <li className="flex items-start gap-2">
                <X className="w-4 h-4 text-red-500 mt-0.5" />
                an AI blog writer
              </li>
              <li className="flex items-start gap-2">
                <X className="w-4 h-4 text-red-500 mt-0.5" />
                a content spinner
              </li>
              <li className="flex items-start gap-2">
                <X className="w-4 h-4 text-red-500 mt-0.5" />
                a traditional SEO agency
              </li>
            </ul>
          </div>

          {/* What it IS */}
          <div className="p-6 bg-green-50 rounded-2xl border border-green-100">
            <p className="font-semibold text-green-900 mb-4">Infinite Authority is:</p>
            <p className="text-green-800">
              An <span className="font-semibold">authority operating system</span> for WordPress.
            </p>
          </div>
        </div>
        
        <div className="text-slate-600 leading-relaxed space-y-4">
          <p>
            It takes what already exists on your site —
            your services, pages, reviews, locations, and proof —
            and turns it into a system search engines can <span className="text-slate-900 font-medium">understand, verify, and trust</span>.
          </p>
          <p>
            Whether you're managing one site or fifty, the logic is the same.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ============================================
   AUTHORITY LOOP SECTION
============================================ */
function AuthorityLoopSection() {
  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
          How It Works
        </h2>
        <p className="text-lg text-primary-600 font-semibold mb-10">
          The Authority Loop
        </p>
        
        <div className="space-y-8">
          {/* Step 1: Audit */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-xl flex-shrink-0">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-900 mb-4">Audit</h3>
                <p className="text-slate-600 mb-4">
                  We crawl your <span className="font-medium text-slate-900">entire site</span> — not just a few URLs.
                </p>
                <p className="text-slate-600 mb-4">
                  Homepage first. Then every internal page.<br />
                  Pages are ranked by business value, not word count.
                </p>
                <p className="text-slate-700 font-medium mb-3">You get:</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    A complete sitemap
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    Clear page roles (money, trust, support, authority)
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    A priority order that actually reflects revenue impact
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Step 2: Fix */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-xl flex-shrink-0">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-900 mb-4">Fix</h3>
                <p className="text-slate-600 mb-4">
                  Every page becomes a <span className="font-medium text-slate-900">Fix Card</span>.
                </p>
                <p className="text-slate-700 font-medium mb-3">Each card shows:</p>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    What's broken
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    Why it matters
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    What needs to change
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    How success is measured
                  </li>
                </ul>
                <p className="text-slate-600 mb-4">
                  We generate a <span className="font-medium text-slate-900">ready-to-run brief</span> for every fix —
                  grounded in your existing content and business context.
                </p>
                <p className="text-slate-900 font-semibold">
                  No guesswork. No interpretation. Just execution.
                </p>
              </div>
            </div>
          </div>

          {/* Step 3: Prove */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-xl flex-shrink-0">
                3
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-900 mb-4">Prove</h3>
                <p className="text-slate-600 mb-4">
                  This is where most tools stop — and <span className="font-medium text-slate-900">Infinite Authority starts</span>.
                </p>
                <p className="text-slate-700 font-medium mb-3">We inject and enforce:</p>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-center gap-2 text-slate-600">
                    <Shield className="w-4 h-4 text-primary-600" />
                    Verified experience signals
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Shield className="w-4 h-4 text-primary-600" />
                    Reviews and review themes
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Shield className="w-4 h-4 text-primary-600" />
                    Process clarity
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Shield className="w-4 h-4 text-primary-600" />
                    Location and service proof
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Shield className="w-4 h-4 text-primary-600" />
                    Trust and credibility indicators
                  </li>
                </ul>
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                  <p className="text-amber-900 font-semibold mb-1">
                    Authority isn't claimed. It's demonstrated.
                  </p>
                  <p className="text-amber-800 text-sm">
                    Until your site can clearly prove what it does and why it's trusted, growth is intentionally locked.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4: Rank */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-xl flex-shrink-0">
                4
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-900 mb-4">Rank</h3>
                <p className="text-slate-600 mb-4">
                  Once the foundation is clean, Infinite Authority builds a <span className="font-medium text-slate-900">12-month Growth Planner</span>.
                </p>
                <p className="text-slate-600 mb-4">
                  Not a blog calendar.<br />
                  <span className="font-medium text-slate-900">A sequence.</span>
                </p>
                <p className="text-slate-700 font-medium mb-3">Every task answers:</p>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    What to publish
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    When to publish it
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    Why it exists
                  </li>
                  <li className="flex items-center gap-2 text-slate-600">
                    <Check className="w-4 h-4 text-green-600" />
                    What page it supports
                  </li>
                </ul>
                <p className="text-slate-900 font-semibold">
                  Every task includes a brief. Every brief is grounded in your real site.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================
   WHAT YOU GET SECTION
============================================ */
function WhatYouGetSection() {
  const items = [
    { icon: <FileText className="w-5 h-5" />, text: 'A fix schedule' },
    { icon: <BarChart3 className="w-5 h-5" />, text: 'Page-level briefs' },
    { icon: <Target className="w-5 h-5" />, text: 'Clear priorities' },
    { icon: <CheckCircle className="w-5 h-5" />, text: 'Defined outcomes' },
  ];

  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
          What You Actually Get
        </h2>
        <p className="text-lg text-slate-600 mb-8">
          No "Recommendations". Only Actions.
        </p>
        
        <p className="text-slate-600 mb-6">
          Most tools give you suggestions.<br />
          <span className="font-medium text-slate-900">Infinite Authority gives you:</span>
        </p>
        
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200">
              <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                {item.icon}
              </div>
              <span className="font-medium text-slate-900">{item.text}</span>
            </div>
          ))}
        </div>
        
        <p className="text-slate-900 font-semibold">
          Every task is something a writer — human or AI — can execute immediately.
        </p>
      </div>
    </section>
  );
}

/* ============================================
   WHO THIS IS FOR SECTION
============================================ */
function WhoThisIsForSection() {
  const needs = [
    'More enquiries',
    'More booked calls',
    'Stronger local, national, or topical visibility',
    'Less guesswork',
    'Fewer wasted pages',
  ];

  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8">
          Who This Is For
        </h2>
        
        <p className="text-lg text-slate-600 mb-6">
          Built for <span className="font-medium text-slate-900">businesses and agencies</span> that sell real services.
        </p>
        
        <p className="text-slate-600 mb-4">If your website needs:</p>
        <ul className="space-y-2 mb-6">
          {needs.map((need, i) => (
            <li key={i} className="flex items-center gap-2 text-slate-700">
              <Check className="w-4 h-4 text-green-600" />
              {need}
            </li>
          ))}
        </ul>
        
        <p className="text-slate-900 font-semibold mb-6">
          Infinite Authority is built for you.
        </p>
        
        <div className="bg-slate-100 rounded-xl p-4 border border-slate-200">
          <p className="text-slate-600 text-sm">
            If you want to publish hundreds of AI blogs and hope for the best — it isn't.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ============================================
   WHY THIS BEATS SECTION
============================================ */
function WhyThisBeatsSection() {
  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
          Why This Beats Content Tools
        </h2>
        <p className="text-lg text-slate-600 mb-8">
          Content doesn't create authority. <span className="font-medium text-slate-900">Structure does.</span>
        </p>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Most Tools */}
          <div className="p-6 bg-red-50 rounded-2xl border border-red-100">
            <h3 className="font-semibold text-red-900 mb-4">Most tools:</h3>
            <ul className="space-y-2 text-red-800">
              <li className="flex items-start gap-2">
                <X className="w-4 h-4 text-red-500 mt-0.5" />
                Generate text
              </li>
              <li className="flex items-start gap-2">
                <X className="w-4 h-4 text-red-500 mt-0.5" />
                Leave structure broken
              </li>
              <li className="flex items-start gap-2">
                <X className="w-4 h-4 text-red-500 mt-0.5" />
                Ignore proof
              </li>
              <li className="flex items-start gap-2">
                <X className="w-4 h-4 text-red-500 mt-0.5" />
                Skip sequencing
              </li>
            </ul>
          </div>

          {/* Infinite Authority */}
          <div className="p-6 bg-green-50 rounded-2xl border border-green-100">
            <h3 className="font-semibold text-green-900 mb-4">Infinite Authority:</h3>
            <ul className="space-y-2 text-green-800">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5" />
                Fixes what already exists
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5" />
                Enforces page roles
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5" />
                Requires evidence
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-600 mt-0.5" />
                Locks growth behind foundations
              </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-slate-600 mb-2">You don't "do SEO".</p>
          <p className="text-xl font-bold text-slate-900">You install authority.</p>
        </div>
      </div>
    </section>
  );
}

/* ============================================
   TRANSPARENCY SECTION
============================================ */
function TransparencySection() {
  const points = [
    'Why a page is a priority',
    'What score it has',
    'What\'s missing',
    'What\'s blocking growth',
  ];

  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
          Transparency
        </h2>
        <p className="text-lg text-slate-600 mb-8">
          Nothing hidden. Nothing vague.
        </p>
        
        <p className="text-slate-600 mb-4">You can always see:</p>
        <ul className="space-y-2 mb-6">
          {points.map((point, i) => (
            <li key={i} className="flex items-center gap-2 text-slate-700">
              <Eye className="w-4 h-4 text-primary-600" />
              {point}
            </li>
          ))}
        </ul>
        
        <p className="text-slate-900 font-semibold">
          No black boxes. No "trust the algorithm".
        </p>
        <p className="text-slate-600 mt-2">
          Just clear, explainable logic.
        </p>
      </div>
    </section>
  );
}

/* ============================================
   CTA SECTION
============================================ */
function CTASection() {
  const [url, setUrl] = useState('');

  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-xl mx-auto bg-slate-900 rounded-2xl p-8 md:p-10 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
          Stop Guessing. Start Proving.
        </h2>
        <div className="text-slate-400 mb-8 space-y-1 text-sm">
          <p>Run your site diagnosis.</p>
          <p>See your Fix Planner.</p>
          <p>Clean the foundation.</p>
          <p>Then scale with a Growth Planner built from your actual site.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) {
              window.location.href = `/signup?url=${encodeURIComponent(url)}`;
            } else {
              window.location.href = '/signup';
            }
          }}
          className="flex flex-col sm:flex-row gap-3 mb-4"
        >
          <Input
            type="url"
            placeholder="https://yoursite.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-white/10 border-slate-700 text-white placeholder:text-slate-500 focus:ring-primary-500"
          />
          <Button type="submit" size="lg" className="w-full sm:w-auto whitespace-nowrap">
            👉 Run Your Site Diagnosis
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </form>
        <p className="text-xs text-slate-500">
          Works best for WordPress sites with existing pages, services, and proof.
        </p>
      </div>
    </section>
  );
}

/* ============================================
   FOOTER
============================================ */
function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-sm text-slate-500">
          © {new Date().getFullYear()} Infinite Authority. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
