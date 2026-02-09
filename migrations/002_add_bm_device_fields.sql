-- +goose Up
ALTER TABLE repeaters ADD COLUMN last_seen TIMESTAMP;
ALTER TABLE repeaters ADD COLUMN bm_status INTEGER;
ALTER TABLE repeaters ADD COLUMN bm_status_text TEXT NOT NULL DEFAULT '';
ALTER TABLE repeaters ADD COLUMN hardware TEXT NOT NULL DEFAULT '';
ALTER TABLE repeaters ADD COLUMN firmware TEXT NOT NULL DEFAULT '';
ALTER TABLE repeaters ADD COLUMN pep INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repeaters ADD COLUMN agl INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repeaters ADD COLUMN website TEXT NOT NULL DEFAULT '';
ALTER TABLE repeaters ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE repeaters ADD COLUMN import_freq_inconsistent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE repeaters ADD COLUMN last_polled TIMESTAMP;
CREATE INDEX idx_repeaters_last_seen ON repeaters (last_seen);
CREATE INDEX idx_repeaters_last_polled ON repeaters (last_polled);

-- +goose Down
DROP INDEX IF EXISTS idx_repeaters_last_polled;
DROP INDEX IF EXISTS idx_repeaters_last_seen;
ALTER TABLE repeaters DROP COLUMN IF EXISTS last_polled;
ALTER TABLE repeaters DROP COLUMN IF EXISTS import_freq_inconsistent;
ALTER TABLE repeaters DROP COLUMN IF EXISTS description;
ALTER TABLE repeaters DROP COLUMN IF EXISTS website;
ALTER TABLE repeaters DROP COLUMN IF EXISTS agl;
ALTER TABLE repeaters DROP COLUMN IF EXISTS pep;
ALTER TABLE repeaters DROP COLUMN IF EXISTS firmware;
ALTER TABLE repeaters DROP COLUMN IF EXISTS hardware;
ALTER TABLE repeaters DROP COLUMN IF EXISTS bm_status_text;
ALTER TABLE repeaters DROP COLUMN IF EXISTS bm_status;
ALTER TABLE repeaters DROP COLUMN IF EXISTS last_seen;
