import { describe, it, expect } from "vitest";
import { BM262_TALKGROUPS, tgName, defaultSlot, searchTalkgroups } from "./talkgroups";
import type { TgRegistry } from "./types";

describe("tgName", () => {
    const registry: TgRegistry = { "1": "Worldwide", "2": "Europe" };

    it("resolves from registry first", () => {
        expect(tgName(1, registry)).toBe("Worldwide");
    });

    it("falls back to BM262 if not in registry", () => {
        expect(tgName(262, null)).toBe("Deutschland");
    });

    it("returns empty string for unknown ID", () => {
        expect(tgName(99999, registry)).toBe("");
    });

    it("prefers registry over BM262 fallback", () => {
        const custom: TgRegistry = { "262": "Custom Name" };
        expect(tgName(262, custom)).toBe("Custom Name");
    });

    it("handles string IDs", () => {
        expect(tgName("2628", null)).toBe("Bayern");
    });
});

describe("defaultSlot", () => {
    it("returns '1' for TGs starting with 1-7", () => {
        expect(defaultSlot(262)).toBe("1");
        expect(defaultSlot(1)).toBe("1");
        expect(defaultSlot(7777)).toBe("1");
    });

    it("returns '2' for TGs starting with 8", () => {
        expect(defaultSlot(8888)).toBe("2");
    });

    it("returns '2' for TGs starting with 9", () => {
        expect(defaultSlot(9990)).toBe("2");
    });
});

describe("searchTalkgroups", () => {
    const registry: TgRegistry = {
        "1": "Worldwide",
        "2": "Europe",
        "262": "Germany",
        "91": "Personal 91",
    };

    it("returns empty array when registry is null", () => {
        expect(searchTalkgroups("262", null)).toEqual([]);
    });

    it("searches by ID prefix for numeric queries", () => {
        const results = searchTalkgroups("262", registry);
        expect(results.some(r => r.id === 262)).toBe(true);
    });

    it("searches by name substring for text queries", () => {
        const results = searchTalkgroups("World", registry);
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(1);
    });

    it("returns at most 8 results", () => {
        const bigRegistry: TgRegistry = {};
        for (let i = 1; i <= 20; i++) {
            bigRegistry[String(i)] = "TG" + i;
        }
        const results = searchTalkgroups("TG", bigRegistry);
        expect(results.length).toBeLessThanOrEqual(8);
    });

    it("includes BM262 fallback results", () => {
        const emptyRegistry: TgRegistry = {};
        const results = searchTalkgroups("Bayern", emptyRegistry);
        expect(results.some(r => r.id === 2628)).toBe(true);
    });

    it("does not duplicate IDs between registry and BM262", () => {
        const results = searchTalkgroups("262", registry);
        const ids = results.map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("BM262_TALKGROUPS", () => {
    it("contains key German TGs", () => {
        expect(BM262_TALKGROUPS["262"]).toBe("Deutschland");
        expect(BM262_TALKGROUPS["2628"]).toBe("Bayern");
    });
});
