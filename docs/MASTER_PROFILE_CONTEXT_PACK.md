# Master Profile & Context Pack System

## Overview

This document describes the **Master Profile + Context Pack** architecture that ensures the Writer Orchestrator always receives unified, authentic context for content generation.

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        PROJECT MASTER PROFILE                             │
│  "What's true about this business?" - stable, versioned per project      │
│                                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ user_context│  │   beads     │  │  reviews +  │  │ pages +     │      │
│  │ (onboarding)│  │ (proof      │  │  themes     │  │ page_links  │      │
│  │             │  │  atoms)     │  │             │  │ (crawl)     │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│         │                │                │                │              │
│         └────────────────┴────────────────┴────────────────┘              │
│                                   │                                       │
│                                   ▼                                       │
│                    ┌──────────────────────────┐                          │
│                    │  buildMasterProfile()     │                          │
│                    │  @/lib/context            │                          │
│                    └──────────────────────────┘                          │
│                                   │                                       │
│                                   ▼                                       │
│                    ┌──────────────────────────┐                          │
│                    │ project_master_profiles  │                          │
│                    │ (versioned, hashed)      │                          │
│                    └──────────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        TASK CONTEXT PACK                                  │
│  "What's needed for THIS specific task?" - per writing job               │
│                                                                           │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                 │
│  │ Master Profile│  │ Task Brief    │  │ Vision Pack   │                 │
│  │ Snapshot      │  │ (from planner)│  │ (images)      │                 │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘                 │
│          │                  │                  │                          │
│          │    ┌─────────────┴─────────────┐    │                          │
│          │    │                           │    │                          │
│          ▼    ▼                           ▼    ▼                          │
│  ┌─────────────────┐              ┌─────────────────┐                    │
│  │ Internal Links  │              │ Rewrite Context │                    │
│  │ (upLinks/down)  │              │ (if mode=update)│                    │
│  └─────────────────┘              └─────────────────┘                    │
│                                                                           │
│                    ┌──────────────────────────┐                          │
│                    │ buildTaskContextPack()   │                          │
│                    │ @/lib/context            │                          │
│                    └──────────────────────────┘                          │
│                                   │                                       │
│                                   ▼                                       │
│                    ┌──────────────────────────┐                          │
│                    │   task_context_packs     │                          │
│                    │   (hashed per task)      │                          │
│                    └──────────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          WRITER JOB CONFIG                                │
│                                                                           │
│    writer_jobs.job_config = {                                            │
│      task: WriterBrief,                                                  │
│      masterProfileId,                                                    │
│      masterProfileVersion,                                               │
│      masterProfileSnapshot,                                              │
│      taskContextPackId,                                                  │
│      taskContextPackSnapshot,                                            │
│      toneProfileId,                                                      │
│      toneOverrides,                                                      │
│      targets: { wordpress, linkedin, gmb, reddit }                       │
│    }                                                                     │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Database Tables

### `project_master_profiles`

Stores stable, versioned business context documents.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Parent project (FK) |
| version | INTEGER | Auto-incrementing version |
| profile_hash | TEXT | SHA-256 hash for deduplication |
| profile_json | JSONB | Full MasterProfile document |
| generated_at | TIMESTAMPTZ | When profile was generated |

**Unique constraints:**
- `(project_id, profile_hash)` - Prevents duplicate content
- `(project_id, version)` - Ensures version uniqueness

### `task_context_packs`

Stores per-task context bundles.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Parent project (FK) |
| task_id | UUID | Growth plan task ID |
| mode | TEXT | 'create' or 'update' |
| original_url | TEXT | For rewrites: URL being updated |
| original_content | TEXT | For rewrites: cleaned extracted text |
| context_json | JSONB | Full TaskContextPack document |
| context_hash | TEXT | SHA-256 hash for deduplication |
| master_profile_id | UUID | Which master profile version used |
| generated_at | TIMESTAMPTZ | When pack was generated |

---

## API Integration

### Writer Job Creation Flow

```
POST /api/projects/[id]/writer
    │
    ├── 1. Fetch project + validate
    │
    ├── 2. Find task (tasks table or growth_plans.months JSONB)
    │
    ├── 3. buildMasterProfile(projectId)
    │       ├── Fetch: user_context, beads, reviews, review_themes, pages
    │       ├── Compute profile_hash
    │       └── Upsert (if hash unchanged, reuse existing version)
    │
    ├── 4. buildTaskContextPack({ projectId, task })
    │       ├── Get/build master profile
    │       ├── Build writer brief from task
    │       ├── Build internal linking plan
    │       ├── Build proof requirements
    │       ├── Build vision context (if imagePackId present)
    │       ├── Build rewrite context (if mode=update)
    │       └── Persist context pack
    │
    ├── 5. VALIDATE REWRITE MODE
    │       └── If mode=update: require originalUrl + originalContent
    │
    ├── 6. Create writer_jobs row with:
    │       ├── job_config (full WriterJobConfig)
    │       ├── context_pack_id
    │       └── master_profile_id
    │
    └── 7. Return job data with context references
```

---

## Master Profile Structure

```typescript
interface MasterProfile {
  // Versioning
  id: string;
  projectId: string;
  version: number;
  profileHash: string;
  generatedAt: string;

  // Business Identity
  business: {
    name: string;
    niche: string;
    yearsInBusiness?: number;
    locations: string[];
    primaryService: string;
    allServices: string[];
    usps: string[];
    websiteUrl: string;
  };

  // Target Audience
  audience: {
    primary: string;
    secondary?: string[];
    painPoints: string[];
    objections: string[];
    buyingTriggers: string[];
  };

  // Brand Voice
  brandVoice: {
    toneProfileId: string;
    toneOverrides?: Partial<ToneOverrides>;
    tabooWords: string[];
    complianceNotes: string[];
    mustSay: string[];      // Phrases that MUST appear
    mustNotSay: string[];   // Phrases that MUST NOT appear
  };

  // Proof Atoms (from beads)
  proofAtoms: ProofAtom[];

  // Review Intelligence
  reviews: {
    totalCount: number;
    averageRating: number;
    themes: ReviewTheme[];
    topSnippets: ReviewSnippet[];  // Consented quotes only
  };

  // Site Structure Summary
  siteMap: {
    totalPages: number;
    moneyPages: PageSummary[];
    trustPages: PageSummary[];
    supportPages: PageSummary[];
    authorityPages: PageSummary[];
    orphanedPages: number;
    internalLinkingHealth: 'poor' | 'fair' | 'good' | 'excellent';
  };

  // Local Signals
  localSignals?: {
    gbpConnected: boolean;
    napConsistent: boolean;
    serviceAreas: string[];
    businessHours?: string;
    primaryPhone?: string;
    primaryAddress?: string;
  };
}
```

---

## Task Context Pack Structure

```typescript
interface TaskContextPack {
  // Identifiers
  id: string;
  projectId: string;
  taskId: string;
  contextHash: string;
  generatedAt: string;

  // Mode
  mode: 'create' | 'update';

  // Master Profile Reference
  masterProfileId: string;
  masterProfileVersion: number;
  masterProfile: MasterProfile;

  // Task Brief (from planner)
  writerBrief: WriterBrief;

  // Internal Linking Plan
  internalLinking: {
    upLinks: InternalLinkTarget[];    // Links TO money/parent pages
    downLinks: InternalLinkTarget[];  // Links TO child/support pages
    sideLinks: InternalLinkTarget[];  // Related content links
    requiredAnchors: string[];
  };

  // Proof Requirements
  proofRequirements: {
    requiredProofElements: ProofElementType[];
    requiredEEATSignals: EEATSignalType[];
    selectedProofAtoms: ProofAtom[];  // Filtered for this task
  };

  // Vision/Image Context
  visionContext?: {
    packId: string;
    packNarrative: string;
    heroImage?: ImagePlan;
    inlineImages: ImagePlan[];
    crossImageThemes: string[];
  };

  // Rewrite Context (mode = 'update' only)
  rewriteContext?: RewriteContext;
}
```

---

## Rewrite Mode

When `mode === 'update'`, the context pack includes:

```typescript
interface RewriteContext {
  originalUrl: string;
  originalTitle: string;
  originalH1: string;
  originalMeta?: string;
  originalContent: string;  // Cleaned text, not HTML
  originalWordCount: number;
  
  // From crawl graph
  internalLinksIn: number;
  internalLinksOut: number;
  incomingLinkAnchors: string[];
  
  // Preservation rules
  preserveElements: string[];   // "keep pricing section", "keep legal disclaimer"
  removeElements: string[];     // "remove outdated promo"
  
  // Page health context
  currentHealthScore?: number;
  currentIssues: string[];
}
```

### Rewrite Validation

The `validateRewriteContext()` function checks:

| Check | Severity | Description |
|-------|----------|-------------|
| Missing rewriteContext | Error | Update mode requires context |
| Missing originalUrl | Error | Must know which page is being updated |
| Missing originalContent | Error | Can't properly rewrite without it |
| Short content (<200 words) | Warning | Consider treating as new content |
| No preservation rules | Warning | Suggest specifying what to keep |
| Missing title/H1 | Warning | Generated title may not maintain continuity |

---

## Compliance Validation

The `validateComplianceRules()` function checks generated output against:

1. **Taboo words** - from `brandVoice.tabooWords`
2. **Forbidden phrases** - from `brandVoice.mustNotSay`
3. **Required phrases** - from `brandVoice.mustSay`
4. **Proof claims policy** - from `proofAtoms[].claimsPolicy.forbiddenPhrases`

---

## Files Created

| File | Purpose |
|------|---------|
| [supabase/migrations/20240102_master_profile_context_pack.sql](../supabase/migrations/20240102_master_profile_context_pack.sql) | Database migration |
| [src/lib/context/types.ts](../src/lib/context/types.ts) | TypeScript interfaces |
| [src/lib/context/buildMasterProfile.ts](../src/lib/context/buildMasterProfile.ts) | Master profile builder |
| [src/lib/context/buildTaskContextPack.ts](../src/lib/context/buildTaskContextPack.ts) | Context pack builder |
| [src/lib/context/index.ts](../src/lib/context/index.ts) | Public exports |
| [packages/writer/src/context/adapter.ts](../packages/writer/src/context/adapter.ts) | Legacy format adapter |
| [packages/writer/src/types.ts](../packages/writer/src/types.ts) | Extended with unified types |
| [packages/writer/src/validators/wpValidator.ts](../packages/writer/src/validators/wpValidator.ts) | Added rewrite + compliance validators |
| [packages/writer/src/orchestrator.ts](../packages/writer/src/orchestrator.ts) | Added `runUnifiedWriterOrchestrator()` |

---

## Usage Examples

### Build Master Profile

```typescript
import { buildMasterProfile } from '@/lib/context';

const masterProfile = await buildMasterProfile(projectId);
console.log(`Master Profile v${masterProfile.version}`);
console.log(`Business: ${masterProfile.business.name}`);
console.log(`Services: ${masterProfile.business.allServices.join(', ')}`);
```

### Build Task Context Pack

```typescript
import { buildTaskContextPack } from '@/lib/context';

const contextPack = await buildTaskContextPack({
  projectId,
  task: {
    id: 'task-uuid',
    slug: 'emergency-plumbing-malta',
    role: 'money',
    primaryService: 'Emergency Plumbing',
    location: 'Malta',
    mode: 'create',
    imagePackId: 'vision-pack-uuid',
  },
});

console.log(`Context Pack: ${contextPack.id}`);
console.log(`Mode: ${contextPack.mode}`);
console.log(`Internal Links: ${contextPack.internalLinking.upLinks.length} up, ${contextPack.internalLinking.downLinks.length} down`);
```

### Run Unified Orchestrator

```typescript
import { runUnifiedWriterOrchestrator } from '@repo/writer';

const result = await runUnifiedWriterOrchestrator(
  jobConfig, // WriterJobConfig from writer_jobs.job_config
  {
    llmCall: async (prompt) => {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });
      return response.choices[0].message.content;
    },
    verbose: true,
  }
);

if (result.success) {
  console.log('Article generated:', result.output.wordpress.title);
}
```

---

## Migration Steps

To enable this system:

1. **Run the migration:**
   ```bash
   supabase db push
   ```

2. **Update existing writer jobs:**
   - Old jobs will continue to work (legacy format supported)
   - New jobs automatically use the unified format

3. **Verify context pack creation:**
   - Check `project_master_profiles` table after creating a writer job
   - Check `task_context_packs` table for task-specific context

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **Authenticity** | Writer always has access to real business data, not generic assumptions |
| **Consistency** | Same master profile used across all tasks = consistent brand voice |
| **Versioning** | Can trace which version of context was used for any output |
| **Deduplication** | Hash-based storage prevents redundant profile storage |
| **Rewrite Safety** | Update mode requires original content, preventing structure hallucination |
| **Compliance** | Built-in validation against taboo words and forbidden claims |
| **Traceability** | writer_jobs links to both context_pack_id and master_profile_id |
