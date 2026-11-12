-- AI waste recognition analyses (assistive only — never auto-approves).
-- Safe to re-run (IF NOT EXISTS).

DO $$ BEGIN
  CREATE TYPE ai_consistency AS ENUM ('MATCH', 'MISMATCH', 'UNCERTAIN', 'DEGRADED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE declarations
  ADD COLUMN IF NOT EXISTS photo_path TEXT,
  ADD COLUMN IF NOT EXISTS photo_sha256 CHAR(64);

CREATE TABLE IF NOT EXISTS declaration_ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id UUID NOT NULL UNIQUE REFERENCES declarations(id) ON DELETE CASCADE,
  model_name VARCHAR(80) NOT NULL DEFAULT 'trash_classifier_v2',
  detected_material VARCHAR(80),
  declared_material_key VARCHAR(80),
  confidence NUMERIC(8,6),
  consistency ai_consistency NOT NULL,
  admin_review_required BOOLEAN NOT NULL DEFAULT TRUE,
  explanation TEXT,
  all_scores_json JSONB,
  detected_objects_json JSONB,
  image_sha256 CHAR(64),
  image_format VARCHAR(16),
  raw_response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_declaration_ai_analyses_consistency
  ON declaration_ai_analyses(consistency);

CREATE INDEX IF NOT EXISTS idx_declaration_ai_analyses_created
  ON declaration_ai_analyses(created_at DESC);
