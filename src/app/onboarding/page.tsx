'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Select, Toggle, Textarea } from '@/components/ui';
import { ArrowLeft, ArrowRight, Check, Globe, Building, Boxes, Star, Image } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CrawlProgressV2 } from '@/components/crawl/CrawlProgressV2';

const STEPS = [
  { id: 1, title: 'Website', icon: Globe },
  { id: 2, title: 'Business', icon: Building },
  { id: 3, title: 'Beads', icon: Boxes },
  { id: 4, title: 'Reviews', icon: Star },
  { id: 5, title: 'Assets', icon: Image },
];

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
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Set up your project</h1>
          <p className="text-slate-600 mt-2">Let&apos;s get your website ready for optimization</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
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
              <h2 className="text-lg font-semibold">Website Details</h2>
              
              <Input
                label="Website URL"
                placeholder="https://example.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                helperText="We'll crawl this site to find all pages"
              />

              <Input
                label="Project Name"
                placeholder="My Website"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />

              <Select
                label="Primary Business Goal"
                options={[
                  { value: 'leads', label: 'Generate Leads' },
                  { value: 'ecommerce', label: 'E-commerce Sales' },
                  { value: 'bookings', label: 'Bookings/Appointments' },
                  { value: 'local', label: 'Local Visibility' },
                ]}
                value={primaryGoal}
                onChange={(e) => setPrimaryGoal(e.target.value)}
              />

              <Input
                label="Locations"
                placeholder="New York, Los Angeles"
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                helperText="Comma-separated list of cities or regions you serve"
              />

              <Input
                label="Languages"
                placeholder="en, de"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                helperText="Comma-separated language codes"
              />

              <div className="space-y-4">
                <Toggle
                  checked={respectRobots}
                  onChange={setRespectRobots}
                  label="Respect robots.txt"
                  description="Follow crawling rules set by your website"
                />
                <Toggle
                  checked={includeSubdomains}
                  onChange={setIncludeSubdomains}
                  label="Include subdomains"
                  description="Also crawl blog.example.com, shop.example.com, etc."
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">Business Information</h2>

              <Input
                label="Industry/Niche"
                placeholder="e.g., Photography, Plumbing, Legal Services"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              />

              <Textarea
                label="Core Services"
                placeholder="Enter each service on a new line..."
                value={coreServices}
                onChange={(e) => setCoreServices(e.target.value)}
                helperText="One service per line"
              />

              <Select
                label="Price Positioning"
                options={[
                  { value: 'budget', label: 'Budget-friendly' },
                  { value: 'mid', label: 'Mid-range' },
                  { value: 'premium', label: 'Premium' },
                ]}
                value={pricePositioning}
                onChange={(e) => setPricePositioning(e.target.value)}
              />

              <Textarea
                label="Key Differentiators"
                placeholder="What makes you different? One per line..."
                value={differentiators}
                onChange={(e) => setDifferentiators(e.target.value)}
              />

              <Textarea
                label="Do NOT Say (Compliance)"
                placeholder="Phrases to avoid, one per line..."
                value={doNotSay}
                onChange={(e) => setDoNotSay(e.target.value)}
                helperText="Legal restrictions, brand guidelines, etc."
              />
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Beads (Proof Points)</h2>
                <p className="text-sm text-slate-600 mt-1">
                  These are your &quot;truth atoms&quot; - facts that should be used consistently across your content.
                </p>
              </div>

              <Input
                label="Proof Bead"
                placeholder='e.g., "4.9★ from 312 Google reviews"'
                value={beadProof}
                onChange={(e) => setBeadProof(e.target.value)}
                helperText="Quantified trust signal"
              />

              <Input
                label="Authority Bead"
                placeholder='e.g., "Certified by XYZ", "Featured in Forbes"'
                value={beadAuthority}
                onChange={(e) => setBeadAuthority(e.target.value)}
                helperText="Credentials, awards, press mentions"
              />

              <Input
                label="Process Bead"
                placeholder='e.g., "3-step booking, takes 2 minutes"'
                value={beadProcess}
                onChange={(e) => setBeadProcess(e.target.value)}
                helperText="How you make it easy"
              />

              <Input
                label="Differentiator Bead"
                placeholder='e.g., "Same-day turnaround available"'
                value={beadDifferentiator}
                onChange={(e) => setBeadDifferentiator(e.target.value)}
                helperText="What makes you unique"
              />
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Reviews & Testimonials</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Add links to your review profiles - we&apos;ll automatically import your reviews.
                </p>
              </div>

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

              <div className="border-t pt-4">
                <p className="text-sm text-slate-600 mb-3">
                  Or paste reviews manually below:
                </p>
                <Textarea
                  label="Manual Reviews"
                  placeholder='Paste reviews here. Separate each review with a blank line.

"They were so professional and quick!"

"Best decision we made. Highly recommend."'
                  value={reviewsText}
                  onChange={(e) => setReviewsText(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Tip:</strong> We&apos;ll automatically fetch reviews from Google Maps, Yelp, and TripAdvisor to populate your trust content.
                </p>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">Brand & CTA</h2>

              <Input
                label="Primary Call-to-Action"
                placeholder="e.g., Book a call, Get a quote, Contact us"
                value={primaryCTA}
                onChange={(e) => setPrimaryCTA(e.target.value)}
                helperText="What action do you want visitors to take?"
              />

              <Select
                label="Brand Tone"
                options={[
                  { value: 'professional', label: 'Professional' },
                  { value: 'friendly', label: 'Friendly' },
                  { value: 'premium', label: 'Premium/Luxury' },
                  { value: 'playful', label: 'Playful' },
                  { value: 'blunt', label: 'Direct/Blunt' },
                ]}
                value={brandTone}
                onChange={(e) => setBrandTone(e.target.value)}
              />

              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-medium text-green-800 mb-2">Ready to start!</h3>
                <p className="text-sm text-green-700">
                  Click &quot;Start Crawl&quot; to begin analyzing your website. We&apos;ll crawl up to 200 pages,
                  rank them by business value, and generate fix recommendations.
                </p>
              </div>
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
