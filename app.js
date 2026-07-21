const DATA_URL = "./schools.csv";

const map = L.map("map", { zoomControl: false }).setView([25.7617, -80.35], 10);
L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 });
map.addLayer(cluster);

const els = {
  search: document.querySelector("#searchInput"),
  clear: document.querySelector("#clearSearch"),
  filters: document.querySelector("#typeFilters"),
  reset: document.querySelector("#resetFilters"),
  visible: document.querySelector("#visibleCount"),
  total: document.querySelector("#totalCount"),
  status: document.querySelector("#status"),
  locate: document.querySelector("#locateButton"),
  sidebar: document.querySelector("#sidebar"),
  mobile: document.querySelector("#mobileFilters")
};

let schools = [];
let selectedType = "all";
let userMarker;

function safe(value = "") {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function classify(record) {
  const text = `${record.type || ""} ${record.grades || ""} ${record.name || ""}`.toLowerCase();
  if (/k[-– ]?8|pk[-– ]?8/.test(text)) return "k8";
  if (/elementary|elem|primary|^e$/.test(text)) return "elementary";
  if (/middle|junior|^m$/.test(text)) return "middle";
  if (/senior high|high school|\bhigh\b|^sr$/.test(text)) return "high";
  return "other";
}

function icon(type) {
  const letter = { elementary: "E", middle: "M", high: "H", k8: "K", other: "S" }[type];
  return L.divIcon({
    className: "",
    html: `<div class="school-marker ${type}">${letter}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -14]
  });
}

function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}

function popup(record, lat, lng) {
  const address = [record.address, record.unit, record.city, record.state || "FL", record.zipcode]
    .filter(Boolean)
    .join(" ");
  const enrollment = Number(record.enrollment);

  return `<div class="popup">
    <h3>${safe(record.name || "Public School")}</h3>
    ${record.campus ? `<p>${safe(record.campus)}</p>` : ""}
    <p><strong>${safe(record.type || "School")}</strong>${record.grades ? ` · Grades ${safe(record.grades)}` : ""}</p>
    ${address ? `<p>📍 ${safe(address)}</p>` : ""}
    ${record.phone ? `<p>☎ <a href="tel:${safe(record.phone)}">${safe(record.phone)}</a></p>` : ""}
    ${Number.isFinite(enrollment) && enrollment > 0 ? `<p>Enrollment: ${enrollment.toLocaleString()}</p>` : ""}
    <a href="${directionsUrl(lat, lng)}" target="_blank" rel="noopener">Open directions →</a>
  </div>`;
}

function normalize(record) {
  const lat = Number(record.latitude);
  const lng = Number(record.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const type = classify(record);
  const searchText = [
    record.name, record.campus, record.address, record.city, record.zipcode,
    record.type, record.grades
  ].filter(Boolean).join(" ").toLowerCase();

  return {
    record,
    lat,
    lng,
    type,
    searchText,
    marker: L.marker([lat, lng], {
      icon: icon(type),
      title: record.name || "Public School"
    }).bindPopup(popup(record, lat, lng))
  };
}

function render() {
  const query = els.search.value.trim().toLowerCase();
  cluster.clearLayers();

  const visible = schools.filter(school =>
    (selectedType === "all" || school.type === selectedType) &&
    (!query || school.searchText.includes(query))
  );

  cluster.addLayers(visible.map(school => school.marker));
  els.visible.textContent = visible.length.toLocaleString();
  els.status.textContent = visible.length
    ? `${visible.length} schools match your search.`
    : "No schools match those filters.";
}

async function loadSchools() {
  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const csvText = await response.text();
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: header => header.trim().replace(/^\uFEFF/, "")
    });

    if (parsed.errors.length) console.warn("CSV parsing warnings:", parsed.errors);

    schools = parsed.data.map(normalize).filter(Boolean);
    if (!schools.length) throw new Error("schools.csv does not contain valid school coordinates yet");

    els.total.textContent = schools.length.toLocaleString();
    render();
    map.fitBounds(L.latLngBounds(schools.map(school => [school.lat, school.lng])), { padding: [30, 30] });
  } catch (error) {
    console.error(error);
    els.status.textContent = "The local schools.csv file is being prepared. Please refresh the page shortly.";
  }
}

els.search.addEventListener("input", render);
els.clear.addEventListener("click", () => {
  els.search.value = "";
  els.search.focus();
  render();
});
els.filters.addEventListener("click", event => {
  const button = event.target.closest("[data-type]");
  if (!button) return;
  selectedType = button.dataset.type;
  document.querySelectorAll(".filter-chip").forEach(item => item.classList.toggle("active", item === button));
  render();
});
els.reset.addEventListener("click", () => {
  selectedType = "all";
  els.search.value = "";
  document.querySelectorAll(".filter-chip").forEach(item => item.classList.toggle("active", item.dataset.type === "all"));
  render();
});
els.locate.addEventListener("click", () => {
  if (!navigator.geolocation) {
    els.status.textContent = "Your browser does not support geolocation.";
    return;
  }

  els.status.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    const here = [coords.latitude, coords.longitude];
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker(here, {
      radius: 9,
      weight: 4,
      color: "#fff",
      fillColor: "#172033",
      fillOpacity: 1
    }).addTo(map).bindPopup("Your location").openPopup();
    map.setView(here, 13);
    els.status.textContent = "Showing schools near your location.";
  }, () => {
    els.status.textContent = "We could not get your location. Check your browser permission.";
  }, { enableHighAccuracy: true, timeout: 10000 });
});
els.mobile.addEventListener("click", () => {
  const open = els.sidebar.classList.toggle("open");
  els.mobile.setAttribute("aria-expanded", String(open));
});
map.on("click", () => els.sidebar.classList.remove("open"));

loadSchools();
