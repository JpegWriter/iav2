# Content Writer System - Handoff Document

> **Version:** 1.0  
> **Date:** January 29, 2026  
> **Status:** Ready for Review

---

## Overview

The Content Writer System automates the creation of SEO-optimized, brand-consistent articles for local service businesses. It uses a two-stage process:

1. **Brief Generation** - Assembles context from crawled site data (no LLM)
2. **Article Generation** - Calls GPT-4o to write WordPress-ready content

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GROWTH PLANNER                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Month 1   │  │   Month 2   │  │   Month 3   │  │    ...12    │        │
│  │  4 tasks    │  │  4 tasks    │  │  4 tasks    │  │   tasks     │        │
│  └──────┬──────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────┼───────────────────────────────────────────────────────────────────┘
          │
          ▼ Click Task
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TASK DETAIL PANEL                                    │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │   Generate   │ ──▶│    Create    │ ──▶│   Preview    │ ──▶│  Publish  │ │
│  │    Brief     │    │   Article    │    │   & Edit     │    │   to WP   │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│       Step 1              Step 2              Step 3            Step 4      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Brief Generation

### What Happens

When a user clicks "Generate Brief", the system:

1. Fetches the **Master Profile** for the project
2. Builds a **Task Context Pack** with all relevant data
3. Creates a **Writer Job** record in the database
4. Updates the task status to `briefed`

### Data Sources

| Source | Data Extracted |
|--------|----------------|
| **Master Profile** | Business name, services, locations, brand voice, proof atoms |
| **Site Content Digest** | Page essences, service list, location list, key pages |
| **Growth Plan Task** | Title, slug, role, audience, word count, search intent |
| **Crawled Pages** | Internal link targets, existing content structure |

### No LLM Required

The brief is **assembled deterministically** from existing data - no AI call is made. This ensures:
- Fast generation (< 2 seconds)
- Consistent, reproducible briefs
- No hallucinated requirements

### Task Context Pack Structure

```typescript
interface TaskContextPack {
  id: string;
  projectId: string;
  taskId: string;
  mode: 'create' | 'update';
  createdAt: string;
  
  // The brief for the writer
  writerBrief: {
    title: string;
    slug: string;
    role: 'money' | 'trust' | 'support' | 'authority';
    primaryService: string;
    primaryLocation: string;
    targetAudience: string;
    searchIntent: 'buy' | 'compare' | 'trust' | 'learn';
    estimatedWords: number;
    focusKeyphrase: string;
    sections: Array<{
      heading: string;
      purpose: string;
      keyPoints: string[];
    }>;
  };
  
  // Geographic context
  geoPack: {
    primaryLocation: string;
    serviceAreas: string[];
    localPhrasing: string[];
  };
  
  // EEAT signals
  eeatPack: {
    claimsAllowed: string[];      // Verified claims we CAN use
    claimsRestricted: string[];   // Claims we must NOT use
    experienceMarkers: string[];  // Years in business, projects completed
    trustSignals: string[];       // Accreditations, memberships
  };
  
  // Internal linking
  linkTargets: {
    upLinks: Array<{ path: string; anchorText: string }>;   // Links to parent pages
    downLinks: Array<{ path: string; anchorText: string }>; // Links to child pages
    lateralLinks: Array<{ path: string; anchorText: string }>; // Related pages
  };
  
  // Proof elements to include
  proofElements: Array<{
    type: string;
    value: string;
    verified: boolean;
  }>;
}
```

---

## Stage 2: Article Generation (Master Authority System)

### What Happens

When a user clicks "Create Article", the system:

1. Fetches the **Writer Job** with its context pack
2. **Determines Intent Mode** (MONEY, SERVICE, INFORMATIONAL, or TRUST)
3. Builds the **Master Authority Prompt** from all context sources
4. Calls **GPT-4o** with JSON response format
5. Parses the response into WordPress blocks
6. Saves the output to `writer_outputs` table
7. Updates task status to `review`

### Intent Mode Detection

The system automatically classifies each page into one of four intent modes:

| Intent Mode | Detection Signals | Content Focus |
|-------------|-------------------|---------------|
| **MONEY** | Role=money, slug contains: pric*, quote, cost, hire, book | Outcomes, suitability, risk reduction |
| **SERVICE** | Role=service, slug contains: service | Process, scope, expectations |
| **TRUST** | Role=trust, slug contains: about, team, credential, testimonial | Transparency, safeguards, credibility |
| **INFORMATIONAL** | Default for support pages, blogs, guides | Mechanisms, patterns, reasoning |

---

## The Master Authority Prompt

> **Status:** LOCKED - Production Grade  
> **Philosophy:** This is an authority system, not content writing

### System Prompt

```
You are an expert authority content writer. You write decision-support content, not promotional material.

CORE PRINCIPLES:
- This is an authority system, not content writing
- Every page must stand as a quotable reference for AI answer engines
- Demonstrate expertise through reasoning and observed evidence, not claims
- Use provided vision analysis as first-party evidence
- Respect topical boundaries defined by the sitemap
- If it reads like marketing, it has failed

OUTPUT REQUIREMENTS:
- You ALWAYS output valid JSON matching the exact schema provided
- You NEVER invent facts, statistics, testimonials, or certifications
- You ONLY use information provided in the context
- You write 1,500-1,800 words minimum
- You structure content for WordPress block compatibility

SELF-CHECK (Perform before every output):
1. Did I use vision analysis correctly as evidence?
2. Did I respect the page's intent mode?
3. Did I avoid topic bleed from adjacent pages?
4. Did I show expertise through reasoning, not claims?
5. Would an AI trust this page as a source?
```

### Context Inputs Provided

The prompt receives 6 structured context blocks:

#### 1️⃣ Master Profile Context
- Business name
- Brand positioning & tone
- Years of experience
- Values & operating philosophy
- Target audiences
- Differentiators
- Constraints / exclusions

#### 2️⃣ Sitemap & Page Context
- Full sitemap (money, service, trust, support pages)
- Current page role & intent
- Internal links (must be preserved exactly)
- Adjacent pages (for topical boundaries)

#### 3️⃣ User Onboarding Context
- Services offered
- Pricing model (high-level)
- Geography / service regions
- Client types
- Known objections & FAQs
- Business maturity

#### 4️⃣ Vision Analysis Context (Critical)
- Image analysis outputs
- Visual themes or patterns
- Environmental observations
- Quality, condition, workflow indicators
- Repeated visual signals

**Vision Analysis Rules:**
- Treat as first-party evidence, not marketing claims
- Use to support reasoning and explanations
- Translate observations into insights and implications
- Never speculate beyond what is observed
- Acceptable phrases: "From the images provided...", "The visual setup suggests..."

#### 5️⃣ Intent Mode
One of: MONEY | SERVICE | INFORMATIONAL | TRUST

#### 6️⃣ EEAT Proof Elements
- Verified claims we CAN use
- Experience markers
- Trust signals

---

### Mandatory Content Structure

#### 1️⃣ INTRODUCTION (150-200 words)
Must accomplish:
- Define the business/entity clearly
- State the operating context
- Identify who this page is for
- Clarify the page's intent
- Preview what decisions/questions will be addressed

#### 2️⃣ CORE EXPLANATION SECTIONS (4-6 × H2 sections)
Each section:
- 250-350 words
- Explains how things actually work
- Uses experience-based reasoning
- Integrates vision analysis where relevant

**Intent-Based Focus:**

| Intent | Focus |
|--------|-------|
| MONEY | Outcomes, suitability, risk reduction |
| SERVICE | Process, scope, expectations |
| INFORMATIONAL | Mechanisms, patterns, reasoning |
| TRUST | Transparency, safeguards, credibility |

#### 3️⃣ DECISION SUPPORT SECTION (Mandatory)
Help the reader decide if / how / when this applies to them.
Format as:
- A practical checklist, OR
- A comparison table, OR
- A "right for you if..." framework

#### 4️⃣ AEO QUESTION SECTION (Mandatory)
Title EXACTLY: "Common Questions About [Topic/Service]"
Rules:
- 5-7 real user questions
- Each answer 80-120 words
- Neutral, quotable, self-contained
- Directly quotable by AI systems

#### 5️⃣ CONCLUSION WITH CTA
- Summarize key takeaways
- Clear next step/call to action
- No hard-sell language

---

### Style Rules

1. Calm, professional, experienced voice
2. Neutral and helpful, not sales-led
3. Paragraphs ≤ 120 words
4. Scannable structure with clear hierarchy
5. WordPress block compatible
6. Preserve all internal links exactly as provided
7. **NEVER** mention SEO, AEO, EEAT, or AI
8. **NEVER** fabricate stats, testimonials, certifications, or outcomes

---

### Length Requirement (Hard - Validation Gate)

> ⚠️ **Articles under 1,500 words are automatically rejected**

**Minimum Word Count Breakdown:**

| Section | Word Count |
|---------|------------|
| Introduction | 150-200 words |
| Core Section 1 (H2) | 250-350 words |
| Core Section 2 (H2) | 250-350 words |
| Core Section 3 (H2) | 250-350 words |
| Core Section 4 (H2) | 250-350 words |
| Core Section 5 (H2) | 250-350 words |
| Decision Support | 100-150 words |
| FAQ (5-7 × 80-120w) | 400-840 words |
| Conclusion | 80-120 words |
| **Total Target** | **1,500-1,800 words** |

---

### Image & Vision Output Rules (Non-Negotiable)

Vision analysis and images are related but not interchangeable.

#### When to Include Image Blocks

| Condition | Action |
|-----------|--------|
| Image URL/ID explicitly provided | ✅ Include `core/image` block |
| System instructs image placement | ✅ Include with placeholder |
| Vision analysis exists but no asset | ❌ Use for text reasoning only |
| "Want an image here" | ❌ Do NOT output empty block |

#### Valid Image Block Requirements

If a `core/image` block is included, it MUST contain:

```json
{
  "blockName": "core/image",
  "attrs": { 
    "url": "PLACEHOLDER:descriptive-image-purpose",
    "alt": "Meaningful alt text"
  },
  "innerHTML": "<figure class='wp-block-image'><img src='PLACEHOLDER:...' alt='...'/></figure>",
  "innerBlocks": []
}
```

**❌ NEVER output:**
- Empty `innerHTML` ("")
- Image blocks with only `alt` attribute
- Image blocks without a resolvable source

#### Placeholder Strategy

For conceptual images without URLs, use: `PLACEHOLDER:descriptive-purpose`

Examples:
- `PLACEHOLDER:team-conducting-property-valuation`
- `PLACEHOLDER:before-after-renovation-comparison`
- `PLACEHOLDER:local-area-street-view`

Downstream systems (media planner) will hydrate these with real assets.

#### Vision ≠ Decoration

- Do NOT add images "for SEO"
- Do NOT force images into every section
- Images must support understanding, not pad content

---

### Success Criteria

The generated page should:
- ✅ Stand as an authority reference
- ✅ Be quotable by AI systems
- ✅ Demonstrate experience using observed evidence
- ✅ Fit cleanly into the sitemap
- ✅ Help a sceptical user decide
- ✅ Have zero empty/invalid image blocks

> **If it reads like marketing, it has failed.**

---

### Final Self-Check (Built into prompt)

Before output, the model verifies:
1. ✓ Vision analysis used correctly as evidence (not marketing)?
2. ✓ Page intent respected throughout?
3. ✓ No topic bleed from adjacent pages?
4. ✓ Expertise shown through reasoning, not claims?
5. ✓ Would an AI trust this page as a quotable source?
6. ✓ Word count is 1,500-1,800?
7. ✓ All internal links preserved exactly?
8. ✓ All image blocks have valid url/placeholder AND complete innerHTML?
9. ✓ No empty or partial image blocks exist?

---

### GPT-4o Call Configuration

```typescript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: MASTER_AUTHORITY_SYSTEM_PROMPT },
    { role: 'user', content: masterAuthorityPrompt }
  ],
  response_format: { type: 'json_object' },
  temperature: 0.6,  // Lower for consistent authority content
  max_tokens: 12000, // Increased for 1,500-1,800 word requirement
});
```

---

## Output Format

### WordPress Blocks

The article is output as an array of WordPress Gutenberg blocks:

```json
{
  "title": "Estate Agents in Portslade: What to Expect & How to Book",
  "slug": "estate-agents-portslade",
  "excerpt": "Looking for trusted estate agents in Portslade? Cox & Co offers expert property valuations and sales support across Brighton & Sussex.",
  "focusKeyphrase": "estate agents Portslade",
  "seoTitle": "Estate Agents in Portslade | Cox & Co",
  "metaDescription": "Expert estate agents in Portslade. Free valuations, local knowledge, trusted service. Contact Cox & Co today.",
  "blocks": [
    {
      "blockName": "core/paragraph",
      "attrs": {},
      "innerHTML": "<p>Finding the right <strong>estate agents in Portslade</strong> can make all the difference when buying or selling your property. At Cox & Co, we've been helping families across Brighton and Sussex for over 15 years.</p>"
    },
    {
      "blockName": "core/heading",
      "attrs": { "level": 2 },
      "innerHTML": "<h2>Why Choose Local Estate Agents in Portslade?</h2>"
    },
    {
      "blockName": "core/paragraph",
      "attrs": {},
      "innerHTML": "<p>Local expertise matters. Our team knows every street in Portslade, Hove, and the surrounding areas. We understand property values, buyer preferences, and what makes each neighbourhood special.</p>"
    },
    {
      "blockName": "core/list",
      "attrs": { "ordered": false },
      "innerHTML": "<ul><li>Free, no-obligation property valuations</li><li>Professional photography and floor plans</li><li>Rightmove and Zoopla listings</li><li>Accompanied viewings 7 days a week</li></ul>"
    },
    {
      "blockName": "core/buttons",
      "attrs": {},
      "innerHTML": "<div class='wp-block-buttons'><div class='wp-block-button'><a class='wp-block-button__link' href='/contact'>Get Your Free Valuation</a></div></div>"
    }
  ]
}
```

### Supported Block Types

| Block Name | Purpose | Attributes |
|------------|---------|------------|
| `core/paragraph` | Body text | - |
| `core/heading` | Section headers | `level`: 2, 3, or 4 |
| `core/list` | Bullet/numbered lists | `ordered`: boolean |
| `core/quote` | Testimonials, callouts | - |
| `core/table` | Comparison tables | - |
| `core/image` | Image placeholders | `alt`: string |
| `core/buttons` | CTA buttons | - |
| `core/group` | Container blocks | - |

---

## Database Schema

### writer_jobs

```sql
CREATE TABLE writer_jobs (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  task_id UUID,
  page_id UUID,
  job_config JSONB NOT NULL,        -- Contains masterProfile, contextPack, task
  target_wordpress BOOLEAN DEFAULT true,
  target_linkedin BOOLEAN DEFAULT false,
  target_gmb BOOLEAN DEFAULT false,
  target_reddit BOOLEAN DEFAULT false,
  tone_profile_id TEXT DEFAULT 'friendly-expert',
  status TEXT DEFAULT 'pending',    -- pending, processing, completed, failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### writer_outputs

```sql
CREATE TABLE writer_outputs (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES writer_jobs(id),
  project_id UUID NOT NULL,
  wp_title TEXT NOT NULL,
  wp_slug TEXT NOT NULL,
  wp_excerpt TEXT DEFAULT '',
  wp_blocks JSONB NOT NULL,         -- Array of WordPress blocks
  wp_seo JSONB NOT NULL,            -- focusKeyphrase, seoTitle, metaDescription
  wp_images JSONB DEFAULT '[]',
  wp_internal_links JSONB DEFAULT '[]',
  audit_data JSONB NOT NULL,        -- wordCount, readingTimeMinutes, etc.
  content_hash TEXT NOT NULL,
  validation_passed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API Endpoints

### POST /api/projects/{projectId}/writer

Creates a new writer job (generates brief).

**Request:**
```json
{
  "taskId": "uuid",
  "publishingTargets": {
    "wordpress": true,
    "linkedin": false,
    "gmb": false,
    "reddit": false
  },
  "toneProfileId": "friendly-expert"
}
```

**Response:**
```json
{
  "data": {
    "id": "job-uuid",
    "status": "pending",
    "masterProfileVersion": 2,
    "contextPackId": "pack-uuid"
  }
}
```

### POST /api/projects/{projectId}/writer/{jobId}/generate

Generates the article content via GPT-4o.

**Request:** (empty body)

**Response:**
```json
{
  "data": {
    "outputId": "output-uuid",
    "title": "Article Title",
    "wordCount": 1547,
    "readingTimeMinutes": 8
  }
}
```

### POST /api/projects/{projectId}/publishes

Publishes content to WordPress.

**Request:**
```json
{
  "taskId": "uuid",
  "channel": "wordpress",
  "title": "Article Title",
  "slug": "article-slug",
  "excerpt": "Article excerpt",
  "blocks": [...],
  "seo": {...},
  "status": "draft"
}
```

---

## UI Flow

### Task Detail Panel

The slide-out panel shows:

1. **Header** - Task title, badges (role, status), service/location info
2. **Workflow Steps** - Visual progress indicator (4 steps)
3. **Content Area** - Changes based on current step:
   - Step 1: "Generate Brief" button + task details
   - Step 2: "Create Article" button + brief summary
   - Step 3: Preview tabs (Preview / Edit) + SEO details
   - Step 4: Success confirmation
4. **Footer** - Reading time, Copy Blocks button, Publish to WordPress button

### Preview Mode

Renders WordPress blocks as formatted HTML:
- Headings with proper hierarchy
- Paragraphs with links and emphasis
- Lists (bulleted and numbered)
- Blockquotes for testimonials
- CTA buttons
- Image placeholders

---

## Configuration

### Tone Profiles

Available tone profiles (stored in `packages/writer/src/tones/profiles.ts`):

| ID | Name | Description |
|----|------|-------------|
| `friendly-expert` | Friendly Expert | Warm, knowledgeable, approachable |
| `professional` | Professional | Formal, authoritative, business-like |
| `casual` | Casual | Relaxed, conversational, friendly |
| `technical` | Technical | Detailed, precise, expert-focused |

### Environment Variables

```env
OPENAI_API_KEY=sk-...           # Required for GPT-4o calls
NEXT_PUBLIC_SUPABASE_URL=...    # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=...   # Supabase admin key
```

---

## Guardrails

### Truth Layer

The system includes a "Truth Layer" that tracks:

- **Verified Claims** - Facts confirmed from GBP, reviews, or site content
- **Restricted Claims** - Unverified superlatives, review stats without source
- **Must Not Say** - Auto-populated from risky claims

### Service Inference

Multi-confirm rule prevents wrong service detection:
- Requires 2+ source types (nav, H1, URL, content) OR 3+ pages
- Niche lock filters cross-niche services (e.g., "Heating" for Estate Agent)

### Review Claim Gating

Numeric review claims (e.g., "4.9 stars", "200+ reviews") only pass verification if:
- GBP is connected
- Reviews have been scraped
- Count is within 20% accuracy

---

## Known Limitations

1. **No rich text editor yet** - Edit mode shows raw JSON blocks
2. **No image generation** - Image blocks are placeholders with prompts
3. **Single article per task** - No revision history
4. **WordPress only** - LinkedIn, GMB, Reddit outputs not yet implemented

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/components/growth/TaskDetailPanel.tsx` | Task detail slide-out panel |
| `src/app/api/projects/[projectId]/writer/route.ts` | Brief generation endpoint |
| `src/app/api/projects/[projectId]/writer/[jobId]/generate/route.ts` | Article generation endpoint |
| `src/lib/context/buildMasterProfile.ts` | Master Profile builder |
| `src/lib/context/buildTaskContextPack.ts` | Task Context Pack builder |
| `packages/writer/src/tones/profiles.ts` | Tone profile definitions |

---

## Feedback Requested

1. **Prompt Quality** - Is the article generation prompt providing enough context? Too much?
2. **Output Format** - Are WordPress blocks the right format? Should we support markdown?
3. **Guardrails** - Are the truth layer restrictions too aggressive or not enough?
4. **Workflow** - Is the 4-step flow intuitive? Should we combine steps?
5. **Missing Features** - What's the highest priority addition?

---

## Next Steps

- [ ] Add rich text editor for article editing
- [ ] Implement image generation with DALL-E
- [ ] Add LinkedIn, GMB, Reddit output variants
- [ ] Build revision history / version comparison
- [ ] Add batch article generation
- [ ] Implement A/B title testing
