const allDatabase = {
  name: "transport-for-somerset",
  version: 2,
  stores: {
    vehicles: "vehicles",
    routes: "routes",
    operators: "operators"
  }
};

const DATA_URL =
  "https://busopendata.transportforsomerset.co.uk/all-v4.json";

const statusElement = document.getElementById("status");
const countElement = document.getElementById("count");
const sizeElement = document.getElementById("size");

function setStatus(message) {
  statusElement.textContent = message;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      allDatabase.name,
      allDatabase.version
    );

    request.onupgradeneeded = () => {
      const database = request.result;
      const storeName = allDatabase.stores.vehicles;

      /*
       * Recreate the vehicles store for version 2.
       *
       * The old version used vehicle_id as a keyPath,
       * which meant vehicle_id was stored twice:
       *
       *   IndexedDB key
       *   vehicle.vehicle_id
       *
       * The new version uses an out-of-line key instead.
       */
      if (database.objectStoreNames.contains(storeName)) {
        database.deleteObjectStore(storeName);
      }

      database.createObjectStore(storeName);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function loadData() {
  setStatus("Opening database...");

  const database = await openDatabase();

  setStatus("Downloading all-v4.json...");

  const response = await fetch(DATA_URL, {
    cache: "no-store",
  });

  if (!response.ok) {
    database.close();

    throw new Error(
      `Data HTTP ${response.status}`
    );
  }

  const data = await response.json();

  setStatus("Populating database...");

  const transaction = database.transaction(
    allDatabase.stores.vehicles,
    "readwrite"
  );

  const store = transaction.objectStore(
    allDatabase.stores.vehicles
  );

  let count = 0;

  for (const [operatorCode, vehicles] of Object.entries(
    data.operators
  )) {
    const operatorName =
      data.operator_names[operatorCode] ??
      operatorCode;

    for (const values of vehicles) {
      const vehicleId = values[0];

      const date = data.dates[values[9]];
      const direction = data.directions[values[2]];
      const destination = data.destinations[values[4]];

      const vehicle = {
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
        recorded_at:
          `${date}T${values[10]}+00:00`,
        journey_id: values[11],
      };

      /*
       * vehicle_id is now the IndexedDB key,
       * rather than part of the stored value.
       */
      store.put(vehicle, vehicleId);

      count++;
    }
  }

  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;

    transaction.onerror = () => {
      reject(
        transaction.error ??
        new Error("Database transaction failed")
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
        new Error("Database transaction aborted")
      );
    };
  });

  setStatus("Reading database...");

  const vehicles = await readVehicles(database);

  countElement.textContent =
    `Entries: ${vehicles.length.toLocaleString()}`;

  const size = new Blob([
    JSON.stringify(vehicles)
  ]).size;

  sizeElement.textContent =
    `Approximate data size: ${formatBytes(size)}`;

  setStatus(
    "Database created and populated successfully."
  );

  database.close();
}

function readVehicles(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      allDatabase.stores.vehicles,
      "readonly"
    );

    const store = transaction.objectStore(
      allDatabase.stores.vehicles
    );

    const request = store.openCursor();

    const vehicles = [];

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(vehicles);
        return;
      }

      /*
       * vehicle_id is stored as the IndexedDB key,
       * so put it back into the application object
       * when reading the record.
       */
      vehicles.push({
        vehicle_id: cursor.key,
        ...cursor.value,
      });

      cursor.continue();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

loadData().catch((error) => {
  console.error(error);

  setStatus(
    `Error: ${error.message}`
  );
});
