// ============================================================================
// VISION FACTS BINDER
// ============================================================================
// Injects vision-derived facts into the article output.
// Ensures real photographic evidence is woven into the content.
// ============================================================================

import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import type { WordPressOutput, WPBlock } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface BindVisionFactsInput {
  output: WordPressOutput;
  visionFacts: string[];
  openaiApiKey?: string;
}

export interface BindVisionFactsResult {
  output: WordPressOutput;
  factsInjected: number;
  sectionsAdded: string[];
}

// ============================================================================
// PROMPT LOADER
// ============================================================================

function loadPrompt(): string {
  const promptPath = path.join(__dirname, '..', 'prompts', 'vision-binder.prompt.md');
  try {
    return fs.readFileSync(promptPath, 'utf8');
  } catch {
    return getInlinePrompt();
  }
}

function getInlinePrompt(): string {
  return `You are injecting visionFacts into a WordPressOutput JSON.
Add ONE H2 section titled "What We've Seen in Practice" with the facts.
Also include at least ONE fact in an FAQ answer.
Use phrases like "In practice, we've observed..." or "From recent site visits...".
DO NOT change numbers/dates. DO NOT invent facts. Preserve all internal links.
Never output empty core/image blocks.
Return ONLY the updated WordPressOutput JSON.`;
}

// ============================================================================
// EVIDENCE MARKER PHRASES
// ============================================================================

export const EVIDENCE_MARKERS = [
  'in practice',
  'from the visuals',
  'we often see',
  'from recent site visits',
  'on the ground',
  'based on local inspections',
  'we\'ve observed',
  'during recent work',
  'from our experience on-site',
] as const;

// ============================================================================
// MAIN BINDER
// ============================================================================

export async function bindVisionFacts(
  input: BindVisionFactsInput
): Promise<BindVisionFactsResult> {
  const { output, visionFacts, openaiApiKey } = input;

  // If no vision facts, return unchanged
  if (!visionFacts || visionFacts.length === 0) {
    return {
      output,
      factsInjected: 0,
      sectionsAdded: [],
    };
  }

  console.log('[VisionBinder] Binding', visionFacts.length, 'vision facts');

  const openai = new OpenAI({
    apiKey: openaiApiKey || process.env.OPENAI_API_KEY,
  });

  const promptTemplate = loadPrompt();
  
  const prompt = `${promptTemplate}

### VISION FACTS
${JSON.stringify(visionFacts, null, 2)}

### CURRENT OUTPUT
${JSON.stringify(output, null, 2)}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a content editor. Return only valid JSON. No markdown wrapping.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const updatedOutput = JSON.parse(content) as WordPressOutput;
    
    // Validate the output
    const validation = validateVisionBinding(updatedOutput, visionFacts);
    
    console.log('[VisionBinder] Injected', validation.factsFound, 'of', visionFacts.length, 'facts');

    return {
      output: updatedOutput,
      factsInjected: validation.factsFound,
      sectionsAdded: validation.evidenceSections,
    };
  } catch (error) {
    console.error('[VisionBinder] Error binding vision facts:', error);
    
    // Fallback: manually inject a simple evidence section
    return fallbackInjection(output, visionFacts);
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateVisionBinding(
  output: WordPressOutput,
  visionFacts: string[]
): {
  valid: boolean;
  factsFound: number;
  evidenceSections: string[];
  hasEvidenceMarker: boolean;
} {
  const outputText = extractAllText(output);
  const lowerText = outputText.toLowerCase();
  
  // Count how many facts are present
  let factsFound = 0;
  for (const fact of visionFacts) {
    // Check for substring match (allow minor variations)
    const factWords = fact.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const matchedWords = factWords.filter(word => lowerText.includes(word));
    if (matchedWords.length >= Math.ceil(factWords.length * 0.6)) {
      factsFound++;
    }
  }

  // Check for evidence sections
  const evidenceSections: string[] = [];
  const evidenceHeadings = [
    'what we\'ve seen in practice',
    'local evidence',
    'from our experience',
    'on-site observations',
  ];
  
  for (const heading of evidenceHeadings) {
    if (lowerText.includes(heading)) {
      evidenceSections.push(heading);
    }
  }

  // Check for evidence marker phrases
  const hasEvidenceMarker = EVIDENCE_MARKERS.some(marker => 
    lowerText.includes(marker.toLowerCase())
  );

  // Determine if valid
  const minFactsRequired = Math.min(3, visionFacts.length);
  const valid = factsFound >= minFactsRequired && hasEvidenceMarker;

  return {
    valid,
    factsFound,
    evidenceSections,
    hasEvidenceMarker,
  };
}

function extractAllText(output: WordPressOutput): string {
  const texts: string[] = [];
  
  // Extract from blocks
  if (output.blocks) {
    for (const block of output.blocks) {
      if (block.innerHTML) {
        texts.push(stripHtml(block.innerHTML));
      }
      if (block.innerBlocks) {
        for (const inner of block.innerBlocks) {
          if (inner.innerHTML) {
            texts.push(stripHtml(inner.innerHTML));
          }
        }
      }
    }
  }

  // Extract from SEO
  if (output.seo) {
    if (output.seo.metaDescription) texts.push(output.seo.metaDescription);
    if (output.seo.seoTitle) texts.push(output.seo.seoTitle);
  }

  return texts.join(' ');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// FALLBACK INJECTION
// ============================================================================

function fallbackInjection(
  output: WordPressOutput,
  visionFacts: string[]
): BindVisionFactsResult {
  // Create a simple evidence section
  const factsFormatted = visionFacts
    .map((fact, i) => `${i + 1}. ${fact}`)
    .join(' ');

  const evidenceBlock: WPBlock = {
    blockName: 'core/group',
    attrs: {},
    innerBlocks: [
      {
        blockName: 'core/heading',
        attrs: { level: 2 },
        innerHTML: 'What We\'ve Seen in Practice',
        innerContent: ['What We\'ve Seen in Practice'],
      },
      {
        blockName: 'core/paragraph',
        attrs: {},
        innerHTML: `<p>From recent site visits and inspections in the local area, we've observed some consistent patterns that are worth noting: ${factsFormatted}</p>`,
        innerContent: [`<p>From recent site visits and inspections in the local area, we've observed some consistent patterns that are worth noting: ${factsFormatted}</p>`],
      },
    ],
    innerHTML: '',
    innerContent: [],
  };

  // Find where to insert (before FAQs if present, otherwise near end)
  const blocks = [...(output.blocks || [])];
  let insertIndex = blocks.length - 1;
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block && block.innerHTML?.toLowerCase().includes('frequently asked') ||
        block && block.innerHTML?.toLowerCase().includes('faq')) {
      insertIndex = i;
      break;
    }
  }

  blocks.splice(insertIndex, 0, evidenceBlock);

  return {
    output: {
      ...output,
      blocks,
    },
    factsInjected: visionFacts.length,
    sectionsAdded: ['What We\'ve Seen in Practice'],
  };
}

// ============================================================================
// EXTRACT VISION FACTS FROM EVIDENCE PACK
// ============================================================================

export function extractVisionFactsFromPack(
  evidencePack: {
    images?: Array<{
      evidence?: {
        sceneSummary?: string;
        storyAngles?: Array<{ hook?: string }>;
        suggestedKeywords?: string[];
      };
    }>;
    combinedNarrative?: string;
    crossImageThemes?: string[];
  }
): string[] {
  const facts: string[] = [];

  // Extract from combined narrative
  if (evidencePack.combinedNarrative) {
    facts.push(evidencePack.combinedNarrative);
  }

  // Extract from cross-image themes
  if (evidencePack.crossImageThemes) {
    for (const theme of evidencePack.crossImageThemes) {
      if (theme.length > 20) {
        facts.push(theme);
      }
    }
  }

  // Extract from individual image evidence
  if (evidencePack.images) {
    for (const img of evidencePack.images) {
      if (img.evidence?.sceneSummary) {
        facts.push(img.evidence.sceneSummary);
      }
      if (img.evidence?.storyAngles) {
        for (const angle of img.evidence.storyAngles) {
          if (angle.hook) {
            facts.push(angle.hook);
          }
        }
      }
    }
  }

  // Deduplicate and limit
  const unique = [...new Set(facts)];
  return unique.slice(0, 10); // Max 10 facts
}
