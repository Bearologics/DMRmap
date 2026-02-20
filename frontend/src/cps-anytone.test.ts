import { describe, it, expect } from "vitest";
import { generateAnytoneContactsCsv, generateAnytoneChannelsCsv, ANYTONE_CH_HEADER } from "./cps-anytone";
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

/** Parse a quoted CSV row into unquoted values. */
function parseCsvRow(row: string): string[] {
    return row.split(",").map(v => v.replace(/^"|"$/g, ""));
}

describe("generateAnytoneContactsCsv", () => {
    const tgs: CpsTalkgroup[] = [
        { id: 262, name: "TG262 Deutschlan", slot: "1" },
        { id: 2628, name: "TG2628 Bayern", slot: "1" },
    ];

    it("generates CSV with correct header", () => {
        const csv = generateAnytoneContactsCsv(tgs);
        const lines = csv.split("\r\n");
        expect(lines[0]).toBe("No.,Radio ID,Name,Call Type,Call Alert");
    });

    it("generates correct data rows", () => {
        const csv = generateAnytoneContactsCsv(tgs);
        const lines = csv.split("\r\n");
        expect(lines).toHaveLength(3); // header + 2 rows
        expect(lines[1]).toBe("1,262,TG262 Deutschlan,Group Call,None");
        expect(lines[2]).toBe("2,2628,TG2628 Bayern,Group Call,None");
    });

    it("uses TG ID as fallback name", () => {
        const tg: CpsTalkgroup[] = [{ id: 99999, name: "", slot: "1" }];
        const csv = generateAnytoneContactsCsv(tg);
        expect(csv).toContain("TG99999");
    });

    it("has 5 columns per row", () => {
        const csv = generateAnytoneContactsCsv(tgs);
        const lines = csv.split("\r\n");
        for (const line of lines) {
            expect(line.split(",")).toHaveLength(5);
        }
    });
});

describe("generateAnytoneChannelsCsv", () => {
    const tgs: CpsTalkgroup[] = [
        { id: 262, name: "TG262", slot: "1" },
    ];
    const repeaters = [makeRepeater()];

    it("generates CSV with correct header", () => {
        const csv = generateAnytoneChannelsCsv(repeaters, tgs);
        const lines = csv.split("\r\n");
        expect(lines[0]).toBe(ANYTONE_CH_HEADER);
    });

    it("creates one row per repeater × talkgroup", () => {
        const tgs2: CpsTalkgroup[] = [
            { id: 262, name: "TG262", slot: "1" },
            { id: 2628, name: "TG2628", slot: "2" },
        ];
        const csv = generateAnytoneChannelsCsv(repeaters, tgs2);
        const lines = csv.split("\r\n");
        expect(lines).toHaveLength(3); // header + 2 channels
    });

    it("has 56 columns per row (matching header)", () => {
        const csv = generateAnytoneChannelsCsv(repeaters, tgs);
        const lines = csv.split("\r\n");
        const headerCols = lines[0].split(",").length;
        expect(headerCols).toBe(56);
        for (let i = 1; i < lines.length; i++) {
            expect(lines[i].split(",")).toHaveLength(headerCols);
        }
    });

    it("all values are double-quoted", () => {
        const csv = generateAnytoneChannelsCsv(repeaters, tgs);
        const lines = csv.split("\r\n");
        for (let i = 0; i < lines.length; i++) {
            const fields = lines[i].split(",");
            for (const field of fields) {
                expect(field).toMatch(/^".*"$/);
            }
        }
    });

    it("includes correct frequencies with 5 decimal places", () => {
        const csv = generateAnytoneChannelsCsv(repeaters, tgs);
        expect(csv).toContain("439.50000");
        expect(csv).toContain("431.90000");
    });

    it("includes color code and timeslot", () => {
        const csv = generateAnytoneChannelsCsv(repeaters, tgs);
        const lines = csv.split("\r\n");
        const cols = parseCsvRow(lines[1]);
        // RX Color Code at index 20, Slot at index 21
        expect(cols[20]).toBe("1");
        expect(cols[21]).toBe("1");
    });

    it("has empty Radio ID field", () => {
        const csv = generateAnytoneChannelsCsv(repeaters, tgs);
        const lines = csv.split("\r\n");
        const cols = parseCsvRow(lines[1]);
        expect(cols[12]).toBe("");
    });

    it("has Through Mode set to On", () => {
        const csv = generateAnytoneChannelsCsv(repeaters, tgs);
        const lines = csv.split("\r\n");
        const cols = parseCsvRow(lines[1]);
        expect(cols[36]).toBe("On");
    });

    it("has TxCC as last column set to 1", () => {
        const csv = generateAnytoneChannelsCsv(repeaters, tgs);
        const lines = csv.split("\r\n");
        const cols = parseCsvRow(lines[1]);
        expect(cols[55]).toBe("1");
    });
});

describe("ANYTONE_CH_HEADER", () => {
    it("has 56 columns", () => {
        expect(ANYTONE_CH_HEADER.split(",")).toHaveLength(56);
    });

    it("uses RX Color Code column name", () => {
        expect(ANYTONE_CH_HEADER).toContain('"RX Color Code"');
    });

    it("has all values double-quoted", () => {
        const fields = ANYTONE_CH_HEADER.split(",");
        for (const field of fields) {
            expect(field).toMatch(/^".*"$/);
        }
    });
});
