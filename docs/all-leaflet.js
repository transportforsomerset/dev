const { MarkerClusterGroup } = await import("./all-leaflet-cluster.js");

const map = new L.Map("map");
const useClusterer = true; // Use the experimental clusterer - true (on) or false (off).
                           // WARNING: turning this off will likely result in a browser
                           //          crash when trying to render 1000's of bus markers.

const fullscreenControl = new L.Control({ position: "topright" });

fullscreenControl.onAdd = function () {
  const button = L.DomUtil.create(
    "button",
    "leaflet-control-fullscreen"
  );

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

new L.TileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }
).addTo(map);

map.setView([51.0149, -3.1024], 11);

const markers = new Map();
let markerCluster;
let allVehicles = [];

/* Simple bus marker */
function createBusIcon(vehicle) {
  return new L.DivIcon({
    className: "",
    html: `<div class="bus-marker route-neutral">${vehicle.route}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

/* Decode compact all-v4.json format */
function decodeCompactData(data) {
  const vehicles = [];

  for (const [operatorCode, operatorVehicles] of Object.entries(
    data.operators
  )) {
    const operatorName =
      data.operator_names[operatorCode] ?? operatorCode;

    for (const values of operatorVehicles) {
      const date = data.dates[values[9]];
      const direction = data.directions[values[2]];
      const destination = data.destinations[values[4]];

      if (date === undefined) {
        throw new Error(`Invalid date index ${values[9]}`);
      }

      if (direction === undefined) {
        throw new Error(
          `Invalid direction index ${values[2]}`
        );
      }

      if (destination === undefined) {
        throw new Error(
          `Invalid destination index ${values[4]}`
        );
      }

      vehicles.push({
        vehicle_id: values[0],
        operator: operatorName,
        operator_code: operatorCode,
        route: values[1],
        direction,
        origin: values[3],
        destination,
        latitude: values[5],
        longitude: values[6],
        bearing: values[7],
        occupancy: values[8],
        recorded_at: `${date}T${values[10]}+00:00`,
        journey_id: values[11],
      });
    }
  }

  return vehicles;
}

function updateMarkers() {
  const activeIds = new Set(
    allVehicles.map((vehicle) => vehicle.vehicle_id)
  );

  const nextMarkers = [];

  for (const vehicle of allVehicles) {
    const position = [
      vehicle.latitude,
      vehicle.longitude,
    ];

    let marker = markers.get(vehicle.vehicle_id);

    if (!marker) {
      marker = new L.Marker(position, {
        icon: createBusIcon(vehicle),
      });

      markers.set(vehicle.vehicle_id, marker);
    } else {
      marker.setLatLng(position);
      marker.setIcon(createBusIcon(vehicle));
    }

    nextMarkers.push(marker);
  }

  if (useClusterer) {
    markerCluster.clearLayers();
    markerCluster.addLayers(nextMarkers);
  } else {
    for (const marker of nextMarkers) {
      if (!map.hasLayer(marker)) {
        marker.addTo(map);
      }
    }
  }

  for (const [id, marker] of markers) {
    if (!activeIds.has(id)) {
      if (useClusterer) {
        markerCluster.removeLayer(marker);
      } else {
        map.removeLayer(marker);
      }

      markers.delete(id);
    }
  }
}

async function loadData() {
  try {
    if (useClusterer) { // turn on / off with the const at the top of the page.
      markerCluster = new MarkerClusterGroup({
        maxClusterRadius: 50,
        disableClusteringAtZoom: 16,
        chunkedLoading: true,
        chunkInterval: 50,
        chunkDelay: 10,
      });
      markerCluster.addTo(map);
    }

    const response = await fetch(
      "https://busopendata.transportforsomerset.co.uk/all-v4.json",
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        `Bus data HTTP ${response.status}`
      );
    }

    const data = await response.json();

    allVehicles = decodeCompactData(data);

    console.log(
      `Loaded ${allVehicles.length} vehicles`
    );

    updateMarkers();

    if (allVehicles.length > 0) {
      const bounds = new L.LatLngBounds(
        allVehicles.map((vehicle) => [
          vehicle.latitude,
          vehicle.longitude,
        ])
      );

      map.fitBounds(bounds.pad(0.05));
    }
  } catch (error) {
    console.error(
      "Unable to load national BODS data:",
      error
    );
  }
}

loadData();
