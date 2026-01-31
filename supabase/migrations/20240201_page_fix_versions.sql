-- Page Fix Writer: Version History & Drafts
-- Enables Preview → Publish → Revert workflow for surgical page rehabilitation

-- ============================================================================
-- PAGE FIX VERSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS page_fix_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign keys
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Page reference
  url TEXT NOT NULL,
  
  -- Version control
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'reverted')),
  
  -- Content snapshots (JSONB for flexibility)
  original_snapshot JSONB NOT NULL,
  proposed_output JSONB NOT NULL,
  diff_summary JSONB NOT NULL,
  
  -- Category toggles (which improvements were applied)
  applied_categories JSONB NOT NULL DEFAULT '{
    "titleMeta": true,
    "headings": true,
    "contentDepth": true,
    "eeat": true,
    "internalLinks": true
  }'::jsonb,
  
  -- Validation warnings (stored for reference)
  validation_warnings JSONB DEFAULT '[]'::jsonb,
  
  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ,
  reverted_at TIMESTAMPTZ,
  
  -- Rollback reference (if this version reverted another)
  rollback_of_version_id UUID REFERENCES page_fix_versions(id),
  
  -- Link to task_outputs for WordPress publishing integration
  task_output_id UUID REFERENCES task_outputs(id),
  
  -- Link to original fix planner task (optional)
  fix_task_id UUID REFERENCES tasks(id)
);

-- Partial unique index: only one draft per page at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_draft_per_page 
  ON page_fix_versions(page_id) 
  WHERE status = 'draft';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast lookup by page
CREATE INDEX IF NOT EXISTS idx_page_fix_versions_page_id 
  ON page_fix_versions(page_id);

-- Fast lookup by project
CREATE INDEX IF NOT EXISTS idx_page_fix_versions_project_id 
  ON page_fix_versions(project_id);

-- Fast lookup by status (for listing drafts, published, etc.)
CREATE INDEX IF NOT EXISTS idx_page_fix_versions_status 
  ON page_fix_versions(status);

-- Fast lookup of latest version per page
CREATE INDEX IF NOT EXISTS idx_page_fix_versions_page_version 
  ON page_fix_versions(page_id, version DESC);

-- Fast lookup by created date
CREATE INDEX IF NOT EXISTS idx_page_fix_versions_created_at 
  ON page_fix_versions(created_at DESC);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get the next version number for a page
CREATE OR REPLACE FUNCTION get_next_fix_version(p_page_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT MAX(version) + 1 FROM page_fix_versions WHERE page_id = p_page_id),
    1
  );
END;
$$ LANGUAGE plpgsql;

-- Get the latest published version for a page
CREATE OR REPLACE FUNCTION get_latest_published_fix(p_page_id UUID)
RETURNS page_fix_versions AS $$
BEGIN
  RETURN (
    SELECT * FROM page_fix_versions 
    WHERE page_id = p_page_id 
      AND status = 'published'
    ORDER BY version DESC
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE page_fix_versions ENABLE ROW LEVEL SECURITY;

-- Users can only see versions for projects they own
CREATE POLICY "Users can view their project fix versions"
  ON page_fix_versions FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Users can create versions for their projects
CREATE POLICY "Users can create fix versions for their projects"
  ON page_fix_versions FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Users can update versions for their projects
CREATE POLICY "Users can update their fix versions"
  ON page_fix_versions FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-set version number on insert
CREATE OR REPLACE FUNCTION set_fix_version_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.version IS NULL OR NEW.version = 0 THEN
    NEW.version := get_next_fix_version(NEW.page_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_fix_version_number
  BEFORE INSERT ON page_fix_versions
  FOR EACH ROW
  EXECUTE FUNCTION set_fix_version_number();

-- ============================================================================
-- ADD COLUMNS TO PAGES TABLE (if not exists)
-- ============================================================================

-- Track fix status on pages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pages' AND column_name = 'fix_status'
  ) THEN
    ALTER TABLE pages ADD COLUMN fix_status TEXT DEFAULT 'pending'
      CHECK (fix_status IN ('pending', 'in_progress', 'fixed', 'locked'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pages' AND column_name = 'last_fix_version_id'
  ) THEN
    ALTER TABLE pages ADD COLUMN last_fix_version_id UUID 
      REFERENCES page_fix_versions(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pages' AND column_name = 'fix_locked_until'
  ) THEN
    ALTER TABLE pages ADD COLUMN fix_locked_until TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE page_fix_versions IS 
  'Stores surgical page rehabilitation versions with preview/publish/revert workflow';

COMMENT ON COLUMN page_fix_versions.original_snapshot IS 
  'Full snapshot of page before fixes (title, meta, h1, headings, body, images)';

COMMENT ON COLUMN page_fix_versions.proposed_output IS 
  'AI-generated improvements in structured JSON format';

COMMENT ON COLUMN page_fix_versions.diff_summary IS 
  'Human-readable diff with explanations of what changed and why';

COMMENT ON COLUMN page_fix_versions.applied_categories IS 
  'Toggle state for which fix categories were applied (title/meta, headings, etc.)';

COMMENT ON COLUMN page_fix_versions.task_output_id IS 
  'Links to task_outputs for WordPress publishing via existing integration';
