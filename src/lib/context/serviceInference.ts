// ============================================================================
// SERVICE INFERENCE
// ============================================================================
// Infers primaryService and allServices from page content.
// Also builds the siteContentDigest from aggregated page essences.
// ============================================================================

import type {
  PageEssence,
  SiteContentDigest,
  WriterSnapshot,
  ProfileConfidence,
  ProfileCompleteness,
} from './types';

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
// MAIN INFERENCE FUNCTION
// ============================================================================

export interface InferredServices {
  primaryService: string;
  allServices: string[];
  confidence: 'high' | 'med' | 'low';
}

export function inferServicesFromEssences(
  pageEssences: PageEssence[],
  businessName?: string,
  allPageUrls?: string[]
): InferredServices {
  // Count service occurrences across all pages
  const serviceCounts = new Map<string, number>();
  const serviceByPage = new Map<string, Set<string>>();

  pageEssences.forEach((essence) => {
    serviceByPage.set(essence.url, new Set());
    essence.servicesMentioned.forEach((service) => {
      const normalized = service.toLowerCase();
      serviceCounts.set(normalized, (serviceCounts.get(normalized) || 0) + 1);
      serviceByPage.get(essence.url)?.add(normalized);
    });
  });

  // Get unique services sorted by frequency
  const sortedServices = Array.from(serviceCounts.entries())
    .sort((a, b) => {
      // First by count
      if (b[1] !== a[1]) return b[1] - a[1];
      // Then by priority
      const priorityA = SERVICE_PRIORITY[a[0]] || 0;
      const priorityB = SERVICE_PRIORITY[b[0]] || 0;
      return priorityB - priorityA;
    })
    .map(([service]) => service);

  // UPGRADE: Also infer services from typology/category URLs
  const urlsToCheck = allPageUrls || pageEssences.map(e => e.url);
  const typologyServices = inferServicesFromTypologyUrls(urlsToCheck);
  
  // Merge typology services with extracted services (typology services are high-confidence)
  const allServicesSet = new Set<string>([
    ...sortedServices.map(capitalizeFirst),
    ...typologyServices,
  ]);
  const allServicesList = Array.from(allServicesSet);

  // Infer primary service
  let primaryService = sortedServices[0] || '';

  // Check if business name hints at a service
  if (businessName) {
    const nameLower = businessName.toLowerCase();
    if (nameLower.includes('plumb') && sortedServices.includes('plumbing')) {
      primaryService = 'plumbing';
    } else if (nameLower.includes('electr') && sortedServices.includes('electrical')) {
      primaryService = 'electrical';
    } else if (nameLower.includes('architect')) {
      primaryService = 'architecture';
    }
  }

  // If no primary from content but we have typology services, use first one
  if (!primaryService && typologyServices.length > 0) {
    primaryService = typologyServices[0];
  }

  // Fallback: If plumbing appears at all, use it
  if (!primaryService && sortedServices.includes('plumbing')) {
    primaryService = 'plumbing';
  }

  // Determine confidence - UPGRADE: typology sites with 6+ services = med confidence
  let confidence: InferredServices['confidence'] = 'low';
  if (allServicesList.length >= 5 && serviceCounts.get(primaryService.toLowerCase())! >= 3) {
    confidence = 'high';
  } else if (allServicesList.length >= 6 && typologyServices.length >= 4) {
    confidence = 'med';  // Typology site with structured categories
  } else if (allServicesList.length >= 3 && serviceCounts.get(primaryService.toLowerCase())! >= 2) {
    confidence = 'med';
  } else if (typologyServices.length >= 6) {
    confidence = 'med';  // Typology site with many categories
  }

  return {
    primaryService: capitalizeFirst(primaryService),
    allServices: allServicesList.slice(0, 15),
    confidence,
  };
}

// ============================================================================
// BUILD SITE CONTENT DIGEST
// ============================================================================

export function buildSiteContentDigest(
  pageEssences: PageEssence[],
  businessName?: string,
  allPageUrls?: string[]
): SiteContentDigest {
  // Pass allPageUrls to service inference for typology parsing
  const inferredServices = inferServicesFromEssences(pageEssences, businessName, allPageUrls);

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
  const oneLiner = homePage?.oneLiner || 
    `Professional ${digest.inferredPrimaryService.toLowerCase()} services`;

  // Build geo pack
  const allLocations = new Set<string>(locations);
  pageEssences.forEach((e) => {
    e.locationsMentioned.forEach((loc) => allLocations.add(loc));
  });
  const locationList = Array.from(allLocations);

  const geoPack = {
    primaryLocation: locationList[0] || 'Local area',
    serviceAreas: locationList.slice(0, 5),
    localPhrasing: buildLocalPhrasing(digest.inferredPrimaryService, locationList),
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
      anchor: buildAnchorText(p, digest.inferredPrimaryService),
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
