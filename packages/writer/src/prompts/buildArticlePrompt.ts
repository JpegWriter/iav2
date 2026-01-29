// ============================================================================
// ARTICLE PROMPT BUILDER
// ============================================================================
// Builds the main WordPress article generation prompt.
// Outputs strict JSON schema matching WordPressOutput type.
// ============================================================================

import type {
  ContextPack,
  WriterPlan,
  WriterTask,
  WPBlock,
  BrandToneProfile,
  SectionPlan,
} from '../types';
import { getToneInstructions } from '../tones/profiles';

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const OUTPUT_SCHEMA = `{
  "title": "string - The H1 title for the page (60-70 chars ideal)",
  "slug": "string - URL-friendly slug derived from title",
  "excerpt": "string - 155 char summary for post excerpt",
  "blocks": [
    {
      "blockName": "string - e.g., core/paragraph, core/heading, core/list, core/table, core/image, core/buttons, core/quote, core/group",
      "attrs": { "level": 2 },  // For headings
      "innerHTML": "string - The HTML content",
      "innerBlocks": []  // For nested blocks like groups
    }
  ],
  "seo": {
    "seoTitle": "string - 50-60 chars with keyphrase near start",
    "metaDescription": "string - 150-160 chars with keyphrase and CTA",
    "focusKeyphrase": "string - 1-4 word target phrase",
    "secondaryKeyphrases": ["string"],
    "canonicalUrl": "string or null",
    "schema": {} // Optional JSON-LD schema
  },
  "images": {
    "hero": {
      "assetRef": "string - Reference to existing image or PLACEHOLDER:description",
      "alt": "string - Descriptive alt text with keyphrase if natural",
      "caption": "string - Optional caption",
      "title": "string - SEO-friendly title attribute",
      "suggestedFilename": "string - descriptive-filename.jpg"
    },
    "inline": [
      {
        "assetRef": "string",
        "alt": "string",
        "caption": "string",
        "title": "string",
        "suggestedFilename": "string",
        "placementHint": "string - After which section/paragraph"
      }
    ]
  },
  "internalLinksUsed": [
    {
      "url": "string - The internal page URL",
      "anchorText": "string - The link text",
      "context": "string - Why this link is relevant"
    }
  ]
}`;

// ============================================================================
// BLOCK TYPE INSTRUCTIONS
// ============================================================================

const BLOCK_INSTRUCTIONS = `
## WORDPRESS BLOCK FORMATS

Use ONLY these block types:

### core/paragraph
{
  "blockName": "core/paragraph",
  "attrs": {},
  "innerHTML": "<p>Your paragraph text with <strong>bold</strong> and <a href=\"...\">links</a>.</p>",
  "innerBlocks": []
}

### core/heading (H2-H4 only, never H1)
{
  "blockName": "core/heading",
  "attrs": { "level": 2 },
  "innerHTML": "<h2>Your Section Title</h2>",
  "innerBlocks": []
}

### core/list
{
  "blockName": "core/list",
  "attrs": { "ordered": false },
  "innerHTML": "<ul><li>Item one</li><li>Item two</li></ul>",
  "innerBlocks": []
}

### core/image
{
  "blockName": "core/image",
  "attrs": { 
    "sizeSlug": "large",
    "linkDestination": "none"
  },
  "innerHTML": "<figure class=\\"wp-block-image size-large\\"><img src=\\"PLACEHOLDER:description\\" alt=\\"Alt text\\"/><figcaption>Optional caption</figcaption></figure>",
  "innerBlocks": []
}

### core/table
{
  "blockName": "core/table",
  "attrs": {},
  "innerHTML": "<figure class=\\"wp-block-table\\"><table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table></figure>",
  "innerBlocks": []
}

### core/buttons (for CTAs)
{
  "blockName": "core/buttons",
  "attrs": {},
  "innerHTML": "",
  "innerBlocks": [
    {
      "blockName": "core/button",
      "attrs": { "className": "is-style-fill" },
      "innerHTML": "<div class=\\"wp-block-button\\"><a class=\\"wp-block-button__link\\" href=\\"/contact\\">Get Started Today</a></div>",
      "innerBlocks": []
    }
  ]
}

### core/quote
{
  "blockName": "core/quote",
  "attrs": {},
  "innerHTML": "<blockquote class=\\"wp-block-quote\\"><p>Quote text here.</p><cite>Attribution</cite></blockquote>",
  "innerBlocks": []
}

NEVER use: core/html, core/freeform, raw HTML outside blocks, inline styles with position/z-index, script tags.
`;

// ============================================================================
// MAIN PROMPT BUILDER
// ============================================================================

export function buildArticlePrompt(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile
): string {
  const toneInstructions = getToneInstructions(tone);

  // Build context sections
  const businessContext = buildBusinessContext(contextPack);
  const proofContext = buildProofContext(contextPack);
  const visionContext = buildVisionContext(contextPack);
  const planContext = buildPlanContext(plan);
  const constraintContext = buildConstraints(task);
  const linkContext = buildLinkContext(task);

  return `# ROLE
You are an expert SEO content writer creating a WordPress article. You understand E-E-A-T principles, user intent matching, and conversion optimization.

# TASK
Create a complete WordPress article for: "${plan.h1 || task.primaryService}"

Page Role: ${task.role.toUpperCase()} page
Page Intent: ${task.intent}
Primary Service/Topic: ${task.primaryService}

# TONE & VOICE
${toneInstructions.join('\n')}

# BUSINESS CONTEXT
${businessContext}

# AVAILABLE PROOF & EVIDENCE
${proofContext}

# AVAILABLE IMAGES
${visionContext}

# ARTICLE STRUCTURE (Follow This Outline)
${planContext}

# INTERNAL LINKING REQUIREMENTS
${linkContext}

# CONSTRAINTS
${constraintContext}

${BLOCK_INSTRUCTIONS}

# CRITICAL RULES

1. **NO GENERIC CONTENT**: Every claim must reference specific business details, locations, or proof elements from the context.

2. **E-E-A-T SIGNALS**: Weave in expertise indicators, credentials, experience, and trust signals naturally.

3. **IMAGE REFERENCES**: Use exact asset references from Available Images. For missing images, use PLACEHOLDER:detailed-description format.

4. **INTERNAL LINKS**: Use natural anchor text that describes the destination page. Include ALL required uplinks.

5. **CTA PLACEMENT**: Place CTA buttons at positions indicated in the plan. Make CTAs action-specific, not generic.

6. **KEYPHRASE USAGE**: Include focus keyphrase in:
   - First paragraph
   - At least one H2
   - Meta description
   - Image alt text (if natural)
   - 2-4 more times naturally throughout

7. **PARAGRAPH LENGTH**: Keep paragraphs under 150 words. Break up long sections.

8. **NO ASSUMPTIONS**: If you don't have specific information, don't invent it. Use what's provided.

# OUTPUT FORMAT
Return ONLY valid JSON matching this schema:
${OUTPUT_SCHEMA}

Generate the complete article now:`;
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

function buildBusinessContext(contextPack: ContextPack): string {
  const sections: string[] = [];

  // Business reality
  const biz = contextPack.businessReality;
  if (biz) {
    sections.push(`## Business Profile
- Business Name: ${biz.name || 'N/A'}
- Services: ${biz.services?.join(', ') || 'N/A'}
- Target Audience: ${biz.targetAudience || 'N/A'}
- Differentiators: ${biz.differentiators?.join(', ') || 'N/A'}
- Brand Beads: ${biz.beadsSummary || 'N/A'}`);
  }

  // Local signals
  const local = contextPack.localSignals;
  if (local) {
    sections.push(`## Local Context
- Locations: ${local.locations?.join(', ') || 'N/A'}
- Service Areas: ${local.serviceAreas?.join(', ') || 'N/A'}
- Local Phrasing: ${local.localPhrasing?.join(', ') || 'N/A'}`);
  }

  return sections.join('\n\n');
}

function buildProofContext(contextPack: ContextPack): string {
  const sections: string[] = [];
  const proof = contextPack.proofSummary;

  if (!proof) {
    return 'No proof elements available. Focus on demonstrable expertise and clear value propositions.';
  }

  // Review themes and quotes
  if (proof.reviewThemes && proof.reviewThemes.length > 0) {
    sections.push(`## Customer Review Themes`);
    for (const theme of proof.reviewThemes) {
      sections.push(`- ${theme}`);
    }
  }

  if (proof.topQuotes && proof.topQuotes.length > 0) {
    sections.push(`## Top Customer Quotes (Use for social proof)`);
    for (const quote of proof.topQuotes.slice(0, 5)) {
      sections.push(`- "${quote}"`);
    }
  }

  // Case study bullets
  if (proof.caseStudyBullets && proof.caseStudyBullets.length > 0) {
    sections.push(`## Case Study Highlights`);
    for (const bullet of proof.caseStudyBullets) {
      sections.push(`- ${bullet}`);
    }
  }

  // Credentials
  if (proof.credentialsList && proof.credentialsList.length > 0) {
    sections.push(`## Credentials & Certifications`);
    for (const cred of proof.credentialsList) {
      sections.push(`- ${cred}`);
    }
  }

  if (sections.length === 0) {
    return 'No proof elements available. Focus on demonstrable expertise and clear value propositions.';
  }

  return sections.join('\n\n');
}

function buildVisionContext(contextPack: ContextPack): string {
  const vision = contextPack.visionSummary;
  
  if (!vision || (vision.inlineCandidates.length === 0 && !vision.heroCandidate)) {
    return 'No existing images available. Use PLACEHOLDER:description format for all image references.';
  }

  const sections: string[] = ['## Available Images'];

  if (vision.heroCandidate) {
    const hero = vision.heroCandidate;
    sections.push(`
### Hero Image: ${hero.imageId}
- Description: ${hero.suggestedAlt || 'N/A'}
- Subjects: ${hero.tags?.join(', ') || 'N/A'}
- Caption: ${hero.suggestedCaption || 'N/A'}
- Intended Use: ${hero.intendedUse || 'hero'}`);
  }

  for (const img of vision.inlineCandidates) {
    sections.push(`
### ${img.imageId}
- Description: ${img.suggestedAlt || 'N/A'}
- Subjects: ${img.tags?.join(', ') || 'N/A'}
- Caption: ${img.suggestedCaption || 'N/A'}
- Intended Use: ${img.intendedUse || 'inline'}`);
  }

  if (vision.emotionalCues && vision.emotionalCues.length > 0) {
    sections.push(`
### Emotional Cues to Match
${vision.emotionalCues.join(', ')}`);
  }

  return sections.join('\n');
}

function buildPlanContext(plan: WriterPlan): string {
  const sections: string[] = [];

  sections.push(`## Article Outline

Title: ${plan.h1}
Word Count Target: ${plan.totalEstimatedWords} words
CTA Placement: ${plan.ctaPlacement}
`);

  if (plan.sections && plan.sections.length > 0) {
    sections.push('### Sections (Follow This Structure):');
    for (let i = 0; i < plan.sections.length; i++) {
      const section = plan.sections[i];
      const imageInfo = section.imageSlot 
        ? `Required: ${section.imageSlot.required}, Description: ${section.imageSlot.description}` 
        : 'Optional';
      const linkInfo = section.internalLinkSlot 
        ? `Link to: ${section.internalLinkSlot.targetUrl} with anchor "${section.internalLinkSlot.anchorText}"`
        : 'None specified';
      
      sections.push(`
${i + 1}. **${section.heading}** (H${section.level})
   - Intent: ${section.intent || 'N/A'}
   - Objection Addressed: ${section.objectionAddressed || 'N/A'}
   - Proof to Include: ${section.proofToInclude || 'N/A'}
   - Word Count: ~${section.estimatedWordCount || 150} words
   - Image: ${imageInfo}
   - Internal Link: ${linkInfo}
`);
    }
  }

  return sections.join('\n');
}

function buildConstraints(task: WriterTask): string {
  return `## Hard Constraints
- Maximum blocks: ${task.wordpress.maxBlocks}
- Maximum HTML bytes: ${task.wordpress.maxHtmlBytes}
- Maximum excerpt length: ${task.wordpress.excerptLength} characters
- Maximum table rows: ${task.wordpress.maxTableRows || 8}
- Maximum H2 count: ${task.wordpress.maxH2Count || 10}
- Required proof elements: ${task.requiredProofElements.join(', ') || 'None specified'}
- Required E-E-A-T signals: ${task.requiredEEATSignals.join(', ') || 'None specified'}

## Style Constraints
- No emoji in body text (buttons OK)
- No exclamation points in headings
- No buzzwords: ${['synergy', 'leverage', 'paradigm', 'holistic'].join(', ')}
- Contractions preferred for warmth
- Active voice preferred
`;
}

function buildLinkContext(task: WriterTask): string {
  const sections: string[] = [];

  if (task.internalLinks.upLinks.length > 0) {
    sections.push(`## REQUIRED Uplinks (Link TO these parent pages):`);
    for (const link of task.internalLinks.upLinks) {
      sections.push(`- ${link.targetUrl}: "${link.anchorSuggestion || 'relevant anchor text'}" (Required: ${link.required})`);
    }
  }

  if (task.internalLinks.downLinks.length > 0) {
    sections.push(`## Suggested Downlinks (Link FROM this page to children):`);
    for (const link of task.internalLinks.downLinks) {
      sections.push(`- ${link.targetUrl}: "${link.anchorSuggestion || 'relevant anchor text'}"`);
    }
  }

  if (task.internalLinks.requiredAnchors.length > 0) {
    sections.push(`## Required Anchor Texts (Must appear somewhere):`);
    for (const anchor of task.internalLinks.requiredAnchors) {
      sections.push(`- "${anchor}"`);
    }
  }

  if (sections.length === 0) {
    return 'No internal linking requirements specified.';
  }

  return sections.join('\n\n');
}

// ============================================================================
// REWRITE PROMPT (for editing existing content)
// ============================================================================

export function buildRewritePrompt(
  contextPack: ContextPack,
  plan: WriterPlan,
  task: WriterTask,
  tone: BrandToneProfile,
  existingBlocks: WPBlock[],
  instructions: string
): string {
  const basePrompt = buildArticlePrompt(contextPack, plan, task, tone);

  const existingContent = JSON.stringify(existingBlocks, null, 2);

  return `${basePrompt}

# EXISTING CONTENT (Rewrite based on instructions)
\`\`\`json
${existingContent}
\`\`\`

# REWRITE INSTRUCTIONS
${instructions}

Maintain the same structure where possible. Only change what's necessary to fulfill the rewrite instructions.`;
}

// ============================================================================
// SECTION EXPANSION PROMPT (for expanding a single section)
// ============================================================================

export function buildSectionPrompt(
  contextPack: ContextPack,
  section: SectionPlan,
  task: WriterTask,
  tone: BrandToneProfile
): string {
  const toneInstructions = getToneInstructions(tone);
  const proofContext = buildProofContext(contextPack);
  
  const imageInfo = section.imageSlot 
    ? `Required: ${section.imageSlot.required}, Description: ${section.imageSlot.description}` 
    : 'Optional';

  return `# ROLE
You are expanding a single section of a WordPress article.

# SECTION TO WRITE
Heading: ${section.heading}
Level: H${section.level}
Intent: ${section.intent || 'Inform and engage'}
Objection Addressed: ${section.objectionAddressed || 'N/A'}
Proof to Include: ${section.proofToInclude || 'N/A'}
Target Word Count: ${section.estimatedWordCount || 200} words
Image: ${imageInfo}

# TONE
${toneInstructions.join('\n')}

# AVAILABLE PROOF
${proofContext}

# CONSTRAINTS
- Return ONLY the blocks for this section (heading + content)
- Use natural transitions
- Include specific examples from proof elements
- Keep paragraphs under 150 words
- Use lists for 3+ items

# OUTPUT FORMAT
Return a JSON array of WPBlock objects for just this section.`;
}
