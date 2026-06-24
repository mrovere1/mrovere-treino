import { canAccessRoute } from "../roles.js";
import { getAllRecords, getRecord } from "../storage.js";

export async function getIrisSummary(userContext) {
  const result = {
    module: "iris-dashboard",
    access: false,
    status: "no_access",
    metrics: null,
    attentionItems: [],
    upcomingItems: [],
    lastUpdated: null
  };

  if (!canAccessRoute(userContext, "iris-dashboard")) {
    return result;
  }

  result.access = true;

  try {
    let containers = await getAllRecords("irisContainers");
    let meta = await getRecord("irisMeta", "snapshot");

    // Fallback: attempt to load static file when IndexedDB is empty
    if (!containers.length) {
      try {
        const resp = await fetch("./data/iris/latest.json", { cache: "no-store" });
        if (resp.ok) {
          const payload = await resp.json();
          containers = _normalizeContainers(payload.containers || []);
          if (!meta) {
            meta = { snapshotName: payload.captured_at };
          }
        }
      } catch {
        // static file unavailable — continue with empty list
      }
    }

    if (!containers.length) {
      result.status = "empty";
      result.metrics = { total: 0, active: 0, trial: 0, expiringSoon: 0, highUsage: 0 };
      return result;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today.getTime() + 30 * 86400000);

    const active = containers.filter((c) => c.status === "active");
    const trial = containers.filter((c) => c.status === "trial");
    const expiringSoon = containers.filter((c) => {
      if (!c.expires_at) return false;
      const exp = new Date(c.expires_at);
      return exp >= today && exp <= in30;
    });
    const highUsage = containers.filter((c) => (c.usage?.usage_percent ?? 0) >= 90);

    result.metrics = {
      total: containers.length,
      active: active.length,
      trial: trial.length,
      expiringSoon: expiringSoon.length,
      highUsage: highUsage.length
    };

    // Attention: high usage first, then expiring soon
    const highUsageItems = highUsage.map((c) => ({
      module: "iris-dashboard",
      title: c.name || c.account || "Container",
      subtitle: `${c.usage?.usage_percent ?? 0}% de licenças em uso`,
      severity: (c.usage?.usage_percent ?? 0) >= 95 ? "critical" : "high",
      date: c.expires_at || null,
      route: "iris-dashboard",
      id: c.id
    }));

    const highUsageIds = new Set(highUsage.map((c) => c.id));
    const expiringItems = expiringSoon
      .filter((c) => !highUsageIds.has(c.id))
      .map((c) => {
        const days = Math.ceil((new Date(c.expires_at) - today) / 86400000);
        return {
          module: "iris-dashboard",
          title: c.name || c.account || "Container",
          subtitle: `Expira em ${days} dia${days !== 1 ? "s" : ""}`,
          severity: days <= 7 ? "high" : "medium",
          date: c.expires_at,
          route: "iris-dashboard",
          id: c.id
        };
      });

    result.attentionItems = [...highUsageItems, ...expiringItems].slice(0, 5);

    result.upcomingItems = expiringSoon
      .sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at))
      .slice(0, 5)
      .map((c) => {
        const days = Math.ceil((new Date(c.expires_at) - today) / 86400000);
        return {
          module: "iris-dashboard",
          title: c.name || c.account || "Container",
          subtitle: c.account ? `${c.account} · ${c.status}` : c.status,
          date: c.expires_at,
          days,
          route: "iris-dashboard",
          id: c.id
        };
      });

    result.status = "ok";
    result.lastUpdated = meta?.snapshotName || new Date().toISOString();
    return result;
  } catch (error) {
    console.warn("[home:iris]", error.message);
    result.status = "error";
    result.error = error.message;
    return result;
  }
}

function _normalizeContainers(raw) {
  return raw.map((c) => ({
    id: c.id || String(Math.random()),
    name: c.name || "",
    account: c.account || "",
    status: c.status || c.state || "active",
    expires_at: c.expires_at || c.expiresAt || c.expiration_date || "",
    usage: {
      license_used: c.usage?.license_used ?? 0,
      license_limit: c.usage?.license_limit ?? 0,
      usage_percent: c.usage?.usage_percent ?? 0
    }
  }));
}
