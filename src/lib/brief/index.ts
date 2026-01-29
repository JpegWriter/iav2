import type { Page, Bead, ReviewTheme, UserContext, FixItem, Brief } from '@/types';

export interface BriefGeneratorInput {
  page: Page;
  userContext: UserContext;
  beads: Bead[];
  reviewThemes: ReviewTheme[];
  fixItems: FixItem[];
  internalLinksToAdd: string[];
}

export interface GeneratedBrief {
  humanBriefMd: string;
  gptBriefMd: string;
  inputsNeeded: {
    images: number;
    notes: string[];
  };
  beadsToInclude: string[];
  internalLinksToAdd: string[];
  reviewThemesToUse: string[];
}

// Simple brief output for the crawl integration
export interface SimpleBriefOutput {
  humanBrief: string;
  gptBrief: string;
  inputsNeeded: {
    images: number;
    notes: string[];
  };
}

// ============================================================================
// SIMPLIFIED BRIEF GENERATOR (for crawl integration)
// ============================================================================

export function generateBriefs(
  pageData: {
    url: string;
    title: string;
    h1: string;
    role: string;
    wordCount: number;
    cleanedText?: string;
  },
  fixItems: Array<{
    title: string;
    severity: string;
    category: string;
    fixActions: string[];
  }>,
  businessContext: {
    businessName: string;
    industry: string;
    services: string[];
    brandVoice: string;
    primaryCTA: string;
    locations: string[];
  },
  beads: Array<{
    type: string;
    label: string;
    value: string;
    priority: number;
  }>
): SimpleBriefOutput {
  const roleLabel = pageData.role.charAt(0).toUpperCase() + pageData.role.slice(1);
  const criticalFixes = fixItems.filter(f => f.severity === 'critical');
  const warningFixes = fixItems.filter(f => f.severity === 'warning');
  const sortedBeads = [...beads].sort((a, b) => b.priority - a.priority).slice(0, 5);
  
  // Generate Human Brief
  let humanBrief = `# Assignment: Improve ${roleLabel} Page

**URL:** ${pageData.url}
**Page Role:** ${roleLabel}
**Current Title:** ${pageData.title || '[Missing]'}
**Current H1:** ${pageData.h1 || '[Missing]'}
**Word Count:** ${pageData.wordCount}

---

## Goal
${getPageIntent(pageData.role)} → ${businessContext.primaryCTA}

## Target Audience
${businessContext.industry ? `Industry: ${businessContext.industry}` : 'General audience'}
${businessContext.locations.length > 0 ? `Location focus: ${businessContext.locations.join(', ')}` : ''}

---

## 🔴 Issues to Fix (Priority Order)

`;

  if (criticalFixes.length > 0) {
    humanBrief += `### Critical Issues\n`;
    criticalFixes.forEach((fix, i) => {
      humanBrief += `${i + 1}. **${fix.title}**\n`;
      fix.fixActions.forEach(action => {
        humanBrief += `   - ${action}\n`;
      });
      humanBrief += `\n`;
    });
  }

  if (warningFixes.length > 0) {
    humanBrief += `### Warnings\n`;
    warningFixes.forEach((fix, i) => {
      humanBrief += `${i + 1}. **${fix.title}**\n`;
      fix.fixActions.forEach(action => {
        humanBrief += `   - ${action}\n`;
      });
      humanBrief += `\n`;
    });
  }

  if (criticalFixes.length === 0 && warningFixes.length === 0) {
    humanBrief += `✅ No critical issues. Page is in good shape!\n\n`;
  }

  humanBrief += `---

## 💎 Beads to Include (Trust Signals)

`;

  if (sortedBeads.length > 0) {
    sortedBeads.forEach(bead => {
      humanBrief += `- **[${bead.type.toUpperCase()}]** ${bead.value}\n`;
    });
  } else {
    humanBrief += `_No beads defined. Add proof points, awards, or differentiators in Settings._\n`;
  }

  humanBrief += `
---

## ✅ Acceptance Criteria

- [ ] Unique SEO title (50-60 characters)
- [ ] Unique H1 heading
- [ ] Meta description (150-160 characters)
- [ ] Clear CTA above the fold: "${businessContext.primaryCTA}"
- [ ] Scannable content with proper heading structure
- [ ] At least ${pageData.role === 'money' ? '3' : '2'} proof beads visible
- [ ] Direct answers section for AI search

---

## 📷 Inputs Needed

`;

  const imageNeeds = getNeededImages(pageData.role);
  humanBrief += `**Images (${imageNeeds.count}):** ${imageNeeds.types.join(', ')}\n`;

  // Generate GPT Brief
  let gptBrief = `### SYSTEM CONTEXT
You are writing for a real business. Be precise, clear, and conversion-focused.
Respect all constraints. Do not invent reviews, awards, numbers, or locations.

### PAGE DATA
URL: ${pageData.url}
Role: ${pageData.role}
PrimaryIntent: ${getPageIntent(pageData.role)}
PrimaryCTA: ${businessContext.primaryCTA}
Language: en

### BUSINESS CONTEXT
- Business: ${businessContext.businessName || 'Not specified'}
- Industry: ${businessContext.industry || 'Not specified'}
- Services: ${businessContext.services.join(', ') || 'Not specified'}
- Locations: ${businessContext.locations.join(', ') || 'Not specified'}
- Brand Voice: ${businessContext.brandVoice || 'Professional, clear, confident'}

### BEADS (Truth atoms — use verbatim)
${sortedBeads.length > 0 
  ? sortedBeads.map(b => `- [${b.type}] ${b.value}`).join('\n')
  : 'No beads defined.'}

### CURRENT PAGE SOURCE
Title: ${pageData.title || '[Missing]'}
H1: ${pageData.h1 || '[Missing]'}
Word Count: ${pageData.wordCount}

${pageData.cleanedText ? `Content Preview:\n${pageData.cleanedText.slice(0, 2000)}${pageData.cleanedText.length > 2000 ? '\n[...truncated...]' : ''}` : ''}

### FAILURES TO FIX
${fixItems.map(f => `- [${f.severity.toUpperCase()}] ${f.title}`).join('\n') || 'No critical issues.'}

### REQUIRED OUTPUTS
1) SEO Title (max ~60 chars)
2) Meta description (max ~155 chars)
3) H1
4) H2/H3 outline
5) Full rewritten page copy (scannable, short paragraphs)
6) Suggested internal links (3–7) using descriptive anchor text
7) Suggested schema types (if relevant)

### RULES
- Do not change the offer facts
- Use beads verbatim only
- Add a short "direct answers" section for AEO/GEO readiness
- Keep tone: ${businessContext.brandVoice || 'professional and clear'}
- Use short paragraphs and bullet points for scannability
`;

  const neededNotes: string[] = [];
  if (pageData.role === 'money') {
    neededNotes.push('Pricing information or "starting from" price');
    if (businessContext.locations.length === 0) {
      neededNotes.push('Service area / locations covered');
    }
  }
  if (pageData.role === 'trust') {
    neededNotes.push('Founder/team story or key milestones');
  }

  return {
    humanBrief,
    gptBrief,
    inputsNeeded: {
      images: imageNeeds.count,
      notes: neededNotes,
    },
  };
}

// ============================================================================
// HUMAN BRIEF TEMPLATE
// ============================================================================

function generateHumanBrief(input: BriefGeneratorInput): string {
  const { page, userContext, beads, reviewThemes, fixItems, internalLinksToAdd } = input;
  
  const roleLabel = page.role.charAt(0).toUpperCase() + page.role.slice(1);
  const topBeads = beads.slice(0, 5);
  const topTheme = reviewThemes[0];
  const criticalFixes = fixItems.filter(f => f.severity === 'critical');
  const warningFixes = fixItems.filter(f => f.severity === 'warning');

  let brief = `# Assignment: Improve ${roleLabel} page (Priority ${page.priorityRank})

**URL:** ${page.url}
**Goal:** ${getPageIntent(page.role)} → ${userContext.business.primaryCTA}
**Audience:** ${userContext.audience.segments.join(', ') || 'General'}
**Location focus:** ${userContext.business.locations.join(', ') || 'Not specified'}

## What's broken (fix these first)
`;

  if (criticalFixes.length > 0) {
    criticalFixes.forEach((fix, i) => {
      brief += `${i + 1}) **[CRITICAL]** ${fix.title}: ${fix.description}\n`;
    });
  }

  if (warningFixes.length > 0) {
    warningFixes.forEach((fix, i) => {
      brief += `${criticalFixes.length + i + 1}) ${fix.title}: ${fix.description}\n`;
    });
  }

  if (criticalFixes.length === 0 && warningFixes.length === 0) {
    brief += `No critical issues found.\n`;
  }

  brief += `
## Must include (Beads)
`;

  if (topBeads.length > 0) {
    topBeads.forEach(bead => {
      const locations = bead.whereToUse.length > 0 
        ? ` (use in: ${bead.whereToUse.join(', ')})`
        : '';
      brief += `- **${bead.type}:** ${bead.value}${locations}\n`;
    });
  } else {
    brief += `- No beads defined. Add proof points, awards, or differentiators.\n`;
  }

  brief += `
## Must add
- Clear CTA above the fold: "${userContext.business.primaryCTA}"
`;

  if (topTheme) {
    brief += `- A proof block with reviews theme: "${topTheme.theme}"\n`;
  }

  if (internalLinksToAdd.length > 0) {
    brief += `- Internal links to: ${internalLinksToAdd.slice(0, 5).join(', ')}\n`;
  }

  const neededImages = getNeededImages(page.role);
  const neededNotes = getNeededNotes(page.role, userContext);

  brief += `
## Inputs needed from client
- **Images:** ${neededImages.count} (${neededImages.types.join(', ')})
`;

  if (neededNotes.length > 0) {
    neededNotes.forEach(note => {
      brief += `- **Note:** ${note}\n`;
    });
  }

  brief += `
## Acceptance criteria
- Unique SEO title + H1
- Page clearly answers: who / what / where / next step
- Scannable sections + direct answers block
- At least ${page.role === 'money' ? '3' : '2'} proof beads visible
- Clear CTA above the fold and repeated at bottom
`;

  return brief;
}

// ============================================================================
// GPT BRIEF TEMPLATE
// ============================================================================

function generateGptBrief(input: BriefGeneratorInput): string {
  const { page, userContext, beads, reviewThemes, fixItems, internalLinksToAdd } = input;

  const sortedBeads = [...beads].sort((a, b) => b.priority - a.priority);
  const failures = fixItems.map(f => ({
    severity: f.severity,
    category: f.category,
    title: f.title,
    description: f.description,
    fixActions: f.fixActions,
  }));

  const brief = `### SYSTEM CONTEXT
You are writing for a real business. Be precise, clear, and conversion-focused.
Respect all constraints. Do not invent reviews, awards, numbers, or locations.

### PAGE DATA
URL: ${page.url}
Role: ${page.role}
PriorityRank: ${page.priorityRank}
PrimaryIntent: ${getPageIntent(page.role)}
PrimaryCTA: ${userContext.business.primaryCTA}
Language: ${page.lang || userContext.business.languages[0] || 'en'}

### BUSINESS CONTEXT
\`\`\`json
${JSON.stringify({
  business: userContext.business,
  offers: userContext.offers,
  audience: userContext.audience,
  brandVoice: userContext.brandVoice,
  compliance: userContext.compliance,
}, null, 2)}
\`\`\`

### BEADS (Truth atoms — must use where specified)
\`\`\`json
${JSON.stringify(sortedBeads.slice(0, 10).map(b => ({
  type: b.type,
  label: b.label,
  value: b.value,
  whereToUse: b.whereToUse,
  allowedParaphrases: b.claimsPolicy.allowedParaphrases,
})), null, 2)}
\`\`\`

### REVIEW THEMES (Use as messaging angles, no fabrication)
\`\`\`json
${JSON.stringify(reviewThemes.slice(0, 5).map(t => ({
  theme: t.theme,
  count: t.count,
  snippets: t.supportingSnippets.slice(0, 2),
})), null, 2)}
\`\`\`

### CURRENT PAGE SOURCE (for reference)
Title: ${page.title || '[Missing]'}
H1: ${page.h1 || '[Missing]'}
ExtractedText:
${(page.cleanedText || '').slice(0, 3000)}
${page.cleanedText && page.cleanedText.length > 3000 ? '\n[...content truncated...]' : ''}

### FAILURES TO FIX (deterministic audit + AI notes)
\`\`\`json
${JSON.stringify(failures, null, 2)}
\`\`\`

### INTERNAL LINKS TO ADD
${internalLinksToAdd.length > 0 ? internalLinksToAdd.map(l => `- ${l}`).join('\n') : 'No specific links required.'}

### REQUIRED OUTPUTS
1) SEO Title (max ~60 chars)
2) Meta description (max ~155 chars)
3) H1
4) H2/H3 outline
5) Full rewritten page copy (scannable, short paragraphs)
6) Suggested internal links (3–7) using descriptive anchor text
7) Suggested schema types (if relevant)

### RULES
- Do not change the offer facts.
- Use beads verbatim or approved paraphrases only.
- Add a short "direct answers" section for AEO/GEO readiness.
- Keep tone: ${userContext.brandVoice.tone.join(', ')} and follow: ${userContext.brandVoice.styleRules.join('; ')}.
- NEVER use: ${userContext.brandVoice.avoid.join(', ')}
- Compliance: ${userContext.compliance.doNotSay.length > 0 ? `Do NOT say: ${userContext.compliance.doNotSay.join(', ')}` : 'No specific restrictions'}
`;

  return brief;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getPageIntent(role: string): string {
  const intents: Record<string, string> = {
    money: 'Convert visitors into leads/customers',
    trust: 'Build credibility and reduce purchase anxiety',
    authority: 'Demonstrate expertise and attract organic traffic',
    support: 'Answer questions and support the buyer journey',
  };
  return intents[role] || intents.support;
}

function getNeededImages(role: string): { count: number; types: string[] } {
  const imageNeeds: Record<string, { count: number; types: string[] }> = {
    money: {
      count: 3,
      types: ['Hero image', 'Team/process photo', 'Trust badges or proof'],
    },
    trust: {
      count: 4,
      types: ['Team photo', 'Office/workspace', 'Client logos', 'Awards/certificates'],
    },
    authority: {
      count: 2,
      types: ['Featured image', 'Supporting infographic or photo'],
    },
    support: {
      count: 1,
      types: ['Relevant illustration or photo'],
    },
  };
  return imageNeeds[role] || imageNeeds.support;
}

function getNeededNotes(role: string, context: UserContext): string[] {
  const notes: string[] = [];

  if (role === 'money') {
    if (!context.offers.startingFrom) {
      notes.push('Pricing information or "starting from" price');
    }
    if (context.business.locations.length === 0) {
      notes.push('Service area / locations covered');
    }
  }

  if (role === 'trust') {
    notes.push('Founder/team story or key milestones');
  }

  if (context.audience.segments.length === 0) {
    notes.push('Target audience details');
  }

  return notes;
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export function generateBrief(input: BriefGeneratorInput): GeneratedBrief {
  const humanBriefMd = generateHumanBrief(input);
  const gptBriefMd = generateGptBrief(input);

  const neededImages = getNeededImages(input.page.role);
  const neededNotes = getNeededNotes(input.page.role, input.userContext);

  // Select beads to include (top priority ones relevant to this page role)
  const relevantBeads = input.beads.filter(b => {
    if (b.whereToUse.length === 0) return true;
    return b.whereToUse.some(location => 
      location.toLowerCase().includes(input.page.role) ||
      location.toLowerCase().includes('hero') ||
      location.toLowerCase().includes('all')
    );
  });

  const beadsToInclude = relevantBeads
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map(b => b.id);

  const reviewThemesToUse = input.reviewThemes
    .slice(0, 3)
    .map(t => t.theme);

  return {
    humanBriefMd,
    gptBriefMd,
    inputsNeeded: {
      images: neededImages.count,
      notes: neededNotes,
    },
    beadsToInclude,
    internalLinksToAdd: input.internalLinksToAdd,
    reviewThemesToUse,
  };
}

// ============================================================================
// CHANNEL RENDERERS
// ============================================================================

export interface ChannelContent {
  wp: {
    title: string;
    slug: string;
    excerpt: string;
    contentHtml: string;
    seo: {
      metaDescription: string;
      focusKeyword: string;
    };
  };
  gmb: {
    summary: string;
    callToAction: string;
  };
  li: {
    postText: string;
    hashtags: string[];
  };
}

export function renderForWordPress(
  content: string,
  page: Page,
  context: UserContext
): ChannelContent['wp'] {
  // This would be called after AI generates the content
  // For now, return a template structure
  return {
    title: page.title || '',
    slug: page.path.replace(/^\//, '').replace(/\//g, '-') || 'page',
    excerpt: page.metaDescription || '',
    contentHtml: content,
    seo: {
      metaDescription: page.metaDescription || '',
      focusKeyword: '',
    },
  };
}

export function renderForGMB(
  page: Page,
  context: UserContext,
  beads: Bead[]
): ChannelContent['gmb'] {
  const proofBead = beads.find(b => b.type === 'proof');
  const location = context.business.locations[0] || '';

  const summary = `${context.business.name} in ${location}. ${proofBead?.value || ''} ${context.business.primaryCTA}`;

  return {
    summary: summary.slice(0, 150),
    callToAction: 'BOOK',
  };
}

export function renderForLinkedIn(
  page: Page,
  context: UserContext,
  beads: Bead[],
  reviewThemes: ReviewTheme[]
): ChannelContent['li'] {
  const proofBead = beads.find(b => b.type === 'proof');
  const theme = reviewThemes[0];

  let postText = `We just updated our ${page.role} page.\n\n`;
  
  if (theme) {
    postText += `Our clients keep telling us: "${theme.supportingSnippets[0] || theme.theme}"\n\n`;
  }
  
  if (proofBead) {
    postText += `${proofBead.value}\n\n`;
  }
  
  postText += `Check it out: ${page.url}`;

  const hashtags = [
    `#${context.business.niche?.replace(/\s+/g, '') || 'business'}`,
    ...context.business.locations.slice(0, 2).map(l => `#${l.replace(/\s+/g, '')}`),
  ];

  return {
    postText: postText.slice(0, 250),
    hashtags,
  };
}
