import type { Repeater, CpsTalkgroup } from "./types";
import { escapeXml, formatFreq } from "./format";

export const CPS_CSV_HEADER = "ContactName,Delete_Contact,Rename_Contact,Comments," +
    "Delete_FiveToneCalls,FiveToneCalls-S5CLDLL_5TTELEGRAM,FiveToneCalls-S5CLDLL_5TCALLADD," +
    "Delete_MDCCalls,MDCCalls-AU_CALLLSTID,MDCCalls-AU_MDCSYS,MDCCalls-AU_RVRTPERS_Zone,MDCCalls-AU_RVRTPERS,MDCCalls-AU_SPTPLDPL,MDCCalls-AU_CALLTYPE," +
    "Delete_QuikCallIICalls,QuikCallIICalls-QU_QCIISYS,QuikCallIICalls-QU_RVRTPERS_Zone,QuikCallIICalls-QU_RVRTPERS,QuikCallIICalls-QU_CALLFORMAT,QuikCallIICalls-QU_TONEATXFRE,QuikCallIICalls-QU_CODEA,QuikCallIICalls-QU_TONEBTXFRE,QuikCallIICalls-QU_CODEB,QuikCallIICalls-QU_STRIPPLDPL," +
    "Delete_DigitalCalls,DigitalCalls-DU_CALLLSTID,DigitalCalls-DU_ROUTETYPE,DigitalCalls-DU_CALLPRCDTNEN,DigitalCalls-DU_RINGTYPE,DigitalCalls-DU_TXTMSGALTTNTP,DigitalCalls-DU_CALLTYPE,DigitalCalls-DU_OVCMCALL," +
    "Delete_CapacityPlusCalls,CapacityPlusCalls-CAPPLUSUCL_CALLLSTID,CapacityPlusCalls-CAPPLUSUCL_ROUTETYPE,CapacityPlusCalls-CAPPLUSUCL_CALLPRCDTNEN,CapacityPlusCalls-CAPPLUSUCL_RINGTYPE,CapacityPlusCalls-CAPPLUSUCL_TXTMSGALTTNTP,CapacityPlusCalls-CAPPLUSUCL_CALLTYPE," +
    "Delete_PhoneCalls,PhoneCalls-PHNUCLELL_CALLID,PhoneCalls-PHNUCLELL_RINGTYPE";

export interface CpsLocaleStrings {
    header2: string;
    routeType: string;
    ringType: string;
    txtMsgAlertType: string;
    callType: string;
}

export const CPS_LOCALE: Record<string, CpsLocaleStrings> = {
    de: {
        header2: "Kontaktname,Delete_Contact,Rename_Contact,Kommentare," +
            "Delete_FiveToneCalls,F\u00fcnf-Ton-Rufe - Telegramm,F\u00fcnf-Ton-Rufe - Adresse," +
            "Delete_MDCCalls,MDC-Rufe - Ruf-ID (Hex),MDC-Rufe - MDC-System,MDC-Rufe - Revert-Kanalzone,MDC-Rufe - Quittungskanal,MDC-Rufe - TPL/DPL ausschlie\u00dfen,MDC-Rufe - Rufart," +
            "Delete_QuikCallIICalls,Quik Call II-Rufe - Quik-Call II-System,Quik Call II-Rufe - Revert-Kanalzone,Quik Call II-Rufe - Quittungskanal,Quik Call II-Rufe - Rufformat,Quik Call II-Rufe - Freq. Ton A (Hz),Quik Call II-Rufe - Code Ton A,Quik Call II-Rufe - Freq. Ton B (Hz),Quik Call II-Rufe - Code Ton B,Quik Call II-Rufe - TPL/DPL ausschlie\u00dfen," +
            "Delete_DigitalCalls,Digitale Rufe - Ruf-ID,Digitale Rufe - Routentyp,Digitale Rufe - Rufempfangston,Digitale Rufe - Ruftonart,Digitale Rufe - Hinweiston Textnachricht,Digitale Rufe - Rufart,Digitale Rufe - DU_OVCMCALL," +
            "Delete_CapacityPlusCalls,Capacity Plus-Rufe - Ruf-ID,Capacity Plus-Rufe - Routentyp,Capacity Plus-Rufe - Rufempfangston,Capacity Plus-Rufe - Ruftonart,Capacity Plus-Rufe - Hinweiston Textnachricht,Capacity Plus-Rufe - Rufart," +
            "Delete_PhoneCalls,Telefonanrufe - Nummer,Telefonanrufe - Klingelton",
        routeType: "Regul\u00e4r",
        ringType: "Keine Art",
        txtMsgAlertType: "Wiederholt",
        callType: "Gruppenruf"
    },
    en: {
        header2: "Contact Name,Delete_Contact,Rename_Contact,Comments," +
            "Delete_FiveToneCalls,Five Tone Calls - Telegram,Five Tone Calls - Address," +
            "Delete_MDCCalls,MDC Calls - Call ID (Hex),MDC Calls - MDC System,MDC Calls - Revert Channel Zone,MDC Calls - Revert Channel,MDC Calls - Strip TPL/DPL,MDC Calls - Call Type," +
            "Delete_QuikCallIICalls,Quik Call II Calls - Quik Call II System,Quik Call II Calls - Revert Channel Zone,Quik Call II Calls - Revert Channel,Quik Call II Calls - Call Format,Quik Call II Calls - Tone A TX Freq (Hz),Quik Call II Calls - Code A,Quik Call II Calls - Tone B TX Freq (Hz),Quik Call II Calls - Code B,Quik Call II Calls - Strip TPL/DPL," +
            "Delete_DigitalCalls,Digital Calls - Call ID,Digital Calls - Route Type,Digital Calls - Call Receive Tone,Digital Calls - Ring Style,Digital Calls - Text Message Alert Tone,Digital Calls - Call Type,Digital Calls - DU_OVCMCALL," +
            "Delete_CapacityPlusCalls,Capacity Plus Calls - Call ID,Capacity Plus Calls - Route Type,Capacity Plus Calls - Call Receive Tone,Capacity Plus Calls - Ring Style,Capacity Plus Calls - Text Message Alert Tone,Capacity Plus Calls - Call Type," +
            "Delete_PhoneCalls,Phone Calls - Number,Phone Calls - Ring Tone",
        routeType: "Regular",
        ringType: "No Style",
        txtMsgAlertType: "Repetitive",
        callType: "Group Call"
    }
};

/** Build a single Motorola CPS XML channel personality. */
export function buildChannel(alias: string, slot: string, colorCode: number, txFreq: string, rxFreq: string): string {
    const slotName = slot === "SLOT1" ? "1" : "2";
    return '    <set name="ConventionalPersonality" alias="' + escapeXml(alias) + '" key="DGTLCONV6PT25">\n' +
        '      <field name="CP_PERSTYPE" Name="Digital">DGTLCONV6PT25</field>\n' +
        '      <field name="CP_CNVPERSALIAS">' + escapeXml(alias) + '</field>\n' +
        '      <field name="CP_SLTASSGMNT" Name="' + slotName + '">' + slot + '</field>\n' +
        '      <field name="CP_COLORCODE">' + colorCode + '</field>\n' +
        '      <field name="CP_TXFREQ">' + rxFreq + '</field>\n' +
        '      <field name="CP_RXFREQ">' + txFreq + '</field>\n' +
        '      <field name="CP_TXINHXPLEN" Name="Color Code Free">MTCHCLRCD</field>\n' +
        '      <field name="CP_TOT">180</field>\n' +
        '    </set>\n';
}

/** Generate a complete Motorola CPS zone XML document. */
export function generateCpsXml(repeaters: Repeater[], talkgroups: CpsTalkgroup[]): string {
    let channels = "";
    repeaters.forEach(function (r) {
        const txFreq = formatFreq(r.freq_tx);
        const rxFreq = formatFreq(r.freq_rx);
        const cc = r.color_code;
        talkgroups.forEach(function (tg) {
            const slot = tg.slot === "1" ? "SLOT1" : "SLOT2";
            const alias = tg.name.substring(0, 16);
            channels += buildChannel(alias, slot, cc, txFreq, rxFreq);
        });
    });
    return '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n' +
        "<config>\n" +
        '  <collection name="ZoneItems">\n' +
        channels +
        "  </collection>\n" +
        "</config>\n";
}

/** Generate a Motorola CPS contacts CSV with locale-aware headers. */
export function generateContactsCsv(talkgroups: CpsTalkgroup[], lang: string): string {
    const locale = CPS_LOCALE[lang] || CPS_LOCALE["de"];
    const rows = [CPS_CSV_HEADER, locale.header2];
    talkgroups.forEach(function (tg) {
        const name = (tg.name || "TG" + tg.id).trim().substring(0, 16);
        const row = name + ",False,,," +
            "False,,," +
            "False,,,,,,," +
            "False,,,,,,,,,," +
            "False," + tg.id + "," + locale.routeType + ",False," + locale.ringType + "," + locale.txtMsgAlertType + "," + locale.callType + ",False," +
            "False,,,,,,," +
            "False,,";
        rows.push(row);
    });
    return rows.join("\r\n");
}
