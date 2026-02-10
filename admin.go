package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

func adminAuth(token string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth == "Bearer "+token {
			next.ServeHTTP(w, r)
			return
		}
		// For the HTML page, allow token via query param so it can be bookmarked
		if r.URL.Query().Get("token") == token {
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
