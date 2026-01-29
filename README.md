# SiteFix Planner

A comprehensive SEO audit and content planning platform built with Next.js 14, Supabase, and TypeScript.

## Features

### 🔍 Site Crawling
- Crawls your entire website from the homepage
- Extracts page metadata, content, and internal links
- Classifies pages by business value (Money, Trust, Support)
- Respects robots.txt directives

### 📊 Deep Audits
- 11 deterministic SEO checks per page
- Health score calculation with weighted categories:
  - Content (40%): Title, H1, meta description, word count
  - Technical (30%): Canonical, status codes
  - Linking (10%): Internal links, orphan detection
  - Trust (20%): Duplicate content detection
- Generates actionable fix items with acceptance criteria

### 📝 Brief Generator
- Human briefs for writers with clear instructions
- GPT briefs with structured context blocks
- Channel-specific rendering (WordPress, GMB, LinkedIn)
- Bead integration for trust signals

### 📋 Fix Planner
- Kanban-style task management
- Priority ordering by severity and page value
- Status tracking: Open → In Progress → Review → Done
- Foundation score recalculation on completion

### 🚀 Growth Planner
- Unlocks when foundation score reaches 80+
- 12-month content calendar generation
- Topic suggestions based on business context
- Multi-channel content strategy

### 💎 Beads System
- Store proof points and trust signals
- Categories: Testimonials, Stats, Awards, Guarantees, Certifications, Experience
- Priority weighting for brief inclusion
- Full CRUD management

### 📤 Publishing
- WordPress API integration
- Direct post/page publishing
- Publishing history tracking
- Status monitoring (pending, published, failed)

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + Auth)
- **Styling**: Tailwind CSS
- **State Management**: React Query (TanStack Query)
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React
- **Crawler**: Cheerio + robots-parser

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd sitefix-planner
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Fill in your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-key (optional)
```

4. Set up the database:
- Go to your Supabase dashboard
- Navigate to SQL Editor
- Run the contents of `supabase/schema.sql`

5. Start the development server:
```bash
pnpm dev
```

Visit `http://localhost:3000`

## Project Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   └── projects/           # Project-scoped endpoints
│   ├── app/                    # Protected dashboard routes
│   │   └── [projectId]/        # Project pages
│   ├── login/                  # Auth pages
│   ├── signup/
│   └── onboarding/             # Project setup wizard
├── components/
│   ├── layout/                 # Sidebar, Header
│   ├── providers.tsx           # React Query provider
│   └── ui/                     # Reusable components
├── lib/
│   ├── audit/                  # Audit engine
│   ├── brief/                  # Brief generator
│   ├── crawler/                # Site crawler
│   ├── supabase/               # DB clients
│   └── utils.ts                # Utility functions
└── types/
    └── index.ts                # TypeScript definitions
```

## Database Schema

Key tables:
- `projects` - Website projects with domain and settings
- `pages` - Crawled pages with metadata and scores
- `audits` - Audit results per page
- `fix_items` - Individual issues to fix
- `tasks` - Trackable fix tasks
- `briefs` - Generated content briefs
- `beads` - Trust signals and proof points
- `growth_plans` - 12-month content strategies
- `channel_connections` - Publishing integrations
- `publishes` - Publishing history

See `supabase/schema.sql` for complete schema.

## API Endpoints

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/[id]` - Get project
- `PATCH /api/projects/[id]` - Update project
- `DELETE /api/projects/[id]` - Delete project

### Pages
- `GET /api/projects/[id]/pages` - List pages
- `GET /api/projects/[id]/pages/[pageId]` - Get page with relations

### Crawl & Audit
- `POST /api/projects/[id]/crawl` - Start crawl
- `POST /api/projects/[id]/audit` - Run audit

### Tasks
- `GET /api/projects/[id]/tasks` - List tasks
- `PATCH /api/projects/[id]/tasks/[taskId]` - Update task status

### Beads
- `GET /api/projects/[id]/beads` - List beads
- `POST /api/projects/[id]/beads` - Create bead
- `PATCH /api/projects/[id]/beads/[beadId]` - Update bead
- `DELETE /api/projects/[id]/beads/[beadId]` - Delete bead

### Briefs
- `GET /api/projects/[id]/briefs` - List briefs

### Publishing
- `GET /api/projects/[id]/channels` - List connections
- `POST /api/projects/[id]/channels` - Add connection
- `GET /api/projects/[id]/publishes` - Publishing history
- `POST /api/projects/[id]/publishes` - Publish content

## Workflow

1. **Create Project**: Enter website URL and business details
2. **Onboarding Wizard**: Add beads, import reviews, set brand voice
3. **Crawl**: System crawls all reachable pages
4. **Audit**: Each page receives health score and fix items
5. **Fix Planner**: Work through issues by priority
6. **Unlock Growth**: Reach 80+ foundation score
7. **Growth Planner**: Generate 12-month content strategy
8. **Publish**: Push content to connected channels

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines first.
