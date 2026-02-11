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

	if os.Getenv("BM_SYNC") == "true" {
		startBMDeviceSync(db)
	} else {
		log.Println("BM device sync disabled (set BM_SYNC=true to enable)")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/repeaters", handleRepeaters(db))
	mux.HandleFunc("/api/repeaters/radius", handleRadiusRepeaters(db))
	mux.HandleFunc("/api/repeaters/route", handleRouteRepeaters(db))
	mux.HandleFunc("/api/repeater", handleRepeaterByID(db))
	mux.HandleFunc("/api/repeaters/search", handleSearchRepeaters(db))

	if adminToken := os.Getenv("ADMIN_TOKEN"); adminToken != "" {
		mux.HandleFunc("/admin/", handleAdminPage())
		adminAPI := http.NewServeMux()
		adminAPI.HandleFunc("/admin/api/repeaters", handleAdminRepeaters(db))
		adminAPI.HandleFunc("/admin/api/repeaters/update", handleAdminUpdateRepeater(db))
		adminAPI.HandleFunc("/admin/api/repeaters/bm-device", handleBMDevice())
		adminAPI.HandleFunc("/admin/api/repeaters/save-bm", handleAdminSaveBMData(db))
		adminAPI.HandleFunc("/admin/api/repeaters/remove-bm-tag", handleAdminRemoveBMTag(db))
		mux.Handle("/admin/api/", adminAuth(adminToken, adminAPI))
		log.Println("Admin interface enabled at /admin/")
	}

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
