/** Matches the Go Repeater struct JSON serialization (db.go) */
export interface Repeater {
  id: number;
  callsign: string;
  freq_tx: number;
  freq_rx: number;
  freq_offset: string;
  band: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  country: string;
  color_code: number;
  ts_linked: string;
  trustee: string;
  ipsc_network: string;
  networks: string[];
  hotspot: number;
  status: string;
  last_seen: string | null;
  bm_status: number | null;
  bm_status_text: string;
  hardware: string;
  firmware: string;
  pep: number;
  agl: number;
  website: string;
  description: string;
  import_freq_inconsistent: boolean;
  inactive: boolean;
  last_polled: string | null;
  distance?: number;
}

export interface CpsTalkgroup {
  id: number;
  name: string;
  slot: string;
}

export type TgRegistry = Record<string, string>;

export type TranslateFunction = (key: string, opts?: Record<string, unknown>) => string;

export type LatLngTuple = [number, number];
