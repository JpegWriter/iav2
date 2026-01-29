# IA V2 - Data Architecture & Writer System Handoff

## Overview

This document provides a complete reference for the data storage architecture and the writer system in the Infinite Authority V2 platform.

---

## 📊 Database Schema (Supabase)

### Core Tables

#### `projects`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Owner (references auth.users) |
| root_url | TEXT | Website root URL |
| name | TEXT | Project name |
| settings | JSONB | Crawl settings: maxPages, maxDepth, languages, primaryGoal |
| status | TEXT | onboarding \| crawling \| auditing \| ready \| planning |
| foundation_score | INTEGER | 0-100 score for site health |
| growth_planner_unlocked | BOOLEAN | Whether growth planner is accessible |

---

#### `user_context` (Onboarding Data)
| Column | Type | Description |
|--------|------|-------------|
| project_id | UUID | Links to project (1:1) |
| business | JSONB | Company name, niche, years, locations, USPs |
| offers | JSONB | Services/products with pricing, descriptions |
| audience | JSONB | Target customers, pain points, objections |
| brand_voice | JSONB | Tone preferences, personality traits |
| assets | JSONB | Logo URL, image library references |
| compliance | JSONB | "Do not say" phrases, legal notes |

**Example `business` JSONB:**
```json
{
  "name": "Malta Plumbing and Electrical",
  "niche": "Emergency plumbing and electrical services",
  "yearsInBusiness": 15,
  "locations": ["Malta", "Valletta", "Sliema"],
  "primaryService": "24 Hour Emergency Plumbing",
  "allServices": ["Emergency Plumbing", "Electrical Repairs", "Boiler Installation"],
  "usps": ["24/7 availability", "Licensed professionals", "Fixed pricing"]
}
```

**Example `audience` JSONB:**
```json
{
  "primaryAudience": "Homeowners in Malta",
  "painPoints": ["Burst pipes at night", "No electrician available on weekends"],
  "objections": ["Is this going to be expensive?", "How fast can you get here?"],
  "buyingTriggers": ["Flood damage", "Power outage", "Gas smell"]
}
```

---

#### `beads` (Proof Atoms)
| Column | Type | Description |
|--------|------|-------------|
| project_id | UUID | Parent project |
| type | TEXT | proof \| authority \| process \| differentiator \| offer \| local |
| label | TEXT | Short label (e.g., "Years Experience") |
| value | TEXT | The proof statement (e.g., "15+ years serving Malta") |
| priority | INTEGER | 0-100 ranking |
| channels | TEXT[] | ['wp', 'gmb', 'li'] - where to use |
| where_to_use | TEXT[] | Specific page types |
| claims_policy | JSONB | mustBeVerifiable, allowedParaphrases, forbiddenPhrases |

---

#### `reviews`
| Column | Type | Description |
|--------|------|-------------|
| project_id | UUID | Parent project |
| source | TEXT | gbp \| website \| csv \| manual |
| rating | INTEGER | 1-5 stars |
| author | TEXT | Reviewer name |
| date | DATE | Review date |
| text | TEXT | Full review text |
| consent | JSONB | { allowedToRepublish: true, notes: "" } |

---

#### `review_themes` (AI-Extracted)
| Column | Type | Description |
|--------|------|-------------|
| project_id | UUID | Parent project |
| theme | TEXT | e.g., "fast response", "professional", "fair pricing" |
| count | INTEGER | How many reviews mention this |
| supporting_snippets | TEXT[] | Exact quotes from reviews |
| recommended_uses | TEXT[] | Suggested content placements |

---

### Website Data

#### `crawl_runs`
| Column | Type | Description |
|--------|------|-------------|
| project_id | UUID | Parent project |
| status | TEXT | pending \| running \| completed \| failed |
| pages_found | INTEGER | Total URLs discovered |
| pages_crawled | INTEGER | Successfully crawled |
| errors | TEXT[] | Error messages |
| limits | JSONB | { maxPages, maxDepth } |

---

#### `pages`
| Column | Type | Description |
|--------|------|-------------|
| project_id | UUID | Parent project |
| url | TEXT | Full page URL |
| path | TEXT | URL path (e.g., /services/plumbing) |
| title | TEXT | Page title |
| h1 | TEXT | H1 heading |
| meta_description | TEXT | Meta description |
| word_count | INTEGER | Content length |
| role | TEXT | money \| trust \| authority \| support |
| priority_score | INTEGER | Business value score |
| priority_rank | INTEGER | Rank within project |
| health_score | INTEGER | SEO health score |
| internal_links_in | INTEGER | Inbound internal links |
| internal_links_out | INTEGER | Outbound internal links |
| is_orphan | BOOLEAN | No internal links pointing to it |

---

#### `page_links`
| Column | Type | Description |
|--------|------|-------------|
| from_url | TEXT | Source page URL |
| to_url | TEXT | Destination page URL |
| anchor_text | TEXT | Link text |
| is_nav | BOOLEAN | In navigation |
| is_footer | BOOLEAN | In footer |

---

### Vision Analysis

#### `vision_evidence_packs`
| Column | Type | Description |
|--------|------|-------------|
| project_id | UUID | Parent project |
| context_snapshot | JSONB | Topic, service, audience context at time of upload |
| combined_narrative | TEXT | AI-generated summary of all images |
| primary_hero_image_id | UUID | Best image for hero use |
| cross_image_themes | TEXT[] | Common themes across images |
| used_in_task_ids | UUID[] | Growth plan tasks using this pack |

---

#### `vision_evidence_images`
| Column | Type | Description |
|--------|------|-------------|
| pack_id | UUID | Parent pack |
| image_url | TEXT | Supabase Storage URL |
| original_filename | TEXT | Original file name |
| mime_type | TEXT | image/jpeg, image/png, etc. |
| width, height | INTEGER | Dimensions |
| evidence | JSONB | Full AI analysis (see below) |

**`evidence` JSONB Structure:**
```json
{
  "sceneSummary": "A plumber fixing a pipe under a kitchen sink",
  "sceneType": "work_in_progress",
  "entities": [
    { "name": "plumber", "type": "person", "confidence": 95 },
    { "name": "wrench", "type": "equipment", "confidence": 90 }
  ],
  "expressions": [
    { "emotion": "focused", "confidence": 85, "personIndex": 0 }
  ],
  "storyAngles": [
    {
      "angle": "Show the human side of emergency repairs",
      "applicableContentTypes": ["blog", "social", "case_study"],
      "suggestedHook": "Behind every emergency call is a real person...",
      "emotionalAppeal": "trust"
    }
  ],
  "heroSuitabilityScore": 85,
  "technicalFlags": {
    "resolution": "high",
    "lighting": "good",
    "blur": "none",
    "composition": "excellent"
  },
  "suggestedAlt": "Licensed plumber repairing kitchen sink pipes in Malta home",
  "suggestedCaption": "Our team responding to an emergency call in Valletta",
  "suggestedKeywords": ["emergency plumber malta", "kitchen plumbing repair"],
  "complianceNotes": {
    "hasIdentifiableFaces": true,
    "hasMinors": false,
    "usageRisk": "low",
    "recommendedActions": ["Confirm customer consent for image use"]
  }
}
```

---

### Growth Planning

#### `growth_plans`
| Column | Type | Description |
|--------|------|-------------|
| project_id | UUID | Parent project (1:1) |
| months | JSONB | 12-month content calendar |
| generated_at | TIMESTAMPTZ | When plan was created |

**`months` JSONB Structure:**
```json
[
  {
    "month": 1,
    "theme": "Foundation & Conversion Fixes",
    "focus": "foundation",
    "monthlyGoal": "Establish clear identity and remove conversion blockers",
    "kpis": ["Primary money page live", "Contact forms working"],
    "tasks": [
      {
        "id": "uuid",
        "title": "Emergency Plumbing in Malta: What to Expect",
        "slug": "emergency-plumbing-malta",
        "role": "money",
        "cadenceSlot": "money",
        "primaryService": "Emergency Plumbing",
        "primaryLocation": "Malta",
        "targetAudience": "Homeowners needing emergency repairs",
        "estimatedWords": 1800,
        "status": "planned",
        "imagePackId": "uuid-if-images-attached",
        "imageCount": 2
      }
    ]
  }
]
```

---

### Writing System

#### `writer_jobs`
| Column | Type | Description |
|--------|------|-------------|
| project_id | UUID | Parent project |
| task_id | UUID | Growth plan task ID |
| job_config | JSONB | Full context for writing |
| status | TEXT | pending \| processing \| completed \| failed |
| tone_profile_id | TEXT | friendly-expert, founder-led-confident, etc. |
| tone_overrides | JSONB | Custom tone adjustments |
| target_wordpress | BOOLEAN | Generate WP article |
| target_linkedin | BOOLEAN | Generate LinkedIn post |
| target_gmb | BOOLEAN | Generate GMB post |
| target_reddit | BOOLEAN | Generate Reddit post |

---

#### `writer_outputs`
| Column | Type | Description |
|--------|------|-------------|
| job_id | UUID | Parent job |
| project_id | UUID | Parent project |
| output_type | TEXT | wordpress \| linkedin \| gmb \| reddit |
| content_json | JSONB | Block-editor JSON or post content |
| content_html | TEXT | Rendered HTML |
| content_hash | TEXT | Deduplication hash |
| seo_package | JSONB | Title, meta, keyphrases, schema |
| image_placements | JSONB | Hero and inline image specs |

---

## 🖊️ Writer Package (`packages/writer/`)

### Directory Structure

```
packages/writer/
├── src/
│   ├── index.ts              # Main exports
│   ├── orchestrator.ts       # Pipeline coordinator
│   ├── types.ts              # TypeScript interfaces
│   ├── tones/
│   │   ├── index.ts
│   │   └── profiles.ts       # 7 pre-built tone profiles
│   ├── prompts/
│   │   ├── index.ts
│   │   ├── buildArticlePrompt.ts    # WordPress article prompt
│   │   ├── buildLinkedInPrompt.ts   # LinkedIn post variants
│   │   ├── buildGmbPrompt.ts        # GMB post variants
│   │   └── buildRedditPrompt.ts     # Reddit post prompt
│   ├── media/
│   │   └── mediaPlanner.ts   # Image selection & placement
│   └── validators/
│       └── wpValidator.ts    # Output validation
└── tests/
```

---

### Tone Profiles Available

| Profile ID | Name | Best For |
|------------|------|----------|
| `friendly-expert` | Friendly Expert | Most service businesses |
| `founder-led-confident` | Founder-Led Confident | Personal brands, consultants |
| `luxury-premium` | Luxury Premium | High-end services |
| `direct-no-nonsense` | Direct & No-Nonsense | Trades, B2B |
| `playful-local` | Playful Local | Local businesses, casual brands |
| `b2b-corporate` | B2B Corporate | Enterprise, SaaS |
| `empathetic-helper` | Empathetic Helper | Healthcare, support services |

**Each profile defines:**
- `voice.formality`: formal / neutral / informal
- `voice.confidence`: confident / neutral / humble
- `voice.humourLevel`: none / subtle / playful
- `voice.sentenceLengthBias`: short / mixed / long
- `tabooWords`: Words to avoid
- `persuasionLevel`: low / medium / high
- `ctaStyle`: soft / direct / urgent
- `readingLevel`: simple / standard / advanced

---

### Prompt Builders

#### `buildArticlePrompt(task, contextPack, plan, tone)`
Generates a WordPress article with:
- Block-editor JSON output (core/paragraph, core/heading, core/list, etc.)
- SEO package (title, meta, keyphrases)
- Image placements (hero + inline)
- Internal links

#### `buildLinkedInPrompt(task, contextPack, tone)`
Variants:
- Standard post
- Thought leader variant
- Data-driven variant  
- Question hook variant
- Carousel prompt

#### `buildGmbPrompt(task, contextPack, tone)`
Variants:
- Standard update
- Seasonal/holiday
- Problem-solver
- Review follow-up

#### `buildRedditPrompt(task, contextPack, tone)`
For authentic Reddit-style engagement.

---

### Writer Orchestrator Flow

```
1. VALIDATE INPUTS
   └── Check task has required fields

2. BUILD CONTEXT PACK
   ├── User context (business, audience)
   ├── Site context (pages, links)
   ├── Proof context (beads, reviews)
   └── Vision context (image analysis)

3. GENERATE WRITER PLAN
   ├── H1 / title
   ├── Section outline
   ├── Target word count
   └── Image placement strategy

4. GENERATE WORDPRESS ARTICLE
   ├── Call LLM with buildArticlePrompt
   ├── Parse JSON blocks
   └── Validate structure

5. GENERATE SOCIAL POSTS (optional)
   ├── LinkedIn
   ├── GMB
   └── Reddit

6. VALIDATE & HASH
   └── Content hash for deduplication

7. RETURN WritingOutput
```

---

## 🔗 Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects/[id]/context` | GET/POST | User context CRUD |
| `/api/projects/[id]/beads` | GET/POST | Proof points CRUD |
| `/api/projects/[id]/reviews/scrape` | POST | Import reviews |
| `/api/projects/[id]/crawl` | POST | Start crawl |
| `/api/projects/[id]/pages` | GET | List crawled pages |
| `/api/projects/[id]/growth-plan` | GET/DELETE | Get/clear growth plan |
| `/api/projects/[id]/growth-plan/generate` | POST | Generate 12-month plan |
| `/api/projects/[id]/vision/evidence` | POST | Upload & analyze images |
| `/api/projects/[id]/writer` | POST | Create writing job |
| `/api/projects/[id]/writer/[jobId]` | GET | Get job status |
| `/api/projects/[id]/writer/[jobId]/output` | GET | Get generated content |

---

## 🔄 Data Flow Summary

```
ONBOARDING
    │
    ├── User inputs business details → user_context
    ├── User adds proof points → beads
    ├── User imports reviews → reviews → review_themes
    └── User uploads images → vision_evidence_packs + vision_evidence_images

CRAWL & AUDIT
    │
    ├── Crawler runs → crawl_runs + pages + page_links
    └── Auditor scores → pages.health_score, pages.role

GROWTH PLANNING
    │
    └── Planner generates → growth_plans.months

WRITING
    │
    ├── User clicks "Generate Brief" → writer_jobs
    ├── Orchestrator runs → writer_outputs
    └── Task status updates → growth_plans.months[].tasks[].status
```

---

## 📦 Storage Locations

| Data Type | Storage |
|-----------|---------|
| Images | Supabase Storage: `images/vision/{projectId}/{packId}/{filename}` |
| Exports | Supabase Storage: `exports/{projectId}/{type}/{date}.json` |
| All other data | Supabase PostgreSQL tables |

---

## Next Steps for Writing Implementation

1. **Connect orchestrator to writer API** - Call `runWriterOrchestrator()` when job is created
2. **Add LLM call function** - Inject OpenAI call into orchestrator options
3. **Store outputs** - Save to `writer_outputs` table
4. **Update task status** - planned → briefed → writing → review → published
