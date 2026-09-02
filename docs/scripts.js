  const map = L.map("map");
  const fullscreenControl = L.control({ position: "topright" });

  fullscreenControl.onAdd = function () {
    const button = L.DomUtil.create("button","leaflet-control-fullscreen");
    button.type = "button";
    button.title = "View map fullscreen";
    button.textContent = "⛶";

    L.DomEvent.disableClickPropagation(button);

    button.addEventListener("click", () => {
      const mapElement = document.getElementById("map");
      if (!mapElement) {return;}
      if (!document.fullscreenElement) {mapElement.requestFullscreen();} else {document.exitFullscreen();}
    });

    return button;
  };
  fullscreenControl.addTo(map);
  document.addEventListener("fullscreenchange", () => {map.invalidateSize();});
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
               {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}
             ).addTo(map);
  map.setView([51.0149, -3.1024], 11);

  const markers = new Map();

  let allVehicles = [];
  let operators = {};
  let serviceGroups = [];
  let selectedRoute = "all";

  /* Colours for each route, not including route variations. */
  const routeColours = {
    "21":  "route-21",
    "22":  "route-22",
    "25":  "route-25",
    "28":  "route-28",
    "PR":  "route-pr",
  };

  /* Route variations to use the same main route colour. */
  const routeColourGroups = {
    "21": ["21A"],
    "22": ["22A", "22C", "X22"],
    "25": ["25A"],
    "28": ["28A"],
  };

  /* Check for route variation and use main route colours, called by createBusIcon(). */ 
  function getRouteColour(route) {
    for (const [parentRoute, variants] of Object.entries(routeColourGroups)) {
      if (variants.includes(route)) { return routeColours[parentRoute]; }
    }
  return routeColours[route] ?? "route-neutral";
  }

  function formatAge(seconds) {
    if (seconds < 10) { return "Updated just now"; }
    if (seconds < 60) { return `Updated ${seconds} seconds ago`; }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) { return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`; }
    const hours = Math.floor(minutes / 60);
    return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", second: "2-digit"});
  }

  function statusTitle(status) {
    switch (status) {
      case "live":   return "🟢 Live bus data";
      case "backup": return "🟠 Backup bus data";
      case "stale":  return "🔴 Stale bus data";
      case "sample": return "🔵 Sample bus data";
      default:       return "Bus data";
    }
  }

function createBusIcon(vehicle) {
  const colourClass = getRouteColour(vehicle.route);
  const bearing = Number(vehicle.bearing ?? 0);

  const ageSeconds = Math.max(0,Math.floor((Date.now() - new Date(vehicle.recorded_at).getTime()) / 1000));

  let ageClass = "";

  if (ageSeconds >= 10 * 60) {
    ageClass = " bus-marker-ghost";
  } else if (ageSeconds >= 5 * 60) {
    ageClass = " bus-marker-faded";
  }

  return L.divIcon({
    className: "",
    html: `<div class="bus-marker ${colourClass}${ageClass}" style="position: relative;">${vehicle.route}
           <div class="bus-direction" style="transform: rotate(${bearing}deg)"></div>
           </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
}

/* Pop up box for bus icons, offering a little more information to the user. */
function createPopup(vehicle) {
  const mph = vehicle.speed_mps * 2.23694;

  const ageSeconds = Math.max(0,Math.floor((Date.now() - new Date(vehicle.recorded_at).getTime()) / 1000));

  let staleMessage = "";

  if (ageSeconds >= 10 * 60) {
    staleMessage = `<div class="popup-stale">This bus hasn't provided updated information for over 10 minutes.</div>`;
  } else if (ageSeconds >= 5 * 60) {
    staleMessage = `<div class="popup-stale">This bus hasn't provided updated information for over 5 minutes.</div>`;
  }

  const operator = operators[vehicle.operator_code];
  const operatorLogo = operator?.logo
    ? `<img src="media/${operator.logo}" alt="${operator.short_name}" class="popup-operator-logo">`
    : "";

return `
  ${staleMessage}
  <div class="popup-header">
    ${operatorLogo}
    <div>
      <div class="popup-route">Route ${vehicle.route}</div>
      <div class="popup-operator">${operator?.short_name ?? vehicle.operator}</div>
    </div>
  </div>
  <div class="popup-destination">${vehicle.origin} → ${vehicle.destination}</div>
  <div class="popup-details">
    <strong>Vehicle: </strong>${vehicle.vehicle_id}<br>
    <strong>Speed: </strong>${mph.toFixed(1)} mph<br>
    <strong>Recorded: </strong>${formatTime(vehicle.recorded_at)}
  </div>`;
}

/* Markers on the map. */
function updateMarkers() {
    const selectedGroup = serviceGroups.find(group => group.ref === selectedRoute);
    const visibleVehicles = selectedRoute === "all" ? allVehicles : allVehicles.filter(vehicle =>selectedGroup?.services.includes(vehicle.route));
    const activeIds = new Set(visibleVehicles.map(vehicle => vehicle.vehicle_id));

    for (const vehicle of visibleVehicles) {
      const position = [vehicle.latitude,vehicle.longitude];
      let marker = markers.get(vehicle.vehicle_id);

      if (!marker) {
        marker = L.marker(position,{icon: createBusIcon(vehicle)});
        marker.bindPopup(createPopup(vehicle));
        marker.addTo(map);
        markers.set(vehicle.vehicle_id,marker);
      } else {
        marker.setLatLng(position);
        marker.setIcon(createBusIcon(vehicle));
        marker.setPopupContent(createPopup(vehicle));

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

function getServiceGroupVehicleCount(group) {
  return allVehicles.filter(vehicle => group.services.includes(vehicle.route)).length;
}

function buildRouteButtons() {
  const routeBar = document.querySelector(".route-bar");

  for (const group of serviceGroups) {
    const button = document.createElement("button");

    button.className = "route-button";
    button.dataset.route = group.ref;
    const label = group.name ?? group.ref;
    const count = getServiceGroupVehicleCount(group);

    if (count === 0) {
      continue;
    }

    const busLabel = count === 1 ? "bus" : "buses";
    button.textContent = `${label} · ${count} ${busLabel}`;
    button.addEventListener("click", () => {
      if (selectedRoute === group.ref) { selectedRoute = "all"; } else { selectedRoute = group.ref; }
      document.querySelectorAll(".route-button").forEach(item => item.classList.remove("selected"));
      if (selectedRoute === "all") {
        document.querySelector('[data-route="all"]').classList.add("selected");
      } else {
        button.classList.add("selected");
      }
      updateMarkers();
    });
    routeBar.appendChild(button);
  }

  const allButton = document.querySelector('[data-route="all"]');
  allButton.addEventListener("click", () => {
    selectedRoute = "all";
    document.querySelectorAll(".route-button").forEach(item =>item.classList.remove("selected"));
    allButton.classList.add("selected");
    updateMarkers();
  });
}

  let firstLoad = true;

  async function loadData() {
    try {
      const cacheBust = ""; // Can be removed??
      const dataURL = "https://busopendata.transportforsomerset.co.uk/";
      const [busResponse,statusResponse,servicesResponse,operatorsResponse] = await Promise.all([
        fetch(`${dataURL}buses.json${cacheBust}`,     {cache: "no-store"}),
        fetch(`${dataURL}status.json${cacheBust}`,    {cache: "no-store"}),
        fetch(`${dataURL}services.json${cacheBust}`,  {cache: "no-store"}),
        fetch(`${dataURL}operators.json${cacheBust}`, {cache: "no-store"})
      ]);

      // Did something go wrong with the data fetching??
      if (!busResponse.ok)      { throw new Error(`Bus data HTTP ${busResponse.status}`); }
      if (!statusResponse.ok)   { throw new Error(`Status HTTP ${statusResponse.status}`); }
      if (!servicesResponse.ok) { throw new Error(`Services HTTP ${servicesResponse.status}`); }
      if (!operatorsResponse.ok) { throw new Error(`Operators HTTP ${operatorsResponse.status}`); }

      const data    = await busResponse.json();
      const status  = await statusResponse.json();
      operators     = await operatorsResponse.json();
      serviceGroups = await servicesResponse.json();

      allVehicles = data.vehicles;
      updateMarkers();
      const generated = new Date(status.generated_at);
      const ageSeconds = Math.max(0,Math.floor((Date.now() - generated.getTime()) / 1000));

      const statusElement = document.getElementById("status");
      statusElement.className = `status ${status.status}`;
      statusElement.innerHTML = `
        <div class="status-title">${statusTitle(status.status)}</div>
        <div class="status-age">${formatAge(ageSeconds)}</div>
        <div class="status-details">
          ${data.vehicle_count}
          vehicles ·
          Data timestamp
          ${formatTime(status.generated_at)}
        </div>`;
      if (firstLoad && data.vehicles.length > 0) {
        const bounds = L.latLngBounds(data.vehicles.map(vehicle => [vehicle.latitude,vehicle.longitude]));
        map.fitBounds(bounds.pad(0.15));
        firstLoad = false;
      }
      if (document.querySelectorAll(".route-button").length === 1) {
        buildRouteButtons();
      }
    } catch (error) {
      console.error(error);
      const statusElement = document.getElementById("status");
      statusElement.className = "status stale";
      statusElement.innerHTML = `<div class="status-title">🔴 Data unavailable</div><div class="status-age">Unable to retrieve bus data.</div>`;
    }
  }

  loadData();
  setInterval(loadData,30000); // reload data every 30 seconds.
