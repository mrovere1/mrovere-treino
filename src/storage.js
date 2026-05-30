const DB_NAME = "mrovere-apps";
const DB_VERSION = 1;

const STORE_CONFIG = [
  { name: "irisContainers", keyPath: "id" },
  { name: "irisAccounts", keyPath: "id" },
  { name: "irisMeta", keyPath: "key" },
  { name: "partnerTemplateVersions", keyPath: "id" },
  { name: "tasksState", keyPath: "key" }
];

let openPromise;

function openDatabase() {
  if (openPromise) {
    return openPromise;
  }

  openPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      STORE_CONFIG.forEach((store) => {
        if (!database.objectStoreNames.contains(store.name)) {
          database.createObjectStore(store.name, { keyPath: store.keyPath });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return openPromise;
}

async function withStore(storeName, mode, executor) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    let result;
    try {
      result = executor(store, transaction);
    } catch (error) {
      reject(error);
      return;
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function saveLocalData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function loadLocalData(key, fallback = null) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function removeLocalData(key) {
  localStorage.removeItem(key);
}

export function saveMetadata(key, metadata) {
  saveLocalData(key, metadata);
}

export function loadMetadata(key, fallback = null) {
  return loadLocalData(key, fallback);
}

export async function putRecord(storeName, value) {
  return withStore(storeName, "readwrite", (store) => {
    store.put(value);
  });
}

export async function getRecord(storeName, key) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.get(key));
}

export async function getAllRecords(storeName) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.getAll());
}

export async function deleteRecord(storeName, key) {
  return withStore(storeName, "readwrite", (store) => {
    store.delete(key);
  });
}

export async function clearStore(storeName) {
  return withStore(storeName, "readwrite", (store) => {
    store.clear();
  });
}

export async function replaceAllRecords(storeName, records) {
  return withStore(storeName, "readwrite", (store) => {
    store.clear();
    records.forEach((record) => store.put(record));
  });
}
