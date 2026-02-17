# DMRmap

A web app that visualizes DMR repeaters on an interactive map. Filter by band and network, search by callsign or address, find repeaters along a driving route, and export CPS-ready channel configurations.

**Live:** https://dmrmap.kida.io

## Features

- Interactive OpenStreetMap with repeater markers (blue = VHF/2m, red = UHF/70cm)
- Band filtering (2m / 70cm) and network filtering (BrandMeister, DMR+, TGIF, Other)
- Toggle visibility of personal hotspots and inactive repeaters
- Free-text search by callsign, city, or DMR ID
- Address-to-address routing via OSRM with adjustable corridor width
- Click-to-pin with adjustable radius search
- Detailed repeater popups (frequencies, color code, timeslots, hardware, power, antenna height, BrandMeister status)
- Real-time Last Heard heatmap via BrandMeister WebSocket
- CPS Studio: manage talk groups, set timeslots, export Motorola CPS 2.0 compatible XML
- Coordinate display with Maidenhead grid locator
- Dark mode (follows system preference)
- Internationalization (English, German, Spanish, French, Italian, Polish)
- No external CDN dependencies — all assets served locally

## Tech Stack

- **Backend:** Go (stdlib `net/http`), PostgreSQL 17 via `pgx/v5`, migrations via `goose/v3`
- **Frontend:** Vanilla JavaScript, Leaflet, i18next — no build step
- **Infrastructure:** Docker Compose, multi-stage Dockerfile

## External Services

| Service | Usage | Auth |
|---------|-------|------|
| [RadioID](https://radioid.net/database/dumps) | Repeater database (seeded from `rptrs.json` dump) | None |
| [BrandMeister API](https://wiki.brandmeister.network/index.php/API) | Device status sync (`/v2/device/{id}`), talk group registry (`/v2/talkgroup`) | None (public read) |
| [BrandMeister WebSocket](https://wiki.brandmeister.network/index.php/API/Last_Heard) | Real-time Last Heard feed for heatmap via socket.io | None |
| [Nominatim](https://nominatim.openstreetmap.org) | Address geocoding and autocomplete (client-side) | None |
| [OSRM](https://project-osrm.org) | Driving route calculation (client-side) | None |

The BrandMeister talk group registry is fetched once at Docker build time and bundled as `static/talkgroups.json`. It is used for talk group name resolution and autocomplete in CPS Studio.

## Running with Docker

```sh
docker compose up --build
```

Open http://localhost:8080. PostgreSQL data is persisted in a named volume.

## Development

Hot-reload with [air](https://github.com/air-verse/air):

```sh
docker compose -f compose.dev.yml up --build
```

The dev container mounts the project directory, so changes to Go and frontend files are picked up automatically.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://dmrmap:dmrmap@localhost:5432/dmrmap?sslmode=disable` | PostgreSQL connection string |
| `JSON_PATH` | `rptrs.json` | Path to RadioID repeater dump |
| `BMRPTRS_PATH` | `bmrptrs.json` | Path to BrandMeister repeater dump |
| `LISTEN_ADDR` | `:8080` | HTTP listen address |
| `BM_SYNC` | *(disabled)* | Set to `true` to enable periodic BrandMeister device sync |
| `ADMIN_TOKEN` | *(disabled)* | Set to enable the admin interface at `/admin/` |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/repeaters` | Repeaters within map bounding box (query: `minLat`, `maxLat`, `minLng`, `maxLng`, `band`, `network`, `hotspots`, `inactive`) |
| GET | `/api/repeaters/radius` | Repeaters within radius of a point (query: `lat`, `lng`, `radius`) |
| POST | `/api/repeaters/route` | Repeaters along a route corridor (body: GeoJSON coordinates + `corridor` width) |
| GET | `/api/repeater` | Single repeater by ID (query: `id`) |
| GET | `/api/repeaters/search` | Free-text search (query: `q`) |

## Project Structure

```
├── main.go              # Route registration, env config
├── db.go                # DB queries, Repeater struct, geo helpers
├── handlers.go          # Public API handlers
├── admin.go             # Admin auth middleware + admin API
├── bmdevice.go          # BrandMeister device sync
├── migrations/          # SQL migrations (goose)
├── static/
│   ├── app.js           # Frontend application logic
│   ├── style.css        # Styles with dark mode support
│   ├── index.html       # Single-page HTML shell
│   ├── i18n.js          # i18next initialization
│   ├── locales/         # Translation files (en, de, es, fr, it, pl)
│   └── lib/             # Vendored JS libraries (Leaflet, i18next, socket.io)
├── Dockerfile           # Production multi-stage build
├── Dockerfile.dev       # Development image with air
├── compose.yml          # Production Docker Compose
└── compose.dev.yml      # Development Docker Compose
```

## Data

Repeater data provided by [RadioID](https://radioid.net/database/dumps). Availability and talk group data by [BrandMeister](https://brandmeister.network). This project is not affiliated with or endorsed by RadioID or BrandMeister.

## License

[MIT](LICENSE)
