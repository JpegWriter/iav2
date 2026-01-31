// ============================================================================
// BUILD MASTER PROFILE
// ============================================================================
// Aggregates all stable project context into a single, versioned document.
// This is "what's true about this business" - rarely changes.
//
// ENHANCED: Now includes page consumption, service inference, proof verification,
// role reclassification, and writer snapshot generation.
//
// HARDENED: Added TruthLayer, ProfileLocks, niche-locked service inference,
// and stricter review claim gating.
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import type {
  MasterProfile,
  ProofAtom,
  ReviewTheme,
  ReviewSnippet,
  PageSummary,
  MasterProfileRow,
  PageEssence,
  SiteContentDigest,
  WriterSnapshot,
  ProfileConfidence,
  ProfileCompleteness,
  TruthLayer,
  ProfileLocks,
} from './types';
import { extractSignalsFromText } from './pageExtractor';
import { summarisePage, selectKeyPages, enforceOneLinerQuality, type PageData } from './pageSummariser';
import { buildReclassifiedSiteMap, type PageForClassification } from './roleReclassifier';
import { verifyProofAtoms, type VerificationContext } from './proofVerifier';
import {
  inferServicesFromEssences,
  buildSiteContentDigest,
  buildWriterSnapshot,
  buildProfileConfidence,
  buildProfileCompleteness,
  inferServicesFromTypologyUrls,
  NICHE_DEFINITIONS,
} from './serviceInference';

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function buildMasterProfile(projectId: string): Promise<MasterProfile> {
  const supabase = await createServerSupabaseClient();

  // Fetch all data in parallel
  const [
    projectResult,
    userContextResult,
    beadsResult,
    reviewsResult,
    reviewThemesResult,
    pagesResult,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single(),

    supabase
      .from('user_context')
      .select('*')
      .eq('project_id', projectId)
      .single(),

    supabase
      .from('beads')
      .select('*')
      .eq('project_id', projectId)
      .order('priority', { ascending: false }),

    supabase
      .from('reviews')
      .select('*')
      .eq('project_id', projectId)
      .order('rating', { ascending: false }),

    supabase
      .from('review_themes')
      .select('*')
      .eq('project_id', projectId)
      .order('count', { ascending: false }),

    supabase
      .from('pages')
      .select('*')
      .eq('project_id', projectId)
      .order('priority_score', { ascending: false }),
  ]);

  const project = projectResult.data;
  const userContext = userContextResult.data;
  const beads = beadsResult.data || [];
  const reviews = reviewsResult.data || [];
  const reviewThemes = reviewThemesResult.data || [];
  const pages = pagesResult.data || [];

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // ========================================================================
  // STEP 1: Reclassify page roles
  // ========================================================================
  const pagesForClassification: PageForClassification[] = pages.map((p: any) => ({
    url: p.url,
    title: p.title,
    h1: p.h1,
    cleaned_text: p.cleaned_text,
    role: p.role,
    priority_score: p.priority_score || 0,
    internal_links_in: p.internal_links_in || 0,
    internal_links_out: p.internal_links_out || 0,
  }));

  const reclassifiedSiteMap = buildReclassifiedSiteMap(pagesForClassification);

  // ========================================================================
  // STEP 2: Select and summarise key pages
  // ========================================================================
  const pageDataList: PageData[] = pages.map((p: any) => ({
    url: p.url,
    title: p.title,
    cleaned_text: p.cleaned_text,
    role: p.role,
  }));

  const keyPages = selectKeyPages(pageDataList, project.root_url);

  // Build page essences
  const pageEssences: {
    home?: PageEssence;
    about?: PageEssence;
    services?: PageEssence;
    contact?: PageEssence;
    moneyPages?: PageEssence[];
    sourceCoverage: { pagesSummarised: number; pagesAttempted: number; missing: string[] };
  } = {
    sourceCoverage: {
      pagesSummarised: 0,
      pagesAttempted: 0,
      missing: keyPages.missing,
    },
  };

  if (keyPages.home) {
    pageEssences.home = summarisePage(keyPages.home.url, keyPages.home.title, keyPages.home.cleaned_text, 'money');
    pageEssences.sourceCoverage.pagesSummarised++;
  }
  pageEssences.sourceCoverage.pagesAttempted++;

  if (keyPages.about) {
    pageEssences.about = summarisePage(keyPages.about.url, keyPages.about.title, keyPages.about.cleaned_text, 'trust');
    pageEssences.sourceCoverage.pagesSummarised++;
  }
  pageEssences.sourceCoverage.pagesAttempted++;

  if (keyPages.services) {
    pageEssences.services = summarisePage(keyPages.services.url, keyPages.services.title, keyPages.services.cleaned_text, 'money');
    pageEssences.sourceCoverage.pagesSummarised++;
  }
  pageEssences.sourceCoverage.pagesAttempted++;

  if (keyPages.contact) {
    pageEssences.contact = summarisePage(keyPages.contact.url, keyPages.contact.title, keyPages.contact.cleaned_text, 'trust');
    pageEssences.sourceCoverage.pagesSummarised++;
  }
  pageEssences.sourceCoverage.pagesAttempted++;

  if (keyPages.moneyPages.length > 0) {
    pageEssences.moneyPages = keyPages.moneyPages.map((p) =>
      summarisePage(p.url, p.title, p.cleaned_text, 'money')
    );
    pageEssences.sourceCoverage.pagesSummarised += keyPages.moneyPages.length;
  }
  pageEssences.sourceCoverage.pagesAttempted += keyPages.moneyPages.length;

  // ========================================================================
  // STEP 3: Build site content digest from essences
  // ========================================================================
  let allEssences = [
    pageEssences.home,
    pageEssences.about,
    pageEssences.services,
    pageEssences.contact,
    ...(pageEssences.moneyPages || []),
  ].filter((e): e is PageEssence => !!e);

  const businessName = userContext?.business?.name || project.name;
  const niche = userContext?.business?.niche || '';
  
  // Determine if we should lock the niche (if explicitly set by user)
  const nicheLocked = !!niche && niche.length > 0;
  const lockedNiche = nicheLocked ? niche : undefined;
  
  // Get all page URLs for typology service inference
  const allPageUrls = pages.map((p: any) => p.url);
  
  // First pass: get inferred services for oneLiner fallback (with niche lock)
  const initialServiceInference = inferServicesFromEssences(allEssences, businessName, allPageUrls, lockedNiche);
  const primaryLocation = allEssences.find(e => e.locationsMentioned.length > 0)?.locationsMentioned[0] || '';
  const topServices = initialServiceInference.allServices.slice(0, 3);

  // ========================================================================
  // STEP 3.5: Enforce oneLiner quality with fallbacks
  // ========================================================================
  allEssences = allEssences.map(essence =>
    enforceOneLinerQuality(essence, businessName, niche, primaryLocation, topServices)
  );
  
  // Also update the pageEssences object with fixed oneLiners
  if (pageEssences.home) {
    pageEssences.home = enforceOneLinerQuality(pageEssences.home, businessName, niche, primaryLocation, topServices);
  }
  if (pageEssences.about) {
    pageEssences.about = enforceOneLinerQuality(pageEssences.about, businessName, niche, primaryLocation, topServices);
  }
  if (pageEssences.services) {
    pageEssences.services = enforceOneLinerQuality(pageEssences.services, businessName, niche, primaryLocation, topServices);
  }
  if (pageEssences.contact) {
    pageEssences.contact = enforceOneLinerQuality(pageEssences.contact, businessName, niche, primaryLocation, topServices);
  }
  if (pageEssences.moneyPages) {
    pageEssences.moneyPages = pageEssences.moneyPages.map(e =>
      enforceOneLinerQuality(e, businessName, niche, primaryLocation, topServices)
    );
  }

  // Pass lockedNiche to filter cross-niche pollution
  const siteContentDigest = buildSiteContentDigest(allEssences, businessName, allPageUrls, lockedNiche);

  // ========================================================================
  // STEP 4: Build business section with inferred services (with quarantine handling)
  // ========================================================================
  const businessSection = buildBusinessSection(project, userContext);

  // Get the full service inference result for quarantine check
  const fullServiceInference = inferServicesFromEssences(allEssences, businessName, allPageUrls, lockedNiche);
  
  // Only patch with inferred services if NOT quarantined
  if (!fullServiceInference.quarantined) {
    if (!businessSection.primaryService && fullServiceInference.primaryService) {
      businessSection.primaryService = fullServiceInference.primaryService;
    }
    if (businessSection.allServices.length === 0 && fullServiceInference.allServices.length > 0) {
      businessSection.allServices = fullServiceInference.allServices;
    }
  }

  // ========================================================================
  // STEP 5: Build proof atoms with verification
  // ========================================================================
  const rawProofAtoms = buildProofAtoms(beads);

  // Concatenate all page text for verification
  const allPageText = pages.map((p: any) => p.cleaned_text || '').join(' ');

  // Check if GBP is connected (from localSignals or user context)
  const gbpConnected = userContext?.local_signals?.gbpConnected || false;
  const googleMapsUrl = userContext?.local_signals?.googleMapsUrl;
  const reviewsScraped = reviews.length > 0 && reviews.some((r: any) => r.source === 'google_maps' || r.source === 'gbp');

  const verificationContext: VerificationContext = {
    allPageText,
    reviewCount: reviews.length,
    averageRating: reviews.length > 0
      ? reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length
      : 0,
    gbpConnected,
    reviewsScraped,
    googleMapsUrl,
  };

  const verifiedProofAtoms = verifyProofAtoms(rawProofAtoms, verificationContext);

  // ========================================================================
  // STEP 6: Build brand voice with claims governance
  // ========================================================================
  const brandVoice = buildBrandVoiceSection(userContext);

  // GOVERNANCE: Only include verified + specific claims in mustSay
  const governedMustSay = governClaimsForMustSay(
    siteContentDigest.safeClaimsFound,
    verifiedProofAtoms,
    beads
  );
  
  if (brandVoice.mustSay.length === 0 && governedMustSay.length > 0) {
    brandVoice.mustSay = governedMustSay;
  }
  
  // HARDENED: Auto-populate mustNotSay with all risky claims found
  const allRiskyClaims = new Set<string>(brandVoice.mustNotSay);
  siteContentDigest.riskyClaimsFound.forEach(claim => allRiskyClaims.add(claim));
  brandVoice.mustNotSay = Array.from(allRiskyClaims);
  
  if (brandVoice.mustNotSay.length === 0 && siteContentDigest.riskyClaimsFound.length > 0) {
    brandVoice.mustNotSay = siteContentDigest.riskyClaimsFound.slice(0, 3);
  }

  // ========================================================================
  // STEP 7: Build local signals with inferred service areas
  // ========================================================================
  const localSignals = buildLocalSignals(userContext);

  // Patch with inferred locations
  if (localSignals && localSignals.serviceAreas.length === 0) {
    const inferredLocations = new Set<string>();
    allEssences.forEach((e) => {
      e.locationsMentioned.forEach((loc) => inferredLocations.add(loc));
    });
    localSignals.serviceAreas = Array.from(inferredLocations).slice(0, 10);
  }

  // ========================================================================
  // STEP 8: Build writer snapshot
  // ========================================================================
  const writerSnapshot = buildWriterSnapshot(
    allEssences,
    siteContentDigest,
    verifiedProofAtoms,
    businessSection.locations
  );

  // ========================================================================
  // STEP 9: Build confidence and completeness (with quarantine awareness)
  // ========================================================================
  const confidence = buildProfileConfidence(
    fullServiceInference.confidence,
    reclassifiedSiteMap.moneyPages.length,
    reviews.length,
    reclassifiedSiteMap.internalLinkingHealth
  );

  // Build completeness with quarantine-aware blockers
  const completeness = buildProfileCompleteness(
    businessSection.primaryService,
    businessSection.allServices,
    reclassifiedSiteMap.moneyPages.length,
    writerSnapshot.linkTargets.contactUrl
  );
  
  // Add quarantine-specific blockers if services are quarantined
  if (fullServiceInference.quarantined) {
    completeness.actionRequired.push('CONFIRM_SERVICES');
    if (fullServiceInference.quarantineReason) {
      completeness.blockers.push(fullServiceInference.quarantineReason);
    }
  }
  
  // Add GBP connection blocker if reviews are claimed but not verified
  const hasUnverifiedReviewClaims = verifiedProofAtoms.some(
    a => a.verification === 'unverified' && /\d+\s*(five\s*star|5\s*star|star|review)/i.test(a.value)
  );
  if (hasUnverifiedReviewClaims && !gbpConnected) {
    completeness.actionRequired.push('CONNECT_GBP');
  }
  
  // Add phone confirmation if no phones found
  const hasPhoneNumbers = allEssences.some(e => e.extractedSignals.phoneNumbers.length > 0);
  if (!hasPhoneNumbers) {
    completeness.actionRequired.push('CONFIRM_PHONE');
  }

  // ========================================================================
  // STEP 10: Build Truth Layer (single source of verified facts)
  // ========================================================================
  const truthLayer: TruthLayer = buildTruthLayer(
    verifiedProofAtoms,
    businessName,
    nicheLocked,
    lockedNiche,
    fullServiceInference.quarantined,
    hasPhoneNumbers,
    gbpConnected
  );

  // ========================================================================
  // STEP 11: Build Profile Locks (prevent inference drift)
  // ========================================================================
  const locks: ProfileLocks = {
    nicheLocked,
    lockedNiche,
    serviceInferenceMode: 'conservative',
    servicesConfirmed: !fullServiceInference.quarantined && fullServiceInference.confidence !== 'low',
  };

  // ========================================================================
  // STEP 12: Assemble final profile
  // ========================================================================
  const profile: Omit<MasterProfile, 'id' | 'projectId' | 'version' | 'profileHash' | 'generatedAt'> = {
    business: businessSection,
    audience: buildAudienceSection(userContext),
    brandVoice,
    proofAtoms: verifiedProofAtoms,
    reviews: buildReviewsSection(reviews, reviewThemes),
    siteMap: {
      totalPages: reclassifiedSiteMap.totalPages,
      moneyPages: reclassifiedSiteMap.moneyPages,
      trustPages: reclassifiedSiteMap.trustPages,
      supportPages: reclassifiedSiteMap.supportPages,
      authorityPages: reclassifiedSiteMap.authorityPages,
      portfolioPages: reclassifiedSiteMap.portfolioPages,
      orphanedPages: reclassifiedSiteMap.orphanedPages,
      internalLinkingHealth: reclassifiedSiteMap.internalLinkingHealth,
    },
    localSignals,
    pageEssence: pageEssences,
    siteContentDigest,
    writerSnapshot,
    confidence,
    completeness,
    truthLayer,
    locks,
  };

  // Compute hash for deduplication
  const profileHash = computeProfileHash(profile);

  // Check if this exact profile already exists
  const existingProfile = await findExistingProfile(supabase, projectId, profileHash);
  
  if (existingProfile) {
    return existingProfile.profile_json;
  }

  // Get next version number
  const nextVersion = await getNextVersion(supabase, projectId);

  // Create the full profile with metadata
  const fullProfile: MasterProfile = {
    id: crypto.randomUUID(),
    projectId,
    version: nextVersion,
    profileHash,
    generatedAt: new Date().toISOString(),
    ...profile,
  };

  // Insert new version
  const { error: insertError } = await supabase
    .from('project_master_profiles')
    .insert({
      id: fullProfile.id,
      project_id: projectId,
      version: nextVersion,
      profile_hash: profileHash,
      profile_json: fullProfile,
      generated_at: fullProfile.generatedAt,
    });

  if (insertError) {
    // If duplicate hash error, fetch existing
    if (insertError.code === '23505') {
      const existing = await findExistingProfile(supabase, projectId, profileHash);
      if (existing) {
        return existing.profile_json;
      }
    }
    throw new Error(`Failed to insert master profile: ${insertError.message}`);
  }

  return fullProfile;
}

// ============================================================================
// TRUTH LAYER BUILDER
// ============================================================================

function buildTruthLayer(
  proofAtoms: ProofAtom[],
  businessName: string,
  nicheLocked: boolean,
  lockedNiche: string | undefined,
  servicesQuarantined: boolean,
  hasPhoneNumbers: boolean,
  gbpConnected: boolean
): TruthLayer {
  // Verified claims that can be used freely
  const verifiedClaims = proofAtoms
    .filter(a => a.verification === 'verified')
    .map(a => a.value);

  // Restricted claims that should not be used
  const restrictedClaims = proofAtoms
    .filter(a => a.verification === 'unverified')
    .map(a => a.value);

  // Items that need confirmation
  const unknownsToConfirm: string[] = [];
  
  if (servicesQuarantined) {
    unknownsToConfirm.push('services');
  }
  if (!hasPhoneNumbers) {
    unknownsToConfirm.push('phone number');
  }
  if (!gbpConnected) {
    unknownsToConfirm.push('GBP connection');
  }

  return {
    verifiedClaims,
    restrictedClaims,
    unknownsToConfirm,
    primaryEntity: businessName,
    nicheLocked,
    lockedNiche,
  };
}

// ============================================================================
// SECTION BUILDERS
// ============================================================================

function buildBusinessSection(project: any, userContext: any): MasterProfile['business'] {
  const business = userContext?.business || {};
  
  return {
    name: business.name || project.name || 'Unknown Business',
    niche: business.niche || '',
    yearsInBusiness: business.yearsInBusiness,
    locations: business.locations || [],
    primaryService: business.primaryService || '',
    allServices: business.allServices || [],
    usps: business.usps || [],
    websiteUrl: project.root_url || '',
  };
}

function buildAudienceSection(userContext: any): MasterProfile['audience'] {
  const audience = userContext?.audience || {};
  
  return {
    primary: audience.primaryAudience || '',
    secondary: audience.secondaryAudiences || [],
    painPoints: audience.painPoints || [],
    objections: audience.objections || [],
    buyingTriggers: audience.buyingTriggers || [],
    languagePreferences: audience.languagePreferences || [],
  };
}

function buildBrandVoiceSection(userContext: any): MasterProfile['brandVoice'] {
  const brandVoice = userContext?.brand_voice || {};
  const compliance = userContext?.compliance || {};
  
  return {
    toneProfileId: brandVoice.toneProfileId || 'friendly-expert',
    toneOverrides: brandVoice.overrides || undefined,
    tabooWords: brandVoice.tabooWords || compliance.tabooWords || [],
    complianceNotes: compliance.notes || [],
    mustSay: compliance.mustSay || [],
    mustNotSay: compliance.mustNotSay || compliance.doNotSay || [],
  };
}

function buildProofAtoms(beads: any[]): ProofAtom[] {
  return beads.map((bead) => ({
    id: bead.id,
    type: bead.type,
    label: bead.label,
    value: bead.value,
    priority: bead.priority || 50,
    channels: bead.channels || ['wp'],
    claimsPolicy: bead.claims_policy || {
      mustBeVerifiable: true,
      allowedParaphrases: [],
      forbiddenPhrases: [],
    },
  }));
}

function buildReviewsSection(reviews: any[], themes: any[]): MasterProfile['reviews'] {
  const totalCount = reviews.length;
  const averageRating = totalCount > 0
    ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / totalCount
    : 0;

  // Build themes
  const themesList: ReviewTheme[] = themes.map((t) => ({
    theme: t.theme,
    count: t.count || 1,
    sentiment: t.sentiment || 'positive',
    recommendedUses: t.recommended_uses || [],
  }));

  // Extract top snippets (only with consent)
  const topSnippets: ReviewSnippet[] = reviews
    .filter((r) => r.consent?.allowedToRepublish !== false)
    .slice(0, 10)
    .map((r) => ({
      text: r.text || '',
      author: r.author,
      rating: r.rating || 5,
      source: r.source || 'manual',
      hasConsent: r.consent?.allowedToRepublish === true,
    }));

  return {
    totalCount,
    averageRating: Math.round(averageRating * 10) / 10,
    themes: themesList,
    topSnippets,
    lastUpdated: reviews[0]?.created_at,
  };
}

function buildSiteMapSection(pages: any[]): MasterProfile['siteMap'] {
  const moneyPages = pages.filter((p) => p.role === 'money');
  const trustPages = pages.filter((p) => p.role === 'trust');
  const supportPages = pages.filter((p) => p.role === 'support');
  const authorityPages = pages.filter((p) => p.role === 'authority');
  const portfolioPages = pages.filter((p) => p.role === 'portfolio');
  const orphanedPages = pages.filter((p) => p.is_orphan).length;

  const mapPage = (p: any): PageSummary => ({
    url: p.url,
    title: p.title || '',
    role: p.role || 'support',
    priorityScore: p.priority_score || 0,
    priorityRank: p.priority_rank || 999,
    internalLinksIn: p.internal_links_in || 0,
    internalLinksOut: p.internal_links_out || 0,
  });

  // Calculate internal linking health
  const avgLinksIn = pages.length > 0
    ? pages.reduce((sum, p) => sum + (p.internal_links_in || 0), 0) / pages.length
    : 0;
  
  let internalLinkingHealth: MasterProfile['siteMap']['internalLinkingHealth'] = 'poor';
  if (avgLinksIn >= 5 && orphanedPages === 0) {
    internalLinkingHealth = 'excellent';
  } else if (avgLinksIn >= 3 && orphanedPages <= 2) {
    internalLinkingHealth = 'good';
  } else if (avgLinksIn >= 1) {
    internalLinkingHealth = 'fair';
  }

  return {
    totalPages: pages.length,
    moneyPages: moneyPages.slice(0, 10).map(mapPage),
    trustPages: trustPages.slice(0, 5).map(mapPage),
    supportPages: supportPages.slice(0, 15).map(mapPage),
    authorityPages: authorityPages.slice(0, 5).map(mapPage),
    portfolioPages: portfolioPages.slice(0, 10).map(mapPage),
    orphanedPages,
    internalLinkingHealth,
  };
}

function buildLocalSignals(userContext: any): MasterProfile['localSignals'] | undefined {
  const business = userContext?.business || {};
  
  if (!business.locations?.length) {
    return undefined;
  }

  return {
    gbpConnected: false, // TODO: Check GBP connection status
    napConsistent: true, // TODO: Check NAP consistency
    serviceAreas: business.locations || [],
    businessHours: business.hours,
    primaryPhone: business.phone,
    primaryAddress: business.address,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function computeProfileHash(profile: any): string {
  // Stable stringify (sorted keys)
  const stableJson = JSON.stringify(profile, Object.keys(profile).sort());
  return crypto.createHash('sha256').update(stableJson).digest('hex').slice(0, 32);
}

async function findExistingProfile(
  supabase: any,
  projectId: string,
  profileHash: string
): Promise<MasterProfileRow | null> {
  const { data } = await supabase
    .from('project_master_profiles')
    .select('*')
    .eq('project_id', projectId)
    .eq('profile_hash', profileHash)
    .single();
  
  return data;
}

async function getNextVersion(supabase: any, projectId: string): Promise<number> {
  const { data } = await supabase
    .from('project_master_profiles')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  
  return (data?.version || 0) + 1;
}

// ============================================================================
// GET LATEST MASTER PROFILE
// ============================================================================

export async function getLatestMasterProfile(projectId: string): Promise<MasterProfile | null> {
  const supabase = await createServerSupabaseClient();
  
  const { data } = await supabase
    .from('project_master_profiles')
    .select('*')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  
  return data?.profile_json || null;
}

// ============================================================================
// GET MASTER PROFILE BY VERSION
// ============================================================================

export async function getMasterProfileByVersion(
  projectId: string,
  version: number
): Promise<MasterProfile | null> {
  const supabase = await createServerSupabaseClient();
  
  const { data } = await supabase
    .from('project_master_profiles')
    .select('*')
    .eq('project_id', projectId)
    .eq('version', version)
    .single();
  
  return data?.profile_json || null;
}

// ============================================================================
// CLAIMS GOVERNANCE
// ============================================================================
// Only allow verified + specific claims in mustSay.
// Generic superlatives like "award-winning" need proof anchors.

// Unverifiable superlative patterns
const UNVERIFIABLE_SUPERLATIVES = [
  /\baward[- ]?winning\b/i,
  /\bbest\s+in\b/i,
  /\bnumber\s*1\b/i,
  /\b#1\b/,
  /\bleading\b/i,
  /\btop[- ]?rated\b/i,
  /\bworld[- ]?class\b/i,
  /\bpremier\b/i,
];

// Specific award name patterns that make superlatives verifiable
const AWARD_PROOF_PATTERNS = [
  /\bWAF\b/i,                        // World Architecture Festival
  /\bRIBA\b/i,                       // Royal Institute of British Architects
  /\bAIA\b/i,                        // American Institute of Architects
  /\barchitizer\b/i,
  /\bdesign\s*award\b/i,
  /\binternational\s+architecture\s+award/i,
  /\bred\s*dot\b/i,
  /\bIF\s*award\b/i,
  /\bgood\s*design\s*award\b/i,
  /\d{4}\s+award/i,                  // e.g., "2023 Award"
  /award\s+for\s+\w+/i,              // e.g., "Award for Excellence"
];

/**
 * Governs what claims can go in mustSay.
 * Rules:
 * 1. Only include claims that are verified AND specific
 * 2. Don't include generic "award-winning" unless paired with named award
 * 3. Safe alternative phrasings for unverified superlatives
 */
function governClaimsForMustSay(
  safeClaims: string[],
  verifiedProofAtoms: ProofAtom[],
  beads: any[]
): string[] {
  const governedClaims: string[] = [];
  const verifiedLabels = new Set(
    verifiedProofAtoms
      .filter(a => a.verification === 'verified')
      .map(a => a.label?.toLowerCase() || a.value.toLowerCase())
  );

  // Check for named awards in beads/proofs
  const hasNamedAward = beads.some(bead => {
    const beadText = `${bead.label || ''} ${bead.value || ''}`.toLowerCase();
    return AWARD_PROOF_PATTERNS.some(pattern => pattern.test(beadText));
  }) || verifiedProofAtoms.some(atom => {
    const atomText = `${atom.label || ''} ${atom.value || ''}`;
    return AWARD_PROOF_PATTERNS.some(pattern => pattern.test(atomText));
  });

  for (const claim of safeClaims) {
    const claimLower = claim.toLowerCase();
    
    // Check if it's an unverifiable superlative
    const isSuperlative = UNVERIFIABLE_SUPERLATIVES.some(p => p.test(claim));
    
    if (isSuperlative) {
      // Only allow if we have named award proof
      if (hasNamedAward) {
        // Prefer the safer phrasing
        if (/award[- ]?winning/i.test(claim)) {
          governedClaims.push('recognised through international awards');
        } else {
          governedClaims.push(claim);
        }
      }
      // Otherwise skip this claim entirely
      continue;
    }

    // Check if verified in proof atoms
    if (verifiedLabels.has(claimLower)) {
      governedClaims.push(claim);
      continue;
    }

    // Allow specific, non-superlative claims
    if (!isSuperlative && claim.length > 5) {
      governedClaims.push(claim);
    }
  }

  // Add safe alternatives for award claims if we have proof
  if (hasNamedAward && !governedClaims.some(c => /award|recogni/i.test(c))) {
    governedClaims.push('internationally recognised');
  }

  return governedClaims.slice(0, 5);
}
