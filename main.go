package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	dsn := envOr("DATABASE_URL", "postgres://dmrmap:dmrmap@localhost:5432/dmrmap?sslmode=disable")
	jsonPath := envOr("JSON_PATH", "rptrs.json")
	bmrptrsPath := envOr("BMRPTRS_PATH", "bmrptrs.json")
	addr := envOr("LISTEN_ADDR", ":8080")

	db, err := openDB(dsn)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	if err := runMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	if err := seedDatabase(db, jsonPath, bmrptrsPath); err != nil {
		log.Fatalf("Failed to seed database: %v", err)
	}

	startBMDeviceSync(db)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/repeaters", handleRepeaters(db))
	mux.HandleFunc("/api/repeaters/radius", handleRadiusRepeaters(db))
	mux.HandleFunc("/api/repeaters/route", handleRouteRepeaters(db))
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
