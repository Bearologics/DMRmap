(function () {
    "use strict";

    // === Map Setup ===
    var map = L.map("map").setView([52.37, 9.73], 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // === State ===
    var heatmapGlowLayer = L.layerGroup().addTo(map);
    var markerLayer = L.layerGroup().addTo(map);
    var routeLayer = null;
    var corridorLayer = null;
    var routePoints = null; // stored [lat, lng] pairs for re-fetching on band change
    var isRouteMode = false;
    var isPinMode = false;
    var isSearchMode = false;
    var pinMarker = null;
    var pinCircle = null;
    var pinLatLng = null;
    var debounceTimer = null;
    var controller = null;
    var heatmapSocket = null;
    var heatmapCounts = {};
    var heatmapMarkerMap = {};
    var heatmapGlowMarkers = {};
    var heatmapMaxCount = 1;
    var heatmapDecayTimer = null;

    // === DOM ===
    var band2m = document.getElementById("band-2m");
    var band70cm = document.getElementById("band-70cm");
    var netBm = document.getElementById("net-bm");
    var netDmrplus = document.getElementById("net-dmrplus");
    var netTgif = document.getElementById("net-tgif");
    var netOther = document.getElementById("net-other");
    var showHotspots = document.getElementById("show-hotspots");
    var showInactive = document.getElementById("show-inactive");
    var showHeatmap = document.getElementById("show-heatmap");
    var countEl = document.getElementById("count");
    var fromInput = document.getElementById("route-from");
    var toInput = document.getElementById("route-to");
    var routeBtn = document.getElementById("route-btn");
    var clearBtn = document.getElementById("clear-btn");
    var corridorRow = document.getElementById("corridor-row");
    var corridorRange = document.getElementById("corridor-range");
    var corridorVal = document.getElementById("corridor-val");
    var pinControlsEl = document.getElementById("pin-controls");
    var pinRadiusInput = document.getElementById("pin-radius");
    var pinRadiusVal = document.getElementById("pin-radius-val");
    var pinClearBtn = document.getElementById("pin-clear");
    var pinListEl = document.getElementById("pin-list");
    var routeListEl = document.getElementById("route-list");
    var searchInput = document.getElementById("search-input");
    var searchListEl = document.getElementById("search-list");
    var searchClearBtn = document.getElementById("search-clear");

    clearBtn.style.display = "none";

    // === CPS Studio DOM + State ===
    var cpsModal = document.getElementById("cps-modal");
    var cpsModalClose = document.getElementById("cps-modal-close");
    var cpsTgTbody = document.getElementById("cps-tg-tbody");
    var cpsRepeaterTags = document.getElementById("cps-repeater-tags");
    var cpsAddTgInput = document.getElementById("cps-add-tg-input");
    var cpsAcList = document.getElementById("cps-ac-list");
    var cpsDownloadBtn = document.getElementById("cps-download-btn");
    var cpsCopyBtn = document.getElementById("cps-copy-btn");
    var cpsChannelCount = document.getElementById("cps-channel-count");

    var cpsRepeaters = [];
    var cpsActiveRepeaters = {};
    var cpsTalkgroups = [];
    var tgRegistry = null;
    var tgRegistryPromise = null;

    // === Autocomplete ===
    function setupAutocomplete(input, listEl) {
        var acTimer = null;
        var acController = null;
        var activeIdx = -1;

        function closeList() {
            listEl.classList.remove("open");
            listEl.innerHTML = "";
            activeIdx = -1;
        }

        function selectItem(displayName) {
            input.value = displayName;
            closeList();
        }

        function updateActive() {
            var items = listEl.querySelectorAll("li");
            items.forEach(function (li, i) {
                li.classList.toggle("active", i === activeIdx);
            });
            if (activeIdx >= 0 && items[activeIdx]) {
                items[activeIdx].scrollIntoView({ block: "nearest" });
            }
        }

        input.addEventListener("input", function () {
            clearTimeout(acTimer);
            if (acController) acController.abort();
            var q = input.value.trim();
            if (q.length < 3) {
                closeList();
                return;
            }
            acTimer = setTimeout(function () {
                acController = new AbortController();
                listEl.innerHTML = '<li class="ac-loading"><span class="spinner"></span>' + t("searching") + '</li>';
                listEl.classList.add("open");
                fetch(
                    "https://nominatim.openstreetmap.org/search?" +
                        new URLSearchParams({
                            q: q,
                            format: "json",
                            limit: "5",
                            addressdetails: "0",
                            "accept-language": getLocale(),
                        }),
                    { signal: acController.signal }
                )
                    .then(function (r) { return r.json(); })
                    .then(function (results) {
                        listEl.innerHTML = "";
                        activeIdx = -1;
                        if (!results.length) {
                            closeList();
                            return;
                        }
                        results.forEach(function (item) {
                            var li = document.createElement("li");
                            var parts = item.display_name.split(", ");
                            var main = parts.slice(0, 2).join(", ");
                            var sub = parts.slice(2).join(", ");
                            li.innerHTML =
                                '<span class="ac-main">' + escapeHtml(main) + "</span>" +
                                (sub ? '<br><span class="ac-sub">' + escapeHtml(sub) + "</span>" : "");
                            li.addEventListener("mousedown", function (e) {
                                e.preventDefault();
                                selectItem(item.display_name);
                            });
                            listEl.appendChild(li);
                        });
                        listEl.classList.add("open");
                    })
                    .catch(function (err) {
                        if (err.name !== "AbortError") closeList();
                    });
            }, 300);
        });

        input.addEventListener("keydown", function (e) {
            if (!listEl.classList.contains("open")) return;
            var items = listEl.querySelectorAll("li");
            if (e.key === "ArrowDown") {
                e.preventDefault();
                activeIdx = Math.min(activeIdx + 1, items.length - 1);
                updateActive();
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                activeIdx = Math.max(activeIdx - 1, 0);
                updateActive();
            } else if (e.key === "Enter" && activeIdx >= 0) {
                e.preventDefault();
                e.stopPropagation();
                var parts = items[activeIdx].querySelector(".ac-main").textContent;
                var sub = items[activeIdx].querySelector(".ac-sub");
                selectItem(parts + (sub ? ", " + sub.textContent : ""));
            } else if (e.key === "Escape") {
                closeList();
            }
        });

        input.addEventListener("blur", function () {
            setTimeout(closeList, 150);
        });
    }

    setupAutocomplete(fromInput, document.getElementById("ac-from"));
    setupAutocomplete(toInput, document.getElementById("ac-to"));

    // === Coordinates display ===
    var coordsEl = document.getElementById("coords");

    function toMaidenhead(lat, lng) {
        lng = lng + 180;
        lat = lat + 90;
        var loc = "";
        loc += String.fromCharCode(65 + Math.floor(lng / 20));
        loc += String.fromCharCode(65 + Math.floor(lat / 10));
        lng = (lng % 20);
        lat = (lat % 10);
        loc += Math.floor(lng / 2);
        loc += Math.floor(lat);
        lng = (lng % 2) * 60;
        lat = (lat % 1) * 60;
        loc += String.fromCharCode(97 + Math.floor(lng / 5));
        loc += String.fromCharCode(97 + Math.floor(lat / 2.5));
        return loc;
    }

    map.on("mousemove", function (e) {
        var lat = e.latlng.lat;
        var lng = e.latlng.lng;
        var grid = toMaidenhead(lat, lng);
        coordsEl.innerHTML =
            lat.toFixed(5) + ", " + lng.toFixed(5) +
            ' <span class="maidenhead">' + grid + "</span>";
    });

    map.on("mouseout", function () {
        coordsEl.innerHTML = "";
    });

    // === Utilities ===
    function getSelectedBand() {
        var has2m = band2m.checked;
        var has70cm = band70cm.checked;
        if (has2m && has70cm) return "all";
        if (has2m) return "2m";
        if (has70cm) return "70cm";
        return "all";
    }

    function getSelectedNetworks() {
        var nets = [];
        if (netBm.checked) nets.push("BM");
        if (netDmrplus.checked) nets.push("DMR+");
        if (netTgif.checked) nets.push("TGIF");
        if (netOther.checked) nets.push("Other");
        if (nets.length === 4) return "all";
        if (nets.length === 0) return "none";
        return nets.join(",");
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // Fallback TG names from wiki.bm262.de for German-speaking region
    var BM262_TALKGROUPS = {
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
        "263852": "DARC Dachau - C06 Runde", "264022": "Whitesticker"
    };

    function tgName(id) {
        var key = String(id);
        if (tgRegistry && tgRegistry[key]) return tgRegistry[key];
        if (BM262_TALKGROUPS[key]) return BM262_TALKGROUPS[key];
        return "";
    }

    function escapeXml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    function buildChannel(alias, slot, colorCode, txHz, rxHz) {
        var slotName = slot === "SLOT1" ? "1" : "2";
        return '        <set name="ConventionalPersonality" alias="' + escapeXml(alias) + '" key="DGTLCONV6PT25">\n' +
            '          <field name="CP_PERSTYPE" Name="Digital">DGTLCONV6PT25</field>\n' +
            '          <field name="CP_CNVPERSALIAS">' + escapeXml(alias) + '</field>\n' +
            '          <field name="CP_SLTASSGMNT" Name="' + slotName + '">' + slot + '</field>\n' +
            '          <field name="CP_COLORCODE">' + colorCode + '</field>\n' +
            '          <field name="CP_TXFREQ">' + txHz + '</field>\n' +
            '          <field name="CP_RXFREQ">' + rxHz + '</field>\n' +
            '          <field name="CP_TXINHXPLEN" Name="Color Code Free">MTCHCLRCD</field>\n' +
            '          <field name="CP_TOT">180</field>\n' +
            '        </set>\n';
    }

    function generateCpsXml(repeaters, talkgroups) {
        var channels = "";
        repeaters.forEach(function (r) {
            var txHz = Math.round(r.freq_tx * 1000000);
            var rxHz = Math.round(r.freq_rx * 1000000);
            var cc = r.color_code;
            talkgroups.forEach(function (tg) {
                var slot = tg.slot === "1" ? "SLOT1" : "SLOT2";
                var alias = (r.callsign + " TG" + tg.id).substring(0, 16);
                channels += buildChannel(alias, slot, cc, txHz, rxHz);
            });
        });
        return '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n' +
            "<config>\n" +
            '  <category name="Zone">\n' +
            '    <set name="Zone" alias="DMRmap">\n' +
            '      <field name="ZP_ZONEALIAS">DMRmap</field>\n' +
            '      <field name="ZP_ZONETYPE" Name="Normal">NORMAL</field>\n' +
            '      <collection name="ZoneItems">\n' +
            channels +
            "      </collection>\n" +
            "    </set>\n" +
            "  </category>\n" +
            "</config>";
    }

    // === BrandMeister API ===
    function fetchTgRegistry() {
        if (tgRegistry) return Promise.resolve(tgRegistry);
        if (tgRegistryPromise) return tgRegistryPromise;
        tgRegistryPromise = fetch("/talkgroups.json")
            .then(function (r) { return r.json(); })
            .then(function (data) { tgRegistry = data; return data; })
            .catch(function () { tgRegistryPromise = null; return {}; });
        return tgRegistryPromise;
    }

    // === CPS Studio Modal ===
    function openCpsModal(repeaters) {
        cpsRepeaters = repeaters;
        cpsActiveRepeaters = {};
        repeaters.forEach(function (r) { cpsActiveRepeaters[r.id] = true; });
        cpsTalkgroups = [];
        cpsModal.style.display = "flex";
        document.body.style.overflow = "hidden";
        cpsTgTbody.innerHTML = "";
        renderRepeaterTags();
        renderTgTable();
        updateChannelCount();
        updateCpsButtons();
        translateDOM();
    }

    function renderRepeaterTags() {
        cpsRepeaterTags.innerHTML = "";
        cpsRepeaters.forEach(function (r) {
            var tag = document.createElement("button");
            tag.type = "button";
            tag.className = "cps-rptr-tag" + (cpsActiveRepeaters[r.id] ? " active" : "");
            tag.textContent = r.callsign;
            tag.addEventListener("click", function () {
                if (cpsActiveRepeaters[r.id]) {
                    delete cpsActiveRepeaters[r.id];
                } else {
                    cpsActiveRepeaters[r.id] = true;
                }
                tag.classList.toggle("active");
                updateChannelCount();
                updateCpsButtons();
            });
            cpsRepeaterTags.appendChild(tag);
        });
    }

    function getActiveRepeaters() {
        return cpsRepeaters.filter(function (r) { return cpsActiveRepeaters[r.id]; });
    }

    function updateCpsButtons() {
        var hasData = getActiveRepeaters().length > 0 && cpsTalkgroups.length > 0;
        cpsDownloadBtn.disabled = !hasData;
        cpsCopyBtn.disabled = !hasData;
    }

    function closeCpsModal() {
        cpsModal.style.display = "none";
        document.body.style.overflow = "";
        cpsAddTgInput.value = "";
        cpsAcList.innerHTML = "";
    }

    function renderTgTable() {
        cpsTgTbody.innerHTML = "";
        cpsTalkgroups.forEach(function (tg, idx) {
            var tr = document.createElement("tr");

            var tdId = document.createElement("td");
            tdId.className = "tg-id";
            tdId.textContent = tg.id;
            tr.appendChild(tdId);

            var tdName = document.createElement("td");
            tdName.className = "tg-name";
            tdName.textContent = tg.name || t("cps_unknown_tg");
            tr.appendChild(tdName);

            var tdSlot = document.createElement("td");
            var toggle = document.createElement("div");
            toggle.className = "ts-toggle";
            var btn1 = document.createElement("button");
            btn1.type = "button";
            btn1.textContent = "TS1";
            if (tg.slot === "1") btn1.className = "active";
            var btn2 = document.createElement("button");
            btn2.type = "button";
            btn2.textContent = "TS2";
            if (tg.slot === "2") btn2.className = "active";
            btn1.addEventListener("click", (function (i) {
                return function () { cpsTalkgroups[i].slot = "1"; renderTgTable(); updateChannelCount(); };
            })(idx));
            btn2.addEventListener("click", (function (i) {
                return function () { cpsTalkgroups[i].slot = "2"; renderTgTable(); updateChannelCount(); };
            })(idx));
            toggle.appendChild(btn1);
            toggle.appendChild(btn2);
            tdSlot.appendChild(toggle);
            tr.appendChild(tdSlot);

            var tdRemove = document.createElement("td");
            var removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "tg-remove-btn";
            removeBtn.innerHTML = "&times;";
            removeBtn.addEventListener("click", (function (i) {
                return function () { cpsTalkgroups.splice(i, 1); renderTgTable(); updateChannelCount(); updateCpsButtons(); };
            })(idx));
            tdRemove.appendChild(removeBtn);
            tr.appendChild(tdRemove);

            cpsTgTbody.appendChild(tr);
        });
    }

    function updateChannelCount() {
        var active = getActiveRepeaters().length;
        var total = active * cpsTalkgroups.length;
        cpsChannelCount.textContent = t("cps_channel_count", {
            repeaters: active,
            tgs: cpsTalkgroups.length,
            channels: total
        });
    }

    function addTalkgroupById(tgId) {
        if (cpsTalkgroups.some(function (tg) { return tg.id === tgId; })) return;
        cpsTalkgroups.push({ id: tgId, name: tgName(tgId), slot: "2" });
        cpsTalkgroups.sort(function (a, b) { return a.id - b.id; });
        renderTgTable();
        updateChannelCount();
        updateCpsButtons();
    }

    function downloadCpsXml() {
        var active = getActiveRepeaters();
        if (!cpsTalkgroups.length || !active.length) return;
        var xml = generateCpsXml(active, cpsTalkgroups);
        var blob = new Blob([xml], { type: "application/xml" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "dmrmap-cps.xml";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function copyCpsXml() {
        var active = getActiveRepeaters();
        if (!cpsTalkgroups.length || !active.length) return;
        var xml = generateCpsXml(active, cpsTalkgroups);
        var origText = cpsCopyBtn.textContent;
        navigator.clipboard.writeText(xml).then(function () {
            cpsCopyBtn.textContent = t("cps_copied");
            setTimeout(function () { cpsCopyBtn.textContent = origText; }, 2000);
        }).catch(function () {
            var ta = document.createElement("textarea");
            ta.value = xml;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            cpsCopyBtn.textContent = t("cps_copied");
            setTimeout(function () { cpsCopyBtn.textContent = origText; }, 2000);
        });
    }

    function showCount(count) {
        countEl.textContent = t("repeater_count", { count: count });
    }

    function showStatus(msg) {
        countEl.textContent = msg;
    }

    // === Popup ===
    function buildPopup(r) {
        var bandClass = r.band === "2m" ? "band-2m" : "band-70cm";
        var html = '<div class="rptr-popup">';
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
        var loc = escapeHtml(r.city);
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

    // === Display markers ===
    function displayRepeaters(repeaters) {
        markerLayer.clearLayers();
        heatmapMarkerMap = {};
        heatmapGlowLayer.clearLayers();
        heatmapGlowMarkers = {};
        repeaters.forEach(function (r) {
            var color = r.band === "2m" ? "#2196F3" : "#D32F2F";
            var marker = L.circleMarker([r.lat, r.lng], {
                radius: 6,
                fillColor: color,
                color: "#fff",
                weight: 1,
                fillOpacity: r.inactive ? 0.35 : 0.85,
            });
            marker.bindPopup(buildPopup(r), { maxWidth: 280 });
            markerLayer.addLayer(marker);
            heatmapMarkerMap[r.id] = marker;
            if (showHeatmap.checked && heatmapCounts[r.id]) {
                applyHeatmapGlow(r.id, r.lat, r.lng);
            }
        });
    }

    // === Viewport mode ===
    function fetchRepeaters() {
        if (isRouteMode || isPinMode || isSearchMode) return;

        if (getSelectedNetworks() === "none") {
            markerLayer.clearLayers();
            showCount(0);
            return;
        }

        if (controller) controller.abort();
        controller = new AbortController();

        var bounds = map.getBounds();
        var params = new URLSearchParams({
            minLat: bounds.getSouth(),
            maxLat: bounds.getNorth(),
            minLng: bounds.getWest(),
            maxLng: bounds.getEast(),
            band: getSelectedBand(),
            network: getSelectedNetworks(),
            hotspots: showHotspots.checked ? "1" : "0",
            inactive: showInactive.checked ? "1" : "0",
        });

        fetch("/api/repeaters?" + params, { signal: controller.signal })
            .then(function (resp) {
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                return resp.json();
            })
            .then(function (data) {
                displayRepeaters(data.repeaters);
                console.log("Showing " + data.count + " repeaters");
                showCount(data.count);
            })
            .catch(function (err) {
                if (err.name === "AbortError") return;
                console.error("Fetch error:", err);
                showStatus(t("error"));
            });
    }

    // === Route mode ===
    function geocode(address) {
        return fetch(
            "https://nominatim.openstreetmap.org/search?" +
                new URLSearchParams({
                    q: address,
                    format: "json",
                    limit: "1",
                    "accept-language": getLocale(),
                })
        )
            .then(function (resp) {
                return resp.json();
            })
            .then(function (data) {
                if (!data.length) throw new Error("Not found: " + address);
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                };
            });
    }

    function getRoute(from, to) {
        return fetch(
            "https://router.project-osrm.org/route/v1/driving/" +
                from.lng + "," + from.lat + ";" +
                to.lng + "," + to.lat +
                "?overview=full&geometries=geojson"
        )
            .then(function (resp) {
                return resp.json();
            })
            .then(function (data) {
                if (!data.routes || !data.routes.length)
                    throw new Error("No route found");
                // coordinates are [lng, lat], convert to [lat, lng]
                return data.routes[0].geometry.coordinates.map(function (c) {
                    return [c[1], c[0]];
                });
            });
    }

    function fetchRouteRepeaters() {
        if (!routePoints) return;

        if (getSelectedNetworks() === "none") {
            markerLayer.clearLayers();
            routeListEl.innerHTML = "";
            showCount(0);
            return;
        }

        showStatus(t("loading"));
        return fetch("/api/repeaters/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                points: routePoints,
                band: getSelectedBand(),
                corridor: parseInt(corridorRange.value),
                network: getSelectedNetworks() === "all" ? [] : getSelectedNetworks().split(","),
                hotspots: showHotspots.checked,
                inactive: showInactive.checked,
            }),
        })
            .then(function (resp) {
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                return resp.json();
            })
            .then(function (data) {
                displayRepeaters(data.repeaters);
                renderRepeaterList(routeListEl, data.repeaters);
                routeListEl.style.display = "";
                console.log("Showing " + data.count + " repeaters along route");
                showCount(data.count);
            })
            .catch(function (err) {
                console.error("Route fetch error:", err);
                showStatus(t("error"));
            });
    }

    // === Corridor visualization ===
    function offsetPoint(lat, lng, bearing, distKm) {
        var R = 6371;
        var lat1 = lat * Math.PI / 180;
        var lng1 = lng * Math.PI / 180;
        var brng = bearing * Math.PI / 180;
        var d = distKm / R;
        var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
        var lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
            Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
        return [lat2 * 180 / Math.PI, lng2 * 180 / Math.PI];
    }

    function computeCorridorPolygon(points, distKm) {
        if (points.length < 2) return [];
        var left = [];
        var right = [];
        for (var i = 0; i < points.length; i++) {
            var bearing;
            if (i === 0) {
                bearing = getBearing(points[0], points[1]);
            } else if (i === points.length - 1) {
                bearing = getBearing(points[i - 1], points[i]);
            } else {
                var b1 = getBearing(points[i - 1], points[i]);
                var b2 = getBearing(points[i], points[i + 1]);
                bearing = averageBearing(b1, b2);
            }
            left.push(offsetPoint(points[i][0], points[i][1], bearing - 90, distKm));
            right.push(offsetPoint(points[i][0], points[i][1], bearing + 90, distKm));
        }
        // Form a closed polygon: left side forward, right side backward
        return left.concat(right.reverse());
    }

    function getBearing(p1, p2) {
        var lat1 = p1[0] * Math.PI / 180;
        var lat2 = p2[0] * Math.PI / 180;
        var dLng = (p2[1] - p1[1]) * Math.PI / 180;
        var y = Math.sin(dLng) * Math.cos(lat2);
        var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function averageBearing(b1, b2) {
        var r1 = b1 * Math.PI / 180;
        var r2 = b2 * Math.PI / 180;
        var x = Math.cos(r1) + Math.cos(r2);
        var y = Math.sin(r1) + Math.sin(r2);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function drawCorridor() {
        if (corridorLayer) {
            map.removeLayer(corridorLayer);
            corridorLayer = null;
        }
        if (!routePoints || routePoints.length < 2) return;
        var distKm = parseInt(corridorRange.value);
        var polygon = computeCorridorPolygon(routePoints, distKm);
        corridorLayer = L.polygon(polygon, {
            color: "#4CAF50",
            weight: 1,
            fillColor: "#4CAF50",
            fillOpacity: 0.1,
            opacity: 0.4,
            interactive: false,
        }).addTo(map);
    }

    function findRoute() {
        var fromAddr = fromInput.value.trim();
        var toAddr = toInput.value.trim();
        if (!fromAddr || !toAddr) return;

        if (isPinMode) clearPin();
        if (isSearchMode) clearSearch();
        routeBtn.disabled = true;
        routeBtn.innerHTML = '<span class="spinner"></span>' + t("routing");
        showStatus(t("geocoding"));

        geocode(fromAddr)
            .then(function (from) {
                return geocode(toAddr).then(function (to) {
                    return { from: from, to: to };
                });
            })
            .then(function (endpoints) {
                showStatus(t("routing"));
                return getRoute(endpoints.from, endpoints.to);
            })
            .then(function (latLngs) {
                // Draw route on map
                if (routeLayer) map.removeLayer(routeLayer);
                routeLayer = L.polyline(latLngs, {
                    color: "#4CAF50",
                    weight: 4,
                    opacity: 0.8,
                }).addTo(map);
                map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

                // Switch to route mode
                routePoints = latLngs;
                drawCorridor();
                isRouteMode = true;
                clearBtn.style.display = "";
                corridorRow.style.display = "";

                return fetchRouteRepeaters();
            })
            .catch(function (err) {
                console.error("Route error:", err);
                showStatus(err.message);
            })
            .then(function () {
                routeBtn.disabled = false;
                routeBtn.textContent = t("route_btn");
            });
    }

    function clearRoute() {
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }
        if (corridorLayer) {
            map.removeLayer(corridorLayer);
            corridorLayer = null;
        }
        routePoints = null;
        isRouteMode = false;
        clearBtn.style.display = "none";
        corridorRow.style.display = "none";
        routeListEl.style.display = "none";
        routeListEl.innerHTML = "";
        fromInput.value = "";
        toInput.value = "";
        updateRouteBtn();
        fetchRepeaters();
    }

    // === Pin mode ===
    function fetchPinRepeaters() {
        if (!pinLatLng) return;

        if (getSelectedNetworks() === "none") {
            markerLayer.clearLayers();
            pinListEl.innerHTML = "";
            showCount(0);
            return;
        }

        showStatus(t("loading"));
        var params = new URLSearchParams({
            lat: pinLatLng.lat,
            lng: pinLatLng.lng,
            radius: pinRadiusInput.value,
            band: getSelectedBand(),
            network: getSelectedNetworks(),
            hotspots: showHotspots.checked ? "1" : "0",
            inactive: showInactive.checked ? "1" : "0",
        });

        fetch("/api/repeaters/radius?" + params)
            .then(function (resp) {
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                return resp.json();
            })
            .then(function (data) {
                displayRepeaters(data.repeaters);
                showCount(data.count);
                renderPinList(data.repeaters);
            })
            .catch(function (err) {
                console.error("Pin fetch error:", err);
                showStatus(t("error"));
            });
    }

    function renderRepeaterList(container, repeaters) {
        container.innerHTML = "";
        if (repeaters.length > 0) {
            var cpsBtn = document.createElement("button");
            cpsBtn.className = "cps-copy-btn";
            cpsBtn.textContent = t("cps_studio_btn");
            cpsBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                openCpsModal(repeaters);
            });
            container.appendChild(cpsBtn);
        }
        repeaters.forEach(function (r) {
            var item = document.createElement("div");
            item.className = "pin-list-item";
            var bandColor = r.band === "2m" ? "#1976D2" : "#D32F2F";
            var detail;
            if (r.distance !== undefined && r.distance !== null) {
                detail = '<span class="dist">' + r.distance + " km</span>";
            } else {
                var loc = r.city || "";
                if (r.country) loc += (loc ? ", " : "") + r.country;
                detail = '<span class="dist">' + escapeHtml(loc) + "</span>";
            }
            item.innerHTML =
                '<a class="callsign" href="https://brandmeister.network/?page=repeater&id=' + r.id + '" target="_blank" rel="noopener">' + escapeHtml(r.callsign) + "</a>" +
                '<span class="freq" style="color:' + bandColor + '">' + r.freq_tx.toFixed(4) + "</span>" +
                detail;
            item.addEventListener("click", function (e) {
                if (e.target.closest("a")) return;
                map.setView([r.lat, r.lng], 14);
                markerLayer.eachLayer(function (layer) {
                    if (layer.getLatLng &&
                        layer.getLatLng().lat === r.lat &&
                        layer.getLatLng().lng === r.lng) {
                        layer.openPopup();
                    }
                });
            });
            container.appendChild(item);
        });
    }

    function renderPinList(repeaters) {
        renderRepeaterList(pinListEl, repeaters);
    }

    function placePin(latlng) {
        // Clear route mode if active
        if (isRouteMode) clearRoute();

        isPinMode = true;
        pinLatLng = latlng;

        if (pinMarker) map.removeLayer(pinMarker);
        if (pinCircle) map.removeLayer(pinCircle);

        pinMarker = L.marker(latlng).addTo(map);
        pinCircle = L.circle(latlng, {
            radius: pinRadiusInput.value * 1000,
            color: "#4CAF50",
            weight: 2,
            fillOpacity: 0.06,
        }).addTo(map);

        pinControlsEl.style.display = "";
        fetchPinRepeaters();
    }

    function clearPin() {
        if (pinMarker) { map.removeLayer(pinMarker); pinMarker = null; }
        if (pinCircle) { map.removeLayer(pinCircle); pinCircle = null; }
        pinLatLng = null;
        isPinMode = false;
        pinControlsEl.style.display = "none";
        pinListEl.innerHTML = "";
        fetchRepeaters();
    }

    // === Heatmap ===
    function heatColor(intensity) {
        var r, g;
        if (intensity < 0.5) {
            r = Math.round(255 * (intensity * 2));
            g = 255;
        } else {
            r = 255;
            g = Math.round(255 * (1 - (intensity - 0.5) * 2));
        }
        return "rgb(" + r + "," + g + ",0)";
    }

    function applyHeatmapGlow(repeaterId, lat, lng) {
        var count = heatmapCounts[repeaterId] || 0;
        if (count === 0) return;
        var intensity = Math.min(count / Math.max(heatmapMaxCount, 1), 1.0);
        var glowRadius = 8 + intensity * 16;
        var color = heatColor(intensity);
        if (heatmapGlowMarkers[repeaterId]) {
            heatmapGlowLayer.removeLayer(heatmapGlowMarkers[repeaterId]);
        }
        var glow = L.circleMarker([lat, lng], {
            radius: glowRadius,
            fillColor: color,
            color: color,
            weight: 2,
            fillOpacity: 0.25 + intensity * 0.2,
            opacity: 0.6 + intensity * 0.4,
            className: "heatmap-glow",
            interactive: false,
        });
        heatmapGlowLayer.addLayer(glow);
        heatmapGlowMarkers[repeaterId] = glow;
    }

    function clearHeatmapVisuals() {
        heatmapGlowLayer.clearLayers();
        heatmapGlowMarkers = {};
    }

    function refreshAllGlows() {
        clearHeatmapVisuals();
        for (var id in heatmapCounts) {
            if (heatmapMarkerMap[id]) {
                var latlng = heatmapMarkerMap[id].getLatLng();
                applyHeatmapGlow(parseInt(id), latlng.lat, latlng.lng);
            }
        }
    }

    function connectHeatmap() {
        if (heatmapSocket) return;
        heatmapSocket = io("https://api.brandmeister.network", {
            path: "/lh/socket.io",
            transports: ["websocket"],
        });
        heatmapSocket.on("connect", function () {
            console.log("Heatmap: connected to BrandMeister LH");
        });
        heatmapSocket.on("disconnect", function () {
            console.log("Heatmap: disconnected from BrandMeister LH");
        });
        heatmapSocket.on("mqtt", function (data) {
            try {
                var payload = typeof data.payload === "string"
                    ? JSON.parse(data.payload)
                    : data.payload;
                if (payload.Event !== "Session-Stop") return;
                var contextId = payload.ContextID;
                if (!contextId || !heatmapMarkerMap[contextId]) return;
                heatmapCounts[contextId] = (heatmapCounts[contextId] || 0) + 1;
                if (heatmapCounts[contextId] > heatmapMaxCount) {
                    heatmapMaxCount = heatmapCounts[contextId];
                    refreshAllGlows();
                } else {
                    var latlng = heatmapMarkerMap[contextId].getLatLng();
                    applyHeatmapGlow(contextId, latlng.lat, latlng.lng);
                }
            } catch (e) { /* ignore malformed payloads */ }
        });
        heatmapDecayTimer = setInterval(function () {
            var changed = false;
            for (var id in heatmapCounts) {
                heatmapCounts[id] = Math.floor(heatmapCounts[id] * 0.8);
                if (heatmapCounts[id] === 0) {
                    delete heatmapCounts[id];
                }
                changed = true;
            }
            if (changed) {
                heatmapMaxCount = 1;
                for (var id2 in heatmapCounts) {
                    if (heatmapCounts[id2] > heatmapMaxCount) {
                        heatmapMaxCount = heatmapCounts[id2];
                    }
                }
                refreshAllGlows();
            }
        }, 60000);
    }

    function disconnectHeatmap() {
        if (heatmapSocket) {
            heatmapSocket.disconnect();
            heatmapSocket = null;
        }
        if (heatmapDecayTimer) {
            clearInterval(heatmapDecayTimer);
            heatmapDecayTimer = null;
        }
        heatmapCounts = {};
        heatmapMaxCount = 1;
        clearHeatmapVisuals();
    }

    // === Events ===
    map.on("moveend", function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(fetchRepeaters, 150);
    });

    map.on("click", function (e) {
        if (isRouteMode || isSearchMode) return;
        placePin(e.latlng);
    });

    function refetchActive() {
        if (isSearchMode) doSearch();
        else if (isPinMode) fetchPinRepeaters();
        else if (isRouteMode) fetchRouteRepeaters();
        else fetchRepeaters();
    }

    band2m.addEventListener("change", refetchActive);
    band70cm.addEventListener("change", refetchActive);

    [netBm, netDmrplus, netTgif, netOther].forEach(function (cb) {
        cb.addEventListener("change", refetchActive);
    });

    showHotspots.addEventListener("change", refetchActive);
    showInactive.addEventListener("change", refetchActive);

    showHeatmap.addEventListener("change", function () {
        if (showHeatmap.checked) connectHeatmap();
        else disconnectHeatmap();
    });

    pinClearBtn.addEventListener("click", clearPin);

    pinRadiusInput.addEventListener("input", function () {
        pinRadiusVal.textContent = pinRadiusInput.value;
        if (pinCircle) pinCircle.setRadius(pinRadiusInput.value * 1000);
    });
    pinRadiusInput.addEventListener("change", function () {
        if (!pinLatLng) return;
        fetchPinRepeaters();
    });

    corridorRange.addEventListener("input", function () {
        corridorVal.textContent = corridorRange.value;
        if (isRouteMode) drawCorridor();
    });
    corridorRange.addEventListener("change", function () {
        if (isRouteMode) {
            drawCorridor();
            fetchRouteRepeaters();
        }
    });

    function updateRouteBtn() {
        routeBtn.disabled = !fromInput.value.trim() || !toInput.value.trim();
    }
    fromInput.addEventListener("input", updateRouteBtn);
    toInput.addEventListener("input", updateRouteBtn);

    routeBtn.addEventListener("click", findRoute);
    clearBtn.addEventListener("click", clearRoute);

    toInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") findRoute();
    });

    fromInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") toInput.focus();
    });

    // === Search ===
    var searchTimer = null;
    var searchController = null;

    function clearSearch() {
        isSearchMode = false;
        searchListEl.style.display = "none";
        searchListEl.innerHTML = "";
        searchInput.value = "";
        searchClearBtn.style.display = "none";
        if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    }

    function doSearch() {
        var q = searchInput.value.trim();
        if (q.length < 2) {
            if (isSearchMode) {
                clearSearch();
                fetchRepeaters();
            }
            return;
        }

        // Enter search mode: clear pin/route
        if (isPinMode) clearPin();
        if (isRouteMode) clearRoute();
        isSearchMode = true;
        searchClearBtn.style.display = "";
        history.replaceState(null, "", "#" + encodeURIComponent(q));

        if (searchController) searchController.abort();
        searchController = new AbortController();
        showStatus(t("searching"));

        fetch("/api/repeaters/search?q=" + encodeURIComponent(q), { signal: searchController.signal })
            .then(function (resp) {
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                return resp.json();
            })
            .then(function (data) {
                displayRepeaters(data.repeaters);
                showCount(data.count);
                if (data.total === 1 && data.repeaters.length === 1) {
                    var r = data.repeaters[0];
                    map.setView([r.lat, r.lng], 14);
                    setTimeout(function () {
                        markerLayer.eachLayer(function (layer) {
                            if (layer.getLatLng &&
                                layer.getLatLng().lat === r.lat &&
                                layer.getLatLng().lng === r.lng) {
                                layer.openPopup();
                            }
                        });
                    }, 600);
                }
                renderRepeaterList(searchListEl, data.repeaters);
                if (data.total > data.count) {
                    var msg = document.createElement("div");
                    msg.className = "search-more-msg";
                    msg.textContent = t("showing_results", { count: data.count, total: data.total });
                    searchListEl.appendChild(msg);
                }
                searchListEl.style.display = "";
            })
            .catch(function (err) {
                if (err.name === "AbortError") return;
                console.error("Search error:", err);
                showStatus(t("error"));
            });
    }

    searchInput.addEventListener("input", function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(doSearch, 300);
    });

    searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            if (isSearchMode) {
                clearSearch();
                fetchRepeaters();
            }
            searchInput.blur();
        }
    });

    searchClearBtn.addEventListener("click", function () {
        clearSearch();
        fetchRepeaters();
    });

    // === CPS Studio Events ===
    cpsModalClose.addEventListener("click", closeCpsModal);
    document.querySelector(".cps-modal-backdrop").addEventListener("click", closeCpsModal);
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && cpsModal.style.display !== "none") {
            if (cpsAcList.children.length) {
                cpsAcList.innerHTML = "";
                cpsAcIdx = -1;
            } else {
                closeCpsModal();
            }
        }
    });
    cpsDownloadBtn.addEventListener("click", downloadCpsXml);
    cpsCopyBtn.addEventListener("click", copyCpsXml);

    // TG autocomplete
    var cpsAcIdx = -1;
    var cpsAcTimer = null;

    function searchTalkgroups(query) {
        if (!tgRegistry) return [];
        var q = query.toLowerCase();
        var isNum = /^\d+$/.test(query);
        var results = [];
        for (var id in tgRegistry) {
            if (isNum ? id.indexOf(query) === 0 : tgRegistry[id].toLowerCase().indexOf(q) !== -1) {
                results.push({ id: parseInt(id), name: tgRegistry[id] });
            }
            if (results.length >= 8) break;
        }
        // also search BM262 fallback
        for (var bmId in BM262_TALKGROUPS) {
            if (results.some(function (r) { return r.id === parseInt(bmId); })) continue;
            if (isNum ? bmId.indexOf(query) === 0 : BM262_TALKGROUPS[bmId].toLowerCase().indexOf(q) !== -1) {
                results.push({ id: parseInt(bmId), name: BM262_TALKGROUPS[bmId] });
            }
            if (results.length >= 8) break;
        }
        return results;
    }

    function renderCpsAc(results) {
        cpsAcList.innerHTML = "";
        cpsAcIdx = -1;
        results.forEach(function (r) {
            var li = document.createElement("li");
            li.textContent = r.id + " — " + (r.name || t("cps_unknown_tg"));
            if (cpsTalkgroups.some(function (tg) { return tg.id === r.id; })) {
                li.className = "ac-disabled";
            } else {
                li.addEventListener("click", function () {
                    addTalkgroupById(r.id);
                    cpsAddTgInput.value = "";
                    cpsAcList.innerHTML = "";
                    cpsAcIdx = -1;
                    cpsAddTgInput.focus();
                });
            }
            cpsAcList.appendChild(li);
        });
    }

    cpsAddTgInput.addEventListener("input", function () {
        clearTimeout(cpsAcTimer);
        var val = cpsAddTgInput.value.trim();
        if (!val) { cpsAcList.innerHTML = ""; cpsAcIdx = -1; return; }
        cpsAcTimer = setTimeout(function () {
            renderCpsAc(searchTalkgroups(val));
        }, 120);
    });

    cpsAddTgInput.addEventListener("keydown", function (e) {
        var items = cpsAcList.querySelectorAll("li:not(.ac-disabled)");
        if (e.key === "ArrowDown") {
            e.preventDefault();
            cpsAcIdx = Math.min(cpsAcIdx + 1, items.length - 1);
            items.forEach(function (li, i) { li.classList.toggle("active", i === cpsAcIdx); });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            cpsAcIdx = Math.max(cpsAcIdx - 1, 0);
            items.forEach(function (li, i) { li.classList.toggle("active", i === cpsAcIdx); });
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (cpsAcIdx >= 0 && items[cpsAcIdx]) {
                items[cpsAcIdx].click();
            } else {
                var val = cpsAddTgInput.value.trim();
                var tgId = parseInt(val);
                if (!isNaN(tgId) && tgId > 0) {
                    addTalkgroupById(tgId);
                    cpsAddTgInput.value = "";
                    cpsAcList.innerHTML = "";
                    cpsAcIdx = -1;
                }
            }
        }
    });

    // === Hash navigation ===
    function checkHash() {
        var hash = decodeURIComponent(window.location.hash.replace("#", ""));
        if (!hash) return;

        var id = parseInt(hash);
        if (id > 0) {
            fetch("/api/repeater?id=" + id)
                .then(function (resp) {
                    if (!resp.ok) throw new Error("HTTP " + resp.status);
                    return resp.json();
                })
                .then(function (r) {
                    map.setView([r.lat, r.lng], 14);
                    setTimeout(function () {
                        markerLayer.eachLayer(function (layer) {
                            if (layer.getLatLng &&
                                layer.getLatLng().lat === r.lat &&
                                layer.getLatLng().lng === r.lng) {
                                layer.openPopup();
                            }
                        });
                    }, 600);
                })
                .catch(function (err) {
                    console.error("Hash nav error:", err);
                });
        } else {
            searchInput.value = hash;
            doSearch();
        }
    }

    window.addEventListener("hashchange", checkHash);

    // === Init ===
    fetchTgRegistry();

    function initApp() {
        if (window.location.hash) {
            checkHash();
        } else {
            fetchRepeaters();
        }
    }

    if (i18next.isInitialized) {
        initApp();
    } else {
        document.addEventListener("i18n-ready", initApp);
    }
})();
