// ============================================================================
// GROWTH PLANNER ENGINE - CONTEXT INGESTION (Phase 0)
// ============================================================================

import { SupabaseClient } from '@supabase/supabase-js';
import {
  SiteStructureContext,
  PageContentContext,
  BusinessRealityModel,
} from './types';

/**
 * Ingest and normalize all context needed for personalized planning
 */
export async function ingestContext(
  supabase: SupabaseClient,
  projectId: string
): Promise<{
  siteStructure: SiteStructureContext;
  pageContents: PageContentContext[];
  businessReality: BusinessRealityModel;
  missingInputs: string[];
}> {
  const missingInputs: string[] = [];

  // 1. Get project data
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (!project) {
    throw new Error('Project not found');
  }

  // 2. Get user context
  const { data: userContext } = await supabase
    .from('user_context')
    .select('*')
    .eq('project_id', projectId)
    .single();

  // 3. Get all pages with their data
  const { data: pages } = await supabase
    .from('pages')
    .select(`
      *,
      audits (
        health_score,
        checks
      ),
      fix_items (
        severity,
        title
      )
    `)
    .eq('project_id', projectId)
    .order('priority_rank', { ascending: true });

  // 4. Get internal link graph
  const { data: links } = await supabase
    .from('page_links')
    .select('*')
    .eq('project_id', projectId);

  // 5. Get beads (trust atoms)
  const { data: beads } = await supabase
    .from('beads')
    .select('*')
    .eq('project_id', projectId);

  // 6. Get review themes
  const { data: reviewThemes } = await supabase
    .from('review_themes')
    .select('*')
    .eq('project_id', projectId);

  // 7. Get raw reviews for sentiment
  const { data: reviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('project_id', projectId)
    .order('rating', { ascending: false })
    .limit(50);

  // Build site structure context
  const siteStructure = buildSiteStructure(pages || [], links || [], project.root_url || '');

  // Build page content contexts
  const pageContents = buildPageContents(pages || [], links || [], userContext);

  // Build business reality model
  const businessReality = buildBusinessReality(
    project,
    userContext,
    beads || [],
    reviewThemes || [],
    reviews || [],
    pages || [],
    missingInputs
  );

  return {
    siteStructure,
    pageContents,
    businessReality,
    missingInputs,
  };
}

function buildSiteStructure(
  pages: any[],
  links: any[],
  rootUrl: string
): SiteStructureContext {
  const roleCount = {
    money: 0,
    trust: 0,
    support: 0,
    authority: 0,
  };

  let totalWordCount = 0;
  const orphanPages: { path: string; title: string }[] = [];
  const linkInCounts: Record<string, number> = {};

  // Count page roles and word counts
  for (const page of pages) {
    const role = page.role || 'support';
    if (role in roleCount) {
      roleCount[role as keyof typeof roleCount]++;
    }
    totalWordCount += page.word_count || 0;
    
    if (page.is_orphan) {
      orphanPages.push({
        path: page.path,
        title: page.title || page.path,
      });
    }
    
    linkInCounts[page.url] = 0;
  }

  // Count incoming links
  for (const link of links) {
    if (linkInCounts[link.to_url] !== undefined) {
      linkInCounts[link.to_url]++;
    }
  }

  // Get top linked pages
  const topLinked = pages
    .map((p) => ({
      path: p.path,
      title: p.title || p.path,
      linksIn: linkInCounts[p.url] || p.internal_links_in || 0,
    }))
    .sort((a, b) => b.linksIn - a.linksIn)
    .slice(0, 10);

  return {
    siteUrl: rootUrl,
    totalPages: pages.length,
    indexablePages: pages.filter((p) => p.status_code === 200).length,
    orphanPages: orphanPages.length,
    avgWordCount: pages.length > 0 ? Math.round(totalWordCount / pages.length) : 0,
    pagesByRole: roleCount,
    internalLinkDensity: pages.length > 0 ? Math.round(links.length / pages.length) : 0,
    topLinkedPages: topLinked,
    orphanedContent: orphanPages.slice(0, 10),
  };
}

/**
 * Normalize a list of items - handles case where items were stored as single comma-separated string
 * Also trims each item and removes empty strings
 */
function normalizeServiceList(items: string[]): string[] {
  if (!items || items.length === 0) return [];
  
  // If it's a single item that contains commas, split it
  if (items.length === 1 && items[0] && items[0].includes(',')) {
    return items[0]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  
  // Otherwise, just trim each item
  return items.map((s) => s?.trim()).filter(Boolean);
}

function buildPageContents(
  pages: any[],
  links: any[],
  userContext: any
): PageContentContext[] {
  const services = userContext?.offers?.coreServices || [];
  const locations = userContext?.business?.locations || [];

  return pages.map((page) => {
    const text = (page.cleaned_text || '').toLowerCase();
    const title = (page.title || '').toLowerCase();
    const h1 = (page.h1 || '').toLowerCase();

    // Detect service mentions
    const serviceMentions = services.filter(
      (s: string) =>
        text.includes(s.toLowerCase()) ||
        title.includes(s.toLowerCase()) ||
        h1.includes(s.toLowerCase())
    );

    // Detect location mentions
    const locationMentions = locations.filter(
      (l: string) =>
        text.includes(l.toLowerCase()) ||
        title.includes(l.toLowerCase()) ||
        h1.includes(l.toLowerCase())
    );

    // Check for conversion elements
    const hasConversionElements =
      text.includes('book') ||
      text.includes('contact') ||
      text.includes('call') ||
      text.includes('enquire') ||
      text.includes('quote') ||
      text.includes('price');

    // Get issues from fix_items
    const issues = (page.fix_items || []).map((f: any) => f.title);

    return {
      path: page.path,
      url: page.url,
      title: page.title,
      h1: page.h1,
      role: page.role || 'support',
      wordCount: page.word_count || 0,
      primaryTopic: extractPrimaryTopic(page.title, page.h1, serviceMentions),
      serviceMentions,
      locationMentions,
      hasConversionElements,
      internalLinksIn: page.internal_links_in || 0,
      internalLinksOut: page.internal_links_out || 0,
      healthScore: page.health_score || 0,
      issues,
    };
  });
}

function extractPrimaryTopic(
  title: string | null,
  h1: string | null,
  services: string[]
): string | null {
  // If a service is mentioned, use that as primary topic
  if (services.length > 0) {
    return services[0];
  }
  // Otherwise extract from H1 or title
  return h1 || title || null;
}

function buildBusinessReality(
  project: any,
  userContext: any,
  beads: any[],
  reviewThemes: any[],
  reviews: any[],
  pages: any[],
  missingInputs: string[]
): BusinessRealityModel {
  const business = userContext?.business || {};
  const offers = userContext?.offers || {};
  const audience = userContext?.audience || {};
  const brandVoice = userContext?.brand_voice || {};
  const compliance = userContext?.compliance || {};

  // Check for missing critical inputs
  if (!business.name) missingInputs.push('Business name');
  if (!offers.coreServices?.length) missingInputs.push('Core services');
  if (!business.locations?.length) missingInputs.push('Primary locations');
  if (!business.niche) missingInputs.push('Business niche');

  // Extract differentiators from beads
  const differentiatorBeads = beads.filter((b) => b.type === 'differentiator');
  const proofBeads = beads.filter((b) => b.type === 'proof');
  const localBeads = beads.filter((b) => b.type === 'local');

  // Build service hierarchy from page analysis
  const serviceHierarchy = buildServiceHierarchy(offers.coreServices || [], pages);

  // Extract years active from proof beads or content
  const yearsActive = extractYearsActive(proofBeads, pages);

  // Extract volume indicators
  const volumeIndicators = proofBeads
    .filter((b) => /\d+/.test(b.value))
    .map((b) => b.value);

  // Normalize services - handle case where services were stored as single comma-separated string
  const rawServices = offers.coreServices || [];
  const normalizedServices = normalizeServiceList(rawServices);
  
  // Normalize locations similarly
  const rawLocations = business.locations || [];
  const normalizedLocations = normalizeServiceList(rawLocations);

  return {
    name: business.name || project.name || 'Unknown Business',
    domain: project.root_url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || '',
    niche: business.niche || 'General',
    primaryGoal: business.primaryGoal || project.settings?.primaryGoal || 'leads',
    primaryCTA: business.primaryCTA || 'Contact Us',
    
    // Filter out empty/whitespace-only service names
    coreServices: normalizedServices.filter((s: string) => s && s.trim().length > 0),
    serviceHierarchy,
    pricePositioning: offers.pricePositioning || 'mid',
    
    // Filter out empty/whitespace-only locations
    primaryLocations: normalizedLocations.filter((l: string) => l && l.trim().length > 0),
    serviceAreaKm: business.serviceAreaKm || 50,
    localPhrasing: localBeads.map((b) => b.value),
    
    yearsActive,
    volumeIndicators,
    differentiators: [
      ...differentiatorBeads.map((b) => b.value),
      ...(offers.differentiators || []),
    ],
    guarantees: offers.guarantees || [],
    
    // Build scenario-based proof from available data
    scenarioProof: buildScenarioProof(
      proofBeads,
      offers.coreServices || [],
      volumeIndicators,
      reviewThemes,
      reviews,
      yearsActive
    ),
    
    tone: brandVoice.tone || ['friendly'],
    doNotSay: compliance.doNotSay || [],
    
    reviewThemes: reviewThemes.map((rt) => ({
      theme: rt.theme,
      count: rt.count,
      snippets: rt.supporting_snippets || [],
    })),
    proofAssets: proofBeads.map((b) => b.label),
  };
}

/**
 * Build scenario-based proof from available context
 * Proof = what experience ENABLES or PREVENTS
 */
function buildScenarioProof(
  proofBeads: any[],
  services: string[],
  volumeIndicators: string[],
  reviewThemes: any[],
  reviews: any[],
  yearsActive: number | null
): Array<{ type: 'outcome' | 'volume' | 'complexity' | 'speed' | 'prevention'; service: string; statement: string }> {
  const scenarioProof: Array<{ type: 'outcome' | 'volume' | 'complexity' | 'speed' | 'prevention'; service: string; statement: string }> = [];

  const primaryService = services[0] || 'services';

  // Extract volume-based proof (e.g., "500+ sessions", "100+ cases")
  for (const indicator of volumeIndicators) {
    const match = indicator.match(/(\d+)\+?\s*(.+)/i);
    if (match) {
      scenarioProof.push({
        type: 'volume',
        service: primaryService,
        statement: indicator,
      });
    }
  }

  // Extract outcome-based proof from reviews
  for (const review of reviews.slice(0, 5)) {
    const text = review.text || review.snippet || '';
    // Look for outcome language
    if (/helped|solved|resolved|saved|achieved|successful|excellent|perfect/i.test(text)) {
      const snippet = text.slice(0, 100) + (text.length > 100 ? '...' : '');
      scenarioProof.push({
        type: 'outcome',
        service: primaryService,
        statement: `Client testimonial: "${snippet}"`,
      });
      break; // One is enough
    }
  }

  // Extract complexity proof from proof beads
  for (const bead of proofBeads) {
    const value = bead.value || '';
    // Look for complexity indicators
    if (/international|cross-border|complex|regulatory|multi|specialist/i.test(value)) {
      scenarioProof.push({
        type: 'complexity',
        service: primaryService,
        statement: value,
      });
    }
  }

  // If we have years but no other proof, create a capability statement
  if (scenarioProof.length === 0 && yearsActive && yearsActive > 5) {
    scenarioProof.push({
      type: 'complexity',
      service: primaryService,
      statement: `${yearsActive} years navigating ${primaryService} challenges`,
    });
  }

  return scenarioProof.slice(0, 5); // Max 5 proof points
}

function buildServiceHierarchy(
  services: string[],
  pages: any[]
): Array<{ service: string; isPrimary: boolean; relatedServices: string[] }> {
  if (services.length === 0) return [];

  // Count how many pages mention each service
  const serviceMentionCounts: Record<string, number> = {};
  
  for (const service of services) {
    serviceMentionCounts[service] = 0;
    const serviceLower = service.toLowerCase();
    
    for (const page of pages) {
      const text = (
        (page.title || '') +
        (page.h1 || '') +
        (page.cleaned_text || '')
      ).toLowerCase();
      
      if (text.includes(serviceLower)) {
        serviceMentionCounts[service]++;
      }
    }
  }

  // Sort by mention count to determine primary
  const sorted = [...services].sort(
    (a, b) => (serviceMentionCounts[b] || 0) - (serviceMentionCounts[a] || 0)
  );

  return sorted.map((service, index) => ({
    service,
    isPrimary: index === 0,
    relatedServices: sorted.filter((s) => s !== service).slice(0, 2),
  }));
}

function extractYearsActive(
  proofBeads: any[],
  pages: any[]
): number | null {
  // Look for "X years" patterns in beads
  for (const bead of proofBeads) {
    const match = bead.value.match(/(\d+)\s*(?:years?|jahre?)/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // Look in page content
  for (const page of pages) {
    const text = page.cleaned_text || '';
    const match = text.match(/(?:since|seit|over|über)\s*(\d{4})|(\d+)\s*(?:years?|jahre?)\s*(?:experience|erfahrung)/i);
    if (match) {
      if (match[1]) {
        return new Date().getFullYear() - parseInt(match[1], 10);
      }
      if (match[2]) {
        return parseInt(match[2], 10);
      }
    }
  }

  return null;
}
