import { describe, it, expect } from "vitest";
import { buildPopup } from "./popup";
import type { Repeater } from "./types";

const makeRepeater = (overrides: Partial<Repeater> = {}): Repeater => ({
    id: 1, callsign: "DB0ABC", freq_tx: 439.5, freq_rx: 431.9,
    freq_offset: "-7.6", band: "70cm", lat: 52.5, lng: 13.4,
    city: "Berlin", state: "Berlin", country: "Germany", color_code: 1,
    ts_linked: "1,2", trustee: "DL1ABC", ipsc_network: "BrandMeister",
    networks: ["BrandMeister"], hotspot: 0, status: "On-air",
    last_seen: null, bm_status: 1, bm_status_text: "Connected",
    hardware: "Motorola", firmware: "", pep: 50, agl: 30, website: "", description: "",
    import_freq_inconsistent: false, inactive: false, last_polled: null,
    ...overrides,
});

const mockT = (key: string) => key;

describe("buildPopup", () => {
    it("contains callsign as a link", () => {
        const html = buildPopup(makeRepeater(), mockT);
        expect(html).toContain("DB0ABC");
        expect(html).toContain("brandmeister.network/?page=repeater&id=1");
    });

    it("contains TX and RX frequencies", () => {
        const html = buildPopup(makeRepeater(), mockT);
        expect(html).toContain("439.5000 MHz");
        expect(html).toContain("431.9000 MHz");
    });

    it("contains color code", () => {
        const html = buildPopup(makeRepeater({ color_code: 3 }), mockT);
        expect(html).toContain(">3<");
    });

    it("contains location info", () => {
        const html = buildPopup(makeRepeater(), mockT);
        expect(html).toContain("Berlin, Berlin, Germany");
    });

    it("contains network info", () => {
        const html = buildPopup(makeRepeater(), mockT);
        expect(html).toContain("BrandMeister");
    });

    it("shows band tag for 2m", () => {
        const html = buildPopup(makeRepeater({ band: "2m" }), mockT);
        expect(html).toContain("band-2m");
    });

    it("shows band tag for 70cm", () => {
        const html = buildPopup(makeRepeater(), mockT);
        expect(html).toContain("band-70cm");
    });

    it("shows inactive status when inactive", () => {
        const html = buildPopup(makeRepeater({ inactive: true }), mockT);
        expect(html).toContain("popup_inactive");
    });

    it("does not show inactive text when active", () => {
        const html = buildPopup(makeRepeater({ inactive: false }), mockT);
        expect(html).not.toContain("popup_inactive");
    });

    it("shows hardware when present", () => {
        const html = buildPopup(makeRepeater({ hardware: "Hytera RD985" }), mockT);
        expect(html).toContain("Hytera RD985");
    });

    it("shows power and antenna when present", () => {
        const html = buildPopup(makeRepeater({ pep: 50, agl: 30 }), mockT);
        expect(html).toContain("50 W");
        expect(html).toContain("30 m AGL");
    });

    it("shows last seen when present", () => {
        const html = buildPopup(makeRepeater({ last_seen: "2024-01-15T12:30:00Z" }), mockT);
        expect(html).toContain("2024-01-15 12:30:00");
    });

    it("escapes HTML in callsign", () => {
        const html = buildPopup(makeRepeater({ callsign: "<script>alert(1)</script>" }), mockT);
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });

    it("uses translate function for labels", () => {
        const keys: string[] = [];
        const captureT = (key: string) => { keys.push(key); return key; };
        buildPopup(makeRepeater(), captureT);
        expect(keys).toContain("popup_tx");
        expect(keys).toContain("popup_rx");
        expect(keys).toContain("popup_cc");
        expect(keys).toContain("popup_location");
    });
});
