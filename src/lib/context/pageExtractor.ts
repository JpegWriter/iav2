// ============================================================================
// PAGE EXTRACTOR
// ============================================================================
// Extracts structured signals from page text content.
// Phone numbers, emails, WhatsApp links, CTAs, services, locations.
// ============================================================================

export interface ExtractedSignals {
  phoneNumbers: string[];
  emails: string[];
  whatsappLinks: string[];
  addressSnippets: string[];
  serviceTokens: string[];
  locationTokens: string[];
  ctaTokens: Array<{ label: string; type: string; url?: string }>;
  proofTokens: string[];
  toneSignals: string[];
  riskyClaimsFound: string[];
}

// ============================================================================
// SERVICE DICTIONARY (Local Service Businesses)
// ============================================================================

const SERVICE_PATTERNS: Record<string, RegExp> = {
  // Plumbing
  'plumbing': /\bplumb(ing|er|ers)?\b/i,
  'drain cleaning': /\b(drain|drainage)\s*(cleaning|unblocking|cleared?)\b/i,
  'blocked drain': /\bblocked?\s*(drain|pipe|toilet|sink)\b/i,
  'toilet repair': /\btoilet\s*(repair|fix|installation|unblock)\b/i,
  'sink repair': /\bsink\s*(repair|fix|installation|unblock)\b/i,
  'shower repair': /\bshower\s*(repair|fix|installation)\b/i,
  'leak detection': /\b(leak|leaking)\s*(detection|repair|fix)\b/i,
  'pipe repair': /\bpipe\s*(repair|replacement|burst)\b/i,
  'geyser': /\b(geyser|water\s*heater|boiler)\s*(repair|installation|replacement)?\b/i,
  'water heater': /\bwater\s*heater\b/i,
  'emergency plumbing': /\bemergency\s*(plumb|call\s*out)\b/i,
  'bathroom fitting': /\bbathroom\s*(fitting|installation|renovation)\b/i,
  'kitchen plumbing': /\bkitchen\s*(plumb|sink|tap)\b/i,
  
  // Electrical
  'electrical': /\belectric(al|ian|ians)?\b/i,
  'wiring': /\b(re)?wiring\b/i,
  'fuse box': /\b(fuse\s*box|consumer\s*unit|circuit\s*breaker)\b/i,
  'lighting': /\blighting\s*(installation|repair|design)?\b/i,
  'socket installation': /\b(socket|outlet)\s*(installation|repair)\b/i,
  'electrical testing': /\belectric(al)?\s*test(ing)?\b/i,
  'emergency electrical': /\bemergency\s*electric\b/i,
  
  // HVAC
  'hvac': /\bhvac\b/i,
  'air conditioning': /\b(air\s*condition(ing|er)?|a\/?c)\s*(installation|repair|service)?\b/i,
  'heating': /\bheating\s*(system|installation|repair)?\b/i,
  'ventilation': /\bventilation\b/i,
  
  // General
  'maintenance': /\b(maintenance|handyman)\b/i,
  'renovation': /\brenovation\b/i,
  'installation': /\binstallation\s*(service)?\b/i,
  'repair': /\brepair\s*(service)?\b/i,
  '24 hour service': /\b24\s*(hour|hr|\/7)\b/i,
};

// ============================================================================
// LOCATION PATTERNS
// ============================================================================

const LOCATION_PATTERNS = [
  // Malta specific
  /\b(malta|valletta|sliema|st\.?\s*julians?|gzira|msida|birkirkara|qormi|mosta|naxxar|rabat|mdina|gozo|mellieha|bugibba|st\.?\s*pauls?\s*bay|attard|balzan|lija|san\s*gwann|swieqi|hamrun|marsa|paola|tarxien|zejtun|zabbar|fgura|marsaskala|marsaxlokk|birzebbugia|gudja|luqa|mqabba|qrendi|zurrieq|siggiewi|dingli|zebbug|gharghur|pembroke|madliena|bahar\s*ic-caghaq)\b/gi,
  // Generic location markers
  /\b(serving|based\s*in|located\s*in|covering|across)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
];

// ============================================================================
// REGEX PATTERNS
// ============================================================================

// Stricter phone patterns with validation
const PHONE_PATTERNS = [
  /\+?356[\s.-]?\d{4}[\s.-]?\d{4}/g,  // Malta format: +356 2124 3981 or 21243981
  /\+?1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,  // US format: +1 (555) 123-4567
  /\+[1-9]\d{0,2}[\s.-]?\d{6,14}/g,  // International: +44 7911 123456
  /\b(?<!\d)\d{8}(?!\d)\b/g,  // Malta 8-digit: 21243981 (not part of longer sequence)
];

// Year patterns to filter out false positives
const YEAR_PATTERN = /^(19|20)\d{2}$/;
const YEAR_SEQUENCE_PATTERN = /(19|20)\d{2}(19|20)\d{2}/;  // 20252024, etc.
const CONCATENATED_YEARS_PATTERN = /^(20[012]\d)+$/;  // 202620252024... pure year concatenation
const CONTAINS_MULTIPLE_YEARS = /(20[012]\d).*(20[012]\d)/;  // Any string with 2+ years in 2000-2029 range

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const WHATSAPP_PATTERN = /(?:wa\.me\/|whatsapp\.com\/|whatsapp:)\+?[\d-]+/gi;

const CTA_PATTERNS = [
  { pattern: /\bcall\s*(us|now|today)?\b/gi, type: 'call' as const },
  { pattern: /\bwhatsapp\s*(us|now)?\b/gi, type: 'whatsapp' as const },
  { pattern: /\b(get|request|free)\s*(a\s*)?(quote|estimate)\b/gi, type: 'quote' as const },
  { pattern: /\bcontact\s*(us|now|today)?\b/gi, type: 'contact' as const },
  { pattern: /\bbook\s*(now|online|appointment)?\b/gi, type: 'book' as const },
  { pattern: /\b(schedule|enquire|enquiry)\b/gi, type: 'other' as const },
];

const PROOF_PATTERNS = [
  /\b\d+\s*(years?|yrs?)\s*(of\s*)?(experience|in\s*business|serving)\b/gi,
  /\b\d+\+?\s*(happy|satisfied)?\s*(customers?|clients?|jobs?|projects?)\b/gi,
  /\b(google\s*)?\d+(\.\d+)?\s*star(s)?\s*(rating|review)?\b/gi,
  /\b(licensed|certified|insured|qualified|accredited)\b/gi,
  /\b(award[- ]?winning|best\s*in)\b/gi,
  /\b(family[- ]?owned|locally\s*owned)\b/gi,
  /\b(same[- ]?day|24[\/\s-]?7|emergency)\s*(service|response|call[- ]?out)?\b/gi,
  /\b(guarantee|warranty|money[- ]?back)\b/gi,
];

const RISKY_CLAIM_PATTERNS = [
  /\b(cheapest|lowest\s*price|best\s*price|unbeatable)\b/gi,
  /\b(best\s*in\s*(malta|town|the\s*area))\b/gi,
  /\b(guaranteed|100%)\b/gi,
  /\b(number\s*1|#1|no\.?\s*1)\b/gi,
  /\b(fastest|quickest)\b/gi,
  /\blicensed\s*for\s*all\b/gi,
];

const TONE_SIGNALS = {
  friendly: /\b(we're\s*here|happy\s*to\s*help|don't\s*hesitate|feel\s*free)\b/gi,
  professional: /\b(professional|expertise|specialist|qualified)\b/gi,
  urgent: /\b(emergency|urgent|immediate|fast\s*response|call\s*now)\b/gi,
  premium: /\b(premium|luxury|high[- ]?end|quality)\b/gi,
  trustworthy: /\b(trusted|reliable|dependable|honest)\b/gi,
  local: /\b(local|family[- ]?owned|community|neighbourhood)\b/gi,
};

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

export function extractSignalsFromText(text: string): ExtractedSignals {
  if (!text) {
    return emptySignals();
  }

  const normalizedText = text.replace(/\s+/g, ' ').trim();

  return {
    phoneNumbers: extractPhoneNumbers(normalizedText),
    emails: extractEmails(normalizedText),
    whatsappLinks: extractWhatsAppLinks(normalizedText),
    addressSnippets: extractAddressSnippets(normalizedText),
    serviceTokens: extractServiceTokens(normalizedText),
    locationTokens: extractLocationTokens(normalizedText),
    ctaTokens: extractCTAs(normalizedText),
    proofTokens: extractProofTokens(normalizedText),
    toneSignals: extractToneSignals(normalizedText),
    riskyClaimsFound: extractRiskyClaims(normalizedText),
  };
}

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

function extractPhoneNumbers(text: string): string[] {
  const phones = new Set<string>();
  
  for (const pattern of PHONE_PATTERNS) {
    const matches = text.match(pattern) || [];
    matches.forEach((m) => {
      const validated = validateAndNormalizePhone(m);
      if (validated) {
        phones.add(validated);
      }
    });
  }
  
  return Array.from(phones);
}

/**
 * Validates and normalizes phone numbers, rejecting false positives
 */
function validateAndNormalizePhone(phone: string): string | null {
  // Strip separators first
  const digitsOnly = phone.replace(/[\s.()\-]/g, '');
  const normalized = digitsOnly.replace(/^\+/, '');
  
  // REJECT: continuous digit strings > 12 (e.g., "202620252024...")
  if (normalized.length > 12) {
    return null;
  }
  
  // REJECT: looks like year sequence (e.g., "20252024", "202620252024")
  if (YEAR_SEQUENCE_PATTERN.test(normalized)) {
    return null;
  }
  
  // REJECT: single year (e.g., "2024", "2025")
  if (YEAR_PATTERN.test(normalized)) {
    return null;
  }
  
  // REJECT: too short (less than 7 digits for international, 8 for Malta local)
  if (normalized.length < 7) {
    return null;
  }
  
  // REJECT: runs of mostly consecutive years (e.g., "2023202420252026")
  const yearCount = (normalized.match(/(19|20)\d{2}/g) || []).length;
  if (yearCount >= 2) {
    return null;
  }
  
  // REJECT: pure concatenated year sequences (e.g., "202620252024")
  if (CONCATENATED_YEARS_PATTERN.test(normalized)) {
    return null;
  }
  
  // REJECT: contains multiple recent years anywhere
  if (CONTAINS_MULTIPLE_YEARS.test(normalized)) {
    return null;
  }
  
  // Normalize to E.164 format where possible
  if (digitsOnly.startsWith('+')) {
    return digitsOnly;  // Already has country code
  }
  
  // Malta: 8 digits starting with 2, 7, or 9
  if (normalized.length === 8 && /^[279]/.test(normalized)) {
    return '+356' + normalized;
  }
  
  // UK: 10-11 digits starting with 0
  if ((normalized.length === 10 || normalized.length === 11) && normalized.startsWith('0')) {
    return '+44' + normalized.slice(1);
  }
  
  // US: 10 digits (add +1)
  if (normalized.length === 10) {
    return '+1' + normalized;
  }
  
  // Return cleaned version if passes validation
  return digitsOnly || null;
}

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_PATTERN) || [];
  return Array.from(new Set(matches.map((e) => e.toLowerCase())));
}

function extractWhatsAppLinks(text: string): string[] {
  const matches = text.match(WHATSAPP_PATTERN) || [];
  return Array.from(new Set(matches));
}

function extractAddressSnippets(text: string): string[] {
  // Look for lines that might be addresses (contain street/locality markers)
  const addressPatterns = [
    /\d+[,\s]+[A-Z][a-z]+\s+(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?)[^.\n]*/gi,
    /[A-Z][a-z]+\s+(?:Street|St\.?|Road|Rd\.?)[,\s]+[A-Z][a-z]+/gi,
  ];

  const addresses: string[] = [];
  for (const pattern of addressPatterns) {
    const matches = text.match(pattern) || [];
    addresses.push(...matches.map((a) => a.trim()));
  }

  return Array.from(new Set(addresses)).slice(0, 3);
}

function extractServiceTokens(text: string): string[] {
  const services = new Set<string>();

  for (const [service, pattern] of Object.entries(SERVICE_PATTERNS)) {
    if (pattern.test(text)) {
      services.add(service);
    }
  }

  return Array.from(services);
}

function extractLocationTokens(text: string): string[] {
  const locations = new Set<string>();

  for (const pattern of LOCATION_PATTERNS) {
    const matches = text.match(pattern) || [];
    matches.forEach((m) => {
      // Clean up the match
      const cleaned = m.replace(/^(serving|based\s*in|located\s*in|covering|across)\s*/i, '').trim();
      if (cleaned.length > 2) {
        locations.add(cleaned);
      }
    });
  }

  return Array.from(locations);
}

function extractCTAs(text: string): Array<{ label: string; type: string; url?: string }> {
  const ctas: Array<{ label: string; type: string }> = [];

  for (const { pattern, type } of CTA_PATTERNS) {
    const matches = text.match(pattern) || [];
    matches.forEach((m) => {
      ctas.push({ label: m.trim(), type });
    });
  }

  // Deduplicate by type
  const seen = new Set<string>();
  return ctas.filter((cta) => {
    if (seen.has(cta.type)) return false;
    seen.add(cta.type);
    return true;
  });
}

function extractProofTokens(text: string): string[] {
  const proofs: string[] = [];

  for (const pattern of PROOF_PATTERNS) {
    const matches = text.match(pattern) || [];
    proofs.push(...matches.map((m) => m.trim()));
  }

  return Array.from(new Set(proofs)).slice(0, 10);
}

function extractToneSignals(text: string): string[] {
  const tones: string[] = [];

  for (const [tone, pattern] of Object.entries(TONE_SIGNALS)) {
    if (pattern.test(text)) {
      tones.push(tone);
    }
  }

  return tones;
}

function extractRiskyClaims(text: string): string[] {
  const risky: string[] = [];

  for (const pattern of RISKY_CLAIM_PATTERNS) {
    const matches = text.match(pattern) || [];
    risky.push(...matches.map((m) => m.trim()));
  }

  return Array.from(new Set(risky));
}

function emptySignals(): ExtractedSignals {
  return {
    phoneNumbers: [],
    emails: [],
    whatsappLinks: [],
    addressSnippets: [],
    serviceTokens: [],
    locationTokens: [],
    ctaTokens: [],
    proofTokens: [],
    toneSignals: [],
    riskyClaimsFound: [],
  };
}

// ============================================================================
// UTILITY: Check if text contains token
// ============================================================================

export function textContainsToken(text: string, token: string): boolean {
  const pattern = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return pattern.test(text);
}

// ============================================================================
// UTILITY: Find contradictions between signals
// ============================================================================

export function findContradictions(
  pageSignals: Array<{ url: string; signals: ExtractedSignals }>
): Array<{ topic: string; pages: string[]; details: string }> {
  const contradictions: Array<{ topic: string; pages: string[]; details: string }> = [];

  // Check for inconsistent phone numbers
  const phonesByPage = new Map<string, string[]>();
  pageSignals.forEach(({ url, signals }) => {
    if (signals.phoneNumbers.length > 0) {
      phonesByPage.set(url, signals.phoneNumbers);
    }
  });

  if (phonesByPage.size > 1) {
    const allPhones = new Set<string>();
    phonesByPage.forEach((phones) => phones.forEach((p) => allPhones.add(p)));
    
    if (allPhones.size > 2) {
      contradictions.push({
        topic: 'phone_numbers',
        pages: Array.from(phonesByPage.keys()),
        details: `Multiple different phone numbers found: ${Array.from(allPhones).join(', ')}`,
      });
    }
  }

  // Check for 24/7 claim consistency
  const pages24hr = pageSignals.filter(({ signals }) =>
    signals.serviceTokens.includes('24 hour service') ||
    signals.proofTokens.some((p) => /24[\/\s-]?7/.test(p))
  );

  if (pages24hr.length > 0 && pages24hr.length < pageSignals.length / 2) {
    contradictions.push({
      topic: '24_7_claim',
      pages: pages24hr.map((p) => p.url),
      details: '24/7 service mentioned on some pages but not others',
    });
  }

  // Check for service consistency (e.g., "electrical" in name but not in services)
  const allServices = new Set<string>();
  pageSignals.forEach(({ signals }) => {
    signals.serviceTokens.forEach((s) => allServices.add(s));
  });

  return contradictions;
}
