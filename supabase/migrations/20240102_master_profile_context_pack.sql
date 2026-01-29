-- ============================================================================
-- MASTER PROFILE & CONTEXT PACK TABLES
-- ============================================================================
-- Provides stable, versioned context documents for the writer orchestrator.
-- Master Profile = "What's true about this business?"
-- Context Pack = "What's needed for THIS specific task?"
-- ============================================================================

-- ============================================================================
-- PROJECT MASTER PROFILES
-- ============================================================================
-- One stable, versioned document per project that the writer can trust.
-- Aggregates: user_context, beads, reviews, crawl summary, local signals

CREATE TABLE IF NOT EXISTS project_master_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,
  profile_hash TEXT NOT NULL,
  
  -- The full master profile document
  profile_json JSONB NOT NULL,
  
  -- Metadata
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  UNIQUE (project_id, profile_hash),
  UNIQUE (project_id, version)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_master_profiles_project 
  ON project_master_profiles(project_id);

CREATE INDEX IF NOT EXISTS idx_master_profiles_latest 
  ON project_master_profiles(project_id, version DESC);

-- ============================================================================
-- TASK CONTEXT PACKS
-- ============================================================================
-- Per-task context bundle passed to the writer orchestrator.
-- Includes: master profile snapshot, task brief, vision packs, rewrite context

CREATE TABLE IF NOT EXISTS task_context_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL,
  
  -- Mode determines what context is included
  mode TEXT NOT NULL CHECK (mode IN ('create', 'update')),
  
  -- For rewrites (mode = 'update')
  original_url TEXT,
  original_content TEXT,  -- Cleaned extracted text
  
  -- The full context pack document
  context_json JSONB NOT NULL,
  context_hash TEXT NOT NULL,
  
  -- Link to master profile version used
  master_profile_id UUID REFERENCES project_master_profiles(id),
  
  -- Metadata
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  UNIQUE (project_id, task_id, context_hash)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_context_packs_project 
  ON task_context_packs(project_id);

CREATE INDEX IF NOT EXISTS idx_context_packs_task 
  ON task_context_packs(task_id);

CREATE INDEX IF NOT EXISTS idx_context_packs_mode 
  ON task_context_packs(mode);

-- ============================================================================
-- UPDATE WRITER_JOBS TABLE (if exists)
-- ============================================================================
-- Add reference to context pack for traceability
-- NOTE: Run these manually after writer_jobs table is created

-- ALTER TABLE writer_jobs 
--   ADD COLUMN IF NOT EXISTS context_pack_id UUID REFERENCES task_context_packs(id);

-- ALTER TABLE writer_jobs 
--   ADD COLUMN IF NOT EXISTS master_profile_id UUID REFERENCES project_master_profiles(id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE project_master_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_context_packs ENABLE ROW LEVEL SECURITY;

-- Master profiles: users can read/write their own projects
CREATE POLICY "Users can manage own master profiles"
  ON project_master_profiles
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Context packs: users can manage their own projects
CREATE POLICY "Users can manage own context packs"
  ON task_context_packs
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- HELPER FUNCTION: Get latest master profile version
-- ============================================================================

CREATE OR REPLACE FUNCTION get_latest_master_profile_version(p_project_id UUID)
RETURNS INTEGER AS $$
  SELECT COALESCE(MAX(version), 0)
  FROM project_master_profiles
  WHERE project_id = p_project_id;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- HELPER FUNCTION: Get latest master profile
-- ============================================================================

CREATE OR REPLACE FUNCTION get_latest_master_profile(p_project_id UUID)
RETURNS project_master_profiles AS $$
  SELECT *
  FROM project_master_profiles
  WHERE project_id = p_project_id
  ORDER BY version DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;
