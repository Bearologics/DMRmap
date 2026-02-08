package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"strconv"
	"strings"
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
	MapInfo     string      `json:"map_info"`
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
		 color_code, offset, ts_linked, trustee, ipsc_network, network, hotspot, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("prepare stmt: %w", err)
	}
	defer stmt.Close()

	inserted, skipped, hotspots := 0, 0, 0
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

		network := classifyNetwork(r.IpscNetwork)
		hotspot := 0
		if isHotspot(r.Offset, r.City, r.MapInfo) {
			hotspot = 1
			hotspots++
		}
		if _, err := stmt.Exec(r.ID, r.Callsign, freq, band, lat, lng,
			r.City, r.State, r.Country, r.ColorCode, r.Offset,
			r.TsLinked, r.Trustee, r.IpscNetwork, network, hotspot, r.Status); err != nil {
			log.Printf("Warning: skipping repeater %d (%s): %v", r.ID, r.Callsign, err)
			skipped++
			continue
		}
		inserted++
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	log.Printf("Seeded %d repeaters (%d skipped, %d hotspots)", inserted, skipped, hotspots)
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

func isHotspot(offset, city, mapInfo string) bool {
	// Zero offset indicates simplex (likely a personal hotspot)
	if off, err := strconv.ParseFloat(strings.TrimSpace(offset), 64); err == nil && math.Abs(off) < 0.01 {
		return true
	}
	// Hotspot keywords in city or map_info
	check := strings.ToLower(city) + " " + strings.ToLower(mapInfo)
	if strings.Contains(check, "hotspot") ||
		strings.Contains(check, "pistar") ||
		strings.Contains(check, "pi-star") ||
		strings.Contains(check, "mmdvm") ||
		strings.Contains(check, "simplex") {
		return true
	}
	return false
}

func classifyNetwork(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" || s == "none" || s == "n/a" || s == "?" || s == "-" || s == "no" {
		return ""
	}
	if strings.Contains(s, "brandm") || s == "bm" || strings.HasPrefix(s, "bm ") ||
		strings.HasPrefix(s, "bm,") || strings.HasPrefix(s, "bm/") ||
		strings.Contains(s, "brand m") || strings.Contains(s, "braindm") ||
		strings.Contains(s, "branme") || strings.Contains(s, "bramm") ||
		strings.Contains(s, "brewmister") || s == "bmr" {
		return "Brandmeister"
	}
	if strings.Contains(s, "dmr-plus") || strings.Contains(s, "dmr+") ||
		strings.Contains(s, "dmrplus") || s == "dmr plus" ||
		strings.HasPrefix(s, "ipsc2") || s == "ipsc" {
		return "DMR+"
	}
	if strings.Contains(s, "dmr-marc") || strings.Contains(s, "dmr marc") ||
		s == "marc" || strings.Contains(s, "dmrmarc") {
		return "DMR-MARC"
	}
	if strings.Contains(s, "tgif") {
		return "TGIF"
	}
	if strings.Contains(s, "freedmr") || strings.Contains(s, "free-dmr") || strings.Contains(s, "free dmr") {
		return "FreeDMR"
	}
	return "Other"
}
