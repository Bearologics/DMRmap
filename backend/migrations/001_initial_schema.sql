-- +goose Up
CREATE TABLE IF NOT EXISTS repeaters (
    id           INTEGER PRIMARY KEY,
    callsign     TEXT NOT NULL,
    freq_tx      DOUBLE PRECISION NOT NULL,
    freq_rx      DOUBLE PRECISION NOT NULL DEFAULT 0,
    freq_offset  TEXT NOT NULL DEFAULT '',
    band         TEXT NOT NULL,
    lat          DOUBLE PRECISION NOT NULL,
    lng          DOUBLE PRECISION NOT NULL,
    city         TEXT NOT NULL DEFAULT '',
    state        TEXT NOT NULL DEFAULT '',
    country      TEXT NOT NULL DEFAULT '',
    color_code   INTEGER NOT NULL DEFAULT 1,
    ts_linked    TEXT NOT NULL DEFAULT '',
    trustee      TEXT NOT NULL DEFAULT '',
    ipsc_network TEXT NOT NULL DEFAULT '',
    network      TEXT NOT NULL DEFAULT '',
    hotspot      INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE INDEX IF NOT EXISTS idx_repeaters_lat_band ON repeaters (lat, band);
CREATE INDEX IF NOT EXISTS idx_repeaters_lng ON repeaters (lng);
CREATE INDEX IF NOT EXISTS idx_repeaters_network ON repeaters (network);

-- +goose Down
DROP TABLE IF EXISTS repeaters;
