-- HCS impact anchors (Feature A). Safe to re-run.

DO $$ BEGIN
  CREATE TYPE anchor_type AS ENUM ('IMPACT_WEEKLY', 'DECLARATION_PROOF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE anchor_status AS ENUM ('pending', 'submitted', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type anchor_type NOT NULL,
  ref VARCHAR(200) NOT NULL,
  hash CHAR(64) NOT NULL,
  topic_id VARCHAR(40),
  sequence_number BIGINT,
  consensus_timestamp VARCHAR(40),
  status anchor_status NOT NULL DEFAULT 'pending',
  last_error TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anchors_type_created ON anchors(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anchors_ref ON anchors(ref);
CREATE INDEX IF NOT EXISTS idx_anchors_status ON anchors(status);
