import { describe, it, expect } from "vitest";
import { escapeHtml, escapeXml, formatFreq, formatTgAlias, formatChannelAlias } from "./format";

describe("escapeHtml", () => {
    it("escapes &, <, >, and quotes", () => {
        expect(escapeHtml('a & b < c > "d"')).toBe('a &amp; b &lt; c &gt; &quot;d&quot;');
    });

    it("returns empty string for falsy input", () => {
        expect(escapeHtml("")).toBe("");
    });

    it("passes through plain text unchanged", () => {
        expect(escapeHtml("Hello World")).toBe("Hello World");
    });
});

describe("escapeXml", () => {
    it("escapes &, <, >, quotes, and apostrophes", () => {
        expect(escapeXml("a & b < c > \"d\" 'e'")).toBe("a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
    });

    it("returns empty string for falsy input", () => {
        expect(escapeXml("")).toBe("");
    });
});

describe("formatFreq", () => {
    it("formats a number to 6 decimal places", () => {
        expect(formatFreq(439.5)).toBe("439.500000");
    });

    it("formats a string number to 6 decimal places", () => {
        expect(formatFreq("145.625")).toBe("145.625000");
    });

    it("handles integers", () => {
        expect(formatFreq(440)).toBe("440.000000");
    });
});

describe("formatTgAlias", () => {
    const mockTgName = (id: number) => {
        const names: Record<number, string> = { 262: "Deutschland", 2628: "Bayern" };
        return names[id] || "";
    };

    it("formats as TG-TS when format is 'tg-ts'", () => {
        expect(formatTgAlias(262, "1", "tg-ts", mockTgName)).toBe("TG262-TS1");
    });

    it("formats as TG + name when format is 'tg-name'", () => {
        expect(formatTgAlias(262, "1", "tg-name", mockTgName)).toBe("TG262 Deutschlan");
    });

    it("includes full name when it fits in 16 chars", () => {
        expect(formatTgAlias(2628, "1", "tg-name", mockTgName)).toBe("TG2628 Bayern");
    });

    it("falls back to TG ID only when name is unknown", () => {
        expect(formatTgAlias(99999, "1", "tg-name", mockTgName)).toBe("TG99999");
    });

    it("truncates to 16 characters", () => {
        const longName = (_id: number) => "Very Long Talkgroup Name";
        expect(formatTgAlias(12345, "1", "tg-name", longName)).toBe("TG12345 Very Lon");
        expect(formatTgAlias(12345, "1", "tg-name", longName)).toHaveLength(16);
    });

    it("formats as tgid-slot for call-tg-ts format", () => {
        expect(formatTgAlias(262, "2", "call-tg-ts", mockTgName)).toBe("262-2");
    });
});

describe("formatChannelAlias", () => {
    it("prepends callsign for call-tg-ts format", () => {
        expect(formatChannelAlias("DB0XYZ", "262-2", "call-tg-ts")).toBe("DB0XYZ 262-2");
    });

    it("returns tgAlias unchanged for tg-name format", () => {
        expect(formatChannelAlias("DB0XYZ", "TG262 Deutschlan", "tg-name")).toBe("TG262 Deutschlan");
    });

    it("returns tgAlias unchanged for tg-ts format", () => {
        expect(formatChannelAlias("DB0XYZ", "TG262-TS1", "tg-ts")).toBe("TG262-TS1");
    });

    it("truncates to 16 characters", () => {
        expect(formatChannelAlias("DB0LONGCALL", "262262-2", "call-tg-ts")).toHaveLength(16);
    });
});
