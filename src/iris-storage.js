import {
  clearStore,
  getAllRecords,
  getRecord,
  putRecord,
  replaceAllRecords
} from "./storage.js";

export async function saveIrisContainers(containers) {
  await replaceAllRecords("irisContainers", containers);
}

export async function saveIrisAccounts(accounts) {
  await replaceAllRecords("irisAccounts", accounts);
}

export async function loadStoredIrisContainers() {
  return getAllRecords("irisContainers");
}

export async function loadStoredIrisAccounts() {
  return getAllRecords("irisAccounts");
}

export async function saveIrisMetadata(metadata) {
  await putRecord("irisMeta", { key: "snapshot", ...metadata });
}

export async function loadIrisMetadata() {
  return getRecord("irisMeta", "snapshot");
}

export async function clearIrisStores() {
  await Promise.all([
    clearStore("irisContainers"),
    clearStore("irisAccounts"),
    clearStore("irisMeta")
  ]);
}
