import type { TgRegistry } from "./types";

/** Fallback TG names from wiki.bm262.de for the German-speaking region. */
export const BM262_TALKGROUPS: TgRegistry = {
    "262": "Deutschland", "263": "MultiMode DL",
    "2620": "Sachsen-Anhalt/Mecklenburg-Vorpommern", "2621": "Berlin/Brandenburg",
    "2622": "Hamburg/Schleswig-Holstein", "2623": "Niedersachsen/Bremen",
    "2624": "Nordrhein-Westfalen", "2625": "Rheinland-Pfalz/Saarland",
    "2626": "Hessen", "2627": "Baden-W\u00fcrttemberg", "2628": "Bayern",
    "2629": "Sachsen/Th\u00fcringen", "26200": "TAC 1", "26209": "Brandenburg",
    "26212": "Berlin-City", "26220": "Grossraum Hamburg", "26221": "Hamburg-City",
    "26222": "Ostholstein-Nord", "26223": "Chaoswelle", "26224": "Elbe-Weser",
    "26225": "AFU-Nord", "26226": "DMR Netzverbund Nord", "26228": "Ostholstein S\u00fcd",
    "26231": "NI Mitte", "26232": "Dreil\u00e4ndereck Mitte Deutschland", "26233": "TAC 3",
    "26234": "NI-Sued", "26236": "NI-Nord", "26239": "NI Ost",
    "26241": "Rheinland", "26242": "Muensterland", "26243": "Ruhrgebiet",
    "26245": "Rheinland-Sued", "26249": "Siebengebirge", "26250": "Saarland",
    "26256": "Eifel-Hunsrueck", "26257": "Siegerland", "26260": "Mittelhessen",
    "26261": "Nordhessen", "26262": "Rhein-Main-Neckar", "26263": "Bergstrasse",
    "26266": "TAC 4", "26270": "Stuttgart", "26271": "Baden",
    "26272": "Neckar-Odenwald", "26273": "BW-Ostalb", "26274": "BW B\u00f6blingen",
    "26275": "Schwarzwald Nord", "26276": "Neckar-Alb", "26277": "Schwarzwald",
    "26278": "BW Herrenberg", "26279": "BW Mittlerer Neckar", "26280": "Niederbayern",
    "26282": "Schwaben", "26283": "Region M\u00fcnchen", "26284": "Region Franken",
    "26285": "Region Ingolstadt", "26286": "Coburg-Rennsteig",
    "26287": "Allg\u00e4u-Bodensee", "26288": "Region Bayern Oberland",
    "26289": "Oberpfalz", "26298": "Th\u00fcringen", "26299": "TAC 2",
    "26300": "Multimode TAC 1", "26301": "Sachsen-Erzgebirge",
    "26322": "D22 - Neue Medien", "26331": "NI Ost", "26333": "Multimode TAC 3",
    "26338": "afu38", "26345": "Paderborn", "26346": "Ostwestfalen-Lippe",
    "26347": "IGA Rhein-Erft", "26348": "Westmuensterland", "26349": "Hochsauerland",
    "26366": "Multimode TAC 4", "26375": "Bodensee-Oberschwaben", "26377": "Ortenau",
    "26384": "Schrobenhausen", "26399": "Multimode TAC2", "26426": "FM-Funknetz",
    "26429": "DL-Nordwest", "262810": "Projekt Pegasus", "263112": "HiOrg-Talk EmComm",
    "263113": "(Un)Wetter Netz", "263333": "Twitterrunde",
    "263852": "DARC Dachau - C06 Runde", "264022": "Whitesticker",
};

/** Resolve a talkgroup ID to its name using the registry + BM262 fallback. */
export function tgName(id: number | string, registry: TgRegistry | null): string {
    const key = String(id);
    if (registry && registry[key]) return registry[key];
    if (BM262_TALKGROUPS[key]) return BM262_TALKGROUPS[key];
    return "";
}

/** Default timeslot: TGs starting with 8 or 9 default to TS2, others to TS1. */
export function defaultSlot(tgId: number | string): string {
    const first = String(tgId).charAt(0);
    return (first === "8" || first === "9") ? "2" : "1";
}

export interface TgSearchResult {
    id: number;
    name: string;
}

/** Search talkgroups by ID prefix or name substring. Returns up to 8 results. */
export function searchTalkgroups(query: string, registry: TgRegistry | null): TgSearchResult[] {
    if (!registry) return [];
    const q = query.toLowerCase();
    const isNum = /^\d+$/.test(query);
    const results: TgSearchResult[] = [];
    for (const id in registry) {
        if (isNum ? id.indexOf(query) === 0 : registry[id].toLowerCase().indexOf(q) !== -1) {
            results.push({ id: parseInt(id), name: registry[id] });
        }
        if (results.length >= 8) break;
    }
    for (const bmId in BM262_TALKGROUPS) {
        if (results.some(function (r) { return r.id === parseInt(bmId); })) continue;
        if (isNum ? bmId.indexOf(query) === 0 : BM262_TALKGROUPS[bmId].toLowerCase().indexOf(q) !== -1) {
            results.push({ id: parseInt(bmId), name: BM262_TALKGROUPS[bmId] });
        }
        if (results.length >= 8) break;
    }
    return results;
}
