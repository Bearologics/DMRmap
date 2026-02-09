package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
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

type bmRepeater struct {
	ID    int    `json:"ID"`
	Call  string `json:"Call"`
	Owner string `json:"Owner"`
}

const (
	rptrsURL   = "https://radioid.net/static/rptrs.json"
	bmrptrsURL = "https://api.brandmeister.network/v2/database/repeaters"
)

func downloadJSON(url string) (io.ReadCloser, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return resp.Body, nil
}

func loadBMRepeaters(path string) map[string]bool {
	var rptrs []bmRepeater

	if r, err := downloadJSON(bmrptrsURL); err == nil {
		defer r.Close()
		if err := json.NewDecoder(r).Decode(&rptrs); err != nil {
			log.Printf("Warning: failed to decode BM repeaters from API: %v", err)
			rptrs = nil
		} else {
			log.Printf("Downloaded %d BM repeaters from API", len(rptrs))
		}
	} else {
		log.Printf("Could not download BM repeaters (%v), falling back to %s", err, path)
	}

	if rptrs == nil {
		f, err := os.Open(path)
		if err != nil {
			log.Printf("Warning: could not open BM repeaters file %s: %v", path, err)
			return map[string]bool{}
		}
		defer f.Close()
		if err := json.NewDecoder(f).Decode(&rptrs); err != nil {
			log.Printf("Warning: could not decode BM repeaters file %s: %v", path, err)
			return map[string]bool{}
		}
	}

	set := make(map[string]bool, len(rptrs))
	for _, r := range rptrs {
		set[strings.ToUpper(strings.TrimSpace(r.Call))] = true
	}
	log.Printf("Loaded %d BM repeater callsigns", len(set))
	return set
}

func loadRepeaters(path string) ([]rawRepeater, error) {
	var raw rawData

	if r, err := downloadJSON(rptrsURL); err == nil {
		defer r.Close()
		if err := json.NewDecoder(r).Decode(&raw); err != nil {
			log.Printf("Warning: failed to decode repeaters from API: %v", err)
		} else {
			log.Printf("Downloaded %d repeaters from API", len(raw.Rptrs))
			return raw.Rptrs, nil
		}
	} else {
		log.Printf("Could not download repeaters (%v), falling back to %s", err, path)
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open json: %w", err)
	}
	defer f.Close()
	if err := json.NewDecoder(f).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode json: %w", err)
	}
	return raw.Rptrs, nil
}

func seedDatabase(db *sql.DB, jsonPath, bmrptrsPath string) error {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM repeaters").Scan(&count); err != nil {
		return fmt.Errorf("count check: %w", err)
	}
	if count > 0 {
		log.Printf("Database already seeded with %d repeaters", count)
		return nil
	}

	rptrs, err := loadRepeaters(jsonPath)
	if err != nil {
		return err
	}

	bmSet := loadBMRepeaters(bmrptrsPath)

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	stmt, err := tx.Prepare(`INSERT INTO repeaters
		(id, callsign, freq_tx, freq_rx, freq_offset, band, lat, lng, city, state, country,
		 color_code, ts_linked, trustee, ipsc_network, network, hotspot, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		ON CONFLICT (id) DO NOTHING`)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("prepare stmt: %w", err)
	}
	defer stmt.Close()

	inserted, skipped, hotspots := 0, 0, 0
	for _, r := range rptrs {
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

		// Calculate freq_rx from freq_tx + offset
		freqRx := 0.0
		if off, err := strconv.ParseFloat(strings.TrimSpace(r.Offset), 64); err == nil {
			freqRx = freq + off
		}

		network := classifyNetwork(r.IpscNetwork)
		hotspot := 0
		if isHotspot(r.Offset, r.City, r.MapInfo, r.Callsign, r.Country, r.Trustee) {
			hotspot = 1
			hotspots++
		} else if network == "Brandmeister" && len(bmSet) > 0 && !bmSet[strings.ToUpper(strings.TrimSpace(r.Callsign))] {
			hotspot = 1
			hotspots++
		}
		if _, err := stmt.Exec(r.ID, r.Callsign, freq, freqRx, r.Offset, band, lat, lng,
			r.City, r.State, r.Country, r.ColorCode,
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

func isHotspot(offset, city, mapInfo, callsign, country, trustee string) bool {
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
	// Country-specific personal callsign detection
	if isPersonalCallsign(callsign, country) {
		return true
	}
	// Trustee matches callsign — station registered under personal call
	if trustee != "" && strings.EqualFold(strings.TrimSpace(trustee), strings.TrimSpace(callsign)) {
		return true
	}
	return false
}

// isPersonalCallsign returns true if the callsign matches a personal (non-repeater)
// allocation pattern for countries with clear conventions.
func isPersonalCallsign(callsign, country string) bool {
	cs := strings.ToUpper(strings.TrimSpace(callsign))
	if len(cs) < 3 {
		return false
	}

	switch country {
	case "Germany":
		// D[A-R][0] = club/repeater, D[A-R][1-9] = personal
		if cs[0] == 'D' && cs[1] >= 'A' && cs[1] <= 'R' && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
	case "United Kingdom":
		// GB3/GB7 = repeater allocation — everything else is personal
		if strings.HasPrefix(cs, "GB3") || strings.HasPrefix(cs, "GB7") {
			return false
		}
		if cs[0] == 'G' || cs[0] == 'M' || strings.HasPrefix(cs, "2E") {
			return true
		}
	case "Italy":
		// IR prefix = repeater, other I-prefix = personal
		if cs[0] == 'I' && !strings.HasPrefix(cs, "IR") {
			return true
		}
	case "France":
		// F[digit]Z = repeater allocation, F[digit][non-Z] = personal
		if cs[0] == 'F' && len(cs) >= 3 && cs[1] >= '0' && cs[1] <= '9' && cs[2] != 'Z' {
			return true
		}
	case "Poland":
		// SR = repeater, SP/SQ/SO = personal
		if strings.HasPrefix(cs, "SP") || strings.HasPrefix(cs, "SQ") || strings.HasPrefix(cs, "SO") {
			return true
		}
	case "Austria":
		// OE[digit]X = repeater/relay, OE[digit][non-X] = personal
		if strings.HasPrefix(cs, "OE") && len(cs) >= 4 && cs[2] >= '0' && cs[2] <= '9' && cs[3] != 'X' {
			return true
		}
	case "Belgium":
		// ON0 = repeater, ON[1-9] = personal
		if strings.HasPrefix(cs, "ON") && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
	case "Czech Republic":
		// OK0 = repeater, OK[1-9] = personal
		if strings.HasPrefix(cs, "OK") && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
	case "Bulgaria":
		// LZ0 = repeater, LZ[1-9] = personal
		if strings.HasPrefix(cs, "LZ") && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
	case "Portugal":
		// CQ0/CT0 = repeater, CQ/CT[1-9] = personal
		if (strings.HasPrefix(cs, "CQ") || strings.HasPrefix(cs, "CT")) && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
	case "Netherlands":
		// PI = repeater, PA/PD/PE/PH = personal
		if cs[0] == 'P' && !strings.HasPrefix(cs, "PI") {
			return true
		}
	case "Spain":
		// ED = repeater, EA[1-9] = personal
		if strings.HasPrefix(cs, "EA") && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
	case "Sweden":
		// SK = repeater/club, SA/SM = personal
		if strings.HasPrefix(cs, "SA") || strings.HasPrefix(cs, "SM") {
			return true
		}
	case "Norway":
		// LD = repeater/digipeater, LA/LB = personal
		if strings.HasPrefix(cs, "LA") || strings.HasPrefix(cs, "LB") {
			return true
		}
	case "Denmark":
		// OZ0 = repeater, OZ[1-9] = personal
		if strings.HasPrefix(cs, "OZ") && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
	case "Finland":
		// OH0 = repeater/Aland, OH[1-9] = personal
		if strings.HasPrefix(cs, "OH") && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
	case "Hungary":
		// HG0 = repeater, HG[1-9] = personal
		if strings.HasPrefix(cs, "HG") && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
	case "Romania":
		// YO0 = repeater, YO[1-9] = personal
		if strings.HasPrefix(cs, "YO") && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
	case "Slovenia":
		// S50 = repeater, S5[1-9] = personal
		if strings.HasPrefix(cs, "S5") && cs[2] >= '1' && cs[2] <= '9' {
			return true
		}
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
