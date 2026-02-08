package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	dbPath := envOr("DB_PATH", "data/repeaters.db")
	jsonPath := envOr("JSON_PATH", "rptrs.json")
	addr := envOr("LISTEN_ADDR", ":8080")

	if err := os.MkdirAll("data", 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	if err := seedDatabase(dbPath, jsonPath); err != nil {
		log.Fatalf("Failed to seed database: %v", err)
	}

	db, err := openDB(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/repeaters", handleRepeaters(db))
	mux.Handle("/", http.FileServer(http.Dir("static")))

	log.Printf("Listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
