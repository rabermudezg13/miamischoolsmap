const DATA_URLS = [
  "https://services1.arcgis.com/nvgO38kfurKbA7B9/ArcGIS/rest/services/Energov_ViewTEST/FeatureServer/8/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson",
  "https://arcgis.gdsc.miami.edu/arcgis/rest/services/mdc_public_schools/FeatureServer/1/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson"
];

const map = L.map("map", { zoomControl: false }).setView([25.7617, -80.35], 10);
L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 });
map.addLayer(cluster);

const els = {
  search: document.querySelector("#searchInput"), clear: document.querySelector("#clearSearch"),
  filters: document.querySelector("#typeFilters"), reset: document.querySelector("#resetFilters"),
  visible: document.querySelector("#visibleCount"), total: document.querySelector("#totalCount"),
  status: document.querySelector("#status"), locate: document.querySelector("#locateButton"),
  sidebar: document.querySelector("#sidebar"), mobile: document.querySelector("#mobileFilters")
};

let schools = [];
let selectedType = "all";
let userMarker;

function safe(value = "") {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

function valueFrom(object, ...names) {
  const entries = Object.entries(object || {});
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (found && found[1] !== null && found[1] !== "") return found[1];
  }
  return "";
}

function normalizeProperties(raw) {
  return {
    name: valueFrom(raw, "NAME", "SCHOOL_NAME", "SCH_NAME"),
    campus: valueFrom(raw, "CAMPUS", "FACILITY"),
    address: valueFrom(raw, "ADDRESS", "STREET", "SITE_ADDR", "FULL_ADDRESS"),
    unit: valueFrom(raw, "UNIT"),
    city: valueFrom(raw, "CITY", "MUNICIPALITY"),
    zipcode: valueFrom(raw, "ZIPCODE", "ZIP", "ZIP_CODE"),
    type: valueFrom(raw, "TYPE", "SCHOOL_TYPE", "SCH_TYPE"),
    grades: valueFrom(raw, "GRADES", "GRADE", "GRADE_LEVEL"),
    phone: valueFrom(raw, "PHONE", "TELEPHONE", "PHONE_NUM"),
    enrollment: valueFrom(raw, "ENROLLMNT", "ENROLLMENT", "STUDENTS")
  };
}

function classify(p) {
  const text = `${p.type || ""} ${p.grades || ""} ${p.name || ""}`.toLowerCase();
  if (/k[-– ]?8|pk[-– ]?8/.test(text)) return "k8";
  if (/elementary|elem|primary|\be\b/.test(text)) return "elementary";
  if (/middle|junior|\bm\b/.test(text)) return "middle";
  if (/senior high|high school|\bhigh\b|\bsr\b/.test(text)) return "high";
  return "other";
}

function icon(type) {
  const letter = { elementary: "E", middle: "M", high: "H", k8: "K", other: "S" }[type];
  return L.divIcon({ className: "", html: `<div class="school-marker ${type}">${letter}</div>`, iconSize: [32,32], iconAnchor: [16,16], popupAnchor: [0,-14] });
}

function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}

function popup(p, lat, lng) {
  const address = [p.address, p.unit, p.city, "FL", p.zipcode].filter(Boolean).join(" ");
  const enrollment = Number(p.enrollment);
  return `<div class="popup"><h3>${safe(p.name || "Public School")}</h3>
    ${p.campus ? `<p>${safe(p.campus)}</p>` : ""}
    <p><strong>${safe(p.type || "School")}</strong>${p.grades ? ` · Grades ${safe(p.grades)}` : ""}</p>
    ${address ? `<p>📍 ${safe(address)}</p>` : ""}
    ${p.phone ? `<p>☎ <a href="tel:${safe(p.phone)}">${safe(p.phone)}</a></p>` : ""}
    ${Number.isFinite(enrollment) && enrollment > 0 ? `<p>Enrollment: ${enrollment.toLocaleString()}</p>` : ""}
    <a href="${directionsUrl(lat,lng)}" target="_blank" rel="noopener">Open directions →</a></div>`;
}

function normalize(feature) {
  const p = normalizeProperties(feature.properties || {});
  const coords = feature.geometry?.coordinates || [];
  const lng = Number(coords[0]), lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const type = classify(p);
  const searchText = [p.name,p.campus,p.address,p.city,p.zipcode,p.type,p.grades].filter(Boolean).join(" ").toLowerCase();
  return { p, lat, lng, type, searchText, marker: L.marker([lat,lng], { icon: icon(type), title: p.name || "Public School" }).bindPopup(popup(p,lat,lng)) };
}

function render() {
  const query = els.search.value.trim().toLowerCase();
  cluster.clearLayers();
  const visible = schools.filter(s => (selectedType === "all" || s.type === selectedType) && (!query || s.searchText.includes(query)));
  cluster.addLayers(visible.map(s => s.marker));
  els.visible.textContent = visible.length.toLocaleString();
  els.status.textContent = visible.length ? `${visible.length} schools match your search.` : "No schools match those filters.";
}

async function fetchSchools() {
  let lastError;
  for (const url of DATA_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "ArcGIS service error");
      if (!Array.isArray(data.features) || !data.features.length) throw new Error("No school records returned");
      return data.features;
    } catch (error) {
      lastError = error;
      console.warn("School data source failed:", url, error);
    }
  }
  throw lastError || new Error("Unable to load school data");
}

async function loadSchools() {
  try {
    const features = await fetchSchools();
    schools = features.map(normalize).filter(Boolean);
    if (!schools.length) throw new Error("School records did not contain valid map coordinates");
    els.total.textContent = schools.length.toLocaleString();
    render();
    map.fitBounds(L.latLngBounds(schools.map(s => [s.lat,s.lng])), { padding: [30,30] });
  } catch (error) {
    console.error(error);
    els.status.textContent = "School data could not be loaded. Please refresh the page or try again later.";
  }
}

els.search.addEventListener("input", render);
els.clear.addEventListener("click", () => { els.search.value = ""; els.search.focus(); render(); });
els.filters.addEventListener("click", event => {
  const button = event.target.closest("[data-type]"); if (!button) return;
  selectedType = button.dataset.type;
  document.querySelectorAll(".filter-chip").forEach(b => b.classList.toggle("active", b === button));
  render();
});
els.reset.addEventListener("click", () => {
  selectedType = "all"; els.search.value = "";
  document.querySelectorAll(".filter-chip").forEach(b => b.classList.toggle("active", b.dataset.type === "all"));
  render();
});
els.locate.addEventListener("click", () => {
  if (!navigator.geolocation) return (els.status.textContent = "Your browser does not support geolocation.");
  els.status.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition(({coords}) => {
    const here = [coords.latitude, coords.longitude];
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker(here, { radius: 9, weight: 4, color: "#fff", fillColor: "#172033", fillOpacity: 1 }).addTo(map).bindPopup("Your location").openPopup();
    map.setView(here, 13); els.status.textContent = "Showing schools near your location.";
  }, () => { els.status.textContent = "We could not get your location. Check your browser permission."; }, { enableHighAccuracy: true, timeout: 10000 });
});
els.mobile.addEventListener("click", () => {
  const open = els.sidebar.classList.toggle("open"); els.mobile.setAttribute("aria-expanded", String(open));
});
map.on("click", () => els.sidebar.classList.remove("open"));

loadSchools();