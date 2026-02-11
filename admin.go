package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
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

func handleBMDevice() http.HandlerFunc {
	client := &http.Client{Timeout: 15 * time.Second}
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, `{"error":"missing id"}`, http.StatusBadRequest)
			return
		}
		if _, err := strconv.Atoi(id); err != nil {
			http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
			return
		}

		url := fmt.Sprintf("https://api.brandmeister.network/v2/device/%s", id)
		resp, err := client.Get(url)
		if err != nil {
			log.Printf("BM device proxy: HTTP error for %s: %v", id, err)
			http.Error(w, `{"error":"upstream request failed"}`, http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNotFound {
			http.Error(w, `{"error":"device not found on BrandMeister"}`, http.StatusNotFound)
			return
		}
		if resp.StatusCode != http.StatusOK {
			log.Printf("BM device proxy: HTTP %d for %s", resp.StatusCode, id)
			http.Error(w, `{"error":"upstream error"}`, http.StatusBadGateway)
			return
		}

		var device bmDeviceResponse
		if err := json.NewDecoder(resp.Body).Decode(&device); err != nil {
			log.Printf("BM device proxy: decode error for %s: %v", id, err)
			http.Error(w, `{"error":"decode error"}`, http.StatusBadGateway)
			return
		}

		desc := device.Description
		if device.PriorityDescription != "" {
			if desc != "" {
				desc = device.PriorityDescription + "\n" + desc
			} else {
				desc = device.PriorityDescription
			}
		}
		desc = stripHTML(desc)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"last_seen":      device.LastSeen,
			"status":         device.Status,
			"status_text":    device.StatusText,
			"hardware":       device.Hardware,
			"firmware":       device.Firmware,
			"pep":            device.Pep,
			"agl":            device.Agl,
			"website":        device.Website,
			"description":    desc,
			"tx":             device.Tx,
			"rx":             device.Rx,
			"last_known_master": device.LastKnownMaster,
		})
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
