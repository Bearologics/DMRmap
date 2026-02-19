import { describe, it, expect } from "vitest";
import { buildChannel, generateCpsXml, generateContactsCsv, CPS_CSV_HEADER, CPS_LOCALE } from "./cps-motorola";
import type { Repeater, CpsTalkgroup } from "./types";

const makeRepeater = (overrides: Partial<Repeater> = {}): Repeater => ({
    id: 1, callsign: "DB0ABC", freq_tx: 439.5, freq_rx: 431.9,
    freq_offset: "-7.6", band: "70cm", lat: 52.5, lng: 13.4,
    city: "Berlin", state: "Berlin", country: "Germany", color_code: 1,
    ts_linked: "1,2", trustee: "DL1ABC", ipsc_network: "BrandMeister",
    networks: ["BrandMeister"], hotspot: 0, status: "On-air",
    last_seen: null, bm_status: 1, bm_status_text: "Connected",
    hardware: "", firmware: "", pep: 0, agl: 0, website: "", description: "",
    import_freq_inconsistent: false, inactive: false, last_polled: null,
    ...overrides,
});

describe("buildChannel", () => {
    it("generates valid XML for a channel personality", () => {
        const xml = buildChannel("TG262-TS1", "SLOT1", 1, "439.500000", "431.900000");
        expect(xml).toContain('alias="TG262-TS1"');
        expect(xml).toContain('<field name="CP_SLTASSGMNT" Name="1">SLOT1</field>');
        expect(xml).toContain("<field name=\"CP_COLORCODE\">1</field>");
        expect(xml).toContain("<field name=\"CP_TXFREQ\">431.900000</field>");
        expect(xml).toContain("<field name=\"CP_RXFREQ\">439.500000</field>");
    });

    it("escapes XML characters in alias", () => {
        const xml = buildChannel('TG<"test">', "SLOT2", 3, "145.000000", "145.600000");
        expect(xml).toContain("TG&lt;&quot;test&quot;&gt;");
    });

    it("maps SLOT2 to display name 2", () => {
        const xml = buildChannel("Test", "SLOT2", 1, "439.500000", "431.900000");
        expect(xml).toContain('Name="2">SLOT2</field>');
    });
});

describe("generateCpsXml", () => {
    it("generates a valid XML document", () => {
        const repeaters = [makeRepeater()];
        const tgs: CpsTalkgroup[] = [{ id: 262, name: "TG262 Deutschlan", slot: "1" }];
        const xml = generateCpsXml(repeaters, tgs);
        expect(xml).toContain('<?xml version="1.0"');
        expect(xml).toContain("<config>");
        expect(xml).toContain("</config>");
        expect(xml).toContain('name="ZoneItems"');
    });

    it("creates one channel per repeater × talkgroup", () => {
        const repeaters = [makeRepeater(), makeRepeater({ callsign: "DB0XYZ" })];
        const tgs: CpsTalkgroup[] = [
            { id: 262, name: "TG262", slot: "1" },
            { id: 2628, name: "TG2628", slot: "1" },
        ];
        const xml = generateCpsXml(repeaters, tgs);
        const matches = xml.match(/ConventionalPersonality/g);
        expect(matches).toHaveLength(4); // 2 repeaters × 2 TGs
    });
});

describe("generateContactsCsv", () => {
    const tgs: CpsTalkgroup[] = [
        { id: 262, name: "TG262 Deutschlan", slot: "1" },
        { id: 2628, name: "TG2628 Bayern", slot: "1" },
    ];

    it("generates German locale CSV by default", () => {
        const csv = generateContactsCsv(tgs, "de");
        const lines = csv.split("\r\n");
        expect(lines).toHaveLength(4); // header1 + header2 + 2 contacts
        expect(lines[0]).toBe(CPS_CSV_HEADER);
        expect(lines[1]).toContain("Kontaktname");
        expect(lines[2]).toContain("TG262 Deutschlan");
        expect(lines[2]).toContain("Gruppenruf");
    });

    it("generates English locale CSV", () => {
        const csv = generateContactsCsv(tgs, "en");
        const lines = csv.split("\r\n");
        expect(lines[1]).toContain("Contact Name");
        expect(lines[2]).toContain("Group Call");
    });

    it("falls back to German for unknown locale", () => {
        const csv = generateContactsCsv(tgs, "fr");
        const lines = csv.split("\r\n");
        expect(lines[1]).toContain("Kontaktname");
    });

    it("uses TG ID as fallback name", () => {
        const tg: CpsTalkgroup[] = [{ id: 99999, name: "", slot: "1" }];
        const csv = generateContactsCsv(tg, "de");
        expect(csv).toContain("TG99999");
    });
});

describe("CPS_LOCALE", () => {
    it("has German and English locales", () => {
        expect(CPS_LOCALE).toHaveProperty("de");
        expect(CPS_LOCALE).toHaveProperty("en");
    });

    it("each locale has all required fields", () => {
        for (const lang of ["de", "en"]) {
            const l = CPS_LOCALE[lang];
            expect(l.header2).toBeTruthy();
            expect(l.routeType).toBeTruthy();
            expect(l.ringType).toBeTruthy();
            expect(l.txtMsgAlertType).toBeTruthy();
            expect(l.callType).toBeTruthy();
        }
    });
});
