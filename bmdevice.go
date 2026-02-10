package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type bmDeviceResponse struct {
	ID               int    `json:"id"`
	LastSeen         string `json:"last_seen"`
	Tx               string `json:"tx"`
	Rx               string `json:"rx"`
	Status           int    `json:"status"`
	StatusText       string `json:"statusText"`
	Hardware         string `json:"hardware"`
	Firmware         string `json:"firmware"`
	Pep              int    `json:"pep"`
	Agl              int    `json:"agl"`
	Website          string `json:"website"`
	PriorityDescription string `json:"priorityDescription"`
	Description      string `json:"description"`
	LastKnownMaster  int    `json:"lastKnownMaster"`
}

func startBMDeviceSync(db *sql.DB) {
	go func() {
		runBMDeviceSync(db)

		ticker := time.NewTicker(3 * 24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			runBMDeviceSync(db)
		}
	}()
}

func runBMDeviceSync(db *sql.DB) {
	log.Println("Starting BM device sync...")

	type repeaterFreq struct {
		ID       int
		Callsign string
		FreqTx   float64
		FreqRx   float64
	}

	// Only poll repeaters that haven't been polled in the last 3 days
	rows, err := db.Query(`SELECT id, callsign, freq_tx, freq_rx FROM repeaters
		WHERE networks @> ARRAY['Brandmeister'] AND hotspot = 0
		AND (last_polled IS NULL OR last_polled < NOW() - INTERVAL '3 days')
		ORDER BY CASE WHEN LEFT(id::text, 3) = '262' THEN 0 WHEN LEFT(id::text, 1) = '2' THEN 1 ELSE 2 END, callsign`)
	if err != nil {
		log.Printf("BM device sync: failed to query repeaters: %v", err)
		return
	}
	defer rows.Close()

	var rptrs []repeaterFreq
	for rows.Next() {
		var rf repeaterFreq
		if err := rows.Scan(&rf.ID, &rf.Callsign, &rf.FreqTx, &rf.FreqRx); err != nil {
			continue
		}
		rptrs = append(rptrs, rf)
	}
	if err := rows.Err(); err != nil {
		log.Printf("BM device sync: row iteration error: %v", err)
		return
	}

	log.Printf("BM device sync: checking %d BrandMeister repeaters", len(rptrs))

	// Rate limit: 3600 requests/hour = 1/second
	limiter := rate.NewLimiter(rate.Every(time.Second), 1)
	sem := make(chan struct{}, 5) // max 5 concurrent
	var wg sync.WaitGroup

	client := &http.Client{Timeout: 15 * time.Second}
	ctx := context.Background()

	var mu sync.Mutex
	updated, errors, inactive, removedBM := 0, 0, 0, 0
	inactiveThreshold := time.Now().Add(-7 * 24 * time.Hour)

	for _, rf := range rptrs {
		wg.Add(1)
		go func(rf repeaterFreq) {
			defer wg.Done()

			sem <- struct{}{}
			defer func() { <-sem }()

			if err := limiter.Wait(ctx); err != nil {
				return
			}

			url := fmt.Sprintf("https://api.brandmeister.network/v2/device/%d", rf.ID)
			resp, err := client.Get(url)
			if err != nil {
				log.Printf("BM device sync: HTTP error for %d (%s): %v", rf.ID, rf.Callsign, err)
				mu.Lock()
				errors++
				mu.Unlock()
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				log.Printf("BM device sync: HTTP %d for %d (%s)", resp.StatusCode, rf.ID, rf.Callsign)
				mu.Lock()
				errors++
				mu.Unlock()
				return
			}

			var device bmDeviceResponse
			if err := json.NewDecoder(resp.Body).Decode(&device); err != nil {
				log.Printf("BM device sync: decode error for %d (%s): %v", rf.ID, rf.Callsign, err)
				mu.Lock()
				errors++
				mu.Unlock()
				return
			}

			lastSeen, err := time.Parse("2006-01-02 15:04:05", device.LastSeen)
			if err != nil {
				log.Printf("BM device sync: parse last_seen error for %d (%s): %v", rf.ID, rf.Callsign, err)
				mu.Lock()
				errors++
				mu.Unlock()
				return
			}

			if lastSeen.Before(inactiveThreshold) {
				log.Printf("BM device sync: inactive repeater %d (%s), last seen %s", rf.ID, rf.Callsign, lastSeen.Format("2006-01-02"))
				mu.Lock()
				inactive++
				mu.Unlock()
			}

			// Combine priority description and description
			desc := device.Description
			if device.PriorityDescription != "" {
				if desc != "" {
					desc = device.PriorityDescription + "\n" + desc
				} else {
					desc = device.PriorityDescription
				}
			}
			// Strip HTML tags for clean storage
			desc = stripHTML(desc)

			// Check frequency consistency between RadioID and BrandMeister
			freqInconsistent := false
			if bmTx, err := strconv.ParseFloat(device.Tx, 64); err == nil {
				if bmRx, err := strconv.ParseFloat(device.Rx, 64); err == nil {
					if math.Abs(bmTx-rf.FreqTx) > 0.001 || math.Abs(bmRx-rf.FreqRx) > 0.001 {
						freqInconsistent = true
					}
				}
			}

			_, err = db.Exec(
				`UPDATE repeaters SET last_seen=$1, bm_status=$2, bm_status_text=$3,
				 hardware=$4, firmware=$5, pep=$6, agl=$7, website=$8, description=$9,
				 import_freq_inconsistent=$10, last_polled=NOW()
				 WHERE id=$11`,
				lastSeen, device.Status, device.StatusText,
				device.Hardware, device.Firmware, device.Pep, device.Agl,
				device.Website, desc, freqInconsistent, rf.ID,
			)

			mu.Lock()
			if err != nil {
				errors++
			} else {
				updated++
			}
			mu.Unlock()

			// Remove Brandmeister tag if no valid master server (0 = unset, 9999 = placeholder)
			if device.LastKnownMaster == 0 || device.LastKnownMaster == 9999 {
				if _, err := db.Exec(`UPDATE repeaters SET networks = array_remove(networks, 'Brandmeister') WHERE id = $1`, rf.ID); err == nil {
					log.Printf("BM device sync: removed Brandmeister tag from %d (%s) — no valid master", rf.ID, rf.Callsign)
					mu.Lock()
					removedBM++
					mu.Unlock()
				}
			}
		}(rf)
	}

	wg.Wait()
	log.Printf("BM device sync complete: %d updated, %d inactive, %d removed BM tag, %d errors", updated, inactive, removedBM, errors)
}

// stripHTML removes HTML tags from a string.
func stripHTML(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			b.WriteRune(r)
		}
	}
	return b.String()
}
