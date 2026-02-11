package main

import (
	"database/sql"
	"database/sql/driver"
	"fmt"
	"log"
	"math"
	"sort"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// StringArray maps a PostgreSQL TEXT[] column to a Go []string via database/sql.
type StringArray []string

func (a *StringArray) Scan(src interface{}) error {
	if src == nil {
		*a = StringArray{}
		return nil
	}
	switch v := src.(type) {
	case []byte:
		parsed, err := parsePostgresArray(string(v))
		if err != nil {
			return err
		}
		*a = parsed
	case string:
		parsed, err := parsePostgresArray(v)
		if err != nil {
			return err
		}
		*a = parsed
	default:
		return fmt.Errorf("StringArray.Scan: unsupported type %T", src)
	}
	return nil
}

func (a StringArray) Value() (driver.Value, error) {
	if a == nil || len(a) == 0 {
		return "{}", nil
	}
	elems := make([]string, len(a))
	for i, s := range a {
		escaped := strings.ReplaceAll(s, `\`, `\\`)
		escaped = strings.ReplaceAll(escaped, `"`, `\"`)
		elems[i] = `"` + escaped + `"`
	}
	return "{" + strings.Join(elems, ",") + "}", nil
}

func parsePostgresArray(s string) ([]string, error) {
	s = strings.TrimSpace(s)
	if s == "{}" || s == "" {
		return []string{}, nil
	}
	if s[0] != '{' || s[len(s)-1] != '}' {
		return nil, fmt.Errorf("invalid postgres array literal: %q", s)
	}
	inner := s[1 : len(s)-1]
	var result []string
	var current strings.Builder
	inQuote := false
	escaped := false
	for _, r := range inner {
		if escaped {
			current.WriteRune(r)
			escaped = false
			continue
		}
		if r == '\\' {
			escaped = true
			continue
		}
		if r == '"' {
			inQuote = !inQuote
			continue
		}
		if r == ',' && !inQuote {
			result = append(result, current.String())
			current.Reset()
			continue
		}
		current.WriteRune(r)
	}
	result = append(result, current.String())
	return result, nil
}

type Repeater struct {
	ID                    int        `json:"id"`
	Callsign              string     `json:"callsign"`
	FreqTx                float64    `json:"freq_tx"`
	FreqRx                float64    `json:"freq_rx"`
	FreqOffset            string     `json:"freq_offset"`
	Band                  string     `json:"band"`
	Lat                   float64    `json:"lat"`
	Lng                   float64    `json:"lng"`
	City                  string     `json:"city"`
	State                 string     `json:"state"`
	Country               string     `json:"country"`
	ColorCode             int        `json:"color_code"`
	TsLinked              string     `json:"ts_linked"`
	Trustee               string     `json:"trustee"`
	IpscNetwork           string     `json:"ipsc_network"`
	Networks              StringArray `json:"networks"`
	Hotspot               int        `json:"hotspot"`
	Status                string     `json:"status"`
	LastSeen              *time.Time `json:"last_seen"`
	BmStatus              *int       `json:"bm_status"`
	BmStatusText          string     `json:"bm_status_text"`
	Hardware              string     `json:"hardware"`
	Firmware              string     `json:"firmware"`
	Pep                   int        `json:"pep"`
	Agl                   int        `json:"agl"`
	Website               string     `json:"website"`
	Description           string     `json:"description"`
	ImportFreqInconsistent bool       `json:"import_freq_inconsistent"`
	Inactive               bool       `json:"inactive"`
	LastPolled             *time.Time `json:"last_polled"`
}

type Filter struct {
	Field string `json:"field"`
	Op    string `json:"op"`
	Value string `json:"value"`
}

func openDB(dsn string) (*sql.DB, error) {
	var db *sql.DB
	var err error

	for i := 0; i < 30; i++ {
		db, err = sql.Open("pgx", dsn)
		if err != nil {
			log.Printf("Failed to open database (attempt %d/30): %v", i+1, err)
			time.Sleep(time.Second)
			continue
		}
		if err = db.Ping(); err != nil {
			db.Close()
			log.Printf("Failed to ping database (attempt %d/30): %v", i+1, err)
			time.Sleep(time.Second)
			continue
		}
		break
	}
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database after 30 attempts: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	return db, nil
}

func queryRepeaters(db *sql.DB, minLat, maxLat, minLng, maxLng float64, band string, networks []string, showHotspots bool, showInactive bool) ([]Repeater, error) {
	paramIdx := 0
	nextParam := func() string {
		paramIdx++
		return fmt.Sprintf("$%d", paramIdx)
	}

	query := `SELECT id, callsign, freq_tx, freq_rx, freq_offset, band, lat, lng, city, state, country,
		color_code, ts_linked, trustee, ipsc_network, networks, hotspot, status,
		last_seen, bm_status, bm_status_text, hardware, firmware, pep, agl, website, description,
		import_freq_inconsistent, last_polled
		FROM repeaters WHERE lat BETWEEN ` + nextParam() + ` AND ` + nextParam() + ` AND lng BETWEEN ` + nextParam() + ` AND ` + nextParam()

	args := []interface{}{minLat, maxLat, minLng, maxLng}

	switch band {
	case "2m":
		query += " AND band = " + nextParam()
		args = append(args, "2m")
	case "70cm":
		query += " AND band = " + nextParam()
		args = append(args, "70cm")
	default:
		query += " AND band IN ('2m', '70cm')"
	}

	if !showHotspots {
		query += " AND hotspot = 0"
	}

	// Network filter: only apply when not all 4 categories are selected
	if len(networks) > 0 && len(networks) < 4 {
		var networkValues []string
		hasOther := false
		for _, n := range networks {
			switch n {
			case "BM":
				networkValues = append(networkValues, "Brandmeister")
			case "DMR+":
				networkValues = append(networkValues, "DMR+")
			case "TGIF":
				networkValues = append(networkValues, "TGIF")
			case "Other":
				hasOther = true
				networkValues = append(networkValues, "DMR-MARC", "FreeDMR", "Other")
			}
		}
		if len(networkValues) > 0 {
			p := nextParam()
			if hasOther {
				query += " AND (networks && " + p + "::text[] OR networks = '{}')"
			} else {
				query += " AND networks && " + p + "::text[]"
			}
			args = append(args, StringArray(networkValues))
		}
	}

	if !showInactive {
		threshold := time.Now().Add(-7 * 24 * time.Hour)
		query += " AND (last_seen IS NULL OR last_seen >= " + nextParam() + ") AND (bm_status IS NULL OR bm_status != 0)"
		args = append(args, threshold)
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	threshold := time.Now().Add(-7 * 24 * time.Hour)
	var results []Repeater
	for rows.Next() {
		var r Repeater
		if err := rows.Scan(&r.ID, &r.Callsign, &r.FreqTx, &r.FreqRx, &r.FreqOffset, &r.Band,
			&r.Lat, &r.Lng, &r.City, &r.State, &r.Country,
			&r.ColorCode, &r.TsLinked, &r.Trustee,
			&r.IpscNetwork, &r.Networks, &r.Hotspot, &r.Status,
			&r.LastSeen, &r.BmStatus, &r.BmStatusText, &r.Hardware,
			&r.Firmware, &r.Pep, &r.Agl, &r.Website, &r.Description,
			&r.ImportFreqInconsistent, &r.LastPolled); err != nil {
			return nil, err
		}
		r.Inactive = (r.LastSeen != nil && r.LastSeen.Before(threshold)) || (r.BmStatus != nil && *r.BmStatus == 0)
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}

// Route corridor query: find repeaters within corridorKm of a polyline.
func queryRepeatersAlongRoute(db *sql.DB, points [][2]float64, corridorKm float64, band string, networks []string, showHotspots bool, showInactive bool) ([]RepeaterWithDistance, error) {
	if len(points) == 0 {
		return []RepeaterWithDistance{}, nil
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
	candidates, err := queryRepeaters(db, minLat, maxLat, minLng, maxLng, band, networks, showHotspots, showInactive)
	if err != nil {
		return nil, err
	}

	// Pre-compute cumulative route distances from start
	cumDist := make([]float64, len(points))
	for i := 1; i < len(points); i++ {
		cumDist[i] = cumDist[i-1] + haversineKm(points[i-1][0], points[i-1][1], points[i][0], points[i][1])
	}

	// Filter by perpendicular distance to route; record along-route distance from start
	var results []RepeaterWithDistance
	for _, r := range candidates {
		perpDist, alongDist := routeDistances(r.Lat, r.Lng, points, cumDist)
		if perpDist <= corridorKm {
			results = append(results, RepeaterWithDistance{Repeater: r, Distance: math.Round(alongDist*10) / 10})
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Distance < results[j].Distance
	})

	return results, nil
}

// Radius query: find repeaters within radiusKm of a point, sorted by distance.
type RepeaterWithDistance struct {
	Repeater
	Distance float64 `json:"distance"`
}

func queryRepeatersInRadius(db *sql.DB, lat, lng, radiusKm float64, band string, networks []string, showHotspots bool, showInactive bool) ([]RepeaterWithDistance, error) {
	latPad := radiusKm / 111.32
	lngPad := radiusKm / (111.32 * math.Cos(lat*math.Pi/180))

	candidates, err := queryRepeaters(db, lat-latPad, lat+latPad, lng-lngPad, lng+lngPad, band, networks, showHotspots, showInactive)
	if err != nil {
		return nil, err
	}

	var results []RepeaterWithDistance
	for _, r := range candidates {
		d := haversineKm(lat, lng, r.Lat, r.Lng)
		if d <= radiusKm {
			results = append(results, RepeaterWithDistance{Repeater: r, Distance: math.Round(d*10) / 10})
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Distance < results[j].Distance
	})

	return results, nil
}

// Admin query: paginated list of all repeaters with optional search.
func queryAdminRepeaters(db *sql.DB, search string, page, perPage int, filters []Filter, filterMode string) ([]Repeater, int, error) {
	paramIdx := 0
	nextParam := func() string {
		paramIdx++
		return fmt.Sprintf("$%d", paramIdx)
	}

	where := ""
	var args []interface{}
	if search != "" {
		p := nextParam()
		where = " WHERE (callsign ILIKE " + p +
			" OR city ILIKE " + p +
			" OR state ILIKE " + p +
			" OR country ILIKE " + p +
			" OR array_to_string(networks, ',') ILIKE " + p +
			" OR id::text = " + nextParam() + ")"
		pattern := "%" + search + "%"
		args = append(args, pattern, search)
	}

	if len(filters) > 0 {
		var clauses []string
		for _, f := range filters {
			switch f.Field {
			case "country":
				switch f.Op {
				case "eq":
					clauses = append(clauses, "country = "+nextParam())
					args = append(args, f.Value)
				case "neq":
					clauses = append(clauses, "country != "+nextParam())
					args = append(args, f.Value)
				case "contains":
					clauses = append(clauses, "country ILIKE "+nextParam())
					args = append(args, "%"+f.Value+"%")
				}
			case "bm_status":
				switch f.Op {
				case "empty":
					clauses = append(clauses, "bm_status IS NULL")
				case "not_empty":
					clauses = append(clauses, "bm_status IS NOT NULL")
				}
			}
		}
		if len(clauses) > 0 {
			joiner := " AND "
			if filterMode == "or" {
				joiner = " OR "
			}
			filterExpr := "(" + strings.Join(clauses, joiner) + ")"
			if where == "" {
				where = " WHERE " + filterExpr
			} else {
				where += " AND " + filterExpr
			}
		}
	}

	var total int
	err := db.QueryRow("SELECT COUNT(*) FROM repeaters"+where, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * perPage
	query := `SELECT id, callsign, freq_tx, freq_rx, freq_offset, band, lat, lng, city, state, country,
		color_code, ts_linked, trustee, ipsc_network, networks, hotspot, status,
		last_seen, bm_status, bm_status_text, hardware, firmware, pep, agl, website, description,
		import_freq_inconsistent, last_polled
		FROM repeaters` + where + ` ORDER BY callsign LIMIT ` + nextParam() + ` OFFSET ` + nextParam()
	args = append(args, perPage, offset)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	threshold := time.Now().Add(-7 * 24 * time.Hour)
	var results []Repeater
	for rows.Next() {
		var r Repeater
		if err := rows.Scan(&r.ID, &r.Callsign, &r.FreqTx, &r.FreqRx, &r.FreqOffset, &r.Band,
			&r.Lat, &r.Lng, &r.City, &r.State, &r.Country,
			&r.ColorCode, &r.TsLinked, &r.Trustee,
			&r.IpscNetwork, &r.Networks, &r.Hotspot, &r.Status,
			&r.LastSeen, &r.BmStatus, &r.BmStatusText, &r.Hardware,
			&r.Firmware, &r.Pep, &r.Agl, &r.Website, &r.Description,
			&r.ImportFreqInconsistent, &r.LastPolled); err != nil {
			return nil, 0, err
		}
		r.Inactive = (r.LastSeen != nil && r.LastSeen.Before(threshold)) || (r.BmStatus != nil && *r.BmStatus == 0)
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if results == nil {
		results = []Repeater{}
	}

	return results, total, nil
}

// routeDistances returns the perpendicular distance from a point to the nearest
// route segment, and the along-route distance from the route start to the
// projection point on that segment.
func routeDistances(lat, lng float64, points [][2]float64, cumDist []float64) (perpDist, alongDist float64) {
	bestPerp := math.Inf(1)
	bestAlong := 0.0
	for i := 0; i < len(points)-1; i++ {
		d, t := distToSegmentWithParam(lat, lng, points[i][0], points[i][1], points[i+1][0], points[i+1][1])
		if d < bestPerp {
			bestPerp = d
			segLen := cumDist[i+1] - cumDist[i]
			bestAlong = cumDist[i] + t*segLen
		}
	}
	if len(points) == 1 {
		bestPerp = haversineKm(lat, lng, points[0][0], points[0][1])
	}
	return bestPerp, bestAlong
}

// distToSegmentWithParam returns the approximate distance from point P to line
// segment AB in km, and the projection parameter t (0–1) along the segment.
func distToSegmentWithParam(pLat, pLng, aLat, aLng, bLat, bLng float64) (dist, t float64) {
	cosLat := math.Cos(pLat * math.Pi / 180)
	// Project to approximate planar coordinates (km)
	px := (pLng - aLng) * cosLat * 111.32
	py := (pLat - aLat) * 111.32
	bx := (bLng - aLng) * cosLat * 111.32
	by := (bLat - aLat) * 111.32

	lenSq := bx*bx + by*by
	if lenSq == 0 {
		return math.Sqrt(px*px + py*py), 0
	}

	t = (px*bx + py*by) / lenSq
	if t < 0 {
		t = 0
	}
	if t > 1 {
		t = 1
	}

	dx := px - t*bx
	dy := py - t*by
	return math.Sqrt(dx*dx + dy*dy), t
}

func queryRepeaterSearch(db *sql.DB, search string, limit int) ([]Repeater, int, error) {
	if limit <= 0 || limit > 200 {
		limit = 25
	}
	pattern := "%" + search + "%"
	where := `WHERE callsign ILIKE $1 OR city ILIKE $1 OR state ILIKE $1 OR country ILIKE $1 OR array_to_string(networks, ',') ILIKE $1 OR id::text = $2`

	var total int
	err := db.QueryRow("SELECT COUNT(*) FROM repeaters "+where, pattern, search).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := db.Query(`SELECT id, callsign, freq_tx, freq_rx, freq_offset, band, lat, lng, city, state, country,
		color_code, ts_linked, trustee, ipsc_network, networks, hotspot, status,
		last_seen, bm_status, bm_status_text, hardware, firmware, pep, agl, website, description,
		import_freq_inconsistent, last_polled
		FROM repeaters `+where+` ORDER BY callsign LIMIT $3`, pattern, search, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	threshold := time.Now().Add(-7 * 24 * time.Hour)
	var results []Repeater
	for rows.Next() {
		var r Repeater
		if err := rows.Scan(&r.ID, &r.Callsign, &r.FreqTx, &r.FreqRx, &r.FreqOffset, &r.Band,
			&r.Lat, &r.Lng, &r.City, &r.State, &r.Country,
			&r.ColorCode, &r.TsLinked, &r.Trustee,
			&r.IpscNetwork, &r.Networks, &r.Hotspot, &r.Status,
			&r.LastSeen, &r.BmStatus, &r.BmStatusText, &r.Hardware,
			&r.Firmware, &r.Pep, &r.Agl, &r.Website, &r.Description,
			&r.ImportFreqInconsistent, &r.LastPolled); err != nil {
			return nil, 0, err
		}
		r.Inactive = (r.LastSeen != nil && r.LastSeen.Before(threshold)) || (r.BmStatus != nil && *r.BmStatus == 0)
		results = append(results, r)
	}
	if results == nil {
		results = []Repeater{}
	}
	return results, total, rows.Err()
}

func queryRepeaterByID(db *sql.DB, id int) (*Repeater, error) {
	var r Repeater
	err := db.QueryRow(`SELECT id, callsign, freq_tx, freq_rx, freq_offset, band, lat, lng, city, state, country,
		color_code, ts_linked, trustee, ipsc_network, networks, hotspot, status,
		last_seen, bm_status, bm_status_text, hardware, firmware, pep, agl, website, description,
		import_freq_inconsistent, last_polled
		FROM repeaters WHERE id = $1`, id).Scan(
		&r.ID, &r.Callsign, &r.FreqTx, &r.FreqRx, &r.FreqOffset, &r.Band,
		&r.Lat, &r.Lng, &r.City, &r.State, &r.Country,
		&r.ColorCode, &r.TsLinked, &r.Trustee,
		&r.IpscNetwork, &r.Networks, &r.Hotspot, &r.Status,
		&r.LastSeen, &r.BmStatus, &r.BmStatusText, &r.Hardware,
		&r.Firmware, &r.Pep, &r.Agl, &r.Website, &r.Description,
		&r.ImportFreqInconsistent, &r.LastPolled)
	if err != nil {
		return nil, err
	}
	threshold := time.Now().Add(-7 * 24 * time.Hour)
	r.Inactive = (r.LastSeen != nil && r.LastSeen.Before(threshold)) || (r.BmStatus != nil && *r.BmStatus == 0)
	return &r, nil
}

func updateRepeater(db *sql.DB, r Repeater) error {
	_, err := db.Exec(`UPDATE repeaters SET
		callsign=$2, freq_tx=$3, freq_rx=$4, freq_offset=$5, band=$6,
		lat=$7, lng=$8, city=$9, state=$10, country=$11,
		color_code=$12, ts_linked=$13, trustee=$14, ipsc_network=$15,
		networks=$16, hotspot=$17, status=$18,
		hardware=$19, firmware=$20, pep=$21, agl=$22,
		website=$23, description=$24
		WHERE id=$1`,
		r.ID, r.Callsign, r.FreqTx, r.FreqRx, r.FreqOffset, r.Band,
		r.Lat, r.Lng, r.City, r.State, r.Country,
		r.ColorCode, r.TsLinked, r.Trustee, r.IpscNetwork,
		r.Networks, r.Hotspot, r.Status,
		r.Hardware, r.Firmware, r.Pep, r.Agl,
		r.Website, r.Description)
	return err
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
