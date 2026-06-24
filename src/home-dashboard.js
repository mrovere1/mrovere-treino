import { navigateTo } from "./router.js";
import { getPovSummary } from "./adapters/pov-adapter.js";
import { getIrisSummary } from "./adapters/iris-adapter.js";
import { getTasksSummary } from "./adapters/tasks-adapter.js";
import { getPartnerSummary } from "./adapters/partner-adapter.js";

const MODULE_LABELS = {
  "pov-tracker": "POV Tracker",
  "iris-dashboard": "IRIS",
  "mrovere-tasks": "Tasks",
  "partner-dashboard": "Partner"
};

const MODULE_ICONS = {
  "pov-tracker": "PV",
  "iris-dashboard": "IR",
  "mrovere-tasks": "TK",
  "partner-dashboard": "PD"
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

let _container = null;
let _userContext = null;
let _loading = false;

export async function renderHomeDashboard(container, userContext) {
  _container = container;
  _userContext = userContext;
  _renderSkeleton();
  await _refresh();
}

async function _refresh() {
  if (_loading) return;
  _loading = true;
  _setRefreshState(true);

  try {
    const [pov, iris, tasks, partner] = await Promise.allSettled([
      getPovSummary(_userContext),
      getIrisSummary(_userContext),
      getTasksSummary(_userContext),
      getPartnerSummary(_userContext)
    ]);

    const results = {
      pov: pov.status === "fulfilled" ? pov.value : _fallback("pov-tracker"),
      iris: iris.status === "fulfilled" ? iris.value : _fallback("iris-dashboard"),
      tasks: tasks.status === "fulfilled" ? tasks.value : _fallback("mrovere-tasks"),
      partner: partner.status === "fulfilled" ? partner.value : _fallback("partner-dashboard")
    };

    _renderDashboard(results);
  } finally {
    _loading = false;
    _setRefreshState(false);
  }
}

function _fallback(module) {
  return { module, access: true, status: "error", metrics: null, attentionItems: [], upcomingItems: [] };
}

// ---------------------------------------------------------------- skeleton

function _renderSkeleton() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="hd-shell">
      <div class="hd-topbar">
        <div>
          <div class="hd-skeleton" style="width:200px;height:22px"></div>
          <div class="hd-skeleton" style="width:140px;height:14px;margin-top:7px"></div>
        </div>
        <button class="button secondary" disabled>Atualizar</button>
      </div>
      <div class="hd-kpis">
        ${[1, 2, 3, 4]
          .map(
            () => `
          <article class="panel hd-kpi">
            <div class="hd-skeleton" style="height:42px;margin-bottom:8px"></div>
            <div class="hd-skeleton" style="width:70%;height:12px"></div>
          </article>`
          )
          .join("")}
      </div>
      <div class="hd-modules">
        ${[1, 2, 3, 4]
          .map(
            () => `
          <article class="panel hd-module-card">
            <div class="hd-skeleton" style="height:28px;width:60%;margin-bottom:12px"></div>
            <div class="hd-skeleton" style="height:60px;margin-bottom:10px"></div>
            <div class="hd-skeleton" style="height:34px"></div>
          </article>`
          )
          .join("")}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------- main render

function _renderDashboard(results) {
  if (!_container) return;

  const modules = [results.pov, results.tasks, results.partner, results.iris];
  const accessible = modules.filter((r) => r.access);
  const loaded = accessible.filter((r) => r.status === "ok");

  const globalActive = _sum(loaded, (r) => {
    if (r.module === "pov-tracker") return r.metrics?.active ?? 0;
    if (r.module === "mrovere-tasks") return r.metrics?.open ?? 0;
    if (r.module === "iris-dashboard") return r.metrics?.active ?? 0;
    if (r.module === "partner-dashboard") return r.metrics?.inProgress ?? 0;
    return 0;
  });

  const globalAttention = _sum(loaded, (r) => r.attentionItems?.length ?? 0);

  const globalOverdue = _sum(loaded, (r) => {
    if (r.module === "pov-tracker") return r.metrics?.overdue ?? 0;
    if (r.module === "mrovere-tasks") return r.metrics?.overdue ?? 0;
    return 0;
  });

  const globalUpcoming = _sum(loaded, (r) => r.upcomingItems?.length ?? 0);

  const allAttention = loaded
    .flatMap((r) => r.attentionItems || [])
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .slice(0, 8);

  const allUpcoming = loaded
    .flatMap((r) => r.upcomingItems || [])
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    })
    .slice(0, 8);

  const now = new Date();
  const greeting = _greeting(now);
  const dateStr = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  _container.innerHTML = `
    <div class="hd-shell">
      <div class="hd-topbar">
        <div>
          <h2 class="hd-greeting">${_esc(greeting)}</h2>
          <p class="muted">${_esc(dateStr)} · ${loaded.length}/${accessible.length} módulos carregados</p>
        </div>
        <button class="button secondary" id="hd-refresh-btn">Atualizar</button>
      </div>

      <div class="hd-modules">
        ${_moduleCard(results.pov)}
        ${_moduleCard(results.tasks)}
        ${_moduleCard(results.partner)}
        ${_moduleCard(results.iris)}
      </div>

      <div class="hd-kpis">
        ${_kpi(globalActive, "Itens ativos", "")}
        ${_kpi(globalAttention, "Requer atenção", globalAttention > 0 ? "warning" : "")}
        ${_kpi(globalOverdue, "Vencidos", globalOverdue > 0 ? "danger" : "")}
        ${_kpi(globalUpcoming, "Próx. 7 dias", globalUpcoming > 0 ? "upcoming" : "")}
      </div>

      ${
        allAttention.length
          ? `
        <section class="panel hd-section">
          <div class="hd-section-head">
            <h3>Requer atenção</h3>
            <span class="pill warning">${allAttention.length}</span>
          </div>
          <div class="hd-item-list">
            ${allAttention.map(_attentionItem).join("")}
          </div>
        </section>`
          : ""
      }

      ${
        allUpcoming.length
          ? `
        <section class="panel hd-section">
          <div class="hd-section-head">
            <h3>Próximos 7 dias</h3>
          </div>
          <div class="hd-item-list">
            ${allUpcoming.map(_upcomingItem).join("")}
          </div>
        </section>`
          : ""
      }
    </div>
  `;

  _container.querySelector("#hd-refresh-btn")?.addEventListener("click", () => _refresh());

  _container.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigateTo(el.dataset.nav));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") navigateTo(el.dataset.nav);
    });
  });
}

// ---------------------------------------------------------------- KPI card

function _kpi(value, label, modifier) {
  return `
    <article class="panel hd-kpi${modifier ? ` hd-kpi--${modifier}` : ""}">
      <div class="hd-kpi-value">${value}</div>
      <div class="hd-kpi-label">${_esc(label)}</div>
    </article>`;
}

// ---------------------------------------------------------------- module card

function _moduleCard(result) {
  const route = result.module;
  const label = MODULE_LABELS[route] || route;
  const icon = MODULE_ICONS[route] || "??";

  if (!result.access) {
    return `
      <article class="panel hd-module-card hd-module-card--locked">
        <div class="hd-module-head">
          <span class="hd-module-icon">${icon}</span>
          <span class="hd-module-title">${_esc(label)}</span>
        </div>
        <p class="muted" style="font-size:0.85rem">Sem acesso.</p>
      </article>`;
  }

  if (result.status === "integration_pending") {
    return `
      <article class="panel hd-module-card">
        <div class="hd-module-head">
          <span class="hd-module-icon">${icon}</span>
          <span class="hd-module-title">${_esc(label)}</span>
        </div>
        <p class="muted" style="font-size:0.85rem;flex:1">Integração não configurada.</p>
        <button class="button secondary hd-open-btn" data-nav="${route}">Configurar</button>
      </article>`;
  }

  if (result.status === "error") {
    return `
      <article class="panel hd-module-card hd-module-card--error">
        <div class="hd-module-head">
          <span class="hd-module-icon">${icon}</span>
          <span class="hd-module-title">${_esc(label)}</span>
        </div>
        <p class="muted" style="font-size:0.85rem;flex:1">Erro ao carregar dados.</p>
        <button class="button secondary hd-open-btn" data-nav="${route}">Abrir módulo</button>
      </article>`;
  }

  if (result.status === "empty") {
    return `
      <article class="panel hd-module-card">
        <div class="hd-module-head">
          <span class="hd-module-icon">${icon}</span>
          <span class="hd-module-title">${_esc(label)}</span>
        </div>
        <p class="muted" style="font-size:0.85rem;flex:1">Nenhum dado disponível.</p>
        <button class="button secondary hd-open-btn" data-nav="${route}">Abrir módulo</button>
      </article>`;
  }

  const rows = _metricRows(result);
  const hasAttention = (result.attentionItems?.length ?? 0) > 0;

  return `
    <article class="panel hd-module-card">
      <div class="hd-module-head">
        <span class="hd-module-icon">${icon}</span>
        <span class="hd-module-title">${_esc(label)}</span>
        ${hasAttention ? `<span class="pill warning" style="margin-left:auto;font-size:0.75rem">${result.attentionItems.length} atenção</span>` : ""}
      </div>
      <div class="hd-module-metrics">
        ${rows
          .map(
            (r) => `
          <div class="hd-metric-row">
            <span class="hd-metric-label">${_esc(r.label)}</span>
            <span class="hd-metric-value${r.modifier ? ` ${r.modifier}` : ""}">${_esc(String(r.value))}</span>
          </div>`
          )
          .join("")}
      </div>
      <button class="button primary hd-open-btn" data-nav="${route}">Abrir módulo</button>
    </article>`;
}

function _metricRows(result) {
  const m = result.metrics || {};
  switch (result.module) {
    case "pov-tracker":
      return [
        { label: "POVs ativas", value: m.active ?? 0 },
        { label: "Em risco", value: m.atRisk ?? 0, modifier: m.atRisk > 0 ? "hd-metric--warn" : "" },
        { label: "Vencidas", value: m.overdue ?? 0, modifier: m.overdue > 0 ? "hd-metric--danger" : "" },
        { label: "Progresso médio", value: `${m.progressAvg ?? 0}%` }
      ];
    case "mrovere-tasks":
      return [
        { label: "Tasks abertas", value: m.open ?? 0 },
        { label: "Vencidas", value: m.overdue ?? 0, modifier: m.overdue > 0 ? "hd-metric--danger" : "" },
        { label: "Próx. 7 dias", value: m.upcoming7 ?? 0 }
      ];
    case "iris-dashboard":
      return [
        { label: "Containers", value: m.total ?? 0 },
        { label: "Ativos", value: m.active ?? 0 },
        { label: "Trial", value: m.trial ?? 0 },
        { label: "Uso > 90%", value: m.highUsage ?? 0, modifier: m.highUsage > 0 ? "hd-metric--warn" : "" }
      ];
    case "partner-dashboard":
      return [
        { label: "Parceiros rastreados", value: m.total ?? 0 },
        { label: "EM Accreditation", value: m.accredited ?? 0 },
        { label: "Em progresso", value: m.inProgress ?? 0 },
        { label: "Guardians completos", value: m.guardiansComplete ?? 0 }
      ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- list items

function _attentionItem(item) {
  const badgeClass = { critical: "danger", high: "warning", medium: "" }[item.severity] || "";
  const label = MODULE_LABELS[item.module] || item.module;
  return `
    <div class="hd-list-item" data-nav="${item.route}" role="button" tabindex="0">
      <span class="pill ${badgeClass} hd-list-badge">${_esc(label)}</span>
      <div class="hd-list-body">
        <div class="hd-list-title">${_esc(item.title)}</div>
        ${item.subtitle ? `<div class="muted" style="font-size:0.82rem">${_esc(item.subtitle)}</div>` : ""}
      </div>
      ${item.date ? `<span class="muted hd-list-date">${_fmtDate(item.date)}</span>` : ""}
    </div>`;
}

function _upcomingItem(item) {
  const label = MODULE_LABELS[item.module] || item.module;
  const daysLabel =
    item.days != null
      ? item.days === 0
        ? "Hoje"
        : item.days === 1
          ? "Amanhã"
          : `Em ${item.days}d`
      : "";
  return `
    <div class="hd-list-item" data-nav="${item.route}" role="button" tabindex="0">
      <span class="pill hd-list-badge">${_esc(label)}</span>
      <div class="hd-list-body">
        <div class="hd-list-title">${_esc(item.title)}</div>
        ${item.subtitle ? `<div class="muted" style="font-size:0.82rem">${_esc(item.subtitle)}</div>` : ""}
      </div>
      ${daysLabel ? `<span class="pill hd-list-days">${_esc(daysLabel)}</span>` : ""}
    </div>`;
}

// ---------------------------------------------------------------- helpers

function _setRefreshState(loading) {
  const btn = _container?.querySelector("#hd-refresh-btn");
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "Carregando..." : "Atualizar";
}

function _sum(arr, fn) {
  return arr.reduce((acc, item) => acc + (fn(item) || 0), 0);
}

function _greeting(now) {
  const h = now.getHours();
  if (h < 12) return "Bom dia, Marcelo";
  if (h < 18) return "Boa tarde, Marcelo";
  return "Boa noite, Marcelo";
}

function _fmtDate(dateStr) {
  try {
    const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return dateStr;
  }
}

function _esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
