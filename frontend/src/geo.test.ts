import { describe, it, expect } from "vitest";
import {
    toMaidenhead,
    offsetPoint,
    getBearing,
    averageBearing,
    computeCorridorPolygon,
    heatColor,
} from "./geo";
import type { LatLngTuple } from "./types";

describe("toMaidenhead", () => {
    it("returns JN88ee for Vienna (48.2, 16.37)", () => {
        expect(toMaidenhead(48.2, 16.37)).toBe("JN88ee");
    });

    it("returns FN31pr for New York (40.75, -73.99)", () => {
        expect(toMaidenhead(40.75, -73.99)).toBe("FN30as");
    });

    it("returns JO62qm for Berlin (52.52, 13.4)", () => {
        expect(toMaidenhead(52.52, 13.4)).toBe("JO62qm");
    });

    it("handles 0,0 (Atlantic Ocean)", () => {
        expect(toMaidenhead(0, 0)).toBe("JJ00aa");
    });
});

describe("getBearing", () => {
    it("returns ~0° for due north", () => {
        const b = getBearing([0, 0], [1, 0]);
        expect(b).toBeCloseTo(0, 0);
    });

    it("returns ~90° for due east", () => {
        const b = getBearing([0, 0], [0, 1]);
        expect(b).toBeCloseTo(90, 0);
    });

    it("returns ~180° for due south", () => {
        const b = getBearing([1, 0], [0, 0]);
        expect(b).toBeCloseTo(180, 0);
    });

    it("returns ~270° for due west", () => {
        const b = getBearing([0, 0], [0, -1]);
        expect(b).toBeCloseTo(270, 0);
    });
});

describe("averageBearing", () => {
    it("averages 0° and 90° to ~45°", () => {
        expect(averageBearing(0, 90)).toBeCloseTo(45, 5);
    });

    it("averages 350° and 10° across north to ~0°", () => {
        expect(averageBearing(350, 10)).toBeCloseTo(0, 5);
    });

    it("averages two identical bearings to the same bearing", () => {
        expect(averageBearing(120, 120)).toBeCloseTo(120, 5);
    });
});

describe("offsetPoint", () => {
    it("moves north by ~111 km (1 degree of latitude)", () => {
        const [lat, lng] = offsetPoint(0, 0, 0, 111.195);
        expect(lat).toBeCloseTo(1, 0);
        expect(lng).toBeCloseTo(0, 1);
    });

    it("moves east by ~111 km at the equator (1 degree of longitude)", () => {
        const [lat, lng] = offsetPoint(0, 0, 90, 111.195);
        expect(lat).toBeCloseTo(0, 1);
        expect(lng).toBeCloseTo(1, 0);
    });
});

describe("computeCorridorPolygon", () => {
    it("returns empty array for fewer than 2 points", () => {
        expect(computeCorridorPolygon([], 10)).toEqual([]);
        expect(computeCorridorPolygon([[0, 0]], 10)).toEqual([]);
    });

    it("returns a closed polygon for a 2-point line", () => {
        const points: LatLngTuple[] = [[0, 0], [1, 0]];
        const polygon = computeCorridorPolygon(points, 10);
        // 2 points → 2 left + 2 right = 4 points
        expect(polygon).toHaveLength(4);
    });

    it("returns correct number of points for a 3-point line", () => {
        const points: LatLngTuple[] = [[0, 0], [1, 0], [2, 0]];
        const polygon = computeCorridorPolygon(points, 10);
        // 3 points → 3 left + 3 right = 6 points
        expect(polygon).toHaveLength(6);
    });

    it("polygon points are offset from the original line", () => {
        const points: LatLngTuple[] = [[0, 0], [1, 0]];
        const polygon = computeCorridorPolygon(points, 50);
        // All polygon points should have non-zero longitude (offset east/west)
        for (const pt of polygon) {
            expect(Math.abs(pt[1])).toBeGreaterThan(0.01);
        }
    });
});

describe("heatColor", () => {
    it("returns green for intensity 0", () => {
        expect(heatColor(0)).toBe("rgb(0,255,0)");
    });

    it("returns yellow for intensity 0.5", () => {
        expect(heatColor(0.5)).toBe("rgb(255,255,0)");
    });

    it("returns red for intensity 1", () => {
        expect(heatColor(1)).toBe("rgb(255,0,0)");
    });

    it("returns intermediate value for intensity 0.25", () => {
        expect(heatColor(0.25)).toBe("rgb(128,255,0)");
    });
});
