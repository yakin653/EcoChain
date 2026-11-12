-- Community validation 2/3 (Feature C). Safe to re-run.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'VALIDATOR'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'VALIDATOR';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'declaration_status' AND e.enumlabel = 'COMMUNITY_REVIEW'
  ) THEN
    ALTER TYPE declaration_status ADD VALUE 'COMMUNITY_REVIEW';
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE vote_decision AS ENUM ('APPROVE', 'REJECT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id UUID NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
  validator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision vote_decision NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT votes_unique_validator UNIQUE (declaration_id, validator_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_declaration ON votes(declaration_id, created_at);

CREATE TABLE IF NOT EXISTS validator_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  votes_cast INTEGER NOT NULL DEFAULT 0,
  votes_correct INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
