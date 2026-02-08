(function () {
    "use strict";

    var map = L.map("map").setView([52.37, 9.73], 9);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    var markerLayer = L.layerGroup().addTo(map);
    var statusBar = document.getElementById("status-bar");
    var band2m = document.getElementById("band-2m");
    var band70cm = document.getElementById("band-70cm");

    var debounceTimer = null;
    var controller = null;

    function getSelectedBand() {
        var has2m = band2m.checked;
        var has70cm = band70cm.checked;
        if (has2m && has70cm) return "all";
        if (has2m) return "2m";
        if (has70cm) return "70cm";
        return "all";
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function buildPopup(r) {
        var bandClass = r.band === "2m" ? "band-2m" : "band-70cm";
        var html = '<div class="rptr-popup">';
        html += "<h3>" + escapeHtml(r.callsign) + "</h3>";
        html += "<table>";
        html +=
            "<tr><td>Freq</td><td>" +
            r.frequency.toFixed(5) +
            ' MHz <span class="band-tag ' +
            bandClass +
            '">' +
            escapeHtml(r.band) +
            "</span></td></tr>";
        if (r.offset)
            html +=
                "<tr><td>Offset</td><td>" +
                escapeHtml(r.offset) +
                " MHz</td></tr>";
        html +=
            "<tr><td>CC</td><td>" + r.color_code + "</td></tr>";
        var loc = escapeHtml(r.city);
        if (r.state) loc += ", " + escapeHtml(r.state);
        if (r.country) loc += ", " + escapeHtml(r.country);
        html += "<tr><td>Location</td><td>" + loc + "</td></tr>";
        if (r.ipsc_network)
            html +=
                "<tr><td>Network</td><td>" +
                escapeHtml(r.ipsc_network) +
                "</td></tr>";
        if (r.trustee)
            html +=
                "<tr><td>Trustee</td><td>" +
                escapeHtml(r.trustee) +
                "</td></tr>";
        if (r.ts_linked)
            html +=
                "<tr><td>Timeslots</td><td>" +
                escapeHtml(r.ts_linked) +
                "</td></tr>";
        html +=
            "<tr><td>Status</td><td>" +
            escapeHtml(r.status) +
            "</td></tr>";
        html += "</table></div>";
        return html;
    }

    function fetchRepeaters() {
        if (controller) {
            controller.abort();
        }
        controller = new AbortController();

        var bounds = map.getBounds();
        var params = new URLSearchParams({
            minLat: bounds.getSouth(),
            maxLat: bounds.getNorth(),
            minLng: bounds.getWest(),
            maxLng: bounds.getEast(),
            band: getSelectedBand(),
        });

        fetch("/api/repeaters?" + params, { signal: controller.signal })
            .then(function (resp) {
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                return resp.json();
            })
            .then(function (data) {
                markerLayer.clearLayers();

                data.repeaters.forEach(function (r) {
                    var color = r.band === "2m" ? "#2196F3" : "#FF9800";
                    var marker = L.circleMarker([r.lat, r.lng], {
                        radius: 6,
                        fillColor: color,
                        color: "#fff",
                        weight: 1,
                        fillOpacity: 0.85,
                    });
                    marker.bindPopup(buildPopup(r), { maxWidth: 280 });
                    markerLayer.addLayer(marker);
                });

                console.log("Showing " + data.count + " repeaters");
                statusBar.textContent =
                    "Showing " + data.count + " repeater" + (data.count !== 1 ? "s" : "");
                statusBar.className = "";
            })
            .catch(function (err) {
                if (err.name === "AbortError") return;
                console.error("Fetch error:", err);
                statusBar.textContent = "Failed to load repeaters";
                statusBar.className = "";
            });
    }

    function debouncedFetch() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(fetchRepeaters, 150);
    }

    map.on("moveend", debouncedFetch);
    band2m.addEventListener("change", fetchRepeaters);
    band70cm.addEventListener("change", fetchRepeaters);

    // Initial load
    fetchRepeaters();
})();
