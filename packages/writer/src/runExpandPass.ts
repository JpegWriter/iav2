// ============================================================================
// RUN EXPAND PASS
// ============================================================================
// Takes an existing WordPressOutput JSON and expands it to authority spec.
// Called when initial generation fails length/EEAT validation.
// ============================================================================

export type IntentType = 'MONEY' | 'SERVICE' | 'INFORMATIONAL' | 'TRUST';

export type WPBlock = {
  blockName: string;
  attrs?: Record<string, any>;
  innerHTML: string;
  innerBlocks?: WPBlock[];
};

export type WordPressOutput = {
  title: string;
  slug: string;
  excerpt?: string;
  blocks: WPBlock[];
  seo?: Record<string, any>;
  images?: any;
  internalLinksUsed?: Array<{ url: string; anchorText: string; context?: string }>;
};

export type ExpandPassInput = {
  original: WordPressOutput;

  // Context inputs (whatever your system already collects)
  masterProfileContext?: any;
  sitemapContext?: any;
  onboardingContext?: any;
  visionAnalysisContext?: any;

  intent: IntentType;

  // Targets
  targetWordsMin: number; // e.g. 1500
  targetWordsMax: number; // e.g. 1800
  faqAnswerWordsMin: number; // e.g. 80
  faqAnswerWordsMax: number; // e.g. 120

  // Safety / limits
  maxHtmlBytes?: number;
  maxBlocks?: number;

  // Internal links must be preserved exactly
  requiredInternalLinks?: Array<{ url: string; anchorText?: string }>;
};

export type LLMClient = {
  generateJson: <T>(args: {
    system: string;
    prompt: string;
    schemaName?: string;
    temperature?: number;
  }) => Promise<T>;
};

// ============================================================================
// HELPERS
// ============================================================================

function safeStringify(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}

/**
 * Builds the EXPAND PASS prompt. Keep it deterministic and explicit.
 */
function buildExpandPrompt(input: ExpandPassInput, expandPromptTemplate: string): string {
  const {
    original,
    intent,
    targetWordsMin,
    targetWordsMax,
    faqAnswerWordsMin,
    faqAnswerWordsMax,
    masterProfileContext,
    sitemapContext,
    onboardingContext,
    visionAnalysisContext,
    requiredInternalLinks,
    maxBlocks,
    maxHtmlBytes,
  } = input;

  const ctx = stripUndefined({
    intent,
    targets: {
      words: { min: targetWordsMin, max: targetWordsMax },
      faqAnswerWords: { min: faqAnswerWordsMin, max: faqAnswerWordsMax },
      maxBlocks,
      maxHtmlBytes,
    },
    masterProfileContext,
    sitemapContext,
    onboardingContext,
    visionAnalysisContext,
    requiredInternalLinks,
  });

  return (
    expandPromptTemplate +
    '\n\n' +
    '### CONTEXT (JSON)\n' +
    safeStringify(ctx) +
    '\n\n' +
    '### CURRENT WORDPRESS OUTPUT (JSON)\n' +
    safeStringify(original)
  );
}

/**
 * Normalizes block structure so downstream validators don't choke:
 * - ensures innerBlocks exists
 * - avoids empty image blocks
 */
function normalizeBlocks(blocks: WPBlock[]): WPBlock[] {
  return blocks.map((b) => {
    const innerBlocks = Array.isArray(b.innerBlocks) ? normalizeBlocks(b.innerBlocks) : [];
    const attrs = b.attrs ?? {};

    // If an image block is present but invalid, remove it here (fail-safe).
    // The validator should still catch this, but this prevents "empty core/image" output.
    if (b.blockName === 'core/image') {
      const hasUrl = typeof attrs.url === 'string' && attrs.url.length > 0;
      const hasPlaceholder = typeof attrs.url === 'string' && attrs.url.startsWith('PLACEHOLDER:');
      const hasImg = typeof b.innerHTML === 'string' && b.innerHTML.includes('<img');
      if (!(hasUrl || hasPlaceholder) || !hasImg) {
        return {
          blockName: 'core/paragraph',
          attrs: {},
          innerHTML:
            '<p><em>[Image placeholder omitted because no valid image reference was provided.]</em></p>',
          innerBlocks: [],
        };
      }
    }

    return { ...b, attrs, innerBlocks };
  });
}

/**
 * The actual runExpandPass() function.
 *
 * - Calls LLM with a strict "expand" instruction.
 * - Forces the model to return a full WordPressOutput JSON.
 * - Normalizes the blocks.
 */
export async function runExpandPass(args: {
  llm: LLMClient;
  input: ExpandPassInput;
  systemPrompt: string; // your master authority system prompt
  expandPromptTemplate: string; // content of expand-pass.prompt.md
}): Promise<WordPressOutput> {
  const { llm, input, systemPrompt, expandPromptTemplate } = args;

  const prompt = buildExpandPrompt(input, expandPromptTemplate);

  // IMPORTANT: keep temperature low so structure is stable.
  const expanded = await llm.generateJson<WordPressOutput>({
    system: systemPrompt,
    prompt,
    schemaName: 'WordPressOutput',
    temperature: 0.2,
  });

  // Normalize for safety.
  const normalized: WordPressOutput = {
    ...expanded,
    blocks: normalizeBlocks(expanded.blocks ?? []),
  };

  // Ensure required internal links are not accidentally dropped
  // (soft enforcement here; hard enforcement belongs in validator).
  if (input.requiredInternalLinks?.length) {
    normalized.internalLinksUsed = normalized.internalLinksUsed ?? [];
    for (const link of input.requiredInternalLinks) {
      const exists = normalized.internalLinksUsed.some((l) => l.url === link.url);
      if (!exists) {
        normalized.internalLinksUsed.push({
          url: link.url,
          anchorText: link.anchorText ?? link.url,
          context: 'Required internal link (auto-appended)',
        });
      }
    }
  }

  return normalized;
}

// ============================================================================
// EXPAND PASS PROMPT TEMPLATE (inline for portability)
// ============================================================================

export const EXPAND_PASS_PROMPT_TEMPLATE = `You are upgrading an existing WordPress article JSON into a full authority page.

NON-NEGOTIABLE RULES:
- Return ONLY a WordPressOutput JSON object (no commentary).
- Preserve the existing meaning and keep the overall page topic the same.
- Preserve and reuse existing headings where possible; you may add 1–2 new H2 sections if required for completeness.
- Target total word count: within the provided min/max range.
- Each H2 section must be expanded with real reasoning and decision-support, not fluff.
- Add exactly ONE dedicated decision-support section (checklist or comparison table).
- Add or expand the AEO Q&A section:
  - 5–7 questions
  - Each answer must be within the provided FAQ answer word range
  - Each answer must be self-contained and quotable.

VISION ANALYSIS:
- If visionAnalysisContext is present, use it as first-party evidence:
  - "From the visuals provided…"
  - "Across the analysed images…"
- Never speculate beyond what is observed.

SITEMAP / TOPICAL BOUNDARIES:
- Respect sitemapContext boundaries (no topic bleed).
- Don't duplicate content that belongs to adjacent pages; reference conceptually.

IMAGE BLOCK SAFETY:
- Only output a core/image block if a valid attrs.url exists OR a PLACEHOLDER: token is used.
- Never output an empty image block.
- If no usable image reference exists, omit the image block.

FORMAT:
- Use WordPress blocks only.
- Paragraphs should be short and scannable.
- Include at least:
  - 1 comparison table OR 1 checklist (prefer both only if natural).
- Preserve internal links exactly as provided in requiredInternalLinks.`;
