/** Determine selected band filter from checkbox states. */
export function getSelectedBand(has2m: boolean, has70cm: boolean): string {
    if (has2m && has70cm) return "all";
    if (has2m) return "2m";
    if (has70cm) return "70cm";
    return "all";
}

/** Determine selected network filter from checkbox states. */
export function getSelectedNetworks(bm: boolean, dmrplus: boolean, tgif: boolean, other: boolean): string {
    const nets: string[] = [];
    if (bm) nets.push("BM");
    if (dmrplus) nets.push("DMR+");
    if (tgif) nets.push("TGIF");
    if (other) nets.push("Other");
    if (nets.length === 4) return "all";
    if (nets.length === 0) return "none";
    return nets.join(",");
}
