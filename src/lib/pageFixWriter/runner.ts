/**
 * Page Fix Writer Runner
 * 
 * Orchestrates the complete fix generation pipeline:
 * 1. Build context and prompt
 * 2. Call LLM
 * 3. Parse and validate output
 * 4. Retry with repair prompt if needed
 * 5. Generate diff
 * 6. Save version
 */

import OpenAI from 'openai';
import type {
  PageFixRequest,
  PageFixOutput,
  PageFixDiff,
  PageFixVersion,
  PageSnapshot,
  ValidationWarning,
} from './types';
import { buildPageFixPrompt, buildRepairPrompt, DEFAULT_GUARDRAILS, DEFAULT_VOICE_PROFILE } from './prompt';
import { validatePageFixOutput, parsePageFixOutput, type ValidationResult } from './validators';
import { generatePageFixDiff } from './diff';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_MODEL = 'gpt-4o';
const MAX_REPAIR_ATTEMPTS = 1;

// ============================================================================
// RUNNER RESULT
// ============================================================================

export interface PageFixRunnerResult {
  success: boolean;
  output?: PageFixOutput;
  diff?: PageFixDiff;
  validation?: ValidationResult;
  error?: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  modelUsed: string;
  attempts: number;
}

// ============================================================================
// MAIN RUNNER
// ============================================================================

export async function runPageFix(
  request: PageFixRequest,
  options?: {
    model?: string;
    openaiApiKey?: string;
  }
): Promise<PageFixRunnerResult> {
  const model = options?.model || DEFAULT_MODEL;
  const apiKey = options?.openaiApiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'OpenAI API key not configured',
      tokensUsed: { input: 0, output: 0 },
      modelUsed: model,
      attempts: 0,
    };
  }

  const openai = new OpenAI({ apiKey });

  // Merge defaults into request
  const fullRequest: PageFixRequest = {
    ...request,
    voiceProfile: request.voiceProfile || DEFAULT_VOICE_PROFILE,
    guardrails: { ...DEFAULT_GUARDRAILS, ...request.guardrails },
  };

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let attempts = 0;

  // Build initial prompt
  const { system, user } = buildPageFixPrompt(fullRequest);

  // First attempt
  attempts++;
  const firstResult = await callOpenAI(openai, model, system, user);
  totalInputTokens += firstResult.inputTokens;
  totalOutputTokens += firstResult.outputTokens;

  if (!firstResult.success) {
    return {
      success: false,
      error: firstResult.error,
      tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
      modelUsed: model,
      attempts,
    };
  }

  // Parse output
  let parseResult = parsePageFixOutput(firstResult.content);
  
  if (!parseResult.success) {
    // Try repair
    if (attempts < MAX_REPAIR_ATTEMPTS + 1) {
      const repairResult = await attemptRepair(
        openai,
        model,
        firstResult.content,
        [{ code: 'JSON_PARSE_ERROR', message: parseResult.error || 'Invalid JSON' }]
      );
      totalInputTokens += repairResult.inputTokens;
      totalOutputTokens += repairResult.outputTokens;
      attempts++;

      if (repairResult.success) {
        parseResult = parsePageFixOutput(repairResult.content);
      }
    }

    if (!parseResult.success) {
      return {
        success: false,
        error: `Failed to parse output: ${parseResult.error}`,
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
        modelUsed: model,
        attempts,
      };
    }
  }

  let output = parseResult.output!;

  // Validate output
  let validation = validatePageFixOutput(output, fullRequest);

  // If there are errors, try repair
  if (!validation.valid && attempts < MAX_REPAIR_ATTEMPTS + 1) {
    const repairResult = await attemptRepair(
      openai,
      model,
      JSON.stringify(output, null, 2),
      validation.errors.map(e => ({ code: e.code, message: e.message }))
    );
    totalInputTokens += repairResult.inputTokens;
    totalOutputTokens += repairResult.outputTokens;
    attempts++;

    if (repairResult.success) {
      const repairedParse = parsePageFixOutput(repairResult.content);
      if (repairedParse.success) {
        output = repairedParse.output!;
        validation = validatePageFixOutput(output, fullRequest);
      }
    }
  }

  // Add metadata to output
  output.generatedAt = new Date().toISOString();
  output.modelUsed = model;
  output.tokensUsed = {
    input: totalInputTokens,
    output: totalOutputTokens,
  };

  // Generate diff
  const diff = generatePageFixDiff(
    crypto.randomUUID(),
    fullRequest.pageId,
    fullRequest.originalSnapshot,
    output
  );

  // Add validation warnings to diff
  diff.warnings = [...validation.errors, ...validation.warnings];

  return {
    success: validation.valid,
    output,
    diff,
    validation,
    tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
    modelUsed: model,
    attempts,
  };
}

// ============================================================================
// OPENAI CALL
// ============================================================================

interface OpenAICallResult {
  success: boolean;
  content: string;
  error?: string;
  inputTokens: number;
  outputTokens: number;
}

async function callOpenAI(
  openai: OpenAI,
  model: string,
  system: string,
  user: string
): Promise<OpenAICallResult> {
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3, // Lower temperature for more consistent output
      max_tokens: 8000,
    });

    const content = response.choices[0]?.message?.content || '';
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;

    return {
      success: true,
      content,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      error: error instanceof Error ? error.message : 'OpenAI API call failed',
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

// ============================================================================
// REPAIR ATTEMPT
// ============================================================================

async function attemptRepair(
  openai: OpenAI,
  model: string,
  originalOutput: string,
  errors: { code: string; message: string }[]
): Promise<OpenAICallResult> {
  const { system, user } = buildRepairPrompt(originalOutput, errors);
  return callOpenAI(openai, model, system, user);
}

// ============================================================================
// SNAPSHOT BUILDER
// ============================================================================

export function buildPageSnapshot(page: {
  url: string;
  title?: string;
  meta_description?: string;
  h1?: string;
  headings?: { level: number; text: string }[];
  body_html?: string;
  cleaned_text?: string;
  images?: { src: string; alt?: string; filename?: string }[];
  links_in?: string[];
  links_out?: string[];
}): PageSnapshot {
  return {
    url: page.url,
    title: page.title || '',
    metaDescription: page.meta_description || '',
    h1: page.h1 || '',
    headings: page.headings || [],
    bodyHtml: page.body_html || '',
    bodyText: page.cleaned_text || '',
    wordCount: (page.cleaned_text || '').split(/\s+/).filter(w => w.length > 0).length,
    images: (page.images || []).map(img => ({
      src: img.src,
      alt: img.alt || '',
      filename: img.filename || img.src.split('/').pop() || 'unknown',
    })),
    internalLinksIn: page.links_in || [],
    internalLinksOut: page.links_out || [],
    capturedAt: new Date().toISOString(),
  };
}

// ============================================================================
// VERSION BUILDER
// ============================================================================

export function buildPageFixVersion(
  pageId: string,
  projectId: string,
  url: string,
  originalSnapshot: PageSnapshot,
  output: PageFixOutput,
  diff: PageFixDiff,
  userId: string,
  versionNumber: number
): PageFixVersion {
  return {
    id: crypto.randomUUID(),
    pageId,
    projectId,
    url,
    status: 'draft',
    version: versionNumber,
    originalSnapshot,
    proposedOutput: output,
    diffSummary: diff,
    appliedCategories: {
      titleMeta: true,
      headings: true,
      contentDepth: true,
      eeat: true,
      internalLinks: true,
    },
    createdAt: new Date().toISOString(),
    createdBy: userId,
  };
}
