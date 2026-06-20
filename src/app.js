import {
  getFriendlyAuthError,
  initializeAuthPersistence,
  renderLoginScreen,
  resolveUserContext,
  signInWithEmailPassword,
  signOutUser,
  watchAuthState
} from "./auth.js";
import { renderAdminModule } from "./admin.js";
import { renderIrisDashboard } from "./iris-dashboard.js";
import { renderPartnerDashboard } from "./partner-dashboard.js";
import { renderPovDashboard } from "./pov-dashboard.js";
import { canAccessRoute, getAvailableModules, getRoleLabel } from "./roles.js";
import { ensureRoute, getCurrentRoute, getRouteMeta, navigateTo } from "./router.js";
import { loadLocalData, saveLocalData } from "./storage.js";
import { renderTasksDashboard } from "./tasks-dashboard.js";

const root = document.querySelector("#app");
const UI_KEYS = {
  sidebarCollapsed: "mrovere.apps.ui.sidebarCollapsed",
  lastRoute: "mrovere.apps.ui.lastRoute"
};

const appState = {
  authLoading: true,
  loginLoading: false,
  loginEmail: "",
  loginError: "",
  userContext: null,
  sidebarCollapsed: loadLocalData(UI_KEYS.sidebarCollapsed, false) === true
};

const MODULE_RENDERERS = {
  home: renderHomeModule,
  "partner-dashboard": renderPartnerDashboard,
  "iris-dashboard": renderIrisDashboard,
  "mrovere-tasks": renderTasksDashboard,
  "pov-tracker": renderPovDashboard,
  admin: renderAdminModule
};

initialize();

async function initialize() {
  renderLoadingShell("Preparing Apps MROVERE...");
  registerServiceWorker();
  ensureRoute();

  try {
    await initializeAuthPersistence();
  } catch (error) {
    appState.loginError = error.message;
  }

  watchAuthState(async (firebaseUser) => {
    if (!firebaseUser) {
      appState.authLoading = false;
      appState.userContext = null;
      appState.loginLoading = false;
      renderLogin();
      return;
    }

    renderLoadingShell("Loading your profile...");
    try {
      appState.userContext = await resolveUserContext(firebaseUser);
      appState.authLoading = false;
      appState.loginLoading = false;
      appState.loginError = "";
      restoreLastRoute();
      renderShell();
    } catch (error) {
      appState.userContext = null;
      appState.loginLoading = false;
      appState.loginError = error.message;
      renderLogin();
    }
  });

  window.addEventListener("hashchange", () => {
    if (appState.userContext) {
      renderShell();
    }
  });
}

function renderLogin() {
  renderLoginScreen(root, {
    errorMessage: appState.loginError,
    loading: appState.loginLoading,
    email: appState.loginEmail,
    onSubmit: handleLoginSubmit
  });
}

async function handleLoginSubmit({ email, password }) {
  appState.loginLoading = true;
  appState.loginEmail = email;
  appState.loginError = "";
  renderLogin();

  try {
    await signInWithEmailPassword(email, password);
  } catch (error) {
    appState.loginLoading = false;
    appState.loginError = getFriendlyAuthError(error);
    renderLogin();
  }
}

function renderLoadingShell(message) {
  root.innerHTML = `
    <section class="auth-shell">
      <div class="panel auth-form loading-state">${message}</div>
    </section>
  `;
}

function renderShell() {
  const route = getCurrentRoute();
  const allowedRoute = canAccessRoute(appState.userContext, route) ? route : "home";

  if (allowedRoute !== route) {
    navigateTo("home");
    return;
  }

  const availableModules = getAvailableModules(appState.userContext);
  const routeMeta = getRouteMeta(allowedRoute);
  saveLocalData(UI_KEYS.lastRoute, allowedRoute);

  root.innerHTML = `
    <div class="shell ${appState.sidebarCollapsed ? "sidebar-collapsed" : ""}">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="sidebar-brand-mark" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 28 28" fill="none">
              <polygon points="14,2 24,7.5 24,20.5 14,26 4,20.5 4,7.5" stroke="currentColor" stroke-width="1.5" />
              <polygon points="14,6 21,10 21,18 14,22 7,18 7,10" stroke="currentColor" stroke-width="1" />
              <polygon points="14,10 18,12.5 18,17.5 14,20 10,17.5 10,12.5" stroke="currentColor" stroke-width=".8" />
            </svg>
          </div>
          <div class="sidebar-brand-copy">
            <h1>Apps Mrovere</h1>
            <div class="muted">Internal operations portal</div>
          </div>
        </div>
        <nav class="sidebar-nav">
          ${availableModules
            .map(
              (module) => `
                <a class="nav-link ${module.route === allowedRoute ? "active" : ""}" href="#/${module.route}">
                  <span class="nav-icon">${module.icon}</span>
                  <span class="nav-label">${module.title}</span>
                </a>
              `
            )
            .join("")}
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-footer-copy">
            <strong>${escapeHtml(appState.userContext.name)}</strong>
            <div class="muted">${escapeHtml(appState.userContext.email || "")}</div>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="topbar-left">
            <button id="sidebar-toggle" class="button secondary" type="button">
              <span aria-hidden="true">${appState.sidebarCollapsed ? ">" : "<"}</span>
              <span class="toggle-label">${appState.sidebarCollapsed ? "Menu" : "Hide"}</span>
            </button>
            <div class="topbar-title">
              <h2>${routeMeta.title}</h2>
              <p>${routeMeta.subtitle}</p>
            </div>
          </div>
          <div class="topbar-right">
            <span class="pill">${escapeHtml(getRoleLabel(appState.userContext))}</span>
            <span class="pill">${escapeHtml(appState.userContext.email || "")}</span>
            <button id="logout-button" class="button secondary" type="button">Log out</button>
          </div>
        </header>
        <main id="app-content" class="content"></main>
      </div>
    </div>
  `;

  root.querySelector("#sidebar-toggle")?.addEventListener("click", () => {
    appState.sidebarCollapsed = !appState.sidebarCollapsed;
    saveLocalData(UI_KEYS.sidebarCollapsed, appState.sidebarCollapsed);
    renderShell();
  });

  root.querySelector("#logout-button")?.addEventListener("click", async () => {
    await signOutUser();
  });

  const content = root.querySelector("#app-content");
  MODULE_RENDERERS[allowedRoute]?.(content, appState.userContext);
}

function renderHomeModule(container, userContext) {
  const modules = getAvailableModules(userContext).filter(({ route }) => route !== "home");
  container.innerHTML = `
    <div class="content-stack">
      <section class="home-hero panel">
        <h2>Apps MROVERE</h2>
        <p>
          Use the portal to work across partner execution, IRIS analysis, and daily
          operational follow-up with role-based access controls.
        </p>
      </section>
      <section class="grid-cards">
        ${modules
          .map(
            (module) => `
              <article class="module-card">
                <span class="pill">${module.title}</span>
                <h3>${module.title}</h3>
                <p>${module.description}</p>
                <footer>
                  <span class="muted">Available for ${userContext.role}</span>
                  <a class="button primary" href="#/${module.route}">Open module</a>
                </footer>
              </article>
            `
          )
          .join("")}
      </section>
    </div>
  `;
}

function restoreLastRoute() {
  const route = getCurrentRoute();
  if (route !== "home") {
    return;
  }

  const lastRoute = loadLocalData(UI_KEYS.lastRoute, "home");
  if (lastRoute !== "home" && canAccessRoute(appState.userContext, lastRoute)) {
    navigateTo(lastRoute);
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
