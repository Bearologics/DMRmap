import type { Repeater, CpsTalkgroup } from "./types";
import { formatFreq } from "./format";

export const ANYTONE_CH_HEADER = "No.,Channel Name,Receive Frequency,Transmit Frequency," +
    "Channel Type,Transmit Power,Band Width,CTCSS/DCS Decode,CTCSS/DCS Encode," +
    "Contact,Contact Call Type,Contact TG/DMR ID,Radio ID," +
    "Busy Lock/TX Permit,Squelch Mode,Optional Signal,DTMF ID,2Tone ID,5Tone ID,PTT ID," +
    "Color Code,Slot,Scan List,Receive Group List,PTT Prohibit,Reverse," +
    "Simplex TDMA,Slot Suit,AES Digital Encryption,Digital Encryption," +
    "Call Confirmation,Talk Around(Simplex),Work Alone,Custom CTCSS," +
    "2TONE Decode,Ranging,Through Mode,APRS RX,Analog APRS PTT Mode," +
    "Digital APRS PTT Mode,APRS Report Type,Digital APRS Report Channel," +
    "Correct Frequency[Hz],SMS Confirmation,Exclude channel from roaming," +
    "DMR MODE,DataACK Disable,R5toneBot,R5ToneEot,Auto Scan," +
    "Ana APRS TX Path,APRS TX Tone,APRS Signal Path,Digi APRS TX CH,Alert Tone";

/** Generate an Anytone CPS talkgroups CSV. */
export function generateAnytoneContactsCsv(talkgroups: CpsTalkgroup[]): string {
    const rows = ["No.,Radio ID,Name,Call Type,Call Alert"];
    talkgroups.forEach(function (tg, idx) {
        const name = (tg.name || "TG" + tg.id).trim().substring(0, 16);
        rows.push((idx + 1) + "," + tg.id + "," + name + ",Group Call,None");
    });
    return rows.join("\r\n");
}

/** Generate an Anytone CPS channels CSV. */
export function generateAnytoneChannelsCsv(repeaters: Repeater[], talkgroups: CpsTalkgroup[]): string {
    const rows = [ANYTONE_CH_HEADER];
    let num = 0;
    repeaters.forEach(function (r) {
        const rxFreq = formatFreq(r.freq_tx);
        const txFreq = formatFreq(r.freq_rx);
        const cc = r.color_code || 1;
        talkgroups.forEach(function (tg) {
            num++;
            const chName = (r.callsign + " " + tg.name).substring(0, 16);
            const contactName = (tg.name || "TG" + tg.id).trim().substring(0, 16);
            rows.push(
                num + "," + chName + "," + rxFreq + "," + txFreq + "," +
                "D-Digital,High,12.5K,Off,Off," +
                contactName + ",Group Call," + tg.id + ",1," +
                "Same Color Code,Carrier,Off,1,1,1,Off," +
                cc + "," + tg.slot + ",None,None,Off,Off," +
                "Off,Off,Normal Encryption,Off," +
                "Off,Off,Off,251.1," +
                "0,Off,Off,Off,Off," +
                "Off,Off,1," +
                "0,Off,0," +
                "0,0,0,0,Off," +
                "Off,Off,Off,1,Off"
            );
        });
    });
    return rows.join("\r\n");
}
