package main

import (
	"database/sql"
	"math"

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

// Route corridor query: find repeaters within corridorKm of a polyline.
func queryRepeatersAlongRoute(db *sql.DB, points [][2]float64, corridorKm float64, band string) ([]Repeater, error) {
	if len(points) == 0 {
		return []Repeater{}, nil
	}

	// Compute bounding box of all route points + corridor padding
	minLat, maxLat := points[0][0], points[0][0]
	minLng, maxLng := points[0][1], points[0][1]
	for _, p := range points {
		if p[0] < minLat {
			minLat = p[0]
		}
		if p[0] > maxLat {
			maxLat = p[0]
		}
		if p[1] < minLng {
			minLng = p[1]
		}
		if p[1] > maxLng {
			maxLng = p[1]
		}
	}
	latPad := corridorKm / 111.32
	avgLat := (minLat + maxLat) / 2
	lngPad := corridorKm / (111.32 * math.Cos(avgLat*math.Pi/180))
	minLat -= latPad
	maxLat += latPad
	minLng -= lngPad
	maxLng += lngPad

	// Fetch candidates from bounding box
	candidates, err := queryRepeaters(db, minLat, maxLat, minLng, maxLng, band)
	if err != nil {
		return nil, err
	}

	// Filter by distance to route segments
	var results []Repeater
	for _, r := range candidates {
		if minDistToRoute(r.Lat, r.Lng, points) <= corridorKm {
			results = append(results, r)
		}
	}
	return results, nil
}

func minDistToRoute(lat, lng float64, points [][2]float64) float64 {
	best := math.Inf(1)
	for i := 0; i < len(points)-1; i++ {
		d := distToSegmentKm(lat, lng, points[i][0], points[i][1], points[i+1][0], points[i+1][1])
		if d < best {
			best = d
		}
	}
	if len(points) == 1 {
		best = haversineKm(lat, lng, points[0][0], points[0][1])
	}
	return best
}

// Approximate distance from point P to line segment AB in km.
func distToSegmentKm(pLat, pLng, aLat, aLng, bLat, bLng float64) float64 {
	cosLat := math.Cos(pLat * math.Pi / 180)
	// Project to approximate planar coordinates (km)
	px := (pLng - aLng) * cosLat * 111.32
	py := (pLat - aLat) * 111.32
	bx := (bLng - aLng) * cosLat * 111.32
	by := (bLat - aLat) * 111.32

	lenSq := bx*bx + by*by
	if lenSq == 0 {
		return math.Sqrt(px*px + py*py)
	}

	t := (px*bx + py*by) / lenSq
	if t < 0 {
		t = 0
	}
	if t > 1 {
		t = 1
	}

	dx := px - t*bx
	dy := py - t*by
	return math.Sqrt(dx*dx + dy*dy)
}

func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	const r = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return r * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}
