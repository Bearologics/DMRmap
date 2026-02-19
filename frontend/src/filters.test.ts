import { describe, it, expect } from "vitest";
import { getSelectedBand, getSelectedNetworks } from "./filters";

describe("getSelectedBand", () => {
    it("returns 'all' when both bands are selected", () => {
        expect(getSelectedBand(true, true)).toBe("all");
    });

    it("returns '2m' when only 2m is selected", () => {
        expect(getSelectedBand(true, false)).toBe("2m");
    });

    it("returns '70cm' when only 70cm is selected", () => {
        expect(getSelectedBand(false, true)).toBe("70cm");
    });

    it("returns 'all' when neither band is selected", () => {
        expect(getSelectedBand(false, false)).toBe("all");
    });
});

describe("getSelectedNetworks", () => {
    it("returns 'all' when all networks are selected", () => {
        expect(getSelectedNetworks(true, true, true, true)).toBe("all");
    });

    it("returns 'none' when no networks are selected", () => {
        expect(getSelectedNetworks(false, false, false, false)).toBe("none");
    });

    it("returns single network when only one is selected", () => {
        expect(getSelectedNetworks(true, false, false, false)).toBe("BM");
        expect(getSelectedNetworks(false, true, false, false)).toBe("DMR+");
        expect(getSelectedNetworks(false, false, true, false)).toBe("TGIF");
        expect(getSelectedNetworks(false, false, false, true)).toBe("Other");
    });

    it("returns comma-separated networks when multiple selected", () => {
        expect(getSelectedNetworks(true, true, false, false)).toBe("BM,DMR+");
        expect(getSelectedNetworks(true, false, true, false)).toBe("BM,TGIF");
    });
});
