import type { Repeater, TranslateFunction } from "./types";
import { escapeHtml } from "./format";

/** Build the HTML popup content for a repeater marker. */
export function buildPopup(r: Repeater, t: TranslateFunction): string {
    const bandClass = r.band === "2m" ? "band-2m" : "band-70cm";
    let html = '<div class="rptr-popup">';
    html += '<h3><a href="https://brandmeister.network/?page=repeater&id=' + r.id + '" target="_blank" rel="noopener">' + escapeHtml(r.callsign) + '</a> <span class="band-tag ' + bandClass + '">' + escapeHtml(r.band) + "</span></h3>";
    html += "<table>";
    html += "<tr><td>" + t("popup_tx") + "</td><td>" + r.freq_tx.toFixed(4) + " MHz</td></tr>";
    if (r.freq_rx)
        html += "<tr><td>" + t("popup_rx") + "</td><td>" + r.freq_rx.toFixed(4) + " MHz</td></tr>";
    if (r.freq_offset)
        html +=
            "<tr><td>" + t("popup_offset") + "</td><td>" +
            escapeHtml(r.freq_offset) +
            " MHz</td></tr>";
    html += "<tr><td>" + t("popup_cc") + "</td><td>" + r.color_code + "</td></tr>";
    let loc = escapeHtml(r.city);
    if (r.state) loc += ", " + escapeHtml(r.state);
    if (r.country) loc += ", " + escapeHtml(r.country);
    html += "<tr><td>" + t("popup_location") + "</td><td>" + loc + "</td></tr>";
    if (r.networks && r.networks.length)
        html +=
            "<tr><td>" + t("popup_network") + "</td><td>" +
            r.networks.map(escapeHtml).join(", ") +
            "</td></tr>";
    if (r.trustee)
        html +=
            "<tr><td>" + t("popup_trustee") + "</td><td>" +
            escapeHtml(r.trustee) +
            "</td></tr>";
    if (r.ts_linked)
        html +=
            "<tr><td>" + t("popup_timeslots") + "</td><td>" +
            escapeHtml(r.ts_linked) +
            "</td></tr>";
    html +=
        "<tr><td>" + t("popup_status") + "</td><td>" +
        escapeHtml(r.status) +
        "</td></tr>";
    if (r.bm_status_text)
        html += "<tr><td>" + t("popup_bm_status") + "</td><td>" + escapeHtml(r.bm_status_text) + "</td></tr>";
    if (r.last_seen)
        html += "<tr><td>" + t("popup_last_seen") + "</td><td>" + escapeHtml(r.last_seen.replace("T", " ").substring(0, 19)) + "</td></tr>";
    if (r.hardware)
        html += "<tr><td>" + t("popup_hardware") + "</td><td>" + escapeHtml(r.hardware) + "</td></tr>";
    if (r.pep)
        html += "<tr><td>" + t("popup_power") + "</td><td>" + r.pep + " W</td></tr>";
    if (r.agl)
        html += "<tr><td>" + t("popup_antenna") + "</td><td>" + r.agl + " m AGL</td></tr>";
    if (r.inactive)
        html += '<tr><td></td><td style="color:#ef5350;font-weight:600">' + t("popup_inactive") + '</td></tr>';
    html += "</table></div>";
    return html;
}
