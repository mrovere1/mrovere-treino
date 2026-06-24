import { canAccessRoute } from "../roles.js";

const POV_API_ORIGIN = "https://mcp.mrovere.com";

export async function getPovSummary(userContext) {
  const result = {
    module: "pov-tracker",
    access: false,
    status: "no_access",
    metrics: null,
    attentionItems: [],
    upcomingItems: [],
    lastUpdated: null
  };

  if (!canAccessRoute(userContext, "pov-tracker")) {
    return result;
  }

  result.access = true;

  try {
    const token = await userContext.getIdToken();
    const resp = await fetch(`${POV_API_ORIGIN}/pov/povs`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!resp.ok) {
      throw new Error(`POV API respondeu ${resp.status}`);
    }

    const data = await resp.json();
    const povs = data.povs || [];

    if (!povs.length) {
      result.status = "empty";
      result.metrics = { active: 0, atRisk: 0, overdue: 0, upcoming7: 0, progressAvg: 0, total: 0 };
      return result;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7 = new Date(today.getTime() + 7 * 86400000);

    const active = povs.filter((p) => p.stage !== "closed");
    const atRisk = active.filter((p) => ["at_risk", "blocked"].includes(p.health_status));
    const overdueByStatus = active.filter((p) => p.health_status === "overdue");
    const overdueByDate = active.filter(
      (p) =>
        p.health_status !== "overdue" &&
        p.target_end_date &&
        new Date(p.target_end_date) < today
    );
    const overdue = [...overdueByStatus, ...overdueByDate];
    const upcoming7 = active.filter((p) => {
      if (!p.target_end_date) return false;
      const end = new Date(p.target_end_date);
      return end >= today && end <= in7;
    });

    const progressValues = active.map((p) => p.lifecycle_summary?.criteria_pct ?? 0);
    const progressAvg = progressValues.length
      ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
      : 0;

    result.metrics = {
      total: povs.length,
      active: active.length,
      atRisk: atRisk.length,
      overdue: overdue.length,
      upcoming7: upcoming7.length,
      progressAvg
    };

    // Attention: at_risk + overdue, deduplicated
    const seen = new Set();
    const attentionPovs = [...atRisk, ...overdue].filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    result.attentionItems = attentionPovs.slice(0, 5).map((p) => ({
      module: "pov-tracker",
      title: p.title || "POV sem título",
      subtitle: p.customer_name || "",
      severity: p.health_status === "overdue" ? "critical" : "high",
      date: p.target_end_date || null,
      route: "pov-tracker",
      id: p.id
    }));

    result.upcomingItems = upcoming7
      .sort((a, b) => new Date(a.target_end_date) - new Date(b.target_end_date))
      .slice(0, 5)
      .map((p) => {
        const days = Math.ceil((new Date(p.target_end_date) - today) / 86400000);
        return {
          module: "pov-tracker",
          title: p.title || "POV sem título",
          subtitle: p.customer_name || "",
          date: p.target_end_date,
          days,
          route: "pov-tracker",
          id: p.id
        };
      });

    result.status = "ok";
    result.lastUpdated = new Date().toISOString();
    return result;
  } catch (error) {
    console.warn("[home:pov]", error.message);
    result.status = "error";
    result.error = error.message;
    return result;
  }
}
