// ============================================================================
// GROWTH PLANNER ENGINE - BRIEF GENERATOR (Phase 4)
// ============================================================================

import { v4 as uuid } from 'uuid';
import {
  BusinessRealityModel,
  GrowthTask,
  WriterBrief,
  LegacyWriterBrief,
  BriefImagePlan,
  BriefPublishingSpec,
  ChannelDerivative,
  GmbDerivative,
  RedditDerivative,
} from './types';

/**
 * Generate a complete writer brief for a growth task (legacy format)
 */
export function generateBrief(
  task: GrowthTask,
  business: BusinessRealityModel
): LegacyWriterBrief {
  const sections = buildContentSections(task, business);
  const keyObjections = extractRelevantObjections(task, business);
  const proofRequired = buildProofRequirements(task, business);
  const imageGuidance = buildImageGuidance(task, business);
  const mandatoryLinks = buildMandatoryLinks(task, business);
  const toneGuidance = buildToneGuidance(business);
  const whatNotToDo = buildWhatNotToDo(task, business);

  // Build SEO elements
  const seoTitle = buildSeoTitle(task, business);
  const metaDescription = buildMetaDescription(task, business);
  const focusKeyword = buildFocusKeyword(task);
  const secondaryKeywords = buildSecondaryKeywords(task, business);

  return {
    taskId: task.id,
    slug: task.slug,
    
    pageTitle: task.title,
    h1Intent: buildH1Intent(task),
    role: task.role,
    
    primaryService: task.primaryService,
    primaryLocation: task.primaryLocation,
    targetAudience: task.targetAudience,
    searchIntent: task.searchIntent,
    
    estimatedWords: task.estimatedWords,
    sections,
    
    keyObjections,
    proofRequired,
    reviewThemesToIncorporate: task.reviewThemesToUse,
    
    imageGuidance,
    mandatoryInternalLinks: mandatoryLinks,

    toneGuidance,
    whatNotToDo,
    
    ctaDirection: task.conversionPath,
    conversionElement: getConversionElement(task, business),
    
    seoTitle,
    metaDescription,
    focusKeyword,
    secondaryKeywords,
  };
}

/**
 * Generate briefs for all tasks in a month (legacy format)
 */
export function generateBriefsForMonth(
  tasks: GrowthTask[],
  business: BusinessRealityModel
): LegacyWriterBrief[] {
  return tasks.map((task) => generateBrief(task, business));
}

// ============================================================================
// SECTION BUILDERS
// ============================================================================

function buildContentSections(
  task: GrowthTask,
  business: BusinessRealityModel
): LegacyWriterBrief['sections'] {
  const sections: LegacyWriterBrief['sections'] = [];

  // All pages start with a hook
  sections.push({
    heading: 'Introduction / Hook',
    purpose: 'Capture attention and establish relevance',
    keyPoints: [
      `Address the reader's situation/problem`,
      `Mention ${task.primaryService} naturally`,
      task.primaryLocation ? `Reference ${task.primaryLocation} area` : 'Keep location-agnostic',
      `Set up the value proposition`,
    ],
  });

  // Role-specific middle sections
  if (task.role === 'money') {
    sections.push(
      {
        heading: 'What We Offer',
        purpose: 'Clearly explain the service',
        keyPoints: [
          `Describe ${task.primaryService} in detail`,
          'Include what\'s included/excluded',
          'Mention any packages or options',
          `Reference experience: ${business.yearsActive || 'extensive'} years`,
        ],
      },
      {
        heading: 'Why Choose Us',
        purpose: 'Differentiate from competitors',
        keyPoints: business.differentiators.slice(0, 4),
      },
      {
        heading: 'Our Process',
        purpose: 'Reduce uncertainty',
        keyPoints: [
          'Step 1: Initial consultation/booking',
          'Step 2: Service delivery',
          'Step 3: Follow-up/results',
        ],
      }
    );
  }

  if (task.role === 'trust') {
    sections.push(
      {
        heading: 'Our Story / Background',
        purpose: 'Build human connection',
        keyPoints: [
          business.yearsActive ? `${business.yearsActive}+ years in ${business.niche}` : 'Our journey',
          'Why we do what we do',
          'What makes us different',
        ],
      },
      {
        heading: 'Results & Proof',
        purpose: 'Demonstrate capability',
        keyPoints: [
          ...business.volumeIndicators.slice(0, 2),
          'Include specific examples',
          'Reference review themes',
        ],
      }
    );
  }

  if (task.role === 'support') {
    sections.push(
      {
        heading: 'Main Content / Answers',
        purpose: 'Provide valuable information',
        keyPoints: [
          `Address common questions about ${task.primaryService}`,
          'Be thorough but accessible',
          'Include practical tips',
        ],
      },
      {
        heading: 'How This Helps You',
        purpose: 'Connect to reader\'s goals',
        keyPoints: [
          'Link information to benefits',
          'Show understanding of their situation',
        ],
      }
    );
  }

  if (task.role === 'authority') {
    sections.push(
      {
        heading: 'Expert Insights',
        purpose: 'Demonstrate deep knowledge',
        keyPoints: [
          `Show expertise in ${business.niche}`,
          'Include industry-specific insights',
          'Reference experience and credentials',
        ],
      },
      {
        heading: 'Practical Application',
        purpose: 'Make it actionable',
        keyPoints: [
          'How to apply this information',
          'Next steps for the reader',
        ],
      }
    );
  }

  // All pages end with CTA
  sections.push({
    heading: 'Call to Action',
    purpose: task.conversionPath,
    keyPoints: [
      `Primary CTA: ${business.primaryCTA}`,
      'Remove friction from next step',
      'Reinforce value proposition',
    ],
  });

  return sections;
}

function extractRelevantObjections(
  task: GrowthTask,
  business: BusinessRealityModel
): string[] {
  const objections: string[] = [];

  // Service-specific objections
  if (task.searchIntent === 'buy') {
    objections.push(
      'Is this worth the investment?',
      'Why should I choose you over competitors?',
      'How long will this take?'
    );
  }

  if (task.searchIntent === 'compare') {
    objections.push(
      'What makes you different?',
      'Are you the right fit for my needs?'
    );
  }

  if (task.primaryLocation) {
    objections.push(
      `Do you actually serve ${task.primaryLocation}?`,
      'Are you local and accessible?'
    );
  }

  // Price positioning objections
  if (business.pricePositioning === 'premium') {
    objections.push('Why are you more expensive?');
  } else if (business.pricePositioning === 'budget') {
    objections.push('Is the quality compromised at this price?');
  }

  return objections.slice(0, 4);
}

function buildProofRequirements(
  task: GrowthTask,
  business: BusinessRealityModel
): string[] {
  const proof: string[] = [...task.proofElements];

  if (task.role === 'money' || task.role === 'trust') {
    if (business.yearsActive) {
      proof.push(`Mention ${business.yearsActive}+ years experience`);
    }
    if (business.volumeIndicators.length > 0) {
      proof.push(`Include: ${business.volumeIndicators[0]}`);
    }
    if (business.reviewThemes.length > 0) {
      proof.push(`Reference review theme: "${business.reviewThemes[0].theme}"`);
    }
  }

  if (task.primaryLocation) {
    proof.push(`Demonstrate local presence in ${task.primaryLocation}`);
  }

  return Array.from(new Set(proof)).slice(0, 5);
}

function buildImageGuidance(
  task: GrowthTask,
  business: BusinessRealityModel
): LegacyWriterBrief['imageGuidance'] {
  const count = task.role === 'money' ? 4 : task.role === 'trust' ? 3 : 2;

  const types: string[] = [];
  const mustProve: string[] = [];

  if (task.role === 'money') {
    types.push(
      `${task.primaryService} in action`,
      'Before/after or results',
      'Team at work'
    );
    mustProve.push(
      'Quality of work',
      'Professional environment',
      'Real people, not stock photos'
    );
  }

  if (task.role === 'trust') {
    types.push(
      'Team photos',
      'Client interactions',
      'Awards or certifications'
    );
    mustProve.push(
      'Human connection',
      'Credibility',
      'Experience'
    );
  }

  if (task.role === 'support') {
    types.push(
      'Illustrative diagrams',
      'Process photos',
      'Educational visuals'
    );
    mustProve.push(
      'Clarity',
      'Helpfulness'
    );
  }

  if (task.primaryLocation) {
    types.push(`Local ${task.primaryLocation} imagery`);
    mustProve.push('Local presence');
  }

  return {
    count,
    types: types.slice(0, 4),
    mustProve: mustProve.slice(0, 3),
  };
}

function buildMandatoryLinks(
  task: GrowthTask,
  business: BusinessRealityModel
): LegacyWriterBrief['mandatoryInternalLinks'] {
  const links: LegacyWriterBrief['mandatoryInternalLinks'] = [];

  // Upward links (to money pages)
  for (const upLink of task.internalLinksUp) {
    links.push({
      path: upLink,
      anchorSuggestion: upLink === '/contact' 
        ? business.primaryCTA 
        : `Learn more about ${task.primaryService}`,
      direction: 'up',
    });
  }

  // Support pages always link to contact
  if (task.role === 'support' && !task.internalLinksUp.includes('/contact')) {
    links.push({
      path: '/contact',
      anchorSuggestion: business.primaryCTA,
      direction: 'up',
    });
  }

  // Money pages should link to trust/about
  if (task.role === 'money') {
    links.push({
      path: '/about',
      anchorSuggestion: 'Learn more about our team',
      direction: 'lateral',
    });
  }

  // If supporting a specific page, always link there
  if (task.supportsPage && !links.find((l: { path: string }) => l.path === task.supportsPage)) {
    links.push({
      path: task.supportsPage,
      anchorSuggestion: `View our ${task.primaryService} services`,
      direction: 'up',
    });
  }

  return links;
}

function buildToneGuidance(business: BusinessRealityModel): string[] {
  const guidance: string[] = [];

  for (const tone of business.tone) {
    switch (tone) {
      case 'friendly':
        guidance.push('Warm and approachable language');
        break;
      case 'premium':
        guidance.push('Sophisticated, quality-focused vocabulary');
        break;
      case 'blunt':
        guidance.push('Direct and to-the-point, no fluff');
        break;
      case 'playful':
        guidance.push('Light-hearted, occasional humor');
        break;
      case 'formal':
        guidance.push('Professional, proper grammar');
        break;
      case 'confident':
        guidance.push('Assertive, expertise-driven');
        break;
      case 'human':
        guidance.push('Personal, relatable, avoid corporate speak');
        break;
      case 'clear':
        guidance.push('Simple language, avoid jargon');
        break;
    }
  }

  return guidance;
}

function buildWhatNotToDo(
  task: GrowthTask,
  business: BusinessRealityModel
): string[] {
  const avoid: string[] = [...business.doNotSay];

  // Common mistakes
  avoid.push(
    'No generic stock-photo descriptions',
    'No vague claims without proof',
    'No competitor bashing'
  );

  if (task.role === 'money') {
    avoid.push(
      'No blog-style casual language',
      'No burying the CTA'
    );
  }

  if (task.searchIntent === 'buy') {
    avoid.push('No excessive education - focus on conversion');
  }

  // Topic bleed prevention
  if (task.primaryService) {
    const otherServices = business.coreServices.filter(
      (s) => s !== task.primaryService
    );
    if (otherServices.length > 0) {
      avoid.push(
        `Avoid diluting focus by over-mentioning ${otherServices[0]}`
      );
    }
  }

  return Array.from(new Set(avoid)).slice(0, 6);
}

// ============================================================================
// SEO BUILDERS
// ============================================================================

function buildH1Intent(task: GrowthTask): string {
  if (task.action === 'fix' || task.action === 'refresh') {
    return `Improve existing H1 for clarity and keyword alignment`;
  }

  return task.title;
}

function buildSeoTitle(
  task: GrowthTask,
  business: BusinessRealityModel
): string {
  const parts: string[] = [];

  if (task.role === 'money') {
    parts.push(task.primaryService);
    if (task.primaryLocation) {
      parts.push(`in ${task.primaryLocation}`);
    }
    parts.push(`| ${business.name}`);
  } else {
    parts.push(task.title.replace(` | ${business.name}`, ''));
    parts.push(`| ${business.name}`);
  }

  const title = parts.join(' ');
  return title.length <= 60 ? title : title.slice(0, 57) + '...';
}

function buildMetaDescription(
  task: GrowthTask,
  business: BusinessRealityModel
): string {
  const parts: string[] = [];

  if (task.role === 'money') {
    parts.push(`Looking for ${task.primaryService.toLowerCase()}`);
    if (task.primaryLocation) {
      parts.push(`in ${task.primaryLocation}?`);
    } else {
      parts.push('?');
    }
    parts.push(business.differentiators[0] || `${business.name} delivers quality.`);
    parts.push(business.primaryCTA);
  } else {
    parts.push(task.title);
    parts.push('-');
    parts.push('Learn more from');
    parts.push(business.name);
  }

  const desc = parts.join(' ');
  return desc.length <= 155 ? desc : desc.slice(0, 152) + '...';
}

function buildFocusKeyword(task: GrowthTask): string {
  const keywords: string[] = [];

  keywords.push(task.primaryService.toLowerCase());

  if (task.primaryLocation) {
    keywords.push(task.primaryLocation.toLowerCase());
  }

  return keywords.join(' ');
}

function buildSecondaryKeywords(
  task: GrowthTask,
  business: BusinessRealityModel
): string[] {
  const secondary: string[] = [];

  // Related services
  for (const service of business.coreServices) {
    if (service !== task.primaryService) {
      secondary.push(service.toLowerCase());
    }
  }

  // Other locations
  for (const location of business.primaryLocations) {
    if (location !== task.primaryLocation) {
      secondary.push(`${task.primaryService.toLowerCase()} ${location.toLowerCase()}`);
    }
  }

  // Niche
  secondary.push(business.niche.toLowerCase());

  return secondary.slice(0, 5);
}

function getConversionElement(
  task: GrowthTask,
  business: BusinessRealityModel
): string {
  switch (business.primaryGoal) {
    case 'bookings':
      return 'Booking form / calendar widget';
    case 'leads':
      return 'Contact form / phone number';
    case 'ecommerce':
      return 'Add to cart / Buy now button';
    case 'local':
      return 'Call button / Direction link / GMB';
    default:
      return 'Contact form';
  }
}

// ============================================================================
// CANONICAL WRITER BRIEF BUILDER
// ============================================================================

/**
 * Generate a canonical writer brief following the production-grade schema
 * 
 * This brief is:
 * - Emitted by the planner
 * - Enriched by the audit gate  
 * - Consumed by the writer
 * - Reused for LinkedIn / GMB / Reddit
 */
export function generateEnhancedBrief(
  task: GrowthTask,
  business: BusinessRealityModel
): WriterBrief {
  const briefId = `brief-${uuid().slice(0, 8)}`;
  
  // Map task searchIntent to brief intent
  const intent = task.searchIntent;
  
  // Build focus keyphrase and synonyms
  const focusKeyphrase = buildFocusKeyword(task);
  const synonyms = buildSecondaryKeywords(task, business);
  
  // Build AEO-first outline
  const outline = buildCanonicalOutline(task, business);
  
  // Build authority angle and experience signals
  const authorityAngle = buildAuthorityAngle(task, business);
  const experienceSignals = buildExperienceSignals(business);
  
  // Build proof elements
  const proofElements = buildProofElements(task, business);
  
  // Build images (if vision context available)
  const images = buildImageSpec(task, business);
  
  // Build internal links with reasons
  const internalLinks = buildCanonicalInternalLinks(task, business);
  
  // Build CTA
  const CTA = buildCTA(task, business);
  
  // Build brand tone
  const brandTone = buildBrandTone(business);
  
  // Build formatting rules
  const formattingRules = buildFormattingRules(task);
  
  // Build syndication variants
  const syndication = buildSyndicationVariants(task, business);
  
  // Build compliance
  const compliance = buildCompliance(task);

  return {
    id: briefId,
    taskId: task.id,
    
    // Page role & intent
    role: task.role,
    intent,
    
    // Core SEO
    primaryTopic: task.primaryService,
    approvedTitle: task.title,
    slug: task.slug,
    focusKeyphrase,
    synonyms,
    metaDescription: buildMetaDescription(task, business),
    
    // Structure (AEO-first)
    outline,
    
    // Authority & credibility
    authorityAngle,
    experienceSignals,
    proofElements,
    
    // Visual intelligence
    images,
    
    // Internal linking
    internalLinks,
    
    // Conversion logic
    CTA,
    
    // Tone & voice
    brandTone,
    
    // Output controls
    wordCountTarget: task.estimatedWords,
    wordpressSafe: true,
    formattingRules,
    
    // Channel variants
    syndication,
    
    // Guardrails
    compliance,
  };
}

// ============================================================================
// CANONICAL BRIEF BUILDERS
// ============================================================================

function buildCanonicalOutline(
  task: GrowthTask,
  business: BusinessRealityModel
): WriterBrief['outline'] {
  const sections: WriterBrief['outline']['sections'] = [];
  
  // Build H1
  const h1 = buildH1Intent(task);
  
  // Build sections based on role and intent
  switch (task.role) {
    case 'money':
      sections.push(
        { h2: `What is ${task.primaryService}?`, intent: 'define' },
        { h2: `Who Needs ${task.primaryService}?`, intent: 'audience', h3s: ['Ideal Clients', 'Common Situations'] },
        { h2: `Our ${task.primaryService} Process`, intent: 'process', h3s: ['Step 1: Consultation', 'Step 2: Session', 'Step 3: Delivery'] },
        { h2: `${task.primaryService} Pricing & Packages`, intent: 'investment' },
        { h2: 'What to Expect During Your Session', intent: 'reassure' },
        { h2: `Why Choose ${business.name}?`, intent: 'differentiate' },
        { h2: task.primaryLocation ? `Book ${task.primaryService} in ${task.primaryLocation}` : 'Get Started Today', intent: 'action' }
      );
      break;
      
    case 'trust':
      sections.push(
        { h2: `About ${business.name}`, intent: 'introduce' },
        { h2: 'Our Story', intent: 'narrative' },
        { h2: 'Our Approach', intent: 'philosophy' },
        { h2: 'Experience & Credentials', intent: 'prove' },
        { h2: 'What Clients Say', intent: 'social-proof' },
        { h2: 'Get in Touch', intent: 'action' }
      );
      break;
      
    case 'support':
      sections.push(
        { h2: `What is ${task.primaryService}?`, intent: 'define' },
        { h2: 'When Do You Need It?', intent: 'timing', h3s: ['Signs to Look For', 'Right Timing'] },
        { h2: 'How to Prepare', intent: 'prepare' },
        { h2: 'What to Expect', intent: 'reassure' },
        { h2: 'Common Mistakes to Avoid', intent: 'warnings' },
        { h2: 'Frequently Asked Questions', intent: 'faq' },
        { h2: 'Ready to Get Started?', intent: 'action' }
      );
      break;
      
    case 'authority':
      sections.push(
        { h2: 'Overview', intent: 'define' },
        { h2: 'Why This Matters', intent: 'context' },
        { h2: 'Key Considerations', intent: 'educate', h3s: ['Factor 1', 'Factor 2', 'Factor 3'] },
        { h2: 'Expert Tips', intent: 'advise' },
        { h2: 'Common Questions', intent: 'faq' },
        { h2: 'Our Perspective', intent: 'opinion' },
        { h2: 'Next Steps', intent: 'action' }
      );
      break;
      
    default:
      sections.push(
        { h2: 'Introduction', intent: 'define' },
        { h2: 'Key Information', intent: 'inform' },
        { h2: 'What to Know', intent: 'educate' },
        { h2: 'Contact Us', intent: 'action' }
      );
  }
  
  return { h1, sections };
}

function buildAuthorityAngle(
  task: GrowthTask,
  business: BusinessRealityModel
): string {
  const differentiator = business.differentiators[0] || '';
  const experience = business.yearsActive ? `${business.yearsActive}+ years` : 'extensive experience';
  
  switch (task.role) {
    case 'money':
      return `With ${experience} in ${business.niche}, ${business.name} brings ${differentiator} to every ${task.primaryService} session`;
    case 'trust':
      return `The ${business.name} difference: ${differentiator}`;
    case 'support':
      return `Expert guidance backed by ${experience} of real-world ${business.niche} experience`;
    case 'authority':
      return `Industry insights from ${experience} in ${business.niche}`;
    default:
      return differentiator;
  }
}

function buildExperienceSignals(business: BusinessRealityModel): string[] {
  const signals: string[] = [];
  
  if (business.yearsActive) {
    signals.push(`${business.yearsActive}+ years of experience`);
  }
  
  if (business.volumeIndicators.length > 0) {
    signals.push(business.volumeIndicators[0]);
  }
  
  if (business.scenarioProof && business.scenarioProof.length > 0) {
    signals.push(business.scenarioProof[0].statement);
  }
  
  // Ensure at least one signal
  if (signals.length === 0) {
    signals.push(`Experienced ${business.niche} professionals`);
  }
  
  return signals.slice(0, 3);
}

function buildProofElements(
  task: GrowthTask,
  business: BusinessRealityModel
): WriterBrief['proofElements'] {
  const proofElements: WriterBrief['proofElements'] = {};
  
  // Reviews
  if (business.reviewThemes.length > 0) {
    proofElements.reviews = business.reviewThemes
      .slice(0, 3)
      .flatMap(rt => rt.snippets.slice(0, 1));
  }
  
  // Stats
  const stats: string[] = [];
  if (business.yearsActive) {
    stats.push(`${business.yearsActive}+ years in business`);
  }
  if (business.volumeIndicators.length > 0) {
    stats.push(...business.volumeIndicators.slice(0, 2));
  }
  if (stats.length > 0) {
    proofElements.stats = stats;
  }
  
  // Case studies (from proof assets)
  if (business.proofAssets.length > 0) {
    proofElements.caseStudies = business.proofAssets.slice(0, 2);
  }
  
  return proofElements;
}

function buildImageSpec(
  task: GrowthTask,
  business: BusinessRealityModel
): WriterBrief['images'] {
  // Generate image specifications based on role
  const images: WriterBrief['images'] = {};
  
  if (task.role === 'money' || task.role === 'trust') {
    images.hero = {
      imageId: '', // To be filled by vision system
      rationale: `Hero image showing ${task.primaryService} quality and professionalism`,
      suggestedAlt: `${business.name} - ${task.primaryService}${task.primaryLocation ? ` in ${task.primaryLocation}` : ''}`,
    };
  }
  
  if (task.role === 'money') {
    images.inline = [
      {
        imageId: '',
        placementHint: 'After process section',
        suggestedAlt: `${task.primaryService} process at ${business.name}`,
      },
      {
        imageId: '',
        placementHint: 'Before pricing section',
        suggestedAlt: `${task.primaryService} results example`,
      },
    ];
  }
  
  return Object.keys(images).length > 0 ? images : undefined;
}

function buildCanonicalInternalLinks(
  task: GrowthTask,
  business: BusinessRealityModel
): WriterBrief['internalLinks'] {
  const links: WriterBrief['internalLinks'] = [];
  
  // Upward links
  for (const upLink of task.internalLinksUp) {
    links.push({
      anchorText: upLink === '/contact' 
        ? business.primaryCTA 
        : `Learn more about ${task.primaryService}`,
      targetUrl: upLink,
      reason: 'Support page links up to conversion page',
    });
  }
  
  // Always link to contact for non-money pages
  if (task.role !== 'money' && !task.internalLinksUp.includes('/contact')) {
    links.push({
      anchorText: business.primaryCTA,
      targetUrl: '/contact',
      reason: 'Primary conversion path',
    });
  }
  
  // Link to about page for money pages
  if (task.role === 'money') {
    links.push({
      anchorText: `About ${business.name}`,
      targetUrl: '/about',
      reason: 'Trust building - money page links to about',
    });
  }
  
  return links;
}

function buildCTA(
  task: GrowthTask,
  business: BusinessRealityModel
): WriterBrief['CTA'] {
  let primary = business.primaryCTA;
  let secondary: string | undefined;
  let placement: 'inline' | 'end' | 'sticky' = 'end';
  
  switch (task.role) {
    case 'money':
      primary = business.primaryCTA;
      secondary = 'View our portfolio';
      placement = 'sticky';
      break;
    case 'trust':
      primary = 'Get in Touch';
      placement = 'end';
      break;
    case 'support':
      primary = 'Ready to Get Started?';
      secondary = business.primaryCTA;
      placement = 'inline';
      break;
    case 'authority':
      primary = 'Have Questions?';
      secondary = 'Book a Consultation';
      placement = 'end';
      break;
  }
  
  return { primary, secondary, placement };
}

function buildBrandTone(business: BusinessRealityModel): WriterBrief['brandTone'] {
  // Map from business tone to brief tone
  // Note: business.tone is BrandTone[] with values like 'friendly', 'premium', 'blunt', 'playful', 'formal', 'confident', 'human', 'clear'
  const personality = business.tone.includes('friendly') ? 'Warm and approachable'
    : business.tone.includes('premium') ? 'Professional and expert'
    : business.tone.includes('playful') ? 'Energetic and engaging'
    : 'Confident and helpful';
    
  const formality: 'casual' | 'professional' | 'formal' = 
    business.tone.includes('playful') ? 'casual'
    : business.tone.includes('formal') ? 'formal'
    : 'professional';
    
  const confidence: 'humble' | 'confident' | 'authoritative' =
    business.tone.includes('human') ? 'humble'
    : business.tone.includes('blunt') ? 'authoritative'
    : 'confident';
  
  return {
    personality,
    formality,
    confidence,
    localFlavour: business.localPhrasing[0] || undefined,
  };
}

function buildFormattingRules(task: GrowthTask): WriterBrief['formattingRules'] {
  return {
    maxParagraphWords: task.role === 'money' ? 50 : 75,
    useLists: true,
    avoidTables: task.role === 'trust',
  };
}

function buildSyndicationVariants(
  task: GrowthTask,
  business: BusinessRealityModel
): WriterBrief['syndication'] {
  const service = task.primaryService;
  const location = task.primaryLocation;
  
  return {
    linkedIn: {
      hook: `Here's what ${business.yearsActive || 'years of'}+ experience in ${service} taught us...`,
      post: `${service} isn't just about the final result—it's about the experience.\n\nAfter working with hundreds of clients, we've learned that what matters most is...\n\nRead more: [link]`,
      CTA: `Questions about ${service}? Drop a comment or DM.`,
    },
    gmb: {
      headline: `${service}${location ? ` in ${location}` : ''} | ${business.name}`,
      description: `Professional ${service} with ${business.yearsActive || 'years of'}+ years experience. ${business.primaryCTA}`,
      CTA: business.primaryCTA,
    },
    reddit: {
      subreddit: business.niche.toLowerCase().replace(/\s+/g, ''),
      angle: `Honest advice from someone who's been doing ${service} for ${business.yearsActive || 'years'}`,
      post: `I see a lot of questions about ${service} here, so I wanted to share some insights from my experience...\n\n[Value-first content]\n\nHappy to answer any questions!`,
    },
  };
}

function buildCompliance(task: GrowthTask): WriterBrief['compliance'] {
  const compliance: WriterBrief['compliance'] = {};
  
  // Add standard disclaimers based on role
  if (task.role === 'money') {
    compliance.restrictedClaims = [
      'Avoid absolute guarantees',
      'No "best" claims without substantiation',
    ];
  }
  
  return compliance;
}

/**
 * Generate enhanced briefs for all tasks in a month
 */
export function generateEnhancedBriefsForMonth(
  tasks: GrowthTask[],
  business: BusinessRealityModel
): WriterBrief[] {
  return tasks.map((task) => generateEnhancedBrief(task, business));
}

/**
 * Generate all briefs for a complete plan
 */
export function generateAllBriefs(
  months: import('./types').GrowthPlanMonth[],
  business: BusinessRealityModel
): WriterBrief[] {
  const briefs: WriterBrief[] = [];
  
  for (const month of months) {
    for (const task of month.tasks) {
      briefs.push(generateEnhancedBrief(task, business));
    }
  }
  
  return briefs;
}
