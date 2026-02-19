-- +goose Up
CREATE TABLE changelog (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    repeater_id INTEGER NOT NULL REFERENCES repeaters(id),
    callsign    TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL,
    action      TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    old_values  JSONB,
    new_values  JSONB
);

CREATE INDEX idx_changelog_repeater_id ON changelog (repeater_id);
CREATE INDEX idx_changelog_created_at ON changelog (created_at);
CREATE INDEX idx_changelog_source ON changelog (source);

-- +goose Down
DROP TABLE IF EXISTS changelog;
