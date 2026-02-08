RepeaterRoute - DMR Repeater Map
Context
The project contains rptrs.json (4.1MB, 10,607 DMR repeaters) with no application code yet. Goal: a server-backed responsive web app that visualizes repeaters on a full-screen OpenStreetMap with band filtering and viewport-based loading. The server seeds a SQLite DB from the JSON on startup, serves a REST API for geo-filtered queries, and serves the frontend assets. Deployed via Docker.

Language: Go
Recommended over Python/Node/Rust because:

Single binary, ~12MB Docker image (vs ~120-200MB for Python/Node)
modernc.org/sqlite is pure Go — no CGO, no C compiler in Docker
net/http stdlib is production-grade — no framework needed
Only 1 external dependency (modernc.org/sqlite)
Fast builds, simple deployment
File Structure

repeaterroute/
  go.mod / go.sum             # Go module (dep: modernc.org/sqlite)
  main.go                     # Entry point: env config, seed, start server
  seed.go                     # Parse rptrs.json → SQLite
  db.go                       # Schema, openDB, queryRepeaters
  handlers.go                 # GET /api/repeaters handler
  static/
    index.html                # Leaflet map shell
    style.css                 # Full-screen map, controls, responsive
    app.js                    # Map init, viewport queries, markers, filters
  rptrs.json                  # Existing data (unchanged)
  Dockerfile                  # Multi-stage: golang:1.22-alpine → alpine:3.19
  docker-compose.yml          # Service + named volume for DB persistence
Database Schema (db.go)

CREATE TABLE IF NOT EXISTS repeaters (
    id           INTEGER PRIMARY KEY,
    callsign     TEXT NOT NULL,
    frequency    REAL NOT NULL,
    band         TEXT NOT NULL,        -- '2m', '70cm', or 'other'
    lat          REAL NOT NULL,
    lng          REAL NOT NULL,
    city         TEXT NOT NULL DEFAULT '',
    state        TEXT NOT NULL DEFAULT '',
    country      TEXT NOT NULL DEFAULT '',
    color_code   INTEGER NOT NULL DEFAULT 1,
    offset       TEXT NOT NULL DEFAULT '',
    ts_linked    TEXT NOT NULL DEFAULT '',
    trustee      TEXT NOT NULL DEFAULT '',
    ipsc_network TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE INDEX idx_repeaters_lat_band ON repeaters (lat, band);
CREATE INDEX idx_repeaters_lng ON repeaters (lng);
Band is computed at seed time: 144-148 MHz → "2m", 420-450 MHz → "70cm", else "other".

API
GET /api/repeaters
Param	Type	Required	Description
minLat	float	yes	South boundary
maxLat	float	yes	North boundary
minLng	float	yes	West boundary
maxLng	float	yes	East boundary
band	string	no	"2m", "70cm", or "all" (default)
Response:


{
  "repeaters": [{ "id": 1, "callsign": "DB0XYZ", "frequency": 439.5, "band": "70cm", "lat": 52.1, "lng": 9.7, ... }],
  "count": 847,
  "truncated": false
}
Query uses LIMIT 1001 — if 1001 rows returned, set truncated: true and return only first 1000. No separate COUNT query needed.

When band is "all", query uses AND band IN ('2m', '70cm') to exclude "other".

Static files
/ and all non-API paths → http.FileServer(http.Dir("static"))

Seed Logic (seed.go)
Runs at startup inside main(), not as a separate script:

Create table + indexes if not exist
SELECT COUNT(*) — if > 0, skip (already seeded)
Read rptrs.json, decode {"rptrs": [...]}
Single transaction, prepared INSERT
Per entry: parse lat/lng (strings→float64, skip if empty/NaN/out-of-range/null-island), parse frequency (skip if 0), classify band, insert
Expected: ~9,870 inserted, ~740 skipped
Coordinate validation: skip if lat/lng empty, NaN, both zero, or outside [-90,90]/[-180,180].

Frontend (static/)
Map (app.js)
Leaflet 1.9.4 from CDN (no marker clustering needed — max 1000 markers)
Centered on Hannover: [52.37, 9.73], zoom 6
L.layerGroup() for markers — cleared and rebuilt on each fetch
L.circleMarker with band colors: blue #2196F3 (2m), orange #FF9800 (70cm)
Debounced moveend listener (150ms) triggers fetchRepeaters()
fetchRepeaters(): extracts bounds → calls API → clears layer → adds markers → updates status bar
Popup: callsign, frequency+band, offset, color code, city/state/country, network, trustee, timeslots, status
Filter UI
Two checkboxes: "2m" and "70cm" (both checked by default)
On change → fetchRepeaters()
Both checked = band=all, one checked = that band, neither = all (show everything)
Status bar
Bottom of screen: "Showing X repeaters"
When truncated: amber background, "Showing 1000 repeaters — zoom in to see all"
Responsive
#map: 100vw × 100vh, no margin
Controls: top-right overlay, touch-friendly (min 44px tap targets)
Mobile (<768px): controls compact horizontally
Docker
Dockerfile

FROM golang:1.22-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -o repeaterroute .

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /build/repeaterroute .
COPY static/ ./static/
COPY rptrs.json .
EXPOSE 8080
CMD ["./repeaterroute"]
docker-compose.yml

services:
  repeaterroute:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - repeater-data:/app/data
    environment:
      - DB_PATH=/app/data/repeaters.db
      - JSON_PATH=/app/rptrs.json
      - LISTEN_ADDR=:8080
    restart: unless-stopped

volumes:
  repeater-data:
Named volume persists SQLite DB across container restarts (no re-seeding).

Implementation Steps
Init Go module — go mod init repeaterroute && go get modernc.org/sqlite
db.go — Repeater struct, schema const, openDB(), queryRepeaters()
seed.go — JSON parsing, coord/freq validation, band classification, bulk insert
handlers.go — Parameter parsing, validation, JSON response
main.go — Env config, seed call, route registration, ListenAndServe
static/index.html — HTML shell with Leaflet CDN, control panel, status bar
static/style.css — Full-screen map, overlay controls, responsive breakpoints
static/app.js — Map init, debounced viewport fetching, markers, filters, popups
Dockerfile — Multi-stage build
docker-compose.yml — Service + volume
Verification

# Local dev
go run . && open http://localhost:8080

# Docker
docker compose up --build && open http://localhost:8080
Map loads centered on Hannover/Germany at zoom 6
Repeaters appear as blue (2m) and orange (70cm) circle markers
Pan/zoom triggers new fetch (check browser network tab)
Band checkboxes filter correctly
Zoom out to world view → "Zoom in to see all repeaters" message appears
Click marker → popup with repeater details
Status bar shows count, updates on each fetch
docker compose up --build starts cleanly, seeds DB on first run, skips on restart