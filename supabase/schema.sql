-- ============================================================================
-- SITEFIX PLANNER - SUPABASE DATABASE SCHEMA
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROJECTS
-- ============================================================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  root_url TEXT NOT NULL,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{
    "respectRobotsTxt": true,
    "includeSubdomains": false,
    "languages": ["en"],
    "primaryGoal": "leads",
    "maxPages": 200,
    "maxDepth": 5
  }'::jsonb,
  status TEXT NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding', 'crawling', 'auditing', 'ready', 'planning')),
  foundation_score INTEGER NOT NULL DEFAULT 0,
  growth_planner_unlocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);

-- ============================================================================
-- USER CONTEXT (Deep Business Profile)
-- ============================================================================

CREATE TABLE user_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  business JSONB NOT NULL DEFAULT '{}'::jsonb,
  offers JSONB NOT NULL DEFAULT '{}'::jsonb,
  audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand_voice JSONB NOT NULL DEFAULT '{}'::jsonb,
  assets JSONB NOT NULL DEFAULT '{"logo": null, "imageLibrary": []}'::jsonb,
  compliance JSONB NOT NULL DEFAULT '{"doNotSay": [], "legalNotes": []}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- BEADS (Truth Atoms)
-- ============================================================================

CREATE TABLE beads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('proof', 'authority', 'process', 'differentiator', 'offer', 'local')),
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  channels TEXT[] NOT NULL DEFAULT ARRAY['wp', 'gmb', 'li'],
  where_to_use TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  tone TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  claims_policy JSONB NOT NULL DEFAULT '{
    "mustBeVerifiable": true,
    "allowedParaphrases": [],
    "forbiddenPhrases": []
  }'::jsonb,
  local_signals JSONB,
  source JSONB NOT NULL DEFAULT '{"kind": "manual", "ref": null, "lastVerifiedAt": null}'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_beads_project_id ON beads(project_id);
CREATE INDEX idx_beads_type ON beads(type);

-- ============================================================================
-- REVIEWS
-- ============================================================================

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('gbp', 'website', 'csv', 'manual')),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  author TEXT NOT NULL,
  date DATE NOT NULL,
  text TEXT NOT NULL,
  url TEXT,
  consent JSONB NOT NULL DEFAULT '{"allowedToRepublish": true, "notes": ""}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_project_id ON reviews(project_id);

-- ============================================================================
-- REVIEW THEMES (Generated)
-- ============================================================================

CREATE TABLE review_themes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  supporting_snippets TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  recommended_uses TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_themes_project_id ON review_themes(project_id);

-- ============================================================================
-- CRAWL RUNS
-- ============================================================================

CREATE TABLE crawl_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  pages_found INTEGER NOT NULL DEFAULT 0,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  errors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  limits JSONB NOT NULL DEFAULT '{"maxPages": 200, "maxDepth": 5}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crawl_runs_project_id ON crawl_runs(project_id);

-- ============================================================================
-- PAGES
-- ============================================================================

CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER,
  title TEXT,
  h1 TEXT,
  meta_description TEXT,
  canonical TEXT,
  lang TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  text_hash TEXT,
  cleaned_text TEXT,
  role TEXT NOT NULL DEFAULT 'support' CHECK (role IN ('money', 'trust', 'authority', 'support')),
  priority_score INTEGER NOT NULL DEFAULT 0,
  priority_rank INTEGER NOT NULL DEFAULT 999,
  health_score INTEGER NOT NULL DEFAULT 0,
  internal_links_in INTEGER NOT NULL DEFAULT 0,
  internal_links_out INTEGER NOT NULL DEFAULT 0,
  is_orphan BOOLEAN NOT NULL DEFAULT false,
  crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, url)
);

CREATE INDEX idx_pages_project_id ON pages(project_id);
CREATE INDEX idx_pages_role ON pages(role);
CREATE INDEX idx_pages_priority_rank ON pages(priority_rank);

-- ============================================================================
-- PAGE LINKS
-- ============================================================================

CREATE TABLE page_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_url TEXT NOT NULL,
  to_url TEXT NOT NULL,
  anchor_text TEXT NOT NULL DEFAULT '',
  is_nav BOOLEAN NOT NULL DEFAULT false,
  is_footer BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_page_links_project_id ON page_links(project_id);
CREATE INDEX idx_page_links_from_url ON page_links(from_url);
CREATE INDEX idx_page_links_to_url ON page_links(to_url);

-- ============================================================================
-- AUDITS
-- ============================================================================

CREATE TABLE audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  health_score INTEGER NOT NULL DEFAULT 0,
  technical_score INTEGER NOT NULL DEFAULT 0,
  content_score INTEGER NOT NULL DEFAULT 0,
  trust_score INTEGER NOT NULL DEFAULT 0,
  linking_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audits_page_id ON audits(page_id);

-- ============================================================================
-- FIX ITEMS
-- ============================================================================

CREATE TABLE fix_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  category TEXT NOT NULL CHECK (category IN ('seo', 'content', 'conversion', 'technical', 'aeo', 'trust')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  fix_actions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  acceptance_criteria TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  effort_estimate TEXT NOT NULL DEFAULT 'medium' CHECK (effort_estimate IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'fixed', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fix_items_page_id ON fix_items(page_id);
CREATE INDEX idx_fix_items_severity ON fix_items(severity);
CREATE INDEX idx_fix_items_status ON fix_items(status);

-- ============================================================================
-- WRITERS
-- ============================================================================

CREATE TABLE writers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('internal', 'freelancer', 'ai')),
  rate DECIMAL(10, 2),
  niches TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TASKS (Planner Items)
-- ============================================================================

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('fix', 'growth')),
  priority_rank INTEGER NOT NULL DEFAULT 999,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'assigned', 'draft_ready', 'review_ready', 'publish_ready', 'published')),
  scheduled_for DATE,
  inputs_needed JSONB NOT NULL DEFAULT '{"images": 0, "notes": []}'::jsonb,
  brief_id UUID,
  required_channels TEXT[] NOT NULL DEFAULT ARRAY['wp']::TEXT[],
  acceptance_criteria TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);

-- ============================================================================
-- BRIEFS
-- ============================================================================

CREATE TABLE briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  human_brief_md TEXT NOT NULL,
  gpt_brief_md TEXT NOT NULL,
  inputs_needed JSONB NOT NULL DEFAULT '{"images": 0, "notes": []}'::jsonb,
  beads_to_include UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  internal_links_to_add TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  review_themes_to_use TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  vision_evidence JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_briefs_page_id ON briefs(page_id);
CREATE INDEX idx_briefs_task_id ON briefs(task_id);

-- Add foreign key from tasks to briefs
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_brief FOREIGN KEY (brief_id) REFERENCES briefs(id) ON DELETE SET NULL;

-- ============================================================================
-- ASSIGNMENTS
-- ============================================================================

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  writer_id UUID NOT NULL REFERENCES writers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'submitted', 'approved', 'rejected')),
  due_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assignments_task_id ON assignments(task_id);
CREATE INDEX idx_assignments_writer_id ON assignments(writer_id);

-- ============================================================================
-- TASK OUTPUTS (Channel Variants)
-- ============================================================================

CREATE TABLE task_outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('wp', 'gmb', 'li')),
  content_md TEXT NOT NULL,
  seo_fields JSONB,
  image_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_outputs_task_id ON task_outputs(task_id);
CREATE INDEX idx_task_outputs_channel ON task_outputs(channel);

-- ============================================================================
-- CHANNEL CONNECTIONS
-- ============================================================================

CREATE TABLE channel_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('wp', 'gmb', 'li')),
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, channel)
);

CREATE INDEX idx_channel_connections_project_id ON channel_connections(project_id);

-- ============================================================================
-- PUBLISHES
-- ============================================================================

CREATE TABLE publishes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  task_output_id UUID NOT NULL REFERENCES task_outputs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('wp', 'gmb', 'li')),
  payload JSONB NOT NULL,
  published_url TEXT,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_publishes_task_id ON publishes(task_id);
CREATE INDEX idx_publishes_status ON publishes(status);

-- ============================================================================
-- GROWTH PLANS
-- ============================================================================

CREATE TABLE growth_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  months JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_growth_plans_project_id ON growth_plans(project_id);

-- ============================================================================
-- EXPORTS
-- ============================================================================

CREATE TABLE exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sitemap', 'audit_report', 'briefs', 'planner', 'growth_plan')),
  format TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'csv', 'md', 'html')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exports_project_id ON exports(project_id);

-- ============================================================================
-- VISION EVIDENCE PACKS
-- ============================================================================

CREATE TABLE vision_evidence_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  combined_narrative TEXT NOT NULL DEFAULT '',
  primary_hero_image_id UUID,
  cross_image_themes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  used_in_brief_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  used_in_task_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vision_evidence_packs_project_id ON vision_evidence_packs(project_id);

-- ============================================================================
-- VISION EVIDENCE IMAGES
-- ============================================================================

CREATE TABLE vision_evidence_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pack_id UUID NOT NULL REFERENCES vision_evidence_packs(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vision_evidence_images_pack_id ON vision_evidence_images(pack_id);

-- Add foreign key for primary hero image
ALTER TABLE vision_evidence_packs 
  ADD CONSTRAINT fk_vision_evidence_packs_hero_image 
  FOREIGN KEY (primary_hero_image_id) 
  REFERENCES vision_evidence_images(id) 
  ON DELETE SET NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE beads ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE fix_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE publishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision_evidence_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision_evidence_images ENABLE ROW LEVEL SECURITY;

-- Projects policy
CREATE POLICY "Users can view own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON projects FOR DELETE USING (auth.uid() = user_id);

-- Helper function to check project ownership
CREATE OR REPLACE FUNCTION check_project_owner(proj_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM projects WHERE id = proj_id AND user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies for related tables (using project ownership check)
CREATE POLICY "Users can manage own user_context" ON user_context FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own beads" ON beads FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own reviews" ON reviews FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own review_themes" ON review_themes FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own crawl_runs" ON crawl_runs FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own pages" ON pages FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own page_links" ON page_links FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own tasks" ON tasks FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own channel_connections" ON channel_connections FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own growth_plans" ON growth_plans FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own exports" ON exports FOR ALL USING (check_project_owner(project_id));
CREATE POLICY "Users can manage own vision_evidence_packs" ON vision_evidence_packs FOR ALL USING (check_project_owner(project_id));

-- Helper function to check vision evidence pack ownership through project
CREATE OR REPLACE FUNCTION check_vision_pack_owner(pack_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM vision_evidence_packs vep
    JOIN projects pr ON vep.project_id = pr.id
    WHERE vep.id = pack_id AND pr.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Users can manage own vision_evidence_images" ON vision_evidence_images FOR ALL USING (check_vision_pack_owner(pack_id));

-- Helper function to check page ownership through project
CREATE OR REPLACE FUNCTION check_page_owner(pg_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM pages p
    JOIN projects pr ON p.project_id = pr.id
    WHERE p.id = pg_id AND pr.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Users can manage own audits" ON audits FOR ALL USING (check_page_owner(page_id));
CREATE POLICY "Users can manage own fix_items" ON fix_items FOR ALL USING (check_page_owner(page_id));
CREATE POLICY "Users can manage own briefs" ON briefs FOR ALL USING (check_page_owner(page_id));

-- Helper function to check task ownership through project
CREATE OR REPLACE FUNCTION check_task_owner(tsk_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tasks t
    JOIN projects pr ON t.project_id = pr.id
    WHERE t.id = tsk_id AND pr.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Users can manage own assignments" ON assignments FOR ALL USING (check_task_owner(task_id));
CREATE POLICY "Users can manage own task_outputs" ON task_outputs FOR ALL USING (check_task_owner(task_id));
CREATE POLICY "Users can manage own publishes" ON publishes FOR ALL USING (check_task_owner(task_id));

-- Writers are global but filtered by user context in application
ALTER TABLE writers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Writers visible to authenticated users" ON writers FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_user_context_updated_at BEFORE UPDATE ON user_context FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_beads_updated_at BEFORE UPDATE ON beads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_fix_items_updated_at BEFORE UPDATE ON fix_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_briefs_updated_at BEFORE UPDATE ON briefs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_task_outputs_updated_at BEFORE UPDATE ON task_outputs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_channel_connections_updated_at BEFORE UPDATE ON channel_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_publishes_updated_at BEFORE UPDATE ON publishes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_vision_evidence_packs_updated_at BEFORE UPDATE ON vision_evidence_packs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- RESEARCH REPORTS (SEO Deep Research)
-- ============================================================================

CREATE TABLE research_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  
  -- Report data
  site_url TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_pages INTEGER NOT NULL DEFAULT 0,
  pages_by_role JSONB NOT NULL DEFAULT '{
    "money": 0,
    "trust": 0,
    "authority": 0,
    "support": 0,
    "operational": 0,
    "unknown": 0
  }'::jsonb,
  
  -- Extracted data (stored as JSONB for flexibility)
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic_clusters JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  heading_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Quality metrics
  thin_content_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  orphaned_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  duplicate_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_research_reports_project ON research_reports(project_id);

-- RLS for research_reports
ALTER TABLE research_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own research_reports" ON research_reports FOR ALL USING (check_project_owner(project_id));

CREATE TRIGGER update_research_reports_updated_at BEFORE UPDATE ON research_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
