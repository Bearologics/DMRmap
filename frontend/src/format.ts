/** Escape a string for safe HTML insertion. */
export function escapeHtml(str: string): string {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Escape a string for safe XML attribute/content insertion. */
export function escapeXml(str: string): string {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** Format a frequency in MHz to 6 decimal places. */
export function formatFreq(mhz: number | string): string {
    return parseFloat(String(mhz)).toFixed(6);
}

/**
 * Format a talkgroup alias for CPS channel naming.
 * @param tgId - Talkgroup ID
 * @param slot - Timeslot ("1" or "2")
 * @param format - Alias format: "tg-ts" or "tg-name"
 * @param tgNameFn - Function that resolves a TG ID to its name
 */
export function formatTgAlias(
    tgId: number,
    slot: string,
    format: string,
    tgNameFn: (id: number) => string,
): string {
    if (format === "call-tg-ts") {
        return (tgId + "-" + slot).substring(0, 16);
    }
    if (format === "tg-ts") {
        return ("TG" + tgId + "-TS" + slot).substring(0, 16);
    }
    return ("TG" + tgId + " " + (tgNameFn(tgId) || "")).trim().substring(0, 16);
}

/**
 * Build the final channel alias for export, prepending callsign when format requires it.
 */
export function formatChannelAlias(
    callsign: string,
    tgAlias: string,
    format: string,
): string {
    if (format === "call-tg-ts") {
        return (callsign + " " + tgAlias).substring(0, 16);
    }
    return tgAlias.substring(0, 16);
}
