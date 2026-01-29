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
  Play,
  Shield,
  Layers,
  Image as ImageIcon,
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

        {/* Proof Chips */}
        <ProofChips />

        {/* Feature Grid */}
        <FeatureGrid />

        {/* 60 Seconds Section */}
        <SixtySecondsSection />

        {/* How It Works */}
        <HowItWorks />

        {/* Comparison Block */}
        <ComparisonBlock />

        {/* FAQ */}
        <FAQ />

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
        <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-4 tracking-tight">
          Fix Your WordPress Site
        </h1>
        <p className="text-xl md:text-2xl font-semibold text-primary-600 mb-8">
          Audit. Fix. Grow. Rank.
        </p>
        
        <div className="text-left max-w-xl mx-auto mb-10 space-y-4 text-slate-600 text-base md:text-lg leading-relaxed">
          <p>
            Most WordPress sites don't fail because of design.<br />
            They fail because they're <span className="text-slate-900 font-medium">structurally invisible</span>.
          </p>
          <p className="text-slate-900 font-semibold">
            Infinite Authority fixes that.
          </p>
          <p>
            Not with more blog posts.<br />
            Not with scraped or rewritten content.<br />
            But by installing a <span className="text-slate-900 font-medium">continuously operating authority system</span> inside your WordPress site.
          </p>
          <p className="text-slate-900 font-semibold">
            Real fixes. Real structure. Real rankings.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Link href="/signup" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto text-base px-8">
              Run Your Site Diagnosis
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          <Link href="/demo" className="w-full sm:w-auto">
            <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-8">
              <Play className="w-4 h-4 mr-2" />
              Watch Demo
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ============================================
   PROOF CHIPS
============================================ */
function ProofChips() {
  const chips = [
    { icon: <Shield className="w-4 h-4" />, label: 'WordPress-first' },
    { icon: <Layers className="w-4 h-4" />, label: 'IA sequencing' },
    { icon: <ImageIcon className="w-4 h-4" />, label: 'Evidence-backed' },
  ];

  return (
    <section className="container mx-auto px-4 pb-16">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {chips.map((chip) => (
          <div
            key={chip.label}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full text-sm font-medium text-slate-700"
          >
            {chip.icon}
            {chip.label}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================
   FEATURE GRID
============================================ */
function FeatureGrid() {
  const features = [
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'Intelligent Crawl',
      description: 'Every page mapped, every link tracked. Your full site graph in minutes.',
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: 'Priority Ranking',
      description: 'Money pages scored first. Know what to fix now vs. later.',
    },
    {
      icon: <CheckCircle className="w-6 h-6" />,
      title: 'Deep Audits',
      description: '50+ checks per page: SEO, content, conversion, AI-readiness.',
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: 'Fix Briefs',
      description: 'Ready-to-run instructions for every issue. Paste and publish.',
    },
  ];

  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center mb-4">
              {feature.icon}
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">{feature.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================
   60 SECONDS SECTION
============================================ */
function SixtySecondsSection() {
  const items = [
    { text: 'Priority page list', desc: 'ranked by business impact' },
    { text: 'Top ranking blockers', desc: 'the issues hurting you most' },
    { text: 'Ready-to-run fix briefs', desc: 'paste and publish' },
  ];

  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-2xl mx-auto bg-gradient-to-br from-primary-50 to-slate-50 rounded-2xl p-8 md:p-10 border border-primary-100">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-6 text-center">
          What you'll get in 60 seconds
        </h2>
        <ul className="space-y-4">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-slate-900">{item.text}</span>
                <span className="text-slate-600"> — {item.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ============================================
   HOW IT WORKS
============================================ */
function HowItWorks() {
  const steps = [
    {
      number: 1,
      title: 'Drop in your URL',
      description: 'Add your site, goals, and proof points. Takes 2 minutes.',
    },
    {
      number: 2,
      title: 'We crawl & audit',
      description: '50+ checks per page. Priority-ranked by business value.',
    },
    {
      number: 3,
      title: 'Fix, publish, grow',
      description: 'Run the fixes. Unlock your 12-month growth roadmap.',
    },
  ];

  return (
    <section className="container mx-auto px-4 pb-20">
      <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-12">
        How It Works
      </h2>
      <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {steps.map((step) => (
          <div
            key={step.number}
            className="relative p-6 bg-white rounded-2xl border border-slate-200"
          >
            <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold mb-4 text-lg">
              {step.number}
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">{step.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================
   COMPARISON BLOCK
============================================ */
function ComparisonBlock() {
  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-10">
          Why this isn't "AI content"
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Bad Side */}
          <div className="p-6 bg-red-50 rounded-2xl border border-red-100">
            <h3 className="font-semibold text-red-900 mb-4 flex items-center gap-2">
              <X className="w-5 h-5" />
              Scraped & Rewritten Content
            </h3>
            <ul className="space-y-3 text-sm text-red-800">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">✗</span>
                Generic articles that sound like everyone else
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">✗</span>
                No structured authority signals for Google
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">✗</span>
                Missing IPTC metadata, evidence, proof points
              </li>
            </ul>
          </div>

          {/* Good Side */}
          <div className="p-6 bg-green-50 rounded-2xl border border-green-100">
            <h3 className="font-semibold text-green-900 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5" />
              Infinite Authority System
            </h3>
            <ul className="space-y-3 text-sm text-green-800">
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                Structured fixes based on your real business data
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                Evidence-backed publishing with proof signals
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                IPTC image metadata + authority sequencing built-in
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================
   FAQ
============================================ */
function FAQ() {
  const faqs = [
    {
      question: "Is this an SEO tool?",
      answer: "It's more than that. It audits your site structure, fixes authority gaps, and builds a publishing system—not just keyword tracking.",
    },
    {
      question: "Do I need to write anything?",
      answer: "No. Every fix comes with ready-to-paste content briefs. You review and publish—or hand it to your team.",
    },
    {
      question: "Will this work for any WordPress site?",
      answer: "Yes. Service businesses, local sites, WooCommerce, membership sites—if it runs on WordPress, it works.",
    },
    {
      question: "How is this different from AI content tools?",
      answer: "AI tools generate content. We install authority infrastructure: structured data, evidence, proof points, and publishing sequences that compound over time.",
    },
  ];

  return (
    <section className="container mx-auto px-4 pb-20">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-10">
          Questions
        </h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <FAQItem key={i} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
        aria-expanded={open}
      >
        <span className="font-medium text-slate-900">{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed animate-fade-in">
          {answer}
        </div>
      )}
    </div>
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
          Ready to fix your site?
        </h2>
        <p className="text-slate-400 mb-8">
          Enter your URL and get your diagnosis in 60 seconds.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) {
              window.location.href = `/signup?url=${encodeURIComponent(url)}`;
            }
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Input
            type="url"
            placeholder="https://yoursite.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-white/10 border-slate-700 text-white placeholder:text-slate-500 focus:ring-primary-500"
          />
          <Button type="submit" size="lg" className="w-full sm:w-auto whitespace-nowrap">
            Run Diagnosis
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </form>
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
