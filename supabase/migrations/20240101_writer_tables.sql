-- ============================================================================
-- WRITER JOBS TABLE
-- ============================================================================
-- Stores writer job requests and their status

CREATE TABLE writer_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  
  -- Job configuration
  job_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Contains: task, userContext, siteContext, proofContext, visionContext, publishingTargets
  
  -- Publishing targets
  target_wordpress BOOLEAN NOT NULL DEFAULT true,
  target_linkedin BOOLEAN NOT NULL DEFAULT false,
  target_gmb BOOLEAN NOT NULL DEFAULT false,
  target_reddit BOOLEAN NOT NULL DEFAULT false,
  
  -- Tone and style
  tone_profile_id TEXT NOT NULL DEFAULT 'friendly-expert',
  tone_overrides JSONB DEFAULT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  processing_time_ms INTEGER,
  
  -- Error handling
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_writer_jobs_project_id ON writer_jobs(project_id);
CREATE INDEX idx_writer_jobs_task_id ON writer_jobs(task_id);
CREATE INDEX idx_writer_jobs_status ON writer_jobs(status);
CREATE INDEX idx_writer_jobs_created_at ON writer_jobs(created_at);

-- ============================================================================
-- WRITER OUTPUTS TABLE
-- ============================================================================
-- Stores the complete generated output from a writer job

CREATE TABLE writer_outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES writer_jobs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- WordPress output
  wp_title TEXT NOT NULL,
  wp_slug TEXT NOT NULL,
  wp_excerpt TEXT NOT NULL DEFAULT '',
  wp_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  wp_seo JSONB NOT NULL DEFAULT '{}'::jsonb,
  wp_images JSONB NOT NULL DEFAULT '{"hero": null, "inline": []}'::jsonb,
  wp_internal_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Social outputs
  linkedin_output JSONB DEFAULT NULL,
  gmb_output JSONB DEFAULT NULL,
  reddit_output JSONB DEFAULT NULL,
  
  -- Audit data
  audit_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Contains: wordCount, blockCount, readingTimeMinutes, keyphraseFrequency, etc.
  
  -- Content hash for change detection
  content_hash TEXT NOT NULL,
  
  -- Validation results
  validation_passed BOOLEAN NOT NULL DEFAULT true,
  validation_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_writer_outputs_job_id ON writer_outputs(job_id);
CREATE INDEX idx_writer_outputs_project_id ON writer_outputs(project_id);
CREATE INDEX idx_writer_outputs_content_hash ON writer_outputs(content_hash);

-- ============================================================================
-- WRITER RUNS TABLE
-- ============================================================================
-- Logs individual LLM calls within a writer job for debugging/auditing

CREATE TABLE writer_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES writer_jobs(id) ON DELETE CASCADE,
  
  -- Run details
  step_name TEXT NOT NULL, -- 'plan', 'article', 'linkedin', 'gmb', 'reddit'
  prompt_hash TEXT NOT NULL, -- Hash of the prompt for caching
  
  -- LLM details
  model_used TEXT NOT NULL DEFAULT 'gpt-4',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Result
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  
  -- For debugging
  raw_response TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_writer_runs_job_id ON writer_runs(job_id);
CREATE INDEX idx_writer_runs_step_name ON writer_runs(step_name);
CREATE INDEX idx_writer_runs_prompt_hash ON writer_runs(prompt_hash);

-- ============================================================================
-- UPDATE TASK_OUTPUTS TO SUPPORT WRITER BLOCKS
-- ============================================================================
-- Add wp_blocks column to task_outputs for storing WordPress block JSON

ALTER TABLE task_outputs 
ADD COLUMN IF NOT EXISTS wp_blocks JSONB DEFAULT NULL;

ALTER TABLE task_outputs
ADD COLUMN IF NOT EXISTS writer_output_id UUID REFERENCES writer_outputs(id) ON DELETE SET NULL;

-- ============================================================================
-- ADD REDDIT CHANNEL
-- ============================================================================

ALTER TABLE task_outputs 
DROP CONSTRAINT IF EXISTS task_outputs_channel_check;

ALTER TABLE task_outputs
ADD CONSTRAINT task_outputs_channel_check 
CHECK (channel IN ('wp', 'gmb', 'li', 'reddit'));

ALTER TABLE channel_connections 
DROP CONSTRAINT IF EXISTS channel_connections_channel_check;

ALTER TABLE channel_connections
ADD CONSTRAINT channel_connections_channel_check 
CHECK (channel IN ('wp', 'gmb', 'li', 'reddit'));

ALTER TABLE publishes 
DROP CONSTRAINT IF EXISTS publishes_channel_check;

ALTER TABLE publishes
ADD CONSTRAINT publishes_channel_check 
CHECK (channel IN ('wp', 'gmb', 'li', 'reddit'));

-- ============================================================================
-- UPDATE BRIEFS TABLE FOR WRITER INTEGRATION
-- ============================================================================

ALTER TABLE briefs
ADD COLUMN IF NOT EXISTS writer_job_id UUID REFERENCES writer_jobs(id) ON DELETE SET NULL;

ALTER TABLE briefs
ADD COLUMN IF NOT EXISTS writer_output_id UUID REFERENCES writer_outputs(id) ON DELETE SET NULL;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE writer_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE writer_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE writer_runs ENABLE ROW LEVEL SECURITY;

-- Writer jobs: users can access their own project's jobs
CREATE POLICY writer_jobs_select ON writer_jobs FOR SELECT
USING (
  project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  )
);

CREATE POLICY writer_jobs_insert ON writer_jobs FOR INSERT
WITH CHECK (
  project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  )
);

CREATE POLICY writer_jobs_update ON writer_jobs FOR UPDATE
USING (
  project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  )
);

-- Writer outputs: same as jobs
CREATE POLICY writer_outputs_select ON writer_outputs FOR SELECT
USING (
  project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  )
);

-- Writer runs: accessible via job
CREATE POLICY writer_runs_select ON writer_runs FOR SELECT
USING (
  job_id IN (
    SELECT id FROM writer_jobs WHERE project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  )
);
