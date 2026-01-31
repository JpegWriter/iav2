// ============================================================================
// SERVICE INFERENCE
// ============================================================================
// Infers primaryService and allServices from page content.
// Also builds the siteContentDigest from aggregated page essences.
//
// HARDENED: Multi-confirm rule + niche lock + conservative quarantine mode.
// ============================================================================

import type {
  PageEssence,
  SiteContentDigest,
  WriterSnapshot,
  ProfileConfidence,
  ProfileCompleteness,
  ServiceInferenceResult,
} from './types';

// ============================================================================
// NICHE DEFINITIONS (for niche lock enforcement)
// ============================================================================

export const NICHE_DEFINITIONS: Record<string, {
  keywords: string[];
  excludeServices: string[];
}> = {
  'estate agent': {
    keywords: ['property', 'valuation', 'estate', 'lettings', 'sales', 'properties', 'rent', 'buy', 'sell', 'landlord', 'tenant'],
    excludeServices: ['plumbing', 'electrical', 'hvac', 'heating', 'air conditioning', 'drain', 'pipe', 'wiring', 'geyser'],
  },
  'architect': {
    keywords: ['architecture', 'design', 'building', 'planning', 'restoration', 'renovation', 'residential', 'commercial'],
    excludeServices: ['plumbing', 'electrical', 'hvac', 'drain cleaning', 'pipe repair'],
  },
  'plumber': {
    keywords: ['plumbing', 'drain', 'pipe', 'toilet', 'bathroom', 'leak', 'water heater', 'geyser'],
    excludeServices: ['estate agent', 'property valuation', 'architecture'],
  },
  'electrician': {
    keywords: ['electrical', 'wiring', 'socket', 'lighting', 'fuse', 'circuit'],
    excludeServices: ['estate agent', 'property valuation', 'architecture'],
  },
  'hvac': {
    keywords: ['hvac', 'heating', 'air conditioning', 'ventilation', 'cooling'],
    excludeServices: ['estate agent', 'property valuation', 'architecture'],
  },
};

// ============================================================================
// SERVICE PRIORITY (for tie-breaking)
// ============================================================================

const SERVICE_PRIORITY: Record<string, number> = {
  'plumbing': 100,
  'electrical': 95,
  'hvac': 90,
  'air conditioning': 85,
  'heating': 80,
  'drain cleaning': 75,
  'blocked drain': 70,
  'emergency plumbing': 65,
  'emergency electrical': 60,
  'bathroom fitting': 55,
  'kitchen plumbing': 50,
  'leak detection': 45,
  'pipe repair': 40,
  'toilet repair': 35,
  'geyser': 30,
  'water heater': 25,
  'wiring': 20,
  'lighting': 15,
  'maintenance': 10,
  'repair': 5,
};

// ============================================================================
// SERVICE SOURCE TYPES (for multi-confirm validation)
// ============================================================================

export type ServiceSource = 
  | 'nav_item'           // From navigation menu
  | 'h1_heading'         // From H1 on a page
  | 'h2_heading'         // From H2 on a page
  | 'service_url'        // From URL pattern (/services/, /typology/)
  | 'service_page'       // From dedicated service page
  | 'page_content'       // From general page content
  | 'business_name';     // From business name

interface ServiceEvidence {
  service: string;
  sources: Set<ServiceSource>;
  pageUrls: Set<string>;
  confidence: number;
}

// ============================================================================
// TYPOLOGY URL PARSING
// ============================================================================

/**
 * Extracts services from typology/category URLs
 * e.g., /typology/restoration-and-renovation => "Restoration & renovation"
 */
export function inferServicesFromTypologyUrls(urls: string[]): string[] {
  const services: string[] = [];
  
  for (const url of urls) {
    const typologyMatch = url.match(/\/(typology|category|service|services|work)\/([^/?#]+)/i);
    if (typologyMatch) {
      const slug = typologyMatch[2];
      const humanLabel = slugToHumanLabel(slug);
      if (humanLabel && !services.includes(humanLabel)) {
        services.push(humanLabel);
      }
    }
  }
  
  return services;
}

/**
 * Converts URL slug to human-readable label
 * e.g., "restoration-and-renovation" => "Restoration & renovation"
 *       "property-valuation-and-advisory-services" => "Property valuation & advisory services"
 */
function slugToHumanLabel(slug: string): string {
  if (!slug) return '';
  
  return slug
    .split('-')
    .map((word, index) => {
      // Replace 'and' with '&'
      if (word === 'and') return '&';
      // Capitalize first word
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      // Lowercase everything else
      return word;
    })
    .join(' ')
    .trim();
}

// ============================================================================
// MAIN INFERENCE FUNCTION (HARDENED)
// ============================================================================
// Multi-confirm rule: services must appear in 2+ independent sources.
// Niche lock: if niche is known, filter out cross-niche pollution.
// Conservative mode: quarantine if confidence is low.
// ============================================================================

export interface InferredServices {
  primaryService: string | null;  // null if quarantined
  allServices: string[];
  confidence: 'high' | 'med' | 'low';
  quarantined: boolean;
  quarantineReason?: string;
  evidence?: Map<string, ServiceEvidence>;
}

/**
 * Hardened service inference with multi-confirm validation
 */
export function inferServicesFromEssences(
  pageEssences: PageEssence[],
  businessName?: string,
  allPageUrls?: string[],
  lockedNiche?: string
): InferredServices {
  // Build evidence map with source tracking
  const evidenceMap = new Map<string, ServiceEvidence>();
  
  // Helper to add evidence
  const addEvidence = (service: string, source: ServiceSource, pageUrl?: string) => {
    const normalized = service.toLowerCase();
    if (!evidenceMap.has(normalized)) {
      evidenceMap.set(normalized, {
        service: normalized,
        sources: new Set(),
        pageUrls: new Set(),
        confidence: 0,
      });
    }
    const evidence = evidenceMap.get(normalized)!;
    evidence.sources.add(source);
    if (pageUrl) evidence.pageUrls.add(pageUrl);
  };

  // 1. Collect evidence from page essences
  pageEssences.forEach((essence) => {
    essence.servicesMentioned.forEach((service) => {
      // Determine source type based on where service was found
      const url = essence.url.toLowerCase();
      
      // Check if this is a service page URL
      if (/\/(service|services|typology|category)\//.test(url)) {
        addEvidence(service, 'service_url', essence.url);
        addEvidence(service, 'service_page', essence.url);
      } else {
        addEvidence(service, 'page_content', essence.url);
      }
    });
  });

  // 2. Collect evidence from typology/service URLs (high confidence)
  const urlsToCheck = allPageUrls || pageEssences.map(e => e.url);
  const typologyServices = inferServicesFromTypologyUrls(urlsToCheck);
  typologyServices.forEach((service) => {
    addEvidence(service, 'service_url');
  });

  // 3. Check business name for service hints
  if (businessName) {
    const nameLower = businessName.toLowerCase();
    if (nameLower.includes('plumb')) addEvidence('plumbing', 'business_name');
    if (nameLower.includes('electr')) addEvidence('electrical', 'business_name');
    if (nameLower.includes('architect')) addEvidence('architecture', 'business_name');
    if (nameLower.includes('estate') || nameLower.includes('property')) {
      addEvidence('estate agent', 'business_name');
    }
  }

  // 4. Apply niche lock filtering
  if (lockedNiche) {
    const nicheDef = NICHE_DEFINITIONS[lockedNiche.toLowerCase()];
    if (nicheDef) {
      // Remove services that don't belong to this niche
      for (const [service, evidence] of Array.from(evidenceMap.entries())) {
        if (nicheDef.excludeServices.some(excluded => 
          service.includes(excluded) || excluded.includes(service)
        )) {
          evidenceMap.delete(service);
        }
      }
    }
  }

  // 5. Calculate confidence for each service based on multi-confirm rule
  for (const [service, evidence] of Array.from(evidenceMap.entries())) {
    let confidence = 0;
    
    // High-value sources
    if (evidence.sources.has('business_name')) confidence += 3;
    if (evidence.sources.has('service_url')) confidence += 2;
    if (evidence.sources.has('service_page')) confidence += 2;
    if (evidence.sources.has('nav_item')) confidence += 2;
    if (evidence.sources.has('h1_heading')) confidence += 2;
    if (evidence.sources.has('h2_heading')) confidence += 1;
    if (evidence.sources.has('page_content')) confidence += 1;
    
    // Multi-page bonus
    if (evidence.pageUrls.size >= 3) confidence += 2;
    else if (evidence.pageUrls.size >= 2) confidence += 1;
    
    evidence.confidence = confidence;
  }

  // 6. Filter services by multi-confirm rule (require 2+ independent sources)
  const confirmedServices = Array.from(evidenceMap.entries())
    .filter(([_, evidence]) => {
      // Must have at least 2 different source types OR appear on 3+ pages
      return evidence.sources.size >= 2 || evidence.pageUrls.size >= 3;
    })
    .sort((a, b) => b[1].confidence - a[1].confidence)
    .map(([service]) => capitalizeFirst(service));

  // 7. Determine primary service
  let primaryService: string | null = null;
  let overallConfidence: 'high' | 'med' | 'low' = 'low';
  let quarantined = false;
  let quarantineReason: string | undefined;

  if (confirmedServices.length > 0) {
    // Get the highest-confidence service
    const topService = confirmedServices[0].toLowerCase();
    const topEvidence = evidenceMap.get(topService);
    
    if (topEvidence && topEvidence.confidence >= 4) {
      primaryService = capitalizeFirst(topService);
      overallConfidence = topEvidence.confidence >= 6 ? 'high' : 'med';
    } else if (topEvidence && topEvidence.confidence >= 2) {
      primaryService = capitalizeFirst(topService);
      overallConfidence = 'med';
    } else {
      // Low confidence - quarantine
      primaryService = null;
      quarantined = true;
      quarantineReason = 'Service inference confidence too low - requires manual confirmation';
    }
  } else {
    // No confirmed services
    quarantined = true;
    quarantineReason = 'No services confirmed with multi-source validation';
  }

  // 8. Final safety check: if we have a niche but inferred a completely different primary service
  if (lockedNiche && primaryService) {
    const nicheDef = NICHE_DEFINITIONS[lockedNiche.toLowerCase()];
    if (nicheDef && !nicheDef.keywords.some(kw => 
      primaryService!.toLowerCase().includes(kw) || kw.includes(primaryService!.toLowerCase())
    )) {
      // Primary service doesn't match niche - quarantine
      quarantined = true;
      quarantineReason = `Inferred service "${primaryService}" conflicts with niche "${lockedNiche}"`;
      primaryService = null;
    }
  }

  return {
    primaryService,
    allServices: confirmedServices.slice(0, 15),
    confidence: overallConfidence,
    quarantined,
    quarantineReason,
    evidence: evidenceMap,
  };
}

// ============================================================================
// BUILD SITE CONTENT DIGEST
// ============================================================================

export function buildSiteContentDigest(
  pageEssences: PageEssence[],
  businessName?: string,
  allPageUrls?: string[],
  lockedNiche?: string
): SiteContentDigest {
  // Pass allPageUrls to service inference for typology parsing
  const inferredServices = inferServicesFromEssences(pageEssences, businessName, allPageUrls, lockedNiche);

  // Aggregate USPs from proof mentions
  const allProofs = new Set<string>();
  pageEssences.forEach((e) => {
    e.proofMentions.forEach((p) => allProofs.add(p));
  });

  // Aggregate CTAs
  const allCTAs: SiteContentDigest['inferredCTAs'] = [];
  const ctaTypes = new Set<string>();
  pageEssences.forEach((e) => {
    e.ctas.forEach((cta) => {
      if (!ctaTypes.has(cta.type)) {
        ctaTypes.add(cta.type);
        allCTAs.push({ type: cta.type, text: cta.label, url: cta.url });
      }
    });
  });

  // Aggregate contact methods
  const contactMethods = new Set<string>();
  pageEssences.forEach((e) => {
    if (e.extractedSignals.phoneNumbers.length > 0) contactMethods.add('phone');
    if (e.extractedSignals.whatsappLinks.length > 0) contactMethods.add('whatsapp');
    if (e.extractedSignals.emails.length > 0) contactMethods.add('email');
    if (e.ctas.some((c) => c.type === 'contact')) contactMethods.add('form');
  });

  // Aggregate risky claims
  const riskyClaimsFound = new Set<string>();
  const safeClaimsFound = new Set<string>();

  pageEssences.forEach((e) => {
    e.complianceNotes.forEach((note) => {
      if (note.includes('Risky')) {
        const match = note.match(/Risky claims found: (.+)/);
        if (match) {
          match[1].split(',').forEach((c) => riskyClaimsFound.add(c.trim()));
        }
      }
    });
    // Collect safe claims from proof mentions
    e.proofMentions.forEach((p) => {
      const lower = p.toLowerCase();
      if (!isRiskyClaim(lower)) {
        safeClaimsFound.add(p);
      }
    });
  });

  // Detect contradictions
  const contradictions = detectContradictions(pageEssences);

  return {
    inferredPrimaryService: inferredServices.primaryService,
    inferredAllServices: inferredServices.allServices,
    inferredUSPs: Array.from(allProofs).slice(0, 5),
    inferredCTAs: allCTAs,
    inferredContactMethods: Array.from(contactMethods),
    riskyClaimsFound: Array.from(riskyClaimsFound),
    safeClaimsFound: Array.from(safeClaimsFound).slice(0, 5),
    serviceInferenceQuarantined: inferredServices.quarantined,
    serviceInferenceReason: inferredServices.quarantineReason,
    contradictions,
  };
}

// ============================================================================
// BUILD WRITER SNAPSHOT
// ============================================================================

export function buildWriterSnapshot(
  pageEssences: PageEssence[],
  digest: SiteContentDigest,
  proofAtoms: Array<{ verification?: string; value: string }>,
  locations: string[]
): WriterSnapshot {
  // Build one-liner from home page or services page
  const homePage = pageEssences.find((e) => 
    e.url.endsWith('/') || 
    e.url.includes('/index') ||
    e.role === 'money'
  );
  
  // Handle null primaryService gracefully
  const primaryServiceLabel = digest.inferredPrimaryService || 'professional';
  const oneLiner = homePage?.oneLiner || 
    `Professional ${primaryServiceLabel.toLowerCase()} services`;

  // Build geo pack
  const allLocations = new Set<string>(locations);
  pageEssences.forEach((e) => {
    e.locationsMentioned.forEach((loc) => allLocations.add(loc));
  });
  const locationList = Array.from(allLocations);

  const geoPack = {
    primaryLocation: locationList[0] || 'Local area',
    serviceAreas: locationList.slice(0, 5),
    localPhrasing: buildLocalPhrasing(digest.inferredPrimaryService || 'Services', locationList),
  };

  // Build EEAT pack
  const claimsAllowed = proofAtoms
    .filter((a) => a.verification === 'verified')
    .map((a) => a.value);
  const claimsRestricted = proofAtoms
    .filter((a) => a.verification === 'unverified')
    .map((a) => a.value);

  // Build link targets
  const contactPage = pageEssences.find((e) => 
    e.url.toLowerCase().includes('contact')
  );
  const moneyPages = pageEssences
    .filter((e) => e.role === 'money')
    .slice(0, 3);

  const linkTargets = {
    contactUrl: contactPage?.url || pageEssences[0]?.url || '/',
    topMoneyPages: moneyPages.map((p) => ({
      url: p.url,
      title: p.title || p.oneLiner,
      anchor: buildAnchorText(p, primaryServiceLabel),
    })),
    quoteUrl: digest.inferredCTAs.find((c) => c.type === 'quote')?.url,
  };

  return {
    oneLiner,
    geoPack,
    eeatPack: {
      claimsAllowed: claimsAllowed.slice(0, 5),
      claimsRestricted: claimsRestricted.slice(0, 5),
    },
    linkTargets,
  };
}

// ============================================================================
// BUILD PROFILE CONFIDENCE
// ============================================================================

export function buildProfileConfidence(
  servicesConfidence: 'high' | 'med' | 'low',
  moneyPageCount: number,
  reviewCount: number,
  linkGraphHealth: string
): ProfileConfidence {
  return {
    services: servicesConfidence,
    roles: moneyPageCount >= 3 ? 'high' : moneyPageCount >= 1 ? 'med' : 'low',
    reviews: reviewCount >= 10 ? 'high' : reviewCount >= 3 ? 'med' : 'low',
    linkGraph: linkGraphHealth === 'excellent' || linkGraphHealth === 'good' 
      ? 'high' 
      : linkGraphHealth === 'fair' 
        ? 'med' 
        : 'low',
  };
}

// ============================================================================
// BUILD PROFILE COMPLETENESS
// ============================================================================

export function buildProfileCompleteness(
  primaryService: string,
  allServices: string[],
  moneyPageCount: number,
  contactUrl: string | undefined
): ProfileCompleteness {
  const blockers: string[] = [];
  const actionRequired: string[] = [];

  // Check services
  if (!primaryService) {
    blockers.push('PRIMARY_SERVICE_MISSING');
  }
  if (allServices.length < 3) {
    actionRequired.push('ADD_MORE_SERVICES');
  }

  // Check money pages
  if (moneyPageCount === 0) {
    actionRequired.push('CREATE_SERVICE_MONEY_PAGES');
  }

  // Check contact
  if (!contactUrl) {
    blockers.push('CONTACT_URL_MISSING');
  }

  // Calculate completeness score
  let score = 100;
  score -= blockers.length * 25;
  score -= actionRequired.length * 10;
  score = Math.max(0, score);

  return {
    blocked: blockers.length > 0,
    blockers,
    actionRequired,
    completenessScore: score,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function capitalizeFirst(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isRiskyClaim(text: string): boolean {
  // Generic superlatives that need verification
  return /\b(cheapest|lowest|best\s*in|number\s*1|#1|fastest|guaranteed|award[- ]?winning|leading|top[- ]?rated|world[- ]?class|premier)\b/i.test(text);
}

function detectContradictions(
  pageEssences: PageEssence[]
): SiteContentDigest['contradictions'] {
  const contradictions: SiteContentDigest['contradictions'] = [];

  // Check for 24/7 inconsistency
  const pages24hr = pageEssences.filter((e) =>
    e.proofMentions.some((p) => /24[\/\s-]?7/.test(p))
  );
  if (pages24hr.length > 0 && pages24hr.length < pageEssences.length / 2) {
    contradictions.push({
      topic: '24/7 service claim',
      pages: pages24hr.map((p) => p.url),
      details: '24/7 mentioned on some pages but not consistently across the site',
    });
  }

  // Check for phone number inconsistency - only if 3+ VALID unique phones
  // Phone numbers are already validated by pageExtractor, so false positives should be filtered
  const phonesByPage = new Map<string, Set<string>>();
  pageEssences.forEach((e) => {
    e.extractedSignals.phoneNumbers.forEach((phone) => {
      // Additional validation: must look like a real phone number (starts with + or is 8-12 digits)
      if (!isValidPhoneFormat(phone)) {
        return;  // Skip invalid phones
      }
      if (!phonesByPage.has(phone)) {
        phonesByPage.set(phone, new Set());
      }
      phonesByPage.get(phone)!.add(e.url);
    });
  });

  // Only flag contradiction if 3+ distinct valid phone numbers found
  if (phonesByPage.size >= 3) {
    contradictions.push({
      topic: 'phone_numbers',
      pages: Array.from(new Set(
        Array.from(phonesByPage.values()).flatMap((s) => Array.from(s))
      )),
      details: `Multiple phone numbers found: ${Array.from(phonesByPage.keys()).join(', ')}`,
    });
  }

  return contradictions;
}

/**
 * Additional phone format validation for contradiction detection
 */
function isValidPhoneFormat(phone: string): boolean {
  // Must start with + (E.164) or be 8-12 digits
  if (phone.startsWith('+')) {
    // E.164 format: +<country><number>
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }
  // Raw digits
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 12;
}

function buildLocalPhrasing(service: string, locations: string[]): string[] {
  if (!service || locations.length === 0) return [];

  const serviceLower = service.toLowerCase();
  return locations.slice(0, 3).flatMap((loc) => [
    `${serviceLower} in ${loc}`,
    `${loc} ${serviceLower}`,
  ]);
}

function buildAnchorText(page: PageEssence, primaryService: string): string {
  // Try to use service + location
  if (page.servicesMentioned.length > 0 && page.locationsMentioned.length > 0) {
    return `${page.servicesMentioned[0]} in ${page.locationsMentioned[0]}`;
  }
  
  // Fall back to title
  if (page.title && page.title.length < 50) {
    return page.title;
  }

  // Generic
  return primaryService.toLowerCase() + ' services';
}
