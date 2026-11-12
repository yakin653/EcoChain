-- EcoTree NFT (Feature B). Safe to re-run.

DO $$ BEGIN
  CREATE TYPE tree_sync_status AS ENUM ('ok', 'pending', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token_id VARCHAR(40) NOT NULL,
  serial BIGINT NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'seed',
  last_co2_kg NUMERIC(14,3) NOT NULL DEFAULT 0,
  metadata_uri TEXT,
  sync_status tree_sync_status NOT NULL DEFAULT 'pending',
  last_error TEXT,
  claimed_at TIMESTAMPTZ,
  claimed_wallet VARCHAR(42),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trees_token_serial UNIQUE (token_id, serial)
);

CREATE TABLE IF NOT EXISTS tree_level_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  from_level VARCHAR(20),
  to_level VARCHAR(20) NOT NULL,
  co2_kg NUMERIC(14,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tree_level_history_tree ON tree_level_history(tree_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trees_serial ON trees(serial);
