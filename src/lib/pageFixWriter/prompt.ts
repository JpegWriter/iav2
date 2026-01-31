/**
 * Page Fix Writer Prompt Builder
 * 
 * Builds surgical repair prompts that:
 * - Respect existing page purpose
 * - Preserve visual/emotional intent
 * - Improve semantic clarity
 * - Inject E-E-A-T without sounding corporate
 * - Avoid SEO clichés
 * - Never overwrite artist voice
 */

import type { PageFixRequest, PageFixOutput } from './types';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are a surgical page rehabilitation specialist for Infinite Authority.

Your role is to IMPROVE existing pages, not rewrite them. Think of yourself as an editor who:
- Clarifies what's already there
- Contextualizes the page's purpose
- Anchors experience and expertise
- Expands gently where needed
- Explains the page better — not louder

## ABSOLUTE RULES (NEVER BREAK THESE)

❌ NEVER invent services, offerings, or products not mentioned in the original
❌ NEVER add awards, certifications, or credentials unless explicitly provided
❌ NEVER exaggerate claims or add superlatives ("best", "leading", "top")
❌ NEVER use generic SEO phrases ("in today's digital age", "look no further")
❌ NEVER stuff keywords unnaturally
❌ NEVER overwrite emotional or artistic intent
❌ NEVER add outbound links unless explicitly allowed
❌ NEVER change the fundamental purpose of the page

## WHAT YOU MUST DO

✅ Clarify titles and headings to match real page intent
✅ Align H1 with how people actually search for this content
✅ Add context that explains what visitors will find
✅ Inject experience signals using ONLY provided context (years, clients, projects)
✅ Expand thin sections with relevant depth
✅ Improve readability (shorter sentences, clearer structure)
✅ Suggest internal links to related pages on the same site
✅ Write in the voice profile provided (formality, confidence, humor level)

## OUTPUT FORMAT

You MUST return valid JSON matching this exact schema:
{
  "title": "string (50-60 chars, includes main keyword naturally)",
  "metaDescription": "string (120-160 chars, compelling with call-to-action)",
  "h1": "string (clear, keyword-aligned, matches page intent)",
  "sections": [
    {
      "type": "intro|context|experience|process_or_benefits|faq|testimonial|cta|custom",
      "heading": "optional H2/H3 text",
      "html": "section content with semantic HTML",
      "isNew": false,
      "replacesOriginal": "hash of replaced content if applicable"
    }
  ],
  "internalLinks": [
    {
      "anchor": "link text",
      "targetUrl": "/path/to/page",
      "reason": "why this link helps the reader",
      "insertAfterSection": "section type where link fits"
    }
  ],
  "imageInstructions": [
    {
      "imageIdOrFilename": "filename.jpg",
      "alt": "descriptive alt text",
      "caption": "optional caption",
      "iptc": {
        "title": "image title",
        "description": "detailed description",
        "keywords": ["keyword1", "keyword2"]
      }
    }
  ],
  "authorBlock": {
    "html": "optional author/about block HTML"
  },
  "notes": {
    "whatChanged": ["bullet point explanations of each change"],
    "whyItMatters": ["how each change helps visitors and search"],
    "claimsToVerify": ["any claims that need client verification"]
  }
}

Return ONLY the JSON object. No markdown, no code blocks, no explanations outside the JSON.`;

// ============================================================================
// PROMPT BUILDER
// ============================================================================

export function buildPageFixPrompt(request: PageFixRequest): {
  system: string;
  user: string;
} {
  const {
    originalSnapshot,
    fixBrief,
    focusKeyword,
    voiceProfile,
    guardrails,
    businessContext,
    internalLinkOpportunities,
    pageRole,
  } = request;

  // Build voice instructions
  const voiceInstructions = buildVoiceInstructions(voiceProfile);
  
  // Build guardrails section
  const guardrailsSection = buildGuardrailsSection(guardrails);
  
  // Build business context section
  const businessSection = businessContext 
    ? buildBusinessContext(businessContext) 
    : '';
  
  // Build internal link context
  const linkContext = internalLinkOpportunities?.length 
    ? buildLinkContext(internalLinkOpportunities)
    : '';

  const userPrompt = `## PAGE REHABILITATION REQUEST

### ORIGINAL PAGE SNAPSHOT

**URL:** ${originalSnapshot.url}
**Current Title:** ${originalSnapshot.title || '[Missing]'}
**Current Meta Description:** ${originalSnapshot.metaDescription || '[Missing]'}
**Current H1:** ${originalSnapshot.h1 || '[Missing]'}
**Word Count:** ${originalSnapshot.wordCount}
**Page Role:** ${pageRole}

**Current Headings Structure:**
${originalSnapshot.headings.map(h => `${'  '.repeat(h.level - 1)}H${h.level}: ${h.text}`).join('\n') || '[No headings found]'}

**Current Page Content:**
\`\`\`
${originalSnapshot.bodyText.substring(0, 8000)}${originalSnapshot.bodyText.length > 8000 ? '\n[Content truncated...]' : ''}
\`\`\`

**Images on Page:**
${originalSnapshot.images.map(img => `- ${img.filename}: alt="${img.alt || '[Missing]'}"${img.caption ? `, caption="${img.caption}"` : ''}`).join('\n') || '[No images]'}

---

### FIX BRIEF

**Current Score:** ${fixBrief.currentScore}/100
**Target Score:** ${fixBrief.targetScore}/100
**Priority:** ${fixBrief.priority}

**Issues to Address:**
${fixBrief.issues.map(issue => `- [${issue.severity.toUpperCase()}] ${issue.title}: ${issue.description}
  → Suggested: ${issue.suggestedAction}`).join('\n\n')}

**Success Criteria:**
${fixBrief.successCriteria.map(c => `✓ ${c}`).join('\n')}

${focusKeyword ? `**Focus Keyword:** "${focusKeyword}" (use naturally, NEVER stuff)` : ''}

---

### VOICE PROFILE

${voiceInstructions}

---

### GUARDRAILS

${guardrailsSection}

${businessSection ? `---\n\n### BUSINESS CONTEXT (Use for E-E-A-T signals)\n\n${businessSection}` : ''}

${linkContext ? `---\n\n### AVAILABLE INTERNAL LINKS\n\nThese pages exist on the same site. Suggest 2-4 relevant internal links:\n\n${linkContext}` : ''}

---

### YOUR TASK

Improve this ${pageRole} page by addressing the issues above while:
1. Preserving the original page's purpose and emotional intent
2. Using the voice profile provided
3. Adding trust signals ONLY from the business context provided
4. Explaining what's already there more clearly — not adding noise

Return your improvements as the specified JSON format.`;

  return {
    system: SYSTEM_PROMPT,
    user: userPrompt,
  };
}

// ============================================================================
// HELPER BUILDERS
// ============================================================================

function buildVoiceInstructions(voice: PageFixRequest['voiceProfile']): string {
  const formalityGuide = {
    formal: 'Use professional, polished language. Complete sentences, no contractions.',
    neutral: 'Balanced tone. Contractions OK. Clear and approachable.',
    informal: 'Conversational and friendly. Use contractions freely. Feels like a chat.',
  };

  const confidenceGuide = {
    confident: 'Speak with authority. "We do X" not "We try to do X".',
    neutral: 'Balanced confidence. State facts clearly without overselling.',
    humble: 'Understated. Let work speak for itself. Avoid boasting.',
  };

  const humorGuide = {
    none: 'No humor or wordplay. Straightforward.',
    subtle: 'Light touches of personality. Occasional wit.',
    playful: 'Personality shines through. Can be clever and fun.',
  };

  return `**Formality:** ${voice.formality} — ${formalityGuide[voice.formality]}
**Confidence:** ${voice.confidence} — ${confidenceGuide[voice.confidence]}
**Humor:** ${voice.humourLevel} — ${humorGuide[voice.humourLevel]}
**Sentence Style:** ${voice.sentenceLengthBias} sentences preferred
**Persuasion Level:** ${voice.persuasionLevel}
**CTA Style:** ${voice.ctaStyle}

${voice.tabooWords.length > 0 ? `**NEVER use these words/phrases:** ${voice.tabooWords.join(', ')}` : ''}`;
}

function buildGuardrailsSection(guardrails: PageFixRequest['guardrails']): string {
  const rules: string[] = [];
  
  if (guardrails.prohibitedPhrases.length > 0) {
    rules.push(`**Prohibited phrases:** ${guardrails.prohibitedPhrases.join(', ')}`);
  }
  
  if (guardrails.requireVerifiableClaims) {
    rules.push('**All claims must be verifiable** — only use facts from provided context');
  }
  
  if (!guardrails.allowOutboundLinks) {
    rules.push('**No outbound links** — only internal links allowed');
  }
  
  rules.push(`**Max keyword density:** ${(guardrails.maxKeywordDensity * 100).toFixed(1)}%`);
  
  if (guardrails.preserveImagePositions) {
    rules.push('**Preserve image positions** — do not suggest moving images');
  }
  
  if (guardrails.preserveExistingLinks) {
    rules.push('**Keep existing internal links** — add new ones, don\'t remove current');
  }
  
  return rules.join('\n');
}

function buildBusinessContext(ctx: NonNullable<PageFixRequest['businessContext']>): string {
  const lines: string[] = [];
  
  lines.push(`**Business Name:** ${ctx.businessName}`);
  
  if (ctx.location) {
    lines.push(`**Location:** ${ctx.location}`);
  }
  
  if (ctx.yearsInBusiness) {
    lines.push(`**Years in Business:** ${ctx.yearsInBusiness}`);
  }
  
  if (ctx.credentials?.length) {
    lines.push(`**Credentials:** ${ctx.credentials.join(', ')}`);
  }
  
  if (ctx.specialties?.length) {
    lines.push(`**Specialties:** ${ctx.specialties.join(', ')}`);
  }
  
  return lines.join('\n');
}

function buildLinkContext(links: NonNullable<PageFixRequest['internalLinkOpportunities']>): string {
  // Sort by relevance and take top 10
  const topLinks = links
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 10);
  
  return topLinks
    .map(link => `- ${link.url} — "${link.title}" (${link.role} page)`)
    .join('\n');
}

// ============================================================================
// REPAIR PROMPT (for validator failures)
// ============================================================================

export function buildRepairPrompt(
  originalOutput: string,
  validationErrors: { code: string; message: string }[]
): {
  system: string;
  user: string;
} {
  return {
    system: `You are a JSON repair specialist. Your job is to fix invalid or problematic output from a page fix generation.

You will receive:
1. The original (problematic) output
2. A list of validation errors

Fix the issues while preserving as much of the original intent as possible.

Return ONLY valid JSON matching the PageFixOutput schema. No explanations.`,
    
    user: `## ORIGINAL OUTPUT (with problems)

\`\`\`json
${originalOutput}
\`\`\`

## VALIDATION ERRORS TO FIX

${validationErrors.map(e => `- [${e.code}] ${e.message}`).join('\n')}

## YOUR TASK

Fix these issues and return corrected JSON only.`,
  };
}

// ============================================================================
// EXPORT DEFAULT GUARDRAILS
// ============================================================================

export const DEFAULT_GUARDRAILS: PageFixRequest['guardrails'] = {
  prohibitedPhrases: [
    'award-winning',
    'industry-leading',
    'best in class',
    'world-class',
    'cutting-edge',
    'synergy',
    'leverage',
    'in today\'s digital age',
    'look no further',
    'one-stop shop',
    'game-changing',
    'revolutionary',
  ],
  requireVerifiableClaims: true,
  allowOutboundLinks: false,
  maxKeywordDensity: 0.02, // 2%
  preserveImagePositions: true,
  preserveExistingLinks: true,
};

export const DEFAULT_VOICE_PROFILE: PageFixRequest['voiceProfile'] = {
  id: 'default',
  name: 'Balanced Professional',
  formality: 'neutral',
  confidence: 'confident',
  humourLevel: 'subtle',
  sentenceLengthBias: 'mixed',
  tabooWords: [],
  persuasionLevel: 'medium',
  ctaStyle: 'soft',
};
