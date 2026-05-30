import { canPerform } from "./roles.js";
import {
  clearIrisStores,
  loadIrisMetadata,
  loadStoredIrisAccounts,
  loadStoredIrisContainers,
  saveIrisAccounts,
  saveIrisContainers,
  saveIrisMetadata
} from "./iris-storage.js";

const irisState = {
  activeTab: "containers",
  containers: [],
  accounts: [],
  filteredContainers: [],
  filteredAccounts: [],
  selectedContainerId: null,
  page: 1,
  pageSize: 25,
  search: "",
  statusFilter: "all",
  regionFilter: "all",
  accountCountryFilter: "all",
  metadata: null,
  debounceTimer: null,
  userContext: null
};

export async function renderIrisDashboard(container, userContext) {
  irisState.userContext = userContext;
  renderIrisScaffold(container, userContext);

  try {
    await hydrateLocalIrisState(userContext);
    await tryLoadLatestIrisFiles(userContext);
    await refreshStoredState();
    drawIrisContent(container, userContext);
  } catch (error) {
    container.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

async function hydrateLocalIrisState(userContext) {
  await refreshStoredState();

  if (!irisState.containers.length && !irisState.accounts.length) {
    await tryLoadLatestIrisFiles(userContext);
    await refreshStoredState();
  }
}

async function refreshStoredState() {
  const [containers, accounts, metadata] = await Promise.all([
    loadStoredIrisContainers(),
    loadStoredIrisAccounts(),
    loadIrisMetadata()
  ]);

  irisState.containers = containers;
  irisState.accounts = accounts;
  irisState.metadata = metadata;
  irisState.filteredContainers = applyIrisFilters(containers);
  irisState.filteredAccounts = applyAccountFilters(accounts);
  irisState.selectedContainerId =
    irisState.selectedContainerId || irisState.filteredContainers[0]?.id || null;
}

function renderIrisScaffold(container, userContext) {
  container.innerHTML = `
    <div class="dashboard-shell">
      <section class="module-header">
        <div>
          <h2>IRIS Dashboard</h2>
          <p>
            Large snapshots are stored locally in IndexedDB, filtered in memory, and
            rendered page by page to keep the UI responsive.
          </p>
        </div>
        <div class="toolbar">
          ${
            canPerform(userContext, "import-iris")
              ? `
                <label class="button secondary">
                  Import containers JSON
                  <input id="iris-containers-input" type="file" accept="application/json" class="hidden" />
                </label>
                <label class="button secondary">
                  Import accounts JSON
                  <input id="iris-accounts-input" type="file" accept="application/json" class="hidden" />
                </label>
                <button id="iris-reload-button" class="button secondary" type="button">Reload latest files</button>
                <button id="iris-clear-button" class="button danger" type="button">Clear local IRIS data</button>
              `
              : ""
          }
        </div>
      </section>
      <section class="tab-strip">
        ${renderTabButton("containers", "Containers")}
        ${renderTabButton("accounts", "Accounts")}
        ${renderTabButton("usage", "Usage")}
      </section>
      <section id="iris-module-content"></section>
    </div>
  `;

  container.querySelectorAll("[data-iris-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      irisState.activeTab = button.dataset.irisTab;
      irisState.page = 1;
      drawIrisContent(container, userContext);
    });
  });

  if (canPerform(userContext, "import-iris")) {
    container.querySelector("#iris-containers-input")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      await importIrisContainersJson(file, userContext);
      await refreshStoredState();
      drawIrisContent(container, userContext);
    });

    container.querySelector("#iris-accounts-input")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      await importIrisAccountsJson(file, userContext);
      await refreshStoredState();
      drawIrisContent(container, userContext);
    });

    container.querySelector("#iris-reload-button")?.addEventListener("click", async () => {
      await tryLoadLatestIrisFiles(userContext);
      await refreshStoredState();
      drawIrisContent(container, userContext);
    });

    container.querySelector("#iris-clear-button")?.addEventListener("click", async () => {
      await clearIrisStores();
      await refreshStoredState();
      drawIrisContent(container, userContext);
    });
  }
}

function drawIrisContent(container, userContext) {
  const content = container.querySelector("#iris-module-content");
  if (!irisState.containers.length && !irisState.accounts.length) {
    content.innerHTML = `
      <div class="empty-state">
        ${
          canPerform(userContext, "import-iris")
            ? "No IRIS data is available yet. Place latest.json and accounts_latest.json under data/iris or import local JSON files."
            : "No IRIS snapshot is available for this browser session yet. Ask an administrator to import or reload the local JSON files."
        }
      </div>
    `;
    return;
  }

  if (irisState.activeTab === "accounts") {
    content.innerHTML = renderAccountsView();
    wireAccountsView(content);
    return;
  }

  if (irisState.activeTab === "usage") {
    content.innerHTML = renderIrisUsageSummary();
    return;
  }

  content.innerHTML = `
    <div class="content-stack">
      ${renderIrisMetrics()}
      <section class="panel" style="padding: 1rem;">
        <div class="section-heading">
          <h3>Container filters</h3>
          <span class="muted">${irisState.filteredContainers.length} matching results</span>
        </div>
        <div class="iris-filters">
          <div class="field">
            <label for="iris-search">Search</label>
            <input id="iris-search" value="${escapeHtml(irisState.search)}" placeholder="Search container, account, or region" />
          </div>
          <div class="field">
            <label for="iris-status-filter">Status</label>
            <select id="iris-status-filter">
              ${renderOptions(["all", ...uniqueValues(irisState.containers, "status")], irisState.statusFilter)}
            </select>
          </div>
          <div class="field">
            <label for="iris-region-filter">Region</label>
            <select id="iris-region-filter">
              ${renderOptions(["all", ...uniqueValues(irisState.containers, "region")], irisState.regionFilter)}
            </select>
          </div>
          <div class="field">
            <label for="iris-page-size">Page size</label>
            <select id="iris-page-size">
              ${renderOptions(["25", "50", "100"], String(irisState.pageSize))}
            </select>
          </div>
        </div>
      </section>
      <section class="split-layout">
        <article class="panel card-table">
          <header>
            <div>
              <h3>Containers</h3>
              <p class="muted">Only the current page is rendered into the DOM.</p>
            </div>
          </header>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Container</th>
                  <th>Account</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Usage</th>
                </tr>
              </thead>
              <tbody id="iris-container-table-body"></tbody>
            </table>
          </div>
          <div class="pagination">
            <span class="muted">${irisState.filteredContainers.length} results</span>
            <div class="pagination-controls">
              <button id="iris-prev-page" class="button secondary" type="button">Previous</button>
              <button id="iris-next-page" class="button secondary" type="button">Next</button>
            </div>
          </div>
        </article>
        <aside class="panel side-panel" id="iris-detail-panel"></aside>
      </section>
    </div>
  `;

  renderIrisTable(content.querySelector("#iris-container-table-body"));
  renderIrisContainerDetails(content.querySelector("#iris-detail-panel"));
  wireContainerView(content);
}

export async function loadIrisContainers() {
  return loadStoredIrisContainers();
}

export async function loadIrisAccounts() {
  return loadStoredIrisAccounts();
}

export async function tryLoadLatestIrisFiles(userContext) {
  await tryImportStaticFile("./data/iris/latest.json", "containers", userContext);
  await tryImportStaticFile("./data/iris/accounts_latest.json", "accounts", userContext);
}

async function tryImportStaticFile(path, kind, userContext) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (kind === "containers") {
      await importContainerPayload(payload, "latest.json", userContext);
    } else {
      await importAccountPayload(payload, "accounts_latest.json", userContext);
    }
  } catch {
    // Keep the app resilient when optional local files are not available.
  }
}

export async function importIrisContainersJson(file, userContext) {
  const payload = JSON.parse(await file.text());
  await importContainerPayload(payload, file.name, userContext);
}

export async function importIrisAccountsJson(file, userContext) {
  const payload = JSON.parse(await file.text());
  await importAccountPayload(payload, file.name, userContext);
}

async function importContainerPayload(payload, sourceFileName, userContext) {
  const containers = normalizeContainerPayload(payload);
  await saveIrisContainers(containers);
  await saveIrisSnapshotMetadata({
    sourceFileName,
    importedBy: userContext?.email || "local-browser",
    totalContainers: containers.length,
    totalAccounts: irisState.accounts.length,
    snapshotName: payload.captured_at || payload.generatedAt || sourceFileName
  });
}

async function importAccountPayload(payload, sourceFileName, userContext) {
  const accounts = normalizeAccountPayload(payload);
  await saveIrisAccounts(accounts);
  await saveIrisSnapshotMetadata({
    sourceFileName,
    importedBy: userContext?.email || "local-browser",
    totalContainers: irisState.containers.length,
    totalAccounts: accounts.length,
    snapshotName: payload.captured_at || payload.generatedAt || sourceFileName
  });
}

export async function saveIrisSnapshotMetadata(metadata) {
  await saveIrisMetadata({
    importedAt: new Date().toISOString(),
    ...metadata
  });
}

export function renderIrisMetrics() {
  const utilizationValues = irisState.containers
    .map((container) => Number(container.usage?.usage_percent || 0))
    .filter((value) => Number.isFinite(value));
  const averageUsage = utilizationValues.length
    ? Math.round(utilizationValues.reduce((sum, value) => sum + value, 0) / utilizationValues.length)
    : 0;

  return `
    <section class="iris-metrics">
      <article class="stat-card panel">
        <h3>Containers</h3>
        <div class="stat-value">${irisState.containers.length}</div>
      </article>
      <article class="stat-card panel">
        <h3>Accounts</h3>
        <div class="stat-value">${irisState.accounts.length}</div>
      </article>
      <article class="stat-card panel">
        <h3>Average usage</h3>
        <div class="stat-value">${averageUsage}%</div>
      </article>
      <article class="stat-card panel">
        <h3>Snapshot</h3>
        <div class="muted">${escapeHtml(irisState.metadata?.snapshotName || "Local browser state")}</div>
      </article>
    </section>
  `;
}

export function renderIrisTable(tbody) {
  const fragment = document.createDocumentFragment();
  const currentPageItems = paginateIrisResults(irisState.filteredContainers);

  currentPageItems.forEach((container) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <button class="button secondary" data-container-select="${escapeHtml(container.id)}" type="button">
          ${escapeHtml(container.name || container.id)}
        </button>
      </td>
      <td>${escapeHtml(container.account || "-")}</td>
      <td>${escapeHtml(container.region || "-")}</td>
      <td>${escapeHtml(container.status || "-")}</td>
      <td>${escapeHtml(formatUsage(container))}</td>
    `;
    fragment.appendChild(row);
  });

  tbody.innerHTML = "";
  tbody.appendChild(fragment);
}

export function applyIrisFilters(containers) {
  const search = irisState.search.toLowerCase();
  return containers.filter((container) => {
    const matchesSearch =
      !search ||
      [container.name, container.account, container.region, container.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    const matchesStatus =
      irisState.statusFilter === "all" || container.status === irisState.statusFilter;
    const matchesRegion =
      irisState.regionFilter === "all" || container.region === irisState.regionFilter;

    return matchesSearch && matchesStatus && matchesRegion;
  });
}

function applyAccountFilters(accounts) {
  const countryFilter = irisState.accountCountryFilter;
  return accounts.filter((account) => {
    return countryFilter === "all" || account.billingCountry === countryFilter;
  });
}

export function paginateIrisResults(results) {
  const start = (irisState.page - 1) * irisState.pageSize;
  return results.slice(start, start + irisState.pageSize);
}

export function renderIrisContainerDetails(panel) {
  const selected =
    irisState.filteredContainers.find((container) => container.id === irisState.selectedContainerId) ||
    irisState.filteredContainers[0];

  if (!selected) {
    panel.innerHTML = `<div class="empty-state">Select a container to inspect its details.</div>`;
    return;
  }

  irisState.selectedContainerId = selected.id;
  panel.innerHTML = `
    <div class="content-stack">
      <div class="section-heading">
        <h3>${escapeHtml(selected.name || selected.id)}</h3>
        <span class="pill">${escapeHtml(selected.status || "Unknown")}</span>
      </div>
      <div class="detail-grid">
        <article><strong>Container ID</strong>${escapeHtml(selected.id)}</article>
        <article><strong>Account</strong>${escapeHtml(selected.account || "-")}</article>
        <article><strong>Region</strong>${escapeHtml(selected.region || "-")}</article>
        <article><strong>Products</strong>${escapeHtml((selected.products || []).join(", ") || "-")}</article>
        <article><strong>Expiration</strong>${escapeHtml(selected.expires_at || "-")}</article>
        <article><strong>Last updated</strong>${escapeHtml(selected.updated_at || "-")}</article>
      </div>
      ${renderIrisUsageSummary(selected)}
      <div>
        <strong class="muted">Raw usage payload</strong>
        <div class="code-block iris-details-code">${escapeHtml(
          JSON.stringify(selected.usage || {}, null, 2)
        )}</div>
      </div>
    </div>
  `;
}

export function renderIrisUsageSummary(selectedContainer = null) {
  if (selectedContainer) {
    const usage = selectedContainer.usage || {};
    return `
      <div class="panel" style="padding: 1rem;">
        <div class="section-heading">
          <h4>Usage summary</h4>
        </div>
        <div class="detail-grid">
          <article><strong>License used</strong>${escapeHtml(String(usage.license_used ?? "-"))}</article>
          <article><strong>License limit</strong>${escapeHtml(String(usage.license_limit ?? "-"))}</article>
          <article><strong>Usage percent</strong>${escapeHtml(String(usage.usage_percent ?? "-"))}%</article>
          <article><strong>Additional metrics</strong>${escapeHtml(String(usage.assets_monitored ?? usage.metric ?? "-"))}</article>
        </div>
      </div>
    `;
  }

  const topUsage = [...irisState.containers]
    .sort((left, right) => Number(right.usage?.usage_percent || 0) - Number(left.usage?.usage_percent || 0))
    .slice(0, 10);

  return `
    <section class="panel card-table">
      <header>
        <div>
          <h3>Highest usage containers</h3>
          <p class="muted">Quick view based on the locally imported usage metrics.</p>
        </div>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Container</th>
              <th>Account</th>
              <th>Usage</th>
              <th>Limit</th>
              <th>Percent</th>
            </tr>
          </thead>
          <tbody>
            ${topUsage
              .map(
                (container) => `
                  <tr>
                    <td>${escapeHtml(container.name)}</td>
                    <td>${escapeHtml(container.account || "-")}</td>
                    <td>${escapeHtml(String(container.usage?.license_used ?? "-"))}</td>
                    <td>${escapeHtml(String(container.usage?.license_limit ?? "-"))}</td>
                    <td>${escapeHtml(String(container.usage?.usage_percent ?? "-"))}%</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAccountsView() {
  return `
    <div class="content-stack">
      ${renderIrisMetrics()}
      <section class="panel" style="padding: 1rem;">
        <div class="section-heading">
          <h3>Account filters</h3>
          <span class="muted">${irisState.filteredAccounts.length} accounts</span>
        </div>
        <div class="iris-filters">
          <div class="field">
            <label for="iris-account-country-filter">Billing country</label>
            <select id="iris-account-country-filter">
              ${renderOptions(["all", ...uniqueValues(irisState.accounts, "billingCountry")], irisState.accountCountryFilter)}
            </select>
          </div>
        </div>
      </section>
      <section class="panel card-table">
        <header>
          <div>
            <h3>Accounts</h3>
            <p class="muted">Account snapshots are kept separate from containers and imported independently.</p>
          </div>
        </header>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Country</th>
                <th>Type</th>
                <th>Industry</th>
                <th>Containers</th>
              </tr>
            </thead>
            <tbody>
              ${irisState.filteredAccounts
                .slice(0, 250)
                .map(
                  (account) => `
                    <tr>
                      <td>${escapeHtml(account.name || account.id)}</td>
                      <td>${escapeHtml(account.billingCountry || "-")}</td>
                      <td>${escapeHtml(account.type || "-")}</td>
                      <td>${escapeHtml(account.industry || "-")}</td>
                      <td>${escapeHtml(String((account.containerIds || []).length))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="table-note">For performance, the account tab renders a maximum of 250 rows at once in this view.</div>
      </section>
    </div>
  `;
}

function wireContainerView(content) {
  const searchInput = content.querySelector("#iris-search");
  searchInput?.addEventListener("input", () => {
    clearTimeout(irisState.debounceTimer);
    irisState.debounceTimer = setTimeout(() => {
      irisState.search = searchInput.value.trim();
      irisState.page = 1;
      irisState.filteredContainers = applyIrisFilters(irisState.containers);
      drawIrisContent(content.closest("#app-content"), irisState.userContext);
    }, 250);
  });

  content.querySelector("#iris-status-filter")?.addEventListener("change", (event) => {
    irisState.statusFilter = event.target.value;
    irisState.page = 1;
    irisState.filteredContainers = applyIrisFilters(irisState.containers);
    drawIrisContent(content.closest("#app-content"), irisState.userContext);
  });

  content.querySelector("#iris-region-filter")?.addEventListener("change", (event) => {
    irisState.regionFilter = event.target.value;
    irisState.page = 1;
    irisState.filteredContainers = applyIrisFilters(irisState.containers);
    drawIrisContent(content.closest("#app-content"), irisState.userContext);
  });

  content.querySelector("#iris-page-size")?.addEventListener("change", (event) => {
    irisState.pageSize = Number(event.target.value);
    irisState.page = 1;
    drawIrisContent(content.closest("#app-content"), irisState.userContext);
  });

  content.querySelector("#iris-prev-page")?.addEventListener("click", () => {
    irisState.page = Math.max(1, irisState.page - 1);
    drawIrisContent(content.closest("#app-content"), irisState.userContext);
  });

  content.querySelector("#iris-next-page")?.addEventListener("click", () => {
    const maxPage = Math.max(1, Math.ceil(irisState.filteredContainers.length / irisState.pageSize));
    irisState.page = Math.min(maxPage, irisState.page + 1);
    drawIrisContent(content.closest("#app-content"), irisState.userContext);
  });

  content.querySelectorAll("[data-container-select]").forEach((button) => {
    button.addEventListener("click", () => {
      irisState.selectedContainerId = button.dataset.containerSelect;
      renderIrisContainerDetails(content.querySelector("#iris-detail-panel"));
    });
  });
}

function wireAccountsView(content) {
  content.querySelector("#iris-account-country-filter")?.addEventListener("change", (event) => {
    irisState.accountCountryFilter = event.target.value;
    irisState.filteredAccounts = applyAccountFilters(irisState.accounts);
    drawIrisContent(content.closest("#app-content"), irisState.userContext);
  });
}

function normalizeContainerPayload(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload.containers || payload.items || payload.data || [];

  return list.map((item, index) => ({
    id: item.id || item.container_id || item.uuid || `container-${index}`,
    name: item.name || item.container_name || item.display_name || "",
    account: item.account || item.account_name || item.customer || item.tenant || "",
    account_id: item.account_id || item.accountId || item.customer_id || "",
    region: item.region || item.datacenter || item.dc || "",
    status: item.status || item.state || "",
    products: normalizeArray(item.products || item.licenses || item.plan),
    features: normalizeArray(item.features || item.capabilities || item.modules),
    usage: normalizeUsage(item.usage || item.metrics || item.consumption || {}),
    expires_at: item.expires_at || item.expiresAt || item.expiration_date || "",
    updated_at: item.updated_at || item.updatedAt || item.last_updated || ""
  }));
}

function normalizeAccountPayload(payload) {
  const list = Array.isArray(payload) ? payload : payload.accounts || payload.items || payload.data || [];
  return list.map((item, index) => ({
    id: item.id || item.accountId || `account-${index}`,
    name: item.name || item.accountName || "",
    billingCountry: item.billingCountry || item.billing_country || item.country || "",
    billingCity: item.billingCity || item.billing_city || "",
    type: item.type || item.accountType || "",
    industry: item.industry || "",
    accountOwnerName: item.accountOwnerName || item.ownerName || "",
    renewalOwnerName: item.renewalOwnerName || "",
    resourceManagerName: item.resourceManagerName || "",
    containerIds: item.containerIds || item.container_ids || []
  }));
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [String(value)];
}

function normalizeUsage(value) {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  return {
    ...value,
    usage_percent: Number(value.usage_percent ?? value.percent ?? 0) || 0
  };
}

function renderOptions(values, selectedValue) {
  return values
    .filter(Boolean)
    .map((value) => `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value === "all" ? "All" : value)}</option>`)
    .join("");
}

function uniqueValues(list, field) {
  return [...new Set(list.map((item) => item[field]).filter(Boolean))].sort();
}

function formatUsage(container) {
  const usage = container.usage || {};
  if (usage.usage_percent) {
    return `${usage.usage_percent}%`;
  }
  if (usage.license_used || usage.license_limit) {
    return `${usage.license_used || 0}/${usage.license_limit || 0}`;
  }
  return "N/A";
}

function renderTabButton(tab, label) {
  return `<button class="tab-button ${irisState.activeTab === tab ? "active" : ""}" data-iris-tab="${tab}" type="button">${label}</button>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
