import type { LatLngTuple } from "./types";

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Convert lat/lng to 6-character Maidenhead grid locator. */
export function toMaidenhead(lat: number, lng: number): string {
    lng = lng + 180;
    lat = lat + 90;
    let loc = "";
    loc += String.fromCharCode(65 + Math.floor(lng / 20));
    loc += String.fromCharCode(65 + Math.floor(lat / 10));
    lng = lng % 20;
    lat = lat % 10;
    loc += Math.floor(lng / 2);
    loc += Math.floor(lat);
    lng = (lng % 2) * 60;
    lat = (lat % 1) * 60;
    loc += String.fromCharCode(97 + Math.floor(lng / 5));
    loc += String.fromCharCode(97 + Math.floor(lat / 2.5));
    return loc;
}

/** Move a point along a bearing by a distance (great-circle). */
export function offsetPoint(lat: number, lng: number, bearing: number, distKm: number): LatLngTuple {
    const lat1 = lat * DEG_TO_RAD;
    const lng1 = lng * DEG_TO_RAD;
    const brng = bearing * DEG_TO_RAD;
    const d = distKm / EARTH_RADIUS_KM;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return [lat2 * RAD_TO_DEG, lng2 * RAD_TO_DEG];
}

/** Initial bearing (forward azimuth) from p1 to p2 in degrees [0, 360). */
export function getBearing(p1: LatLngTuple, p2: LatLngTuple): number {
    const lat1 = p1[0] * DEG_TO_RAD;
    const lat2 = p2[0] * DEG_TO_RAD;
    const dLng = (p2[1] - p1[1]) * DEG_TO_RAD;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360;
}

/** Average of two bearings via unit-vector mean. */
export function averageBearing(b1: number, b2: number): number {
    const r1 = b1 * DEG_TO_RAD;
    const r2 = b2 * DEG_TO_RAD;
    const x = Math.cos(r1) + Math.cos(r2);
    const y = Math.sin(r1) + Math.sin(r2);
    return (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360;
}

/** Build a closed polygon outlining the corridor around a polyline. */
export function computeCorridorPolygon(points: LatLngTuple[], distKm: number): LatLngTuple[] {
    if (points.length < 2) return [];
    const left: LatLngTuple[] = [];
    const right: LatLngTuple[] = [];
    for (let i = 0; i < points.length; i++) {
        let bearing: number;
        if (i === 0) {
            bearing = getBearing(points[0], points[1]);
        } else if (i === points.length - 1) {
            bearing = getBearing(points[i - 1], points[i]);
        } else {
            const b1 = getBearing(points[i - 1], points[i]);
            const b2 = getBearing(points[i], points[i + 1]);
            bearing = averageBearing(b1, b2);
        }
        left.push(offsetPoint(points[i][0], points[i][1], bearing - 90, distKm));
        right.push(offsetPoint(points[i][0], points[i][1], bearing + 90, distKm));
    }
    return left.concat(right.reverse());
}

/** Map a 0–1 intensity value to an RGB color string (green→yellow→red). */
export function heatColor(intensity: number): string {
    let r: number, g: number;
    if (intensity < 0.5) {
        r = Math.round(255 * (intensity * 2));
        g = 255;
    } else {
        r = 255;
        g = Math.round(255 * (1 - (intensity - 0.5) * 2));
    }
    return "rgb(" + r + "," + g + ",0)";
}
