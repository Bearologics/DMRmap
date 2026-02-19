-- +goose Up
ALTER TABLE repeaters ADD COLUMN networks TEXT[] NOT NULL DEFAULT '{}';
UPDATE repeaters SET networks = ARRAY[network] WHERE network != '';
DROP INDEX IF EXISTS idx_repeaters_network;
ALTER TABLE repeaters DROP COLUMN network;
CREATE INDEX idx_repeaters_networks ON repeaters USING GIN (networks);

-- +goose Down
ALTER TABLE repeaters ADD COLUMN network TEXT NOT NULL DEFAULT '';
UPDATE repeaters SET network = networks[1] WHERE array_length(networks, 1) > 0;
DROP INDEX IF EXISTS idx_repeaters_networks;
ALTER TABLE repeaters DROP COLUMN networks;
CREATE INDEX idx_repeaters_network ON repeaters (network);
