package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
)

func adminAuth(token string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "Bearer "+token {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":"unauthorized"}`))
	})
}

func handleAdminPage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "static/admin.html")
	}
}

type adminRepeatersResponse struct {
	Repeaters []Repeater `json:"repeaters"`
	Total     int        `json:"total"`
	Page      int        `json:"page"`
	PerPage   int        `json:"per_page"`
}

func handleAdminUpdateRepeater(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		var rpt Repeater
		if err := json.NewDecoder(r.Body).Decode(&rpt); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}
		if rpt.ID <= 0 {
			http.Error(w, `{"error":"missing repeater id"}`, http.StatusBadRequest)
			return
		}

		if err := updateRepeater(db, rpt); err != nil {
			http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
	}
}

func handleBackfillBM(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		bmSet := loadBMRepeaters("")
		if len(bmSet) == 0 {
			http.Error(w, `{"error":"could not load BM repeaters"}`, http.StatusInternalServerError)
			return
		}
		log.Printf("BM backfill: downloaded %d BM callsigns", len(bmSet))

		rows, err := db.Query("SELECT id, callsign FROM repeaters WHERE NOT networks @> ARRAY['Brandmeister']")
		if err != nil {
			http.Error(w, `{"error":"database query failed"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var ids []int
		for rows.Next() {
			var id int
			var callsign string
			if err := rows.Scan(&id, &callsign); err != nil {
				continue
			}
			if bmSet[strings.ToUpper(strings.TrimSpace(callsign))] {
				ids = append(ids, id)
			}
		}

		if len(ids) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"updated": 0})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, `{"error":"transaction failed"}`, http.StatusInternalServerError)
			return
		}

		updated := 0
		for _, id := range ids {
			if _, err := tx.Exec("UPDATE repeaters SET networks = array_append(networks, 'Brandmeister') WHERE id = $1", id); err == nil {
				updated++
			}
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, `{"error":"commit failed"}`, http.StatusInternalServerError)
			return
		}

		log.Printf("BM backfill: updated %d repeaters", updated)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"updated": updated})
	}
}

func handleAdminRepeaters(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		q := r.URL.Query()
		page := 1
		if v := q.Get("page"); v != "" {
			if p, err := strconv.Atoi(v); err == nil && p > 0 {
				page = p
			}
		}

		perPage := 50
		if v := q.Get("per_page"); v != "" {
			if p, err := strconv.Atoi(v); err == nil && p > 0 {
				perPage = p
			}
		}
		if perPage > 200 {
			perPage = 200
		}

		search := strings.TrimSpace(q.Get("q"))

		repeaters, total, err := queryAdminRepeaters(db, search, page, perPage)
		if err != nil {
			http.Error(w, `{"error":"database query failed"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(adminRepeatersResponse{
			Repeaters: repeaters,
			Total:     total,
			Page:      page,
			PerPage:   perPage,
		})
	}
}
