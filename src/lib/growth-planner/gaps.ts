// ============================================================================
// GROWTH PLANNER ENGINE - GAP ANALYSIS (Phase 1)
// ============================================================================

import {
  SiteStructureContext,
  PageContentContext,
  BusinessRealityModel,
  GapAnalysis,
  PageGap,
  GapAction,
} from './types';
import { PageRole } from '@/types';

/**
 * Analyze site structure and content to identify gaps and issues
 */
export function analyzeGaps(
  siteStructure: SiteStructureContext,
  pageContents: PageContentContext[],
  businessReality: BusinessRealityModel
): GapAnalysis {
  const moneyPageGaps = analyzeMoneyPageGaps(pageContents, businessReality);
  const trustGaps = analyzeTrustGaps(pageContents, businessReality);
  const supportGaps = analyzeSupportGaps(pageContents, businessReality);
  const structuralIssues = analyzeStructuralIssues(pageContents, siteStructure);
  const conversionBlockers = analyzeConversionBlockers(pageContents, businessReality);

  return {
    moneyPageGaps,
    trustGaps,
    supportGaps,
    structuralIssues,
    conversionBlockers,
  };
}

/**
 * Analyze money page gaps - core service pages that are missing or weak
 */
function analyzeMoneyPageGaps(
  pages: PageContentContext[],
  business: BusinessRealityModel
): PageGap[] {
  const gaps: PageGap[] = [];
  const moneyPages = pages.filter((p) => p.role === 'money');
  
  // Build context for compelling titles
  const location = business.primaryLocations[0] || '';
  const locationSuffix = location ? ` in ${location}` : '';
  const yearsActive = business.yearsActive;
  const yearsPhrase = yearsActive && yearsActive > 1 
    ? `${yearsActive}+ Years of` 
    : '';

  // Check each core service has a dedicated money page
  for (const service of business.coreServices) {
    const serviceLower = service.toLowerCase();
    const existingPage = moneyPages.find(
      (p) =>
        p.serviceMentions.some((s) => s.toLowerCase() === serviceLower) ||
        (p.title?.toLowerCase().includes(serviceLower)) ||
        (p.h1?.toLowerCase().includes(serviceLower))
    );

    if (!existingPage) {
      // Service has no dedicated money page - CREATE with compelling title
      const titleTemplates = [
        `${service} Services${locationSuffix} | Expert ${service} by ${business.name}`,
        `Professional ${service}${locationSuffix} | ${business.name}`,
        yearsPhrase ? `${yearsPhrase} ${service} Excellence | ${business.name}` : null,
        `Trusted ${service} Provider${locationSuffix} | ${business.name}`,
      ].filter(Boolean) as string[];
      
      gaps.push({
        path: null,
        existingTitle: null,
        action: 'create',
        reason: `No dedicated money page for core service: ${service}`,
        priority: 'critical',
        targetRole: 'money',
        targetService: service,
        targetLocation: business.primaryLocations[0] || null,
        blocksConversion: true,
        suggestedTitle: titleTemplates[0],
      });
    } else {
      // Check if the page needs improvement
      const issues: string[] = [];

      if (existingPage.wordCount < 500) {
        issues.push('Thin content (< 500 words)');
      }
      if (!existingPage.hasConversionElements) {
        issues.push('Missing conversion elements');
      }
      if (existingPage.locationMentions.length === 0 && business.primaryLocations.length > 0) {
        issues.push('No location anchoring');
      }
      if (existingPage.issues.length > 0) {
        issues.push(...existingPage.issues.slice(0, 2));
      }

      if (issues.length > 0) {
        const action: GapAction = existingPage.wordCount < 300 ? 'rebuild' : 
                                  existingPage.wordCount < 800 ? 'expand' : 'fix';
        // Use existing title or create an improved one
        const improvedTitle = existingPage.title && !existingPage.title.includes('|')
          ? `${existingPage.title} | Professional ${service} by ${business.name}`
          : existingPage.title || `Professional ${service}${locationSuffix} | ${business.name}`;
          
        gaps.push({
          path: existingPage.path,
          existingTitle: existingPage.title,
          action,
          reason: issues.join('; '),
          priority: issues.some((i) => i.includes('conversion')) ? 'critical' : 'high',
          targetRole: 'money',
          targetService: service,
          targetLocation: business.primaryLocations[0] || null,
          blocksConversion: !existingPage.hasConversionElements,
          suggestedTitle: improvedTitle,
        });
      }
    }
  }

  // Check for location-specific service pages
  for (const location of business.primaryLocations.slice(0, 3)) {
    const primaryService = business.coreServices[0];
    if (!primaryService) continue;

    const locationServicePage = moneyPages.find(
      (p) =>
        p.serviceMentions.includes(primaryService) &&
        p.locationMentions.some((l) => l.toLowerCase() === location.toLowerCase())
    );

    if (!locationServicePage) {
      // Create SEO-optimized location page title
      const locationTitleTemplates = [
        `${primaryService} in ${location} | Local ${primaryService} Experts`,
        `${location} ${primaryService} Services | ${business.name}`,
        `Find Trusted ${primaryService} in ${location} | ${business.name}`,
      ];
      
      gaps.push({
        path: null,
        existingTitle: null,
        action: 'create',
        reason: `No location-specific page for ${primaryService} in ${location}`,
        priority: 'high',
        targetRole: 'money',
        targetService: primaryService,
        targetLocation: location,
        blocksConversion: false,
        suggestedTitle: locationTitleTemplates[0],
      });
    }
  }

  return gaps;
}

/**
 * Analyze trust page gaps - about, testimonials, case studies
 */
function analyzeTrustGaps(
  pages: PageContentContext[],
  business: BusinessRealityModel
): PageGap[] {
  const gaps: PageGap[] = [];
  const trustPages = pages.filter((p) => p.role === 'trust');

  // Essential trust pages with SEO-optimized title templates
  const primaryService = business.coreServices[0] || 'services';
  const primaryLocation = business.primaryLocations[0] || '';
  const locationSuffix = primaryLocation ? ` in ${primaryLocation}` : '';
  const yearsPhrase = business.yearsActive ? `${business.yearsActive}+ Years` : '';
  
  const essentialTrustPages = [
    {
      keywords: ['about', 'über uns', 'about us', 'team', 'who we are'],
      name: 'About Us',
      reason: 'Establishes credibility and human connection',
      titleTemplates: [
        yearsPhrase ? `Meet ${business.name}: ${yearsPhrase} of ${primaryService} Excellence${locationSuffix}` : null,
        `About ${business.name} – Your Trusted ${primaryService} Partner${locationSuffix}`,
        `Who We Are: ${business.name}'s Story & ${primaryService} Expertise`,
      ],
    },
    {
      keywords: ['testimonial', 'review', 'bewertung', 'kundenstimmen', 'erfahrung'],
      name: 'Testimonials',
      reason: 'Social proof is critical for conversion',
      titleTemplates: [
        `${primaryService} Client Reviews & Testimonials | ${business.name}`,
        `What Our ${primaryService} Clients Say${locationSuffix}`,
        `Real Results: ${business.name} ${primaryService} Reviews`,
      ],
    },
    {
      keywords: ['case study', 'success story', 'portfolio', 'work', 'projekt'],
      name: 'Case Studies / Portfolio',
      reason: 'Demonstrates capability and results',
      titleTemplates: [
        `${primaryService} Case Studies & Success Stories | ${business.name}`,
        `How We Helped: ${primaryService} Results${locationSuffix}`,
        `${business.name} Portfolio: ${primaryService} Projects & Outcomes`,
      ],
    },
  ];

  for (const essential of essentialTrustPages) {
    const exists = pages.some((p) =>
      essential.keywords.some(
        (kw) =>
          p.path.toLowerCase().includes(kw) ||
          (p.title?.toLowerCase().includes(kw)) ||
          (p.h1?.toLowerCase().includes(kw))
      )
    );

    if (!exists) {
      // Pick best available title template (first non-null)
      const suggestedTitle = essential.titleTemplates.find(t => t !== null) || `${essential.name} | ${business.name}`;
      
      gaps.push({
        path: null,
        existingTitle: null,
        action: 'create',
        reason: `Missing ${essential.name} page - ${essential.reason}`,
        priority: essential.name === 'About Us' ? 'high' : 'medium',
        targetRole: 'trust',
        targetService: primaryService,
        targetLocation: primaryLocation || null,
        blocksConversion: essential.name === 'Testimonials',
        suggestedTitle,
      });
    }
  }

  // Check if existing trust pages are thin
  for (const page of trustPages) {
    if (page.wordCount < 300) {
      gaps.push({
        path: page.path,
        existingTitle: page.title,
        action: 'expand',
        reason: 'Trust page has insufficient content depth',
        priority: 'medium',
        targetRole: 'trust',
        targetService: null,
        targetLocation: null,
        blocksConversion: false,
        suggestedTitle: page.title || 'Trust Page',
      });
    }
  }

  return gaps;
}

/**
 * Analyze support page gaps - FAQs, process, guides
 */
function analyzeSupportGaps(
  pages: PageContentContext[],
  business: BusinessRealityModel
): PageGap[] {
  const gaps: PageGap[] = [];

  // Essential support pages with SEO-optimized titles
  const primaryService = business.coreServices[0] || 'services';
  const primaryLocation = business.primaryLocations[0] || '';
  const locationSuffix = primaryLocation ? ` in ${primaryLocation}` : '';
  
  const essentialSupport = [
    {
      keywords: ['faq', 'häufige fragen', 'questions', 'fragen'],
      name: 'FAQ',
      reason: 'Addresses objections and supports SEO',
      titleTemplates: [
        `${primaryService} FAQ: Your Questions Answered | ${business.name}`,
        `Frequently Asked Questions About ${primaryService}${locationSuffix}`,
      ],
    },
    {
      keywords: ['process', 'how it works', 'ablauf', 'so funktioniert'],
      name: 'Process / How It Works',
      reason: 'Reduces uncertainty and builds trust',
      titleTemplates: [
        `How Our ${primaryService} Process Works | ${business.name}`,
        `What to Expect: Your ${primaryService} Journey${locationSuffix}`,
      ],
    },
    {
      keywords: ['contact', 'kontakt', 'get in touch', 'reach us'],
      name: 'Contact',
      reason: 'Essential conversion endpoint',
      titleTemplates: [
        `Contact ${business.name} for ${primaryService}${locationSuffix}`,
        `Get in Touch – ${primaryService} Enquiries Welcome`,
      ],
    },
  ];

  for (const essential of essentialSupport) {
    const exists = pages.some((p) =>
      essential.keywords.some(
        (kw) =>
          p.path.toLowerCase().includes(kw) ||
          (p.title?.toLowerCase().includes(kw))
      )
    );

    if (!exists) {
      const suggestedTitle = essential.titleTemplates[0] || `${essential.name} | ${business.name}`;
      
      gaps.push({
        path: null,
        existingTitle: null,
        action: 'create',
        reason: `Missing ${essential.name} page - ${essential.reason}`,
        priority: essential.name === 'Contact' ? 'critical' : 'medium',
        targetRole: 'support',
        targetService: primaryService,
        targetLocation: primaryLocation || null,
        blocksConversion: essential.name === 'Contact',
        suggestedTitle,
      });
    }
  }

  // Service-specific FAQs for core services
  for (const service of business.coreServices.slice(0, 2)) {
    const serviceFaq = pages.find(
      (p) =>
        p.path.toLowerCase().includes('faq') &&
        p.serviceMentions.includes(service)
    );

    if (!serviceFaq) {
      gaps.push({
        path: null,
        existingTitle: null,
        action: 'create',
        reason: `No dedicated FAQ for ${service}`,
        priority: 'low',
        targetRole: 'support',
        targetService: service,
        targetLocation: primaryLocation || null,
        blocksConversion: false,
        suggestedTitle: `${service} FAQ: Top 10 Questions Answered${locationSuffix}`,
      });
    }
  }

  return gaps;
}

/**
 * Analyze structural issues - duplicates, orphans, cannibalization
 */
function analyzeStructuralIssues(
  pages: PageContentContext[],
  siteStructure: SiteStructureContext
): Array<{
  type: 'duplicate_intent' | 'topic_bleed' | 'orphan' | 'cannibalisation';
  pages: string[];
  recommendation: string;
}> {
  const issues: Array<{
    type: 'duplicate_intent' | 'topic_bleed' | 'orphan' | 'cannibalisation';
    pages: string[];
    recommendation: string;
  }> = [];

  // Check for orphaned content
  if (siteStructure.orphanedContent.length > 0) {
    issues.push({
      type: 'orphan',
      pages: siteStructure.orphanedContent.map((p) => p.path),
      recommendation: 'Add internal links to orphaned pages from relevant parent pages',
    });
  }

  // Check for potential topic cannibalization (pages with similar titles)
  const titleGroups: Record<string, string[]> = {};
  
  for (const page of pages) {
    if (!page.title) continue;
    
    // Normalize title for comparison
    const normalizedTitle = page.title
      .toLowerCase()
      .replace(/[|–-].*$/, '') // Remove brand name suffix
      .trim();

    if (!titleGroups[normalizedTitle]) {
      titleGroups[normalizedTitle] = [];
    }
    titleGroups[normalizedTitle].push(page.path);
  }

  for (const [title, paths] of Object.entries(titleGroups)) {
    if (paths.length > 1) {
      issues.push({
        type: 'cannibalisation',
        pages: paths,
        recommendation: `Multiple pages targeting "${title}" - consolidate or differentiate intent`,
      });
    }
  }

  // Check for topic bleed (support pages that should be money pages)
  const moneyKeywords = ['service', 'package', 'pricing', 'book', 'hire'];
  for (const page of pages.filter((p) => p.role === 'support')) {
    const hasMoneyIntent = moneyKeywords.some(
      (kw) =>
        page.path.toLowerCase().includes(kw) ||
        (page.title?.toLowerCase().includes(kw))
    );

    if (hasMoneyIntent) {
      issues.push({
        type: 'topic_bleed',
        pages: [page.path],
        recommendation: 'This support page has money-page intent - consider role change',
      });
    }
  }

  return issues;
}

/**
 * Analyze conversion blockers
 */
function analyzeConversionBlockers(
  pages: PageContentContext[],
  business: BusinessRealityModel
): Array<{
  page: string;
  blocker: string;
  fixAction: string;
}> {
  const blockers: Array<{
    page: string;
    blocker: string;
    fixAction: string;
  }> = [];

  // Check money pages for conversion elements
  const moneyPages = pages.filter((p) => p.role === 'money');

  for (const page of moneyPages) {
    if (!page.hasConversionElements) {
      blockers.push({
        page: page.path,
        blocker: 'No clear call-to-action or conversion element',
        fixAction: `Add prominent CTA: "${business.primaryCTA}"`,
      });
    }

    if (page.internalLinksOut === 0) {
      blockers.push({
        page: page.path,
        blocker: 'No internal links to guide user journey',
        fixAction: 'Add links to related services, contact, and trust pages',
      });
    }

    if (page.wordCount < 500 && page.role === 'money') {
      blockers.push({
        page: page.path,
        blocker: 'Insufficient content depth for decision-making',
        fixAction: 'Expand with benefits, process, proof, and objection handling',
      });
    }
  }

  return blockers;
}
