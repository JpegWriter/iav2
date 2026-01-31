'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Select, Toggle, Textarea } from '@/components/ui';
import { ArrowLeft, ArrowRight, Check, Globe, Building, Boxes, Star, Image, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CrawlProgressV2 } from '@/components/crawl/CrawlProgressV2';

const STEPS = [
  { id: 1, title: 'Site Discovery', icon: Globe },
  { id: 2, title: 'Business Identity', icon: Building },
  { id: 3, title: 'Proof Signals', icon: Boxes },
  { id: 4, title: 'Trust Sources', icon: Star },
  { id: 5, title: 'Conversion Intent', icon: Image },
];

// Collapsible "Why This Matters" component
function WhyThisMatters({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <HelpCircle className="w-4 h-4" />
        <span>Why this step matters</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {isOpen && (
        <p className="mt-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
          {children}
        </p>
      )}
    </div>
  );
}

// Tooltip component for inline hints
function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center ml-1">
      <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 max-w-[250px] text-center">
        {text}
      </span>
    </span>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  // Step 1: Website
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [projectName, setProjectName] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState('leads');
  const [locations, setLocations] = useState('');
  const [languages, setLanguages] = useState('en');
  const [respectRobots, setRespectRobots] = useState(true);
  const [includeSubdomains, setIncludeSubdomains] = useState(false);

  // Step 2: Business
  const [niche, setNiche] = useState('');
  const [coreServices, setCoreServices] = useState('');
  const [pricePositioning, setPricePositioning] = useState('mid');
  const [differentiators, setDifferentiators] = useState('');
  const [doNotSay, setDoNotSay] = useState('');

  // Step 3: Beads (simplified for MVP)
  const [beadProof, setBeadProof] = useState('');
  const [beadAuthority, setBeadAuthority] = useState('');
  const [beadProcess, setBeadProcess] = useState('');
  const [beadDifferentiator, setBeadDifferentiator] = useState('');

  // Step 4: Reviews
  const [reviewsText, setReviewsText] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [yelpUrl, setYelpUrl] = useState('');
  const [tripAdvisorUrl, setTripAdvisorUrl] = useState('');

  // Step 5: Assets (simplified)
  const [primaryCTA, setPrimaryCTA] = useState('Contact us');
  const [brandTone, setBrandTone] = useState('professional');

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      // Create project
      const projectRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootUrl: websiteUrl,
          name: projectName || new URL(websiteUrl).hostname,
          settings: {
            respectRobotsTxt: respectRobots,
            includeSubdomains,
            languages: languages.split(',').map(l => l.trim()),
            primaryGoal,
            maxPages: 200,
            maxDepth: 5,
          },
        }),
      });

      if (!projectRes.ok) {
        throw new Error('Failed to create project');
      }

      const { data: project } = await projectRes.json();

      // Update user context
      await fetch(`/api/projects/${project.id}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: {
            name: projectName,
            website: websiteUrl,
            niche,
            primaryGoal,
            primaryCTA,
            locations: locations.split(',').map(l => l.trim()).filter(Boolean),
            serviceAreaKm: 25,
            languages: languages.split(',').map(l => l.trim()),
            reviewProfiles: {
              googleMaps: googleMapsUrl || null,
              yelp: yelpUrl || null,
              tripAdvisor: tripAdvisorUrl || null,
            },
          },
          offers: {
            coreServices: coreServices
              .split(/[\n,]+/)  // Split by newlines OR commas
              .map(s => s.trim())
              .filter(Boolean),
            pricePositioning,
            startingFrom: '',
            packages: [],
            guarantees: [],
            differentiators: differentiators
              .split(/[\n,]+/)  // Split by newlines OR commas
              .map(s => s.trim())
              .filter(Boolean),
          },
          audience: {
            segments: [],
            topPainPoints: [],
            topObjections: [],
          },
          brandVoice: {
            tone: [brandTone],
            styleRules: ['Use short paragraphs', 'Be direct'],
            avoid: doNotSay.split('\n').filter(Boolean),
          },
          compliance: {
            doNotSay: doNotSay.split('\n').filter(Boolean),
            legalNotes: [],
          },
        }),
      });

      // Create beads
      const beadsToCreate = [
        { type: 'proof', value: beadProof },
        { type: 'authority', value: beadAuthority },
        { type: 'process', value: beadProcess },
        { type: 'differentiator', value: beadDifferentiator },
      ].filter(b => b.value.trim());

      for (const bead of beadsToCreate) {
        await fetch(`/api/projects/${project.id}/beads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: bead.type,
            label: bead.type.charAt(0).toUpperCase() + bead.type.slice(1),
            value: bead.value,
            priority: 80,
            channels: ['wp', 'gmb', 'li'],
            whereToUse: ['hero', 'trust_block'],
            tone: [brandTone],
          }),
        });
      }

      // Create reviews from text
      if (reviewsText.trim()) {
        const reviews = reviewsText.split('\n\n').filter(Boolean);
        for (const reviewText of reviews.slice(0, 10)) {
          await fetch(`/api/projects/${project.id}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'manual',
              rating: 5,
              author: 'Customer',
              date: new Date().toISOString().split('T')[0],
              text: reviewText.trim(),
            }),
          });
        }
      }

      // Scrape reviews from review site URLs (don't await - run in background)
      if (googleMapsUrl || yelpUrl || tripAdvisorUrl) {
        fetch(`/api/projects/${project.id}/reviews/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            googleMapsUrl: googleMapsUrl || null,
            yelpUrl: yelpUrl || null,
            tripAdvisorUrl: tripAdvisorUrl || null,
          }),
        }).catch(err => console.error('Review scrape error:', err));
      }

      // Start crawl (don't await - let it run in background)
      fetch(`/api/projects/${project.id}/crawl`, {
        method: 'POST',
      }).catch(err => console.error('Crawl error:', err));

      // Immediately show animated progress
      setCreatedProjectId(project.id);
      setShowProgress(true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  // Show crawl progress overlay
  if (showProgress && createdProjectId) {
    return (
      <CrawlProgressV2 
        projectId={createdProjectId} 
        onComplete={() => router.push(`/app/${createdProjectId}`)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Build Your Authority Engine</h1>
          <p className="text-slate-600 mt-2">You're building a machine Google understands, trusts, and rewards.</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-2">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => setCurrentStep(step.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
                  currentStep === step.id
                    ? 'bg-primary-100 text-primary-700'
                    : currentStep > step.id
                    ? 'text-green-600'
                    : 'text-slate-400'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                    currentStep === step.id
                      ? 'bg-primary-600 text-white'
                      : currentStep > step.id
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-200 text-slate-500'
                  )}
                >
                  {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
                </div>
                <span className="hidden sm:inline text-sm font-medium">{step.title}</span>
              </button>
              {index < STEPS.length - 1 && (
                <div className={cn('w-8 h-0.5 mx-1', currentStep > step.id ? 'bg-green-500' : 'bg-slate-200')} />
              )}
            </div>
          ))}
        </div>
        
        {/* Step tooltip */}
        <p className="text-center text-xs text-slate-400 mb-8 flex items-center justify-center gap-1">
          <HelpCircle className="w-3 h-3" />
          Each step removes ambiguity for search engines.
        </p>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-700">
            {error}
          </div>
        )}

        {/* Step Content */}
        <Card className="mb-6">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Let's map your site the way Google sees it.</h2>
                <p className="text-sm text-slate-600 mt-1">
                  We'll scan your pages, understand intent, and decide what deserves to rank first.
                </p>
              </div>
              
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-sm font-medium text-slate-700">Website URL</label>
                  <Tooltip text="We don't scrape content. We analyze structure, intent, and signals." />
                </div>
                <Input
                  placeholder="https://example.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  helperText="This is your authority source. Everything we build connects back here."
                />
              </div>

              <Input
                label="Project Name (Internal)"
                placeholder="My Photography Business"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                helperText="Used only inside Infinite Authority. Call it something you'll recognize later."
              />

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  What should rankings ultimately do for your business?
                </label>
                <Select
                  options={[
                    { value: 'leads', label: 'Generate Leads' },
                    { value: 'calls', label: 'Phone Calls' },
                    { value: 'bookings', label: 'Bookings/Appointments' },
                    { value: 'ecommerce', label: 'E-commerce Sales' },
                    { value: 'local', label: 'Local Visibility' },
                  ]}
                  value={primaryGoal}
                  onChange={(e) => setPrimaryGoal(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  {primaryGoal === 'leads' && '→ Service pages prioritized'}
                  {primaryGoal === 'calls' && '→ Local & conversion pages boosted'}
                  {primaryGoal === 'bookings' && '→ Funnel clarity enforced'}
                  {primaryGoal === 'ecommerce' && '→ Product & category pages optimized'}
                  {primaryGoal === 'local' && '→ Geographic signals amplified'}
                </p>
              </div>

              <Input
                label="Locations"
                placeholder="Vienna, Malta, Brighton"
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                helperText="This defines where Google should trust you — not just what you do."
              />

              <Input
                label="Languages"
                placeholder="en, de"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                helperText="We align language with search intent. Not translation. Intent."
              />

              <div className="space-y-4">
                <Toggle
                  checked={respectRobots}
                  onChange={setRespectRobots}
                  label="Respect crawl rules (Recommended)"
                  description="We follow your site's rules. You stay in control."
                />
                <Toggle
                  checked={includeSubdomains}
                  onChange={setIncludeSubdomains}
                  label="Include subdomains"
                  description="Also crawl blog.example.com, shop.example.com, etc."
                />
              </div>
              
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>This step prevents wasted rankings later</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-slate-600 mt-1">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>Nothing is changed on your site yet</span>
                </div>
              </div>
              
              <WhyThisMatters>
                Google ranks clarity before content. This step defines your crawl boundaries, sets geographic relevance, and prevents authority dilution later.
              </WhyThisMatters>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Define what you actually sell — clearly.</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Ambiguity kills rankings. Clarity compounds them.
                </p>
              </div>

              <Input
                label="Industry/Niche"
                placeholder='e.g., "Family Photographer", not "Photography"'
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                helperText="Google ranks specialists, not categories."
              />

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-sm font-medium text-slate-700">Core Services</label>
                  <Tooltip text="Each line becomes a potential authority page." />
                </div>
                <Textarea
                  placeholder="Family Photography
Newborn Photography
Corporate Headshots"
                  value={coreServices}
                  onChange={(e) => setCoreServices(e.target.value)}
                  helperText="One service per line. Think pages — not offerings."
                />
              </div>

              <Select
                label="Market Position"
                options={[
                  { value: 'budget', label: 'Budget-friendly' },
                  { value: 'mid', label: 'Mid-range' },
                  { value: 'premium', label: 'Premium' },
                ]}
                value={pricePositioning}
                onChange={(e) => setPricePositioning(e.target.value)}
                helperText="This affects tone, proof weighting, and conversion strategy."
              />

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  What makes you the obvious choice?
                </label>
                <Textarea
                  placeholder='"12+ years in Vienna"
"8,000+ families photographed"
"Same-day turnaround available"'
                  value={differentiators}
                  onChange={(e) => setDifferentiators(e.target.value)}
                  helperText="Facts beat adjectives. Be specific."
                />
              </div>

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-sm font-medium text-slate-700">Claims to avoid</label>
                  <Tooltip text="Google distrusts exaggeration." />
                </div>
                <Textarea
                  placeholder="Phrases to avoid, one per line..."
                  value={doNotSay}
                  onChange={(e) => setDoNotSay(e.target.value)}
                  helperText="We protect you from over-promising language that weakens trust."
                />
              </div>
              
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-sm text-blue-800 flex items-start gap-2">
                  <span className="text-lg">🧠</span>
                  <span>This step trains Infinite Authority how to speak accurately about you.</span>
                </p>
              </div>
              
              <WhyThisMatters>
                Most SEO systems fail here. Vague business definitions lead to diluted authority. We need precise language to build pages that Google recognizes as expertise.
              </WhyThisMatters>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Proof Signals (What Google Remembers)</h2>
                <p className="text-sm text-slate-600 mt-1">
                  These are your permanent truth anchors. We repeat them so Google doesn't forget.
                </p>
              </div>

              <Input
                label="Quantified Trust"
                placeholder='e.g., "4.9★ from 312 Google reviews"'
                value={beadProof}
                onChange={(e) => setBeadProof(e.target.value)}
                helperText="Numbers = memory for algorithms."
              />

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">External Validation</label>
                <Input
                  placeholder='e.g., "Certified by XYZ", "Featured in Forbes"'
                  value={beadAuthority}
                  onChange={(e) => setBeadAuthority(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Examples: Certified • Featured • Regulated • Recognized
                </p>
              </div>

              <Input
                label="Ease Signal"
                placeholder='e.g., "3-step booking. Takes under 2 minutes."'
                value={beadProcess}
                onChange={(e) => setBeadProcess(e.target.value)}
                helperText="Simple processes convert better — and rank better."
              />

              <Input
                label="Uncopyable Advantage"
                placeholder='e.g., "Only studio in Vienna with natural light rooftop"'
                value={beadDifferentiator}
                onChange={(e) => setBeadDifferentiator(e.target.value)}
                helperText="If a competitor can say it, don't use it."
              />
              
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                <p className="text-sm text-purple-800 flex items-start gap-2">
                  <span className="text-lg">🧬</span>
                  <span>These signals are reused everywhere. You're not filling a form — you're installing memory.</span>
                </p>
              </div>
              
              <WhyThisMatters>
                Proof Signals are facts we consistently reinforce across your site, content, and updates. Repetition builds recognition. Recognition builds trust.
              </WhyThisMatters>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Connect your reputation.</h2>
                <p className="text-sm text-slate-600 mt-1">
                  We don't rewrite reviews. We amplify them intelligently.
                </p>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-medium text-slate-700 block">Live Trust Sources</label>
                <Input
                  label="Google Maps URL"
                  placeholder="https://maps.google.com/maps/place/your-business..."
                  value={googleMapsUrl}
                  onChange={(e) => setGoogleMapsUrl(e.target.value)}
                  helperText="Your Google Business Profile URL"
                />

                <Input
                  label="Yelp URL"
                  placeholder="https://www.yelp.com/biz/your-business"
                  value={yelpUrl}
                  onChange={(e) => setYelpUrl(e.target.value)}
                  helperText="Your Yelp business page URL"
                />

                <Input
                  label="TripAdvisor URL"
                  placeholder="https://www.tripadvisor.com/your-business..."
                  value={tripAdvisorUrl}
                  onChange={(e) => setTripAdvisorUrl(e.target.value)}
                  helperText="Your TripAdvisor page URL (if applicable)"
                />
                <p className="text-xs text-slate-500">We sync real reviews so your authority stays current.</p>
              </div>

              <div className="border-t pt-4">
                <label className="text-sm font-medium text-slate-700 block mb-3">
                  Offline or Private Testimonials
                </label>
                <Textarea
                  placeholder='Paste reviews here. Separate each review with a blank line.

"They were so professional and quick!"

"Best decision we made. Highly recommend."'
                  value={reviewsText}
                  onChange={(e) => setReviewsText(e.target.value)}
                  className="min-h-[120px]"
                  helperText="Use this for emails, PDFs, or messages not publicly indexed."
                />
              </div>

              <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-sm text-amber-800 flex items-start gap-2">
                  <span className="text-lg">⭐</span>
                  <span>Reviews power local trust, conversion, and authority reinforcement.</span>
                </p>
              </div>
              
              <WhyThisMatters>
                Third-party validation is the most powerful trust signal. We extract themes, sentiment, and proof points from your reviews to reinforce authority across all content.
              </WhyThisMatters>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Tell us how success looks.</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Rankings are useless without action.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Primary Action</label>
                <Input
                  placeholder="e.g., Book a call, Request pricing, Get a quote, Join waitlist"
                  value={primaryCTA}
                  onChange={(e) => setPrimaryCTA(e.target.value)}
                  helperText="We align content and structure around this action."
                />
              </div>

              <Select
                label="Voice & Presence"
                options={[
                  { value: 'professional', label: 'Professional' },
                  { value: 'friendly', label: 'Friendly' },
                  { value: 'premium', label: 'Premium/Luxury' },
                  { value: 'playful', label: 'Playful' },
                  { value: 'blunt', label: 'Direct/Blunt' },
                ]}
                value={brandTone}
                onChange={(e) => setBrandTone(e.target.value)}
                helperText="This affects copy style, not personality replacement."
              />

              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h3 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                  <span className="text-lg">🚀</span>
                  You're about to start the Authority Engine
                </h3>
                <p className="text-sm text-green-700">
                  We'll analyze up to 200 pages, prioritize by business value,
                  and generate a clear, sequential growth plan.
                </p>
                <p className="text-xs text-green-600 mt-2 opacity-75">
                  No changes are made automatically.
                </p>
              </div>
              
              <WhyThisMatters>
                Every piece of content needs a destination. Your primary action becomes the gravitational center of your authority system.
              </WhyThisMatters>
            </div>
          )}
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {currentStep < 5 ? (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} loading={loading}>
              Start Crawl
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
