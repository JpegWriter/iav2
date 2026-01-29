// ============================================================================
// WRITER TEST FIXTURES
// ============================================================================
// Sample data for testing the Writer system across different niches.
// ============================================================================

import type {
  WritingJob,
  WriterTask,
  UserContext,
  SiteContext,
  ProofContext,
  VisionContext,
  PublishingTargets,
} from '../src/types';

// ============================================================================
// SAMPLE TASK
// ============================================================================

export const sampleTask: WriterTask = {
  slug: 'emergency-plumbing-repair',
  role: 'money',
  intent: 'buy',
  primaryService: 'Emergency Plumbing Repair',
  location: 'Denver, CO',
  targetAudience: 'Homeowners needing urgent plumbing repairs',
  requiredProofElements: ['testimonial', 'statistic'],
  requiredEEATSignals: ['years_active', 'certifications'],
  internalLinks: {
    upLinks: [
      {
        targetUrl: '/services',
        targetTitle: 'Our Services',
        anchorSuggestion: 'our plumbing services',
        required: true,
      },
    ],
    downLinks: [
      {
        targetUrl: '/services/drain-cleaning',
        targetTitle: 'Drain Cleaning',
        anchorSuggestion: 'drain cleaning',
      },
    ],
    requiredAnchors: ['plumbing services'],
  },
  mediaRequirements: {
    heroRequired: true,
    inlineImagesMin: 2,
    inlineImagesMax: 4,
  },
  wordpress: {
    maxBlocks: 50,
    maxHtmlBytes: 40000,
    excerptLength: 155,
    readingTimeTarget: 5,
    maxTableRows: 6,
    maxH2Count: 8,
  },
};

// ============================================================================
// SAMPLE USER CONTEXT
// ============================================================================

export const sampleUserContext: UserContext = {
  businessName: 'Quick Fix Plumbing Co.',
  website: 'https://quickfixplumbing.com',
  locales: ['en-US'],
  serviceAreas: ['Denver', 'Aurora', 'Lakewood'],
  services: ['Emergency Plumbing', 'Drain Cleaning', 'Water Heater Installation'],
  products: [],
  uspDifferentiators: [
    '24/7 emergency service',
    'Licensed and insured',
    'Same-day appointments',
  ],
  beads: [
    {
      id: 'bead-1',
      type: 'proof',
      label: 'Years in Business',
      value: '15+ years serving Denver',
      priority: 1,
    },
    {
      id: 'bead-2',
      type: 'authority',
      label: 'Certification',
      value: 'Master Plumber License',
      priority: 2,
    },
  ],
  brandToneProfile: {
    id: 'friendly-expert',
    name: 'Friendly Expert',
    voice: {
      formality: 'neutral',
      confidence: 'confident',
      humourLevel: 'subtle',
      sentenceLengthBias: 'mixed',
    },
    tabooWords: ['synergy', 'leverage'],
    persuasionLevel: 'medium',
    ctaStyle: 'direct',
    readingLevel: 'standard',
  },
  complianceNotes: [],
};

// ============================================================================
// SAMPLE SITE CONTEXT
// ============================================================================

export const sampleSiteContext: SiteContext = {
  sitemapSummary: {
    totalPages: 25,
    moneyPages: 8,
    supportPages: 12,
    authorityPages: 5,
  },
  pageGraph: [
    {
      url: '/services',
      title: 'Our Services',
      role: 'money',
      priorityScore: 0.9,
    },
    {
      url: '/about',
      title: 'About Us',
      role: 'trust',
      priorityScore: 0.7,
    },
  ],
};

// ============================================================================
// SAMPLE PROOF CONTEXT
// ============================================================================

export const sampleProofContext: ProofContext = {
  reviews: [
    {
      source: 'google',
      rating: 5,
      text: 'Amazing service! They came within an hour and fixed our burst pipe.',
      date: '2024-01-15',
      author: 'John D.',
      themes: ['fast response', 'quality work'],
    },
    {
      source: 'google',
      rating: 5,
      text: 'Professional and courteous. Fair pricing too!',
      date: '2024-01-10',
      author: 'Sarah M.',
      themes: ['professional', 'fair pricing'],
    },
  ],
  reviewThemes: [
    {
      theme: 'fast response',
      count: 45,
      snippets: ['came within an hour', 'same day service'],
    },
    {
      theme: 'professional',
      count: 38,
      snippets: ['courteous', 'respectful', 'clean work'],
    },
  ],
  proofAssets: {
    caseStudies: [
      {
        title: 'Emergency Pipe Repair',
        summary: 'Fixed a burst pipe in a family home during a winter freeze.',
        outcome: 'Prevented $10,000+ in water damage',
        metrics: ['1 hour response time', 'Same-day repair'],
      },
    ],
    awards: [],
    certifications: [
      {
        name: 'Master Plumber License',
        issuer: 'State of Colorado',
        validUntil: '2025-12-31',
      },
    ],
    guarantees: ['100% satisfaction guarantee', 'No surprise fees'],
  },
};

// ============================================================================
// SAMPLE VISION CONTEXT
// ============================================================================

export const sampleVisionContext: VisionContext = {
  selectedImages: [
    {
      imageId: 'img-hero-1',
      filePath: '/images/plumber-at-work.jpg',
      vision: {
        subjects: ['plumber', 'pipes', 'tools'],
        expressions: [{ type: 'focused', confidence: 0.9 }],
        scene: 'Professional plumber working under a sink',
        technicalScore: 0.85,
        emotionalImpact: 'medium',
      },
      tags: ['plumber', 'professional', 'work'],
      suggestedAlt: 'Professional plumber repairing pipes under a sink',
      suggestedCaption: 'Our expert technicians provide reliable repairs',
      intendedUse: 'hero',
    },
    {
      imageId: 'img-inline-1',
      filePath: '/images/water-heater.jpg',
      vision: {
        subjects: ['water heater', 'installation'],
        expressions: [],
        scene: 'New water heater installation',
        technicalScore: 0.8,
        emotionalImpact: 'low',
      },
      tags: ['water heater', 'installation'],
      suggestedAlt: 'Professional water heater installation',
      suggestedCaption: 'Quality water heater installation services',
      intendedUse: 'inline',
    },
  ],
  heroCandidate: 'img-hero-1',
};

// ============================================================================
// SAMPLE PUBLISHING TARGETS
// ============================================================================

export const samplePublishingTargets: PublishingTargets = {
  wordpress: {
    siteId: 'site-1',
    status: 'draft',
  },
  linkedin: {
    enabled: true,
  },
  gmb: {
    enabled: true,
  },
  reddit: {
    enabled: false,
    subredditTargets: [],
  },
};

// ============================================================================
// FULL SAMPLE WRITING JOB
// ============================================================================

export const sampleWritingJob: WritingJob = {
  jobId: 'job-123',
  userId: 'user-456',
  projectId: 'project-789',
  task: sampleTask,
  userContext: sampleUserContext,
  siteContext: sampleSiteContext,
  proofContext: sampleProofContext,
  visionContext: sampleVisionContext,
  publishingTargets: samplePublishingTargets,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ============================================================================
// LUXURY RETAIL FIXTURE
// ============================================================================

export const luxuryRetailTask: WriterTask = {
  slug: 'custom-engagement-rings',
  role: 'money',
  intent: 'buy',
  primaryService: 'Custom Engagement Rings',
  targetAudience: 'Couples seeking unique engagement rings',
  requiredProofElements: ['testimonial', 'case_study_reference'],
  requiredEEATSignals: ['credentials', 'awards'],
  internalLinks: {
    upLinks: [
      {
        targetUrl: '/jewelry',
        targetTitle: 'Fine Jewelry',
        required: true,
      },
    ],
    downLinks: [],
    requiredAnchors: [],
  },
  mediaRequirements: {
    heroRequired: true,
    inlineImagesMin: 3,
    inlineImagesMax: 6,
  },
  wordpress: {
    maxBlocks: 60,
    maxHtmlBytes: 50000,
    excerptLength: 155,
    readingTimeTarget: 6,
  },
};

export const luxuryUserContext: UserContext = {
  businessName: 'Lumina Fine Jewelry',
  website: 'https://luminafinejewelry.com',
  locales: ['en-US'],
  serviceAreas: ['Beverly Hills', 'Los Angeles'],
  services: ['Custom Engagement Rings', 'Wedding Bands', 'Fine Jewelry'],
  products: ['Diamond Rings', 'Gemstone Jewelry', 'Custom Designs'],
  uspDifferentiators: [
    'GIA certified diamonds',
    'Master craftsmen with 30+ years experience',
    'Private consultation appointments',
  ],
  beads: [
    {
      id: 'bead-1',
      type: 'authority',
      label: 'Certification',
      value: 'GIA Graduate Gemologist',
      priority: 1,
    },
  ],
  brandToneProfile: {
    id: 'luxury-premium',
    name: 'Luxury Premium',
    voice: {
      formality: 'formal',
      confidence: 'confident',
      humourLevel: 'none',
      sentenceLengthBias: 'long',
    },
    tabooWords: ['cheap', 'affordable', 'budget', 'deal'],
    persuasionLevel: 'low',
    ctaStyle: 'soft',
    readingLevel: 'advanced',
  },
  complianceNotes: [],
};
