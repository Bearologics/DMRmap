# DMRmap

A web app that visualizes DMR repeaters on an interactive map. Filter by band, search by address, and find repeaters along a driving route.

**Live:** https://dmrmap.kida.io

## Features

- Full-screen OpenStreetMap with DMR repeater markers (blue for 2m, red for 70cm)
- Band filtering (2m / 70cm / both)
- Address-to-address routing with repeater corridor search (10 km)
- Address autocomplete via Nominatim
- Driving routes via OSRM
- Coordinate display with Maidenhead grid locator
- Dark mode (follows system preference, manual toggle)
- No external CDN dependencies — all assets served locally

## Requirements

- Go 1.25+
- Docker (optional)

## Running locally

```sh
go run .
```

Open http://localhost:8080. The SQLite database is seeded automatically from `rptrs.json` on first startup.

## Docker

```sh
docker compose up --build
```

The database is persisted in a named volume across restarts.

## Development

Hot-reload with [air](https://github.com/air-verse/air):

```sh
docker compose -f compose.dev.yml up --build
```

## Data

Repeater data provided by [RadioID](https://radioid.net/database/dumps). This project is not affiliated with or endorsed by RadioID.

## License

[MIT](LICENSE)
