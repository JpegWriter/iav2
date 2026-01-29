# Ultimate Writer

Converts Growth Planner tasks + briefs into:
1. **WordPress-safe articles** (block-editor JSON, not HTML blobs)
2. **Hero image + inline image placements** with SEO metadata
3. **Platform-specific companion posts**: LinkedIn, Google Business Profile (GMB), Reddit

## 🎯 Key Principles

- **Works for ANY niche** - No assumptions about photography, plumbing, or any specific industry
- **Uses richest context available** - Vision analysis, user onboarding, reviews + EEAT signals
- **WordPress block-safe** - Outputs valid Gutenberg block JSON
- **Validation-first** - All outputs validated before returning

## 📦 Installation

```bash
# From workspace root
pnpm install

# Build the package
cd packages/writer
pnpm build
```

## 🚀 Quick Start

```typescript
import { runWriterOrchestrator } from '@iav2/writer';

const result = await runWriterOrchestrator(writingJob, {
  llmCall: async (prompt) => {
    // Your LLM integration
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  },
  verbose: true,
});

if (result.success) {
  console.log('WordPress blocks:', result.output.wordpress.blocks);
  console.log('LinkedIn post:', result.output.social.linkedin);
  console.log('GMB post:', result.output.social.gmb);
}
```

## 📊 Architecture

```
WritingJob (input)
    │
    ▼
┌───────────────────┐
│   ORCHESTRATOR    │
├───────────────────┤
│ 1. Validate Input │
│ 2. Build Context  │
│ 3. Generate Plan  │
│ 4. Resolve Tone   │
│ 5. Generate WP    │
│ 6. Validate WP    │
│ 7. Generate Social│
│ 8. Return Output  │
└───────────────────┘
    │
    ▼
WritingOutput (output)
```

## 📁 Package Structure

```
packages/writer/
├── src/
│   ├── types.ts          # Canonical input/output types
│   ├── orchestrator.ts   # Main pipeline coordinator
│   ├── index.ts          # Package exports
│   ├── tones/
│   │   ├── profiles.ts   # 6 tone profiles + helpers
│   │   └── index.ts
│   ├── media/
│   │   └── mediaPlanner.ts  # Hero + inline image planning
│   ├── validators/
│   │   └── wpValidator.ts   # WordPress output validation
│   └── prompts/
│       ├── buildArticlePrompt.ts
│       ├── buildLinkedInPrompt.ts
│       ├── buildGmbPrompt.ts
│       ├── buildRedditPrompt.ts
│       └── index.ts
├── tests/
│   ├── fixtures.ts       # Test data for 4 niches
│   ├── wpValidator.test.ts
│   ├── mediaPlanner.test.ts
│   └── toneProfiles.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 🎨 Tone Profiles

| Profile ID | Name | Formality | Best For |
|------------|------|-----------|----------|
| `friendly-expert` | Friendly Expert | 3/5 | Most service businesses |
| `founder-led-confident` | Founder-Led Confident | 3/5 | Personal brands, startups |
| `luxury-premium` | Luxury Premium | 5/5 | High-end retail, luxury services |
| `direct-no-nonsense` | Direct & No-Nonsense | 3/5 | Trades, contractors |
| `playful-local` | Playful & Local | 2/5 | Cafes, local shops |
| `b2b-corporate` | B2B Corporate | 4/5 | Enterprise, SaaS |

### Using Tone Profiles

```typescript
import { getToneProfile, mergeToneProfile, getToneInstructions } from '@iav2/writer/tones';

// Get a profile
const tone = getToneProfile('friendly-expert');

// Customize it
const customTone = mergeToneProfile(tone, {
  voice: { formality: 4 },
  tabooWords: ['synergy', 'leverage'],
});

// Get instructions for a platform
const instructions = getToneInstructions(customTone, 'linkedin');
```

## 🖼️ Media Planner

```typescript
import { selectHeroImage, planInlineImages, generateImageMetadata } from '@iav2/writer/media';

// Select best hero image
const heroSelection = selectHeroImage(visionAnalysisResults, 'plumbing services');
console.log(heroSelection.assetRef);
console.log(heroSelection.reason);

// Plan inline images
const inlinePlan = planInlineImages(images, sections, minImages: 2, maxImages: 5);
console.log(inlinePlan.placements);
console.log(inlinePlan.placeholders);
```

## ✅ Validation

The WordPress validator checks:
- Block count limits
- HTML byte size
- Paragraph length
- H2/H3 counts
- Internal link requirements
- CTA presence
- Forbidden markup (scripts, inline event handlers)
- SEO field lengths
- Keyphrase usage

```typescript
import { validateWordPressOutput, validateWriterTaskInputs } from '@iav2/writer/validators';

// Validate task inputs before generation
const inputValidation = validateWriterTaskInputs(task);
if (!inputValidation.valid) {
  console.log(inputValidation.errors);
}

// Validate generated output
const validation = validateWordPressOutput(wordpressOutput, task);
console.log(validation.valid);
console.log(validation.stats);
console.log(validation.warnings);
```

## 📝 Prompt Builders

Each platform has specialized prompt builders:

### WordPress Article
```typescript
import { buildArticlePrompt, buildRewritePrompt } from '@iav2/writer/prompts';

const prompt = buildArticlePrompt(contextPack, plan, task, tone);
```

### LinkedIn
```typescript
import { 
  buildLinkedInPrompt,
  buildLinkedInThoughtLeaderVariant,
  buildLinkedInDataVariant,
  buildLinkedInCarouselPrompt,
} from '@iav2/writer/prompts';
```

### Google Business Profile
```typescript
import { 
  buildGmbPrompt,
  buildGmbSeasonalPrompt,
  buildGmbProblemSolverPrompt,
} from '@iav2/writer/prompts';
```

### Reddit
```typescript
import { 
  buildRedditPrompt,
  buildRedditAmaPrompt,
  buildRedditGuidePrompt,
  REDDIT_COMMENT_TEMPLATES,
} from '@iav2/writer/prompts';
```

## 🔌 Backend Integration

### API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/[projectId]/writer` | Create writer job |
| GET | `/api/projects/[projectId]/writer` | List writer jobs |
| GET | `/api/projects/[projectId]/writer/[jobId]` | Get job details |
| DELETE | `/api/projects/[projectId]/writer/[jobId]` | Cancel/delete job |
| PATCH | `/api/projects/[projectId]/writer/[jobId]` | Retry failed job |
| GET | `/api/projects/[projectId]/writer/[jobId]/output` | Get generated output |
| POST | `/api/projects/[projectId]/writer/[jobId]/output` | Apply output to task |

### Database Tables

```sql
-- Writer jobs
writer_jobs (id, project_id, task_id, job_config, status, ...)

-- Generated outputs
writer_outputs (id, job_id, wp_title, wp_blocks, linkedin_output, ...)

-- LLM call logs
writer_runs (id, job_id, step_name, input_tokens, output_tokens, ...)
```

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test wpValidator
```

### Test Fixtures

The package includes fixtures for 4 different niches:
- **Local Service** (Plumber)
- **E-commerce** (Jewelry Store)
- **B2B SaaS** (Project Management)
- **Professional Services** (Law Firm)

```typescript
import { localServiceFixture, ecommerceFixture, b2bSaasFixture } from '@iav2/writer/tests/fixtures';
```

## 📋 WritingJob Schema

```typescript
interface WritingJob {
  task: WriterTask;           // Role, intent, service, links, constraints
  userContext: UserContext;   // Business name, industry, services, tone
  siteContext: SiteContext;   // Domain, service areas, existing pages
  proofContext: ProofContext; // Reviews, credentials, stats, EEAT
  visionContext: VisionAnalysis[]; // Analyzed images
  publishingTargets: {
    wordpress: boolean;
    linkedin: boolean;
    gmb: boolean;
    reddit: boolean;
  };
}
```

## 📋 WritingOutput Schema

```typescript
interface WritingOutput {
  wordpress: {
    title: string;
    slug: string;
    excerpt: string;
    blocks: WPBlock[];        // Gutenberg-safe block JSON
    seo: SEOPackage;
    images: { hero, inline };
    internalLinksUsed: InternalLinkUsed[];
  };
  social: {
    linkedin: SocialOutput | null;
    gmb: SocialOutput | null;
    reddit: SocialOutput | null;
  };
  audit: {
    wordCount: number;
    blockCount: number;
    readingTimeMinutes: number;
    validationWarnings: ValidationWarning[];
    contentHash: string;
    generatedAt: string;
  };
}
```

## 🚫 What This Package Does NOT Do

- **No LLM calls** - You inject your own `llmCall` function
- **No file uploads** - Image management is external
- **No publishing** - Outputs are returned for your publishing pipeline
- **No UI** - Headless, API-focused

## 📄 License

MIT
