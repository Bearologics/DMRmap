package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

type apiResponse struct {
	Repeaters []Repeater `json:"repeaters"`
	Count     int        `json:"count"`
}

type searchResponse struct {
	Repeaters []Repeater `json:"repeaters"`
	Count     int        `json:"count"`
	Total     int        `json:"total"`
}

type routeRequest struct {
	Points   [][2]float64 `json:"points"`
	Band     string       `json:"band"`
	Corridor float64      `json:"corridor"`
	Network  []string     `json:"network"`
	Hotspots bool         `json:"hotspots"`
	Inactive bool         `json:"inactive"`
}

func handleSearchRepeaters(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(searchResponse{Repeaters: []Repeater{}, Count: 0, Total: 0})
			return
		}

		limit := 25
		if v := r.URL.Query().Get("limit"); v != "" {
			if p, err := strconv.Atoi(v); err == nil && p > 0 {
				limit = p
			}
		}
		if limit > 200 {
			limit = 200
		}

		repeaters, total, err := queryRepeaterSearch(db, q, limit)
		if err != nil {
			http.Error(w, `{"error":"database query failed"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(searchResponse{
			Repeaters: repeaters,
			Count:     len(repeaters),
			Total:     total,
		})
	}
}

func handleRepeaterByID(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		idStr := r.URL.Query().Get("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			http.Error(w, `{"error":"missing or invalid id"}`, http.StatusBadRequest)
			return
		}

		rpt, err := queryRepeaterByID(db, id)
		if err != nil {
			http.Error(w, `{"error":"repeater not found"}`, http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rpt)
	}
}

func handleRepeaters(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		q := r.URL.Query()
		minLat, err1 := strconv.ParseFloat(q.Get("minLat"), 64)
		maxLat, err2 := strconv.ParseFloat(q.Get("maxLat"), 64)
		minLng, err3 := strconv.ParseFloat(q.Get("minLng"), 64)
		maxLng, err4 := strconv.ParseFloat(q.Get("maxLng"), 64)

		if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
			http.Error(w, `{"error":"missing or invalid bounding box parameters (minLat, maxLat, minLng, maxLng)"}`, http.StatusBadRequest)
			return
		}

		band := q.Get("band")
		if band == "" {
			band = "all"
		}
		if band != "2m" && band != "70cm" && band != "all" {
			http.Error(w, `{"error":"band must be 2m, 70cm, or all"}`, http.StatusBadRequest)
			return
		}

		var networks []string
		if net := q.Get("network"); net != "" && net != "all" {
			networks = strings.Split(net, ",")
		}

		showHotspots := q.Get("hotspots") == "1"
		showInactive := q.Get("inactive") == "1"

		repeaters, err := queryRepeaters(db, minLat, maxLat, minLng, maxLng, band, networks, showHotspots, showInactive)
		if err != nil {
			http.Error(w, `{"error":"database query failed"}`, http.StatusInternalServerError)
			return
		}

		if repeaters == nil {
			repeaters = []Repeater{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(apiResponse{
			Repeaters: repeaters,
			Count:     len(repeaters),
		})
	}
}

type radiusResponse struct {
	Repeaters []RepeaterWithDistance `json:"repeaters"`
	Count     int                   `json:"count"`
}

func handleRadiusRepeaters(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		q := r.URL.Query()
		lat, err1 := strconv.ParseFloat(q.Get("lat"), 64)
		lng, err2 := strconv.ParseFloat(q.Get("lng"), 64)
		if err1 != nil || err2 != nil {
			http.Error(w, `{"error":"missing or invalid lat/lng"}`, http.StatusBadRequest)
			return
		}

		radius := 100.0
		if rv := q.Get("radius"); rv != "" {
			if parsed, err := strconv.ParseFloat(rv, 64); err == nil && parsed > 0 {
				radius = parsed
			}
		}
		if radius > 500 {
			radius = 500
		}

		band := q.Get("band")
		if band == "" {
			band = "all"
		}
		if band != "2m" && band != "70cm" && band != "all" {
			http.Error(w, `{"error":"band must be 2m, 70cm, or all"}`, http.StatusBadRequest)
			return
		}

		var networks []string
		if net := q.Get("network"); net != "" && net != "all" {
			networks = strings.Split(net, ",")
		}

		showHotspots := q.Get("hotspots") == "1"
		showInactive := q.Get("inactive") == "1"

		repeaters, err := queryRepeatersInRadius(db, lat, lng, radius, band, networks, showHotspots, showInactive)
		if err != nil {
			http.Error(w, `{"error":"database query failed"}`, http.StatusInternalServerError)
			return
		}

		if repeaters == nil {
			repeaters = []RepeaterWithDistance{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(radiusResponse{
			Repeaters: repeaters,
			Count:     len(repeaters),
		})
	}
}

func handleRouteRepeaters(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		var req routeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if len(req.Points) < 2 {
			http.Error(w, `{"error":"at least 2 route points required"}`, http.StatusBadRequest)
			return
		}

		if req.Band == "" {
			req.Band = "all"
		}
		if req.Band != "2m" && req.Band != "70cm" && req.Band != "all" {
			http.Error(w, `{"error":"band must be 2m, 70cm, or all"}`, http.StatusBadRequest)
			return
		}
		if req.Corridor <= 0 {
			req.Corridor = 10
		}

		repeaters, err := queryRepeatersAlongRoute(db, req.Points, req.Corridor, req.Band, req.Network, req.Hotspots, req.Inactive)
		if err != nil {
			http.Error(w, `{"error":"database query failed"}`, http.StatusInternalServerError)
			return
		}

		if repeaters == nil {
			repeaters = []RepeaterWithDistance{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(radiusResponse{
			Repeaters: repeaters,
			Count:     len(repeaters),
		})
	}
}
