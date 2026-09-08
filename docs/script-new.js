const map = L.map("map");

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

      marker.addTo(map);
      markers.set(vehicle.vehicle_id, marker);
    } else {
      marker.setLatLng(position);
      marker.setIcon(createBusIcon(vehicle));

      if (!map.hasLayer(marker)) {
        marker.addTo(map);
      }
    }
  }

  for (const [id, marker] of markers) {
    if (!activeIds.has(id)) {
      map.removeLayer(marker);
    }
  }
}

async function loadData() {
  try {
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
