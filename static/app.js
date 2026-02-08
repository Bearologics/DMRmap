(function () {
    "use strict";

    // === Theme ===
    var themeToggle = document.getElementById("theme-toggle");

    function applyTheme(dark) {
        document.documentElement.classList.toggle("dark", dark);
        themeToggle.textContent = dark ? "\u2600" : "\u263E";
        themeToggle.title = dark ? "Switch to light mode" : "Switch to dark mode";
    }

    var savedTheme = localStorage.getItem("theme");
    var prefersDark = savedTheme === "dark" ||
        (savedTheme === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
    applyTheme(prefersDark);

    themeToggle.addEventListener("click", function () {
        var isDark = document.documentElement.classList.toggle("dark");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        themeToggle.textContent = isDark ? "\u2600" : "\u263E";
        themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    });

    // === Map Setup ===
    var map = L.map("map").setView([52.37, 9.73], 9);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // === State ===
    var markerLayer = L.layerGroup().addTo(map);
    var routeLayer = null;
    var routePoints = null; // stored [lat, lng] pairs for re-fetching on band change
    var isRouteMode = false;
    var debounceTimer = null;
    var controller = null;

    // === DOM ===
    var band2m = document.getElementById("band-2m");
    var band70cm = document.getElementById("band-70cm");
    var countEl = document.getElementById("count");
    var fromInput = document.getElementById("route-from");
    var toInput = document.getElementById("route-to");
    var routeBtn = document.getElementById("route-btn");
    var clearBtn = document.getElementById("clear-btn");

    clearBtn.style.display = "none";

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
                fetch(
                    "https://nominatim.openstreetmap.org/search?" +
                        new URLSearchParams({
                            q: q,
                            format: "json",
                            limit: "5",
                            addressdetails: "0",
                            "accept-language": navigator.language,
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

    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function showCount(count) {
        countEl.textContent = count + " repeater" + (count !== 1 ? "s" : "");
    }

    function showStatus(msg) {
        countEl.textContent = msg;
    }

    // === Popup ===
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
        html += "<tr><td>CC</td><td>" + r.color_code + "</td></tr>";
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

    // === Display markers ===
    function displayRepeaters(repeaters) {
        markerLayer.clearLayers();
        repeaters.forEach(function (r) {
            var color = r.band === "2m" ? "#2196F3" : "#D32F2F";
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
    }

    // === Viewport mode ===
    function fetchRepeaters() {
        if (isRouteMode) return;

        if (controller) controller.abort();
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
                displayRepeaters(data.repeaters);
                console.log("Showing " + data.count + " repeaters");
                showCount(data.count);
            })
            .catch(function (err) {
                if (err.name === "AbortError") return;
                console.error("Fetch error:", err);
                showStatus("Error");
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
                    "accept-language": navigator.language,
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

        showStatus("Loading...");
        return fetch("/api/repeaters/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                points: routePoints,
                band: getSelectedBand(),
                corridor: 10,
            }),
        })
            .then(function (resp) {
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                return resp.json();
            })
            .then(function (data) {
                displayRepeaters(data.repeaters);
                console.log("Showing " + data.count + " repeaters along route");
                showCount(data.count);
            })
            .catch(function (err) {
                console.error("Route fetch error:", err);
                showStatus("Error");
            });
    }

    function findRoute() {
        var fromAddr = fromInput.value.trim();
        var toAddr = toInput.value.trim();
        if (!fromAddr || !toAddr) return;

        routeBtn.disabled = true;
        showStatus("Geocoding...");

        geocode(fromAddr)
            .then(function (from) {
                return geocode(toAddr).then(function (to) {
                    return { from: from, to: to };
                });
            })
            .then(function (endpoints) {
                showStatus("Routing...");
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
                isRouteMode = true;
                clearBtn.style.display = "";

                return fetchRouteRepeaters();
            })
            .catch(function (err) {
                console.error("Route error:", err);
                showStatus(err.message);
            })
            .then(function () {
                routeBtn.disabled = false;
            });
    }

    function clearRoute() {
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }
        routePoints = null;
        isRouteMode = false;
        clearBtn.style.display = "none";
        fromInput.value = "";
        toInput.value = "";
        fetchRepeaters();
    }

    // === Events ===
    map.on("moveend", function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(fetchRepeaters, 150);
    });

    band2m.addEventListener("change", function () {
        if (isRouteMode) fetchRouteRepeaters();
        else fetchRepeaters();
    });

    band70cm.addEventListener("change", function () {
        if (isRouteMode) fetchRouteRepeaters();
        else fetchRepeaters();
    });

    routeBtn.addEventListener("click", findRoute);
    clearBtn.addEventListener("click", clearRoute);

    toInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") findRoute();
    });

    fromInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") toInput.focus();
    });

    // === Init ===
    fetchRepeaters();
})();
