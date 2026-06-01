const DEFAULT_ROUTE = "home";

export const ROUTE_META = {
  home: {
    title: "Home",
    subtitle: "Select a module to continue."
  },
  "partner-dashboard": {
    title: "Partner Dashboard",
    subtitle: "Live workbook parsing, certifications, maturity, and templates."
  },
  "iris-dashboard": {
    title: "IRIS Dashboard",
    subtitle: "Local JSON snapshots, fast filtering, and usage visibility."
  },
  "mrovere-tasks": {
    title: "MROVERE Tasks",
    subtitle: "Daily operational focus powered by local task feeds."
  },
  admin: {
    title: "Admin",
    subtitle: "Manual user onboarding and Firestore user visibility."
  }
};

export function normalizeRoute(routeValue) {
  if (!routeValue) {
    return DEFAULT_ROUTE;
  }

  const cleaned = routeValue.replace(/^#\/?/, "").trim();
  return ROUTE_META[cleaned] ? cleaned : DEFAULT_ROUTE;
}

export function getCurrentRoute() {
  return normalizeRoute(window.location.hash);
}

export function navigateTo(route) {
  const normalized = normalizeRoute(route);
  const nextHash = `#/${normalized}`;

  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
    return;
  }

  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function ensureRoute() {
  if (!window.location.hash) {
    navigateTo(DEFAULT_ROUTE);
  }
}

export function getRouteMeta(route) {
  return ROUTE_META[normalizeRoute(route)];
}
