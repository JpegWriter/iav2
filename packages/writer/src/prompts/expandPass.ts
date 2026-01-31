// ============================================================================
// EXPAND PASS PROMPT
// ============================================================================
// This prompt is used when an article fails minimum length requirements.
// It takes the original output and expands it to meet authority content standards.
// ============================================================================

export interface ExpandPassContext {
  originalBlocks: any[];
  originalWordCount: number;
  targetWordCount: number;
  intentMode: 'MONEY' | 'SERVICE' | 'INFORMATIONAL' | 'TRUST';
  visionAnalysis?: any;
  sitemapContext?: any;
  businessName?: string;
  primaryService?: string;
  location?: string;
}

export function buildExpandPassPrompt(context: ExpandPassContext): string {
  const {
    originalBlocks,
    originalWordCount,
    targetWordCount,
    intentMode,
    visionAnalysis,
    sitemapContext,
    businessName,
    primaryService,
    location,
  } = context;

  const visionSection = visionAnalysis 
    ? `
## VISION ANALYSIS (Use as evidence)
${JSON.stringify(visionAnalysis, null, 2)}

When expanding, reference visual observations using phrases like:
- "From the images provided..."
- "The visual evidence suggests..."
- "Our analysis reveals..."
`
    : '';

  const sitemapSection = sitemapContext
    ? `
## SITEMAP CONTEXT (For internal linking context)
Consider these related pages when expanding:
${JSON.stringify(sitemapContext, null, 2)}
`
    : '';

  return `
# ARTICLE EXPANSION TASK

You are upgrading an existing article that is too short to meet authority content standards.

## CURRENT STATE
- Current word count: ${originalWordCount} words
- Required word count: ${targetWordCount} words (minimum)
- Gap to fill: ${targetWordCount - originalWordCount} words

## BUSINESS CONTEXT
- Business: ${businessName || 'Local Business'}
- Service: ${primaryService || 'Services'}
- Location: ${location || 'Local Area'}

## INTENT MODE: ${intentMode}
${getIntentExpansionGuidance(intentMode)}

${visionSection}
${sitemapSection}

## ORIGINAL CONTENT
\`\`\`json
${JSON.stringify(originalBlocks, null, 2)}
\`\`\`

## EXPANSION REQUIREMENTS

You MUST:
1. Preserve ALL existing headings and their order
2. Expand each H2 section to 250-350 words using:
   - Real-world reasoning and experience-based insights
   - Vision analysis references where available
   - Local/contextual relevance
   - Trade-offs and considerations
3. Add ONE decision-support section (checklist or comparison table)
4. Expand FAQ answers to 80-120 words each (quotable, self-contained)
5. Preserve WordPress block structure exactly
6. Preserve all internal links exactly

You MUST NOT:
- Add image blocks unless a valid asset or PLACEHOLDER is provided
- Remove any internal links
- Change the fundamental structure
- Invent statistics or testimonials
- Add promotional language

## OUTPUT FORMAT

Return a JSON object with this structure:
{
  "title": "Same title",
  "slug": "same-slug",
  "excerpt": "Updated if needed",
  "blocks": [
    // Expanded WordPress blocks
  ],
  "wordCount": // New word count (must be >= ${targetWordCount})
}

## EXPANSION STRATEGY

For each section:
1. Read the existing content
2. Identify what's missing:
   - HOW does this work in practice?
   - WHAT should the reader consider?
   - WHY does this matter?
   - WHEN does this apply vs not apply?
3. Add 150-200 words of substantive depth
4. Ensure paragraphs stay under 120 words each

Expand the article now:`;
}

function getIntentExpansionGuidance(intentMode: string): string {
  switch (intentMode) {
    case 'MONEY':
      return `Expand with:
- Outcome clarity (what will they get?)
- Suitability guidance (who is this for/not for?)
- Risk reduction (what protects them?)
- Decision criteria (how to choose?)`;
    
    case 'SERVICE':
      return `Expand with:
- Process explanation (step by step)
- Scope clarity (what's included/excluded)
- Timeline expectations
- Variation handling (custom requests)`;
    
    case 'INFORMATIONAL':
      return `Expand with:
- Mechanism explanation (how does this work?)
- Pattern identification (what trends apply?)
- Cause and effect reasoning
- Practical implications`;
    
    case 'TRUST':
      return `Expand with:
- Transparency (how do we operate?)
- Safeguards (what protects clients?)
- Background context (why this approach?)
- Concern acknowledgment`;
    
    default:
      return 'Expand with substantive, experience-based reasoning.';
  }
}
