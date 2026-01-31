# Writer System Handoff

## Overview

The Writer package (`packages/writer/`) is a complete AI-powered content generation system that produces:
- **WordPress articles** in block-editor JSON format
- **LinkedIn posts** optimized for algorithm engagement
- **Google My Business posts** for local SEO
- **Reddit posts** for authentic community engagement

The system is **niche-agnostic** - it works for any business type by taking context from the onboarding data.

---

## � CRITICAL: Vision Pipeline Architecture (Jan 2026 Fix)

### The Problem That Was Fixed

Vision facts were being **extracted correctly** from the database but **never injected** into the GPT prompt. This resulted in generic articles that ignored all visual evidence and user-provided facts.

### Root Cause

Three broken links in [route.ts](../src/app/api/projects/[projectId]/writer/[jobId]/generate/route.ts):

| Bug | Wrong Code | Correct Code |
|-----|------------|--------------|
| Quality gate visionFacts | `contextPack?.visionFacts` | `contextPack?.writerBrief?.visionFacts` |
| Prompt visionAnalysis | `contextPack?.visionAnalysis` | Reconstructed from `writerBrief.visionFacts` + `visionContext` |
| buildVisionContext | Expected `.summary`, `.observations` | Now uses `.facts`, `.narrative`, `.themes`, `.userFacts` |

### Vision Data Flow (Now Fixed)

```
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE LAYER                                                  │
│  ├── vision_evidence_packs.context_snapshot.userFacts           │
│  ├── vision_evidence_packs.combined_narrative                   │
│  ├── vision_evidence_packs.cross_image_themes                   │
│  └── vision_evidence_images[].evidence.sceneSummary             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  WRITER ROUTE (POST /api/projects/[id]/writer)                  │
│  └── Extracts into visionFacts[] array                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  CONTEXT PACK (TaskContextPack)                                 │
│  ├── writerBrief.visionFacts ← TEXT FACTS (what to write about) │
│  └── visionContext ← IMAGE METADATA (packNarrative, themes)     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  GENERATE ROUTE (buildArticlePrompt)                            │
│  ├── visionFacts = writerBrief.visionFacts ✅                   │
│  ├── visionContext = contextPack.visionContext ✅               │
│  └── visionAnalysis = { facts, narrative, themes, userFacts } ✅│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  buildVisionContext() → PROMPT SECTION                          │
│  ├── 📋 USER-PROVIDED FACTS (MUST include)                      │
│  ├── 📷 VISUAL NARRATIVE                                        │
│  ├── 🔍 OBSERVED EVIDENCE                                       │
│  ├── 🎨 CROSS-IMAGE THEMES                                      │
│  └── 📸 ANALYSED IMAGES                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  QUALITY GATE (runQualityGate)                                  │
│  ├── Checks minimum 3 vision facts appear in content            │
│  ├── Auto-repair pass if facts missing (runVisionFactRepairPass)│
│  └── Validates heading contract (requiredHeadings)              │
└─────────────────────────────────────────────────────────────────┘
```

### Verification Logs

When a job runs, you should now see:
```
[ArticleGen] Vision pipeline check: 8 visionFacts, 3 userFacts
[ArticleGen] Vision injection: 8 facts, 4 themes
```

If you see `0 visionFacts` and `0 userFacts`, the vision pack is not attached to the task.

---

## �📁 Package Structure

```
packages/writer/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts              ← Main exports
│   ├── orchestrator.ts       ← Pipeline coordinator (THE MAIN FILE)
│   ├── types.ts              ← All TypeScript interfaces (563 lines)
│   ├── tones/
│   │   ├── index.ts
│   │   └── profiles.ts       ← 6 pre-built tone profiles + platform adjustments
│   ├── prompts/
│   │   ├── index.ts
│   │   ├── buildArticlePrompt.ts   ← WordPress article prompt (504 lines)
│   │   ├── buildLinkedInPrompt.ts  ← LinkedIn post variants (358 lines)
│   │   ├── buildGmbPrompt.ts       ← Google Business posts
│   │   └── buildRedditPrompt.ts    ← Reddit-style posts
│   ├── media/
│   │   └── mediaPlanner.ts   ← Hero/inline image selection (483 lines)
│   └── validators/
│       └── wpValidator.ts    ← Output validation (634 lines)
└── tests/
    ├── fixtures.ts
    ├── mediaPlanner.test.ts
    ├── toneProfiles.test.ts
    └── wpValidator.test.ts
```

---

## 🎭 Tone Profiles

### Available Profiles

| ID | Name | Best For | Formality | Confidence |
|----|------|----------|-----------|------------|
| `friendly-expert` | Friendly Expert | Most service businesses | Neutral | Confident |
| `founder-led-confident` | Founder-Led Confident | Personal brands, consultants | Neutral | Confident |
| `luxury-premium` | Luxury Premium | High-end services | Formal | Confident |
| `direct-no-nonsense` | Direct & No-Nonsense | Trades, B2B | Informal | Confident |
| `playful-local` | Playful Local | Local businesses | Informal | Neutral |
| `b2b-corporate` | B2B Corporate | Enterprise, SaaS | Formal | Confident |

### Profile Structure

Each profile defines:

```typescript
interface BrandToneProfile {
  id: string;
  name: string;
  voice: {
    formality: 'formal' | 'neutral' | 'informal';
    confidence: 'confident' | 'neutral' | 'humble';
    humourLevel: 'none' | 'subtle' | 'playful';
    sentenceLengthBias: 'short' | 'mixed' | 'long';
  };
  tabooWords: string[];         // Words to NEVER use
  persuasionLevel: 'low' | 'medium' | 'high';
  ctaStyle: 'soft' | 'direct' | 'urgent';
  readingLevel: 'simple' | 'standard' | 'advanced';
}
```

### Example: Friendly Expert

```typescript
{
  id: 'friendly-expert',
  name: 'Friendly Expert',
  voice: {
    formality: 'neutral',
    confidence: 'confident',
    humourLevel: 'subtle',
    sentenceLengthBias: 'mixed',
  },
  tabooWords: [
    'synergy', 'leverage', 'utilize', 'paradigm', 'disrupt',
    'innovative', 'cutting-edge', 'world-class', 'best-in-class',
    'guru', 'ninja', 'rockstar',
  ],
  persuasionLevel: 'medium',
  ctaStyle: 'direct',
  readingLevel: 'standard',
}
```

### Example: Luxury Premium

```typescript
{
  id: 'luxury-premium',
  name: 'Luxury Premium',
  voice: {
    formality: 'formal',
    confidence: 'confident',
    humourLevel: 'none',
    sentenceLengthBias: 'long',
  },
  tabooWords: [
    'cheap', 'affordable', 'budget', 'deal', 'discount',
    'bargain', 'free', 'hack', 'trick', 'awesome', 'cool', 'amazing',
  ],
  persuasionLevel: 'low',
  ctaStyle: 'soft',
  readingLevel: 'advanced',
}
```

### Platform Adjustments

Tones are automatically adjusted per platform:

```typescript
const PLATFORM_ADJUSTMENTS = {
  linkedin: {
    formality: 'neutral',
    characterLimit: 3000,
    hashtagRange: [3, 8],
    emojiAllowed: true,
    emojiLimit: 3,
    ctaRequired: true,
  },
  gmb: {
    formality: 'informal',
    characterLimit: 1500,
    hashtagRange: [0, 3],
    emojiAllowed: true,
    emojiLimit: 3,
    ctaRequired: true,
  },
  reddit: {
    formality: 'informal',
    characterLimit: 10000,
    hashtagRange: [0, 0],  // No hashtags
    emojiAllowed: false,
    disclosureRequired: true,
  },
  wordpress: {
    characterLimit: 50000,
    hashtagRange: [0, 0],
    emojiAllowed: false,
    ctaRequired: true,
  },
};
```

---

## 🔧 Orchestrator Pipeline

The main entry point is `runWriterOrchestrator()` in [orchestrator.ts](../packages/writer/src/orchestrator.ts).

### Pipeline Steps

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: VALIDATE INPUTS                                        │
│  ├── Check task has required fields (slug, role, service, etc.) │
│  └── Early exit if validation fails                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: BUILD CONTEXT PACK                                     │
│  ├── Business context (name, services, USPs)                    │
│  ├── Audience context (target, pain points)                     │
│  ├── Proof context (beads, reviews, themes)                     │
│  ├── Site context (page graph, internal links)                  │
│  └── Vision context (images, analysis, themes)                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: GENERATE WRITER PLAN                                   │
│  ├── H1 title generation                                        │
│  ├── Section outline (H2s)                                      │
│  ├── Target word count per section                              │
│  └── Image placement strategy                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: RESOLVE TONE PROFILE                                   │
│  ├── Get base tone (e.g., friendly-expert)                      │
│  └── Merge with user overrides if provided                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: GENERATE WORDPRESS ARTICLE                             │
│  ├── Build prompt with context + plan + tone                    │
│  ├── Call LLM (injected dependency)                             │
│  ├── Parse JSON block output                                    │
│  └── Attach images from vision packs                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: VALIDATE WORDPRESS OUTPUT                              │
│  ├── Check block count limits                                   │
│  ├── Check HTML byte size                                       │
│  ├── Validate SEO fields                                        │
│  ├── Check internal links                                       │
│  └── Scan for forbidden patterns (scripts, iframes, etc.)       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 7: GENERATE SOCIAL POSTS (Optional)                       │
│  ├── LinkedIn post                                              │
│  ├── Google Business post                                       │
│  └── Reddit post                                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 8: RETURN WRITING OUTPUT                                  │
│  ├── WordPressOutput (blocks, SEO, images)                      │
│  ├── SocialOutputs (LinkedIn, GMB, Reddit)                      │
│  ├── Validation warnings                                        │
│  └── Timing stats                                               │
└─────────────────────────────────────────────────────────────────┘
```

### How to Call the Orchestrator

```typescript
import { runWriterOrchestrator } from '@repo/writer';

const result = await runWriterOrchestrator(job, {
  llmCall: async (prompt, schema) => {
    // Your OpenAI/Claude call here
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    return response.choices[0].message.content;
  },
  verbose: true,
  maxRetries: 2,
  toneOverride: {
    // Optional custom overrides
    ctaStyle: 'urgent',
  },
});

if (result.success) {
  console.log('Article:', result.output.wordpress);
  console.log('LinkedIn:', result.output.social.linkedin);
}
```

---

## 📝 Prompt Builders

### WordPress Article Prompt

**File:** [buildArticlePrompt.ts](../packages/writer/src/prompts/buildArticlePrompt.ts)

Generates WordPress block-editor JSON with:

#### Output Schema

```json
{
  "title": "H1 title (60-70 chars)",
  "slug": "url-friendly-slug",
  "excerpt": "155 char summary",
  "blocks": [
    {
      "blockName": "core/paragraph",
      "attrs": {},
      "innerHTML": "<p>Content here</p>",
      "innerBlocks": []
    }
  ],
  "seo": {
    "seoTitle": "50-60 chars with keyphrase",
    "metaDescription": "150-160 chars",
    "focusKeyphrase": "target phrase",
    "secondaryKeyphrases": ["..."],
    "schema": {}
  },
  "images": {
    "hero": {
      "assetRef": "image-id or PLACEHOLDER:description",
      "alt": "Descriptive alt text",
      "caption": "Optional",
      "title": "SEO title",
      "suggestedFilename": "descriptive-name.jpg"
    },
    "inline": [...]
  },
  "internalLinksUsed": [
    { "url": "/service", "anchorText": "link text", "context": "why" }
  ]
}
```

#### Supported Block Types

| Block | Use Case |
|-------|----------|
| `core/paragraph` | Body text with bold/links |
| `core/heading` | H2, H3, H4 sections (never H1) |
| `core/list` | Ordered/unordered lists |
| `core/table` | Comparison tables, data |
| `core/image` | Inline images |
| `core/buttons` | CTA buttons |
| `core/quote` | Testimonials, quotes |

#### Forbidden Patterns

The validator rejects:
- `<script>` tags
- `<iframe>` embeds
- Inline `position: fixed/absolute`
- High `z-index` values
- `onclick` or other event handlers
- `javascript:` URLs
- `core/html` blocks (raw HTML)
- `core/freeform` blocks (classic editor)

---

### LinkedIn Prompt

**File:** [buildLinkedInPrompt.ts](../packages/writer/src/prompts/buildLinkedInPrompt.ts)

Generates LinkedIn companion posts with:

```json
{
  "platform": "linkedin",
  "content": "Full post text (1300-3000 chars)",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "mentionSuggestions": ["@account"],
  "imageRef": "image-id or PLACEHOLDER:description",
  "schedulingHint": "Best time recommendation",
  "engagementHook": "Opening scroll-stopper",
  "callToAction": "What readers should do"
}
```

#### LinkedIn Best Practices (Built In)

- Hook in first 2-3 lines (before "see more")
- Line breaks for readability
- 3-5 strategic hashtags
- 1-2 emojis max
- Link in comments, not body
- Avoids clichés: "excited to announce", "thrilled to share", "game-changer"

---

### GMB Prompt

**File:** [buildGmbPrompt.ts](../packages/writer/src/prompts/buildGmbPrompt.ts)

Variants:
- Standard update
- Seasonal/holiday post
- Problem-solver post
- Review follow-up

---

### Reddit Prompt

**File:** [buildRedditPrompt.ts](../packages/writer/src/prompts/buildRedditPrompt.ts)

Generates authentic Reddit-style engagement:
- No marketing speak
- Community-first approach
- Disclosure when required
- No hashtags or emojis

---

## 🖼️ Media Planner

**File:** [mediaPlanner.ts](../packages/writer/src/media/mediaPlanner.ts)

### Hero Image Selection

Scores images based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Technical | 30% | Resolution, lighting, blur |
| Emotional | 40% | Impact, expressions, mood |
| Relevance | 30% | Match to task keywords |

```typescript
function scoreImageForHero(image: SelectedImage, task: WriterTask): ImageScore {
  // Technical score from vision analysis
  let technicalScore = image.vision.technicalScore;
  
  // Emotional scoring
  switch (image.vision.emotionalImpact) {
    case 'high': emotionalScore = 100; break;
    case 'medium': emotionalScore = 60; break;
    case 'low': emotionalScore = 30; break;
  }
  
  // Boost for positive expressions (smiles)
  // ...
  
  // Relevance scoring based on task context
  // ...
  
  return {
    imageId: image.imageId,
    technicalScore,
    emotionalScore,
    relevanceScore,
    totalScore: tech * 0.3 + emotion * 0.4 + relevance * 0.3,
  };
}
```

### Inline Image Placement

- Distributes images across sections
- Avoids back-to-back images
- Respects min/max from task constraints

---

## ✅ WordPress Validator

**File:** [wpValidator.ts](../packages/writer/src/validators/wpValidator.ts)

### What It Checks

| Check | Severity | Description |
|-------|----------|-------------|
| Block count | Error | Exceeds `task.wordpress.maxBlocks` |
| HTML bytes | Error | Exceeds `task.wordpress.maxHtmlBytes` |
| H2 count | Warning | Too many H2 headings |
| Forbidden patterns | Error | Scripts, iframes, event handlers |
| Forbidden blocks | Error | core/html, core/freeform |
| SEO title length | Warning | Not 50-60 chars |
| Meta description | Warning | Not 150-160 chars |
| Keyphrase density | Warning | Too high or too low |
| Internal links | Warning | Missing required links |
| Reading time | Warning | Outside target range |

### Stats Calculated

```typescript
interface ValidationStats {
  blockCount: number;
  htmlBytes: number;
  wordCount: number;
  h2Count: number;
  h3Count: number;
  paragraphCount: number;
  maxParagraphWords: number;
  internalLinkCount: number;
  imageCount: number;
  tableCount: number;
  maxTableRows: number;
  keyphraseOccurrences: number;
  readingTimeMinutes: number;
}
```

---

## 📊 Core Types

### WriterTask (From Growth Planner)

```typescript
interface WriterTask {
  slug: string;
  role: 'money' | 'support' | 'trust' | 'authority' | 'operational';
  primaryService: string;
  location?: string;
  intent: 'buy' | 'compare' | 'trust' | 'learn';
  targetAudience: string;
  
  // Proof requirements
  requiredProofElements: ProofElementType[];
  requiredEEATSignals: EEATSignalType[];
  
  // Internal linking
  internalLinks: {
    upLinks: Array<{ targetUrl, targetTitle, anchorSuggestion, required }>;
    downLinks: Array<{ targetUrl, targetTitle, anchorSuggestion }>;
    requiredAnchors: string[];
  };
  
  // Media requirements
  mediaRequirements: {
    heroRequired: boolean;
    inlineImagesMin: number;
    inlineImagesMax: number;
  };
  
  // WordPress constraints
  wordpress: {
    maxBlocks: number;
    maxHtmlBytes: number;
    excerptLength: number;
    readingTimeTarget: number;
    maxH2Count?: number;
    maxTableRows?: number;
  };
}
```

### WritingJob (Full Context)

```typescript
interface WritingJob {
  id: string;
  projectId: string;
  task: WriterTask;
  userContext: UserContext;
  siteContext: SiteContext;
  proofContext: ProofContext;
  visionContext: VisionContext;
  toneProfileId: string;
  toneOverrides?: Partial<BrandToneProfile>;
}
```

### WritingOutput (Result)

```typescript
interface WritingOutput {
  jobId: string;
  wordpress: WordPressOutput;
  social: {
    linkedin?: LinkedInPost;
    gmb?: GMBPost;
    reddit?: RedditPost;
  };
  audit: AuditOutput;
  contentHash: string;
}
```

---

## 🚀 Integration Status

### Currently Working
- ✅ Tone profiles defined and selectable
- ✅ Prompt builders complete for all platforms
- ✅ Media planner with hero selection
- ✅ WordPress validator with full checks
- ✅ Orchestrator pipeline defined
- ✅ Type definitions complete
- ✅ Unit tests for core components

### Still Needs Connection
- ⏳ LLM call injection (OpenAI/Claude)
- ⏳ API endpoint to trigger orchestrator
- ⏳ Database write for `writer_outputs`
- ⏳ Task status update flow
- ⏳ Queue/worker for async processing

---

## 🔗 How to Use

### 1. Import from Package

```typescript
import {
  runWriterOrchestrator,
  getToneProfile,
  TONE_PROFILES,
  selectHeroImage,
  validateWordPressOutput,
  buildArticlePrompt,
  buildLinkedInPrompt,
} from '@repo/writer';
```

### 2. Build a WritingJob

```typescript
const job: WritingJob = {
  id: 'job-123',
  projectId: 'project-456',
  task: growthPlanTask,  // From growth_plans.months[].tasks[]
  userContext: userContext,  // From user_context table
  siteContext: {
    sitemapSummary: { totalPages: 50, moneyPages: 10, ... },
    pageGraph: pages,  // From pages table
  },
  proofContext: {
    beads: beads,  // From beads table
    reviews: reviews,  // From reviews table
    themes: reviewThemes,  // From review_themes table
  },
  visionContext: {
    packs: visionPacks,  // From vision_evidence_packs
    images: visionImages,  // From vision_evidence_images
  },
  toneProfileId: 'friendly-expert',
};
```

### 3. Run the Orchestrator

```typescript
const result = await runWriterOrchestrator(job, {
  llmCall: yourOpenAIFunction,
  verbose: true,
});
```

### 4. Save the Output

```typescript
if (result.success) {
  await supabase.from('writer_outputs').insert({
    job_id: job.id,
    project_id: job.projectId,
    output_type: 'wordpress',
    content_json: result.output.wordpress,
    content_hash: result.output.contentHash,
    seo_package: result.output.wordpress.seo,
  });
}
```

---

## 📋 Next Steps to Complete Integration

1. **Create `/api/projects/[id]/writer/process` endpoint**
   - Accepts job ID
   - Fetches job from `writer_jobs`
   - Gathers all context
   - Calls `runWriterOrchestrator()`
   - Saves to `writer_outputs`
   - Updates task status

2. **Add background worker**
   - Poll for pending jobs
   - Or use Supabase Edge Functions
   - Or use Vercel Cron

3. **Wire up UI**
   - Show generation progress
   - Preview generated content
   - Edit before publish

4. **Add export to WordPress**
   - Convert blocks to WP REST API format
   - Handle image uploads
   - Create draft/publish

---

## 🎯 Intent-Aware SEO Heading Scorer (Jan 2026)

### Overview

The SEO Heading Scorer is a **client-side scoring system** that evaluates SEO Title, H1, and Meta Description options on a 0-100 scale. It uses **page intent detection** to apply the correct scoring weights - ensuring informational pages aren't penalized for missing transactional verbs, and money pages are flagged for missing location.

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/writer/seoHeadingScorer.ts` | Core scoring logic with intent detection |
| `src/components/growth/SeoHeadingSelector.tsx` | React component for scored option UI |
| `src/components/growth/TaskDetailPanel.tsx` | Integration point in Growth Planner |
| `src/lib/growth-planner/refineSeoDrafts.ts` | **Where headings are GENERATED** (GPT call) |

### Page Intent Types

```typescript
type PageIntent = "money" | "service" | "informational" | "case-study" | "comparison";
```

**Intent Detection Patterns:**

| Intent | Detection Pattern |
|--------|-------------------|
| `money` | `/\b(book\|get\|hire\|pricing\|photographer\|packages?)\b/i` |
| `service` | `/\b(services\|photography in\|based in\|covering)\b/i` |
| `informational` | `/\b(trends?\|guide\|insights?\|tips\|how to\|202[0-9]\|ideas?)\b/i` |
| `case-study` | `/\b(case study\|real wedding\|we captured\|gallery\|portfolio)\b/i` |
| `comparison` | `/\b(vs\|versus\|compared?\|difference\|alternative)\b/i` |

### Scoring Weights by Intent

```
                          money   service   informational   case-study
┌─────────────────────────────────────────────────────────────────────┐
│ Location present        +30     +30       +10 (boost)     +15       │
│ Location missing        -40     -35        0 (no penalty) -10       │
│ Topic clarity           +10     +15       +40             +25       │
│ Year modifier           +5      +5        +20             +5        │
│ Expertise cue           +5      +10       +15             +20       │
│ Transactional verb      +15     +12       +5 (optional)   +5        │
│ Missing transactional   -8      -5         0 (no penalty)  0        │
│ Brand                   +10     +10       +8              +15       │
│ Question format         -20     -15       -10             -5        │
│ Hype words              -10     -10       -5              -5        │
│ Emotional-only          -30     -25       -10              0 (ok)   │
└─────────────────────────────────────────────────────────────────────┘
```

### Score Floors (Prevents Trust-Destroying 0s)

Content meeting basic intent correctness never collapses to 0:

```typescript
const SCORE_FLOORS: Record<PageIntent, number> = {
  money: 35,
  service: 40,
  informational: 55,  // Informational content easily meets correctness
  "case-study": 45,
  comparison: 45,
};
```

### Intent-Aware Messaging

**For Money/Service pages:**
```
❌ Location required for local ranking
❌ H1 lacks action verb (-8)
```

**For Informational pages:**
```
ℹ️ Location optional — adding it may improve local relevance
ℹ️ Transactional verb not required for informational
```

### Tier Classification

```typescript
function tierFromScore(score: number): "best" | "good" | "ok" | "risky" {
  if (score >= 85) return "best";
  if (score >= 72) return "good";
  if (score >= 58) return "ok";
  return "risky";
}
```

### SEO Title ↔ H1 Alignment Validator

The system validates that H1 headings match the ranking intent of the selected SEO title:

```typescript
function validateTitleH1Alignment(
  seoTitle: string,
  h1: string,
  primaryService: string,
  location: string
): AlignmentResult {
  // If SEO title contains {service + location}
  // AND H1 does NOT contain same
  // → Flag: "H1 misaligned with ranking intent"
  // → Suggest corrected H1
}
```

**UI Warning:**
```
⚠️ H1 misaligned with ranking intent: missing location
   Suggested: "Engagement Photography in Buckinghamshire"
```

### Usage in Components

```typescript
import { 
  scoreHeadingSet, 
  detectPageIntent,
  validateTitleH1Alignment,
  type ScoreResult 
} from '@/lib/writer/seoHeadingScorer';

// Score all options for a task
const { results, best, recommended } = scoreHeadingSet(
  task.seoTitleOptions,
  { 
    focusKeyword: `${task.primaryService} ${task.primaryLocation}`,
    location: task.primaryLocation,
    headingType: 'title',
    intent: detectPageIntent(task.title) // Optional: auto-detected if omitted
  }
);

// Check alignment
const alignment = validateTitleH1Alignment(
  selectedSeoTitle,
  selectedH1,
  task.primaryService,
  task.primaryLocation
);
if (!alignment.aligned) {
  console.warn(alignment.warning, alignment.suggestedH1);
}
```

### Expected Scores by Page Type

**Money Page ("Book Wedding Photography in Buckinghamshire"):**
- With location + transactional verb: 85-95
- Missing location: 45-55 (flagged)
- Missing transactional verb: 70-80

**Informational Page ("2026 Wedding Photography Trends"):**
- With topic clarity + year: 78-90
- Without location: 75-85 (NO penalty)
- Without transactional verb: 75-85 (NO penalty)

**Case Study ("Real Wedding at Waddesdon Manor"):**
- With location + brand: 80-90
- Emotional language OK (no penalty)

---

## ✅ COMPLETED: Intent-Aware Heading Generation Pipeline (Jan 2026)

### Overview

The heading **scoring** is now integrated directly into the **generation pipeline**. Every SEO heading option is scored immediately after GPT generates it, sorted by score DESC, and the best option is auto-selected as the default.

**Key Principle:** "Growth Planner never emits unranked SEO options."

### Implementation Location

All scoring integration is in `src/lib/growth-planner/refineSeoDrafts.ts`:

```typescript
// After GPT generates raw options:
const rawOptions = normalizeToSeoOptions(parsed, businessName);

// CRITICAL: Score and sort before returning
const scoredOptions = scoreAndSortOptions(rawOptions, task, geo);

console.log(`[RefineSeoDrafts] Task scored: title=${scoredOptions.bestTitleScore}, h1=${scoredOptions.bestH1Score}`);

return scoredOptions;
```

### The `scoreAndSortOptions()` Function

This function is the quality gate between GPT generation and the UI:

```typescript
function scoreAndSortOptions(
  options: SeoOptions, 
  task: GrowthTask,
  geo: string | undefined
): SeoOptions {
  // 1. Detect intent from first title option
  const detectedIntent = detectPageIntent(sampleTitle);
  
  // 2. Build ScoreInputs with proper headingType
  const titleInputs: ScoreInputs = {
    focusKeyword: task.primaryKeyword || task.title,
    location: geo || task.primaryLocation || '',
    headingType: 'title',
    intent: detectedIntent,
  };
  
  // 3. Score with intent-aware weights
  const scoredTitles = scoreHeadingSet(options.seoTitleOptions, titleInputs);
  
  // 4. Results are sorted DESC - best is first
  return {
    ...options,
    seoTitleOptions: scoredTitles.results.map(r => r.text),
    seoTitleScores: scoredTitles.results.map(r => r.score),
    seoTitleDraft: scoredTitles.recommended, // Best option
    bestTitleScore: scoredTitles.best?.score,
    detectedIntent,
    // ... h1, meta similarly
  };
}
```

### Guarantees Provided

| Guarantee | Implementation |
|-----------|----------------|
| Options are sorted by score DESC | `scoreHeadingSet()` returns sorted results |
| Best option is auto-selected | `selectedSeoTitleIndex` defaults to `0` (best) |
| Scores are attached for UI | `seoTitleScores[]` parallel array on task |
| Low scores logged | Console warning if `bestTitleScore < 58` |
| Intent persisted | `detectedIntent` field on task |

### New Fields on GrowthTask

```typescript
interface GrowthTask {
  // ... existing fields ...
  
  // NEW: Scoring metadata
  seoTitleScores?: number[];     // Parallel to seoTitleOptions
  h1Scores?: number[];           // Parallel to h1Options
  bestTitleScore?: number;       // For quality gating
  bestH1Score?: number;          // For quality gating
  detectedIntent?: 'money' | 'service' | 'informational' | 'case-study' | 'comparison';
}
```

### Console Output

When a plan is refined, you'll see:
```
[SEO Scorer] Task "Engagement Photography Buckinghamshire" → intent: money
[RefineSeoDrafts] Task "Engagement Photography Buckinghamshire" scored: title=87, h1=82
[SEO Scorer] Task "2026 Wedding Trends Guide" → intent: informational
[RefineSeoDrafts] Task "2026 Wedding Trends Guide" scored: title=78, h1=75
[SEO Scorer] ⚠️ Task "Generic Photography" best title score 52 < 58. Intent: money. Options may need improvement.
```

### Quality Gate (Soft for MVP)

Currently logs a warning if best score < 58:

```typescript
const MINIMUM_SCORE_THRESHOLD = 58;

if (bestTitleScore < MINIMUM_SCORE_THRESHOLD) {
  console.warn(`[SEO Scorer] ⚠️ Task "${task.title}" best title score ${bestTitleScore} < ${MINIMUM_SCORE_THRESHOLD}`);
}
```

**Future enhancement:** Make this a hard gate that throws, requiring regeneration for low-scoring options.

### What This Achieves

| Before | After |
|--------|-------|
| Options arrived unranked | Options arrive sorted by score DESC |
| User had to manually evaluate | Best option auto-selected as default |
| Informational pages penalized | Intent-aware weights applied |
| No visibility into quality | Scores visible on every option |
| Low-quality options hidden | Low scores trigger warnings |
