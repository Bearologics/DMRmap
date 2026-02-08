package main

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

const schemaSQL = `
CREATE TABLE IF NOT EXISTS repeaters (
    id           INTEGER PRIMARY KEY,
    callsign     TEXT NOT NULL,
    frequency    REAL NOT NULL,
    band         TEXT NOT NULL,
    lat          REAL NOT NULL,
    lng          REAL NOT NULL,
    city         TEXT NOT NULL DEFAULT '',
    state        TEXT NOT NULL DEFAULT '',
    country      TEXT NOT NULL DEFAULT '',
    color_code   INTEGER NOT NULL DEFAULT 1,
    offset       TEXT NOT NULL DEFAULT '',
    ts_linked    TEXT NOT NULL DEFAULT '',
    trustee      TEXT NOT NULL DEFAULT '',
    ipsc_network TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE INDEX IF NOT EXISTS idx_repeaters_lat_band ON repeaters (lat, band);
CREATE INDEX IF NOT EXISTS idx_repeaters_lng ON repeaters (lng);
`

type Repeater struct {
	ID          int     `json:"id"`
	Callsign    string  `json:"callsign"`
	Frequency   float64 `json:"frequency"`
	Band        string  `json:"band"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	City        string  `json:"city"`
	State       string  `json:"state"`
	Country     string  `json:"country"`
	ColorCode   int     `json:"color_code"`
	Offset      string  `json:"offset"`
	TsLinked    string  `json:"ts_linked"`
	Trustee     string  `json:"trustee"`
	IpscNetwork string  `json:"ipsc_network"`
	Status      string  `json:"status"`
}

func openDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func queryRepeaters(db *sql.DB, minLat, maxLat, minLng, maxLng float64, band string) ([]Repeater, error) {
	baseQuery := `SELECT id, callsign, frequency, band, lat, lng, city, state, country,
		color_code, offset, ts_linked, trustee, ipsc_network, status
		FROM repeaters WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`

	var rows *sql.Rows
	var err error

	switch band {
	case "2m":
		rows, err = db.Query(baseQuery+" AND band = ?", minLat, maxLat, minLng, maxLng, "2m")
	case "70cm":
		rows, err = db.Query(baseQuery+" AND band = ?", minLat, maxLat, minLng, maxLng, "70cm")
	default:
		rows, err = db.Query(baseQuery+" AND band IN ('2m', '70cm')", minLat, maxLat, minLng, maxLng)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []Repeater
	for rows.Next() {
		var r Repeater
		if err := rows.Scan(&r.ID, &r.Callsign, &r.Frequency, &r.Band,
			&r.Lat, &r.Lng, &r.City, &r.State, &r.Country,
			&r.ColorCode, &r.Offset, &r.TsLinked, &r.Trustee,
			&r.IpscNetwork, &r.Status); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}
