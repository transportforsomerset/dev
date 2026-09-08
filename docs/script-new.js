const map = L.map("map");

/* Load Leaflet.markercluster before creating the cluster group. */
function loadMarkerCluster() {
  return new Promise((resolve, reject) => {
    if (window.L && L.MarkerClusterGroup) {
      resolve();
      return;
    }

    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href =
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";
    document.head.appendChild(css);

    const cssDefault = document.createElement("link");
    cssDefault.rel = "stylesheet";
    cssDefault.href =
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css";
    document.head.appendChild(cssDefault);

    const script = document.createElement("script");
    script.src =
      "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

const fullscreenControl = L.control({ position: "topright" });

fullscreenControl.onAdd = function () {
  const button = L.DomUtil.create("button", "leaflet-control-fullscreen");
  button.type = "button";
  button.title = "View map fullscreen";
  button.textContent = "⛶";

  L.DomEvent.disableClickPropagation(button);

  button.addEventListener("click", () => {
    const mapElement = document.getElementById("map");
    if (!mapElement) return;

    if (!document.fullscreenElement) {
      mapElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  return button;
};

fullscreenControl.addTo(map);

document.addEventListener("fullscreenchange", () => {
  map.invalidateSize();
});

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
}).addTo(map);

map.setView([51.0149, -3.1024], 11);

const markers = new Map();
let markerCluster = null;
let allVehicles = [];

/* Simple marker for the national BODS rendering experiment. */
function createBusIcon(vehicle) {
  return L.divIcon({
    className: "",
    html: `<div class="bus-marker route-neutral">${vehicle.route}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

/* Decode the compact all-new.json format. */
function decodeCompactData(data) {
  return data.vehicles.map((values) => {
    const vehicle = {};

    data.fields.forEach((field, index) => {
      vehicle[field] = values[index];
    });

    return vehicle;
  });
}

function updateMarkers() {
  const activeIds = new Set(
    allVehicles.map((vehicle) => vehicle.vehicle_id)
  );

  for (const vehicle of allVehicles) {
    const position = [vehicle.latitude, vehicle.longitude];
    let marker = markers.get(vehicle.vehicle_id);

    if (!marker) {
      marker = L.marker(position, {
        icon: createBusIcon(vehicle),
      });

      markers.set(vehicle.vehicle_id, marker);
      markerCluster.addLayer(marker);
    } else {
      marker.setLatLng(position);
      marker.setIcon(createBusIcon(vehicle));

      if (!markerCluster.hasLayer(marker)) {
        markerCluster.addLayer(marker);
      }
    }
  }

  for (const [id, marker] of markers) {
    if (!activeIds.has(id)) {
      markerCluster.removeLayer(marker);
      markers.delete(id);
    }
  }
}

async function loadData() {
  try {
    await loadMarkerCluster();

    markerCluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 16,

      /*
       * Add markers in batches so the browser doesn't try
       * to process all 27,000+ at once.
       */
      chunkedLoading: true,
      chunkInterval: 50,
      chunkDelay: 10,
    });

    map.addLayer(markerCluster);

    const dataURL = "https://busopendata.transportforsomerset.co.uk/";

    const response = await fetch(`${dataURL}all-new.json`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Bus data HTTP ${response.status}`);
    }

    const data = await response.json();

    allVehicles = decodeCompactData(data);

    console.log(`Loaded ${allVehicles.length} vehicles`);

    updateMarkers();

    if (allVehicles.length > 0) {
      const bounds = L.latLngBounds(
        allVehicles.map((vehicle) => [
          vehicle.latitude,
          vehicle.longitude,
        ])
      );

      map.fitBounds(bounds.pad(0.05));
    }
  } catch (error) {
    console.error("Unable to load national BODS data:", error);
  }
}

loadData();
