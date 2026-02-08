package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"strconv"
)

type rawRepeater struct {
	ID          int         `json:"id"`
	Callsign    string      `json:"callsign"`
	Frequency   string      `json:"frequency"`
	Lat         interface{} `json:"lat"`
	Lng         interface{} `json:"lng"`
	City        string      `json:"city"`
	State       string      `json:"state"`
	Country     string      `json:"country"`
	ColorCode   int         `json:"color_code"`
	Offset      string      `json:"offset"`
	TsLinked    string      `json:"ts_linked"`
	Trustee     string      `json:"trustee"`
	IpscNetwork string      `json:"ipsc_network"`
	Status      string      `json:"status"`
}

type rawData struct {
	Rptrs []rawRepeater `json:"rptrs"`
}

func seedDatabase(dbPath, jsonPath string) error {
	db, err := openDB(dbPath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer db.Close()

	if _, err := db.Exec(schemaSQL); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM repeaters").Scan(&count); err != nil {
		return fmt.Errorf("count check: %w", err)
	}
	if count > 0 {
		log.Printf("Database already seeded with %d repeaters", count)
		return nil
	}

	f, err := os.Open(jsonPath)
	if err != nil {
		return fmt.Errorf("open json: %w", err)
	}
	defer f.Close()

	var raw rawData
	if err := json.NewDecoder(f).Decode(&raw); err != nil {
		return fmt.Errorf("decode json: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	stmt, err := tx.Prepare(`INSERT INTO repeaters
		(id, callsign, frequency, band, lat, lng, city, state, country,
		 color_code, offset, ts_linked, trustee, ipsc_network, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("prepare stmt: %w", err)
	}
	defer stmt.Close()

	inserted, skipped := 0, 0
	for _, r := range raw.Rptrs {
		lat, lng, ok := parseCoords(r.Lat, r.Lng)
		if !ok {
			skipped++
			continue
		}
		freq, ok := parseFrequency(r.Frequency)
		if !ok {
			skipped++
			continue
		}
		band := classifyBand(freq)

		if _, err := stmt.Exec(r.ID, r.Callsign, freq, band, lat, lng,
			r.City, r.State, r.Country, r.ColorCode, r.Offset,
			r.TsLinked, r.Trustee, r.IpscNetwork, r.Status); err != nil {
			log.Printf("Warning: skipping repeater %d (%s): %v", r.ID, r.Callsign, err)
			skipped++
			continue
		}
		inserted++
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	log.Printf("Seeded %d repeaters (%d skipped)", inserted, skipped)
	return nil
}

func parseCoords(rawLat, rawLng interface{}) (float64, float64, bool) {
	lat := toFloat(rawLat)
	lng := toFloat(rawLng)
	if math.IsNaN(lat) || math.IsNaN(lng) {
		return 0, 0, false
	}
	if lat == 0 && lng == 0 {
		return 0, 0, false
	}
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return 0, 0, false
	}
	return lat, lng, true
}

func toFloat(v interface{}) float64 {
	switch val := v.(type) {
	case string:
		if val == "" {
			return math.NaN()
		}
		f, err := strconv.ParseFloat(val, 64)
		if err != nil {
			return math.NaN()
		}
		return f
	case float64:
		return val
	case nil:
		return math.NaN()
	default:
		return math.NaN()
	}
}

func parseFrequency(s string) (float64, bool) {
	if s == "" {
		return 0, false
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || f == 0 {
		return 0, false
	}
	return f, true
}

func classifyBand(freq float64) string {
	if freq >= 144 && freq <= 148 {
		return "2m"
	}
	if freq >= 420 && freq <= 450 {
		return "70cm"
	}
	return "other"
}
