package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
)

type apiResponse struct {
	Repeaters []Repeater `json:"repeaters"`
	Count     int        `json:"count"`
}

type routeRequest struct {
	Points   [][2]float64 `json:"points"`
	Band     string       `json:"band"`
	Corridor float64      `json:"corridor"`
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

		repeaters, err := queryRepeaters(db, minLat, maxLat, minLng, maxLng, band)
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

		repeaters, err := queryRepeatersAlongRoute(db, req.Points, req.Corridor, req.Band)
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
