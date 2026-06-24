import { canAccessRoute } from "../roles.js";

export async function getTasksSummary(userContext) {
  const result = {
    module: "mrovere-tasks",
    access: false,
    status: "no_access",
    metrics: null,
    attentionItems: [],
    upcomingItems: [],
    lastUpdated: null
  };

  if (!canAccessRoute(userContext, "mrovere-tasks")) {
    return result;
  }

  result.access = true;

  const endpoint = userContext?.profile?.tasksEndpoint;
  const token = userContext?.profile?.tasksToken || "";

  if (!endpoint) {
    result.status = "integration_pending";
    return result;
  }

  try {
    const url =
      endpoint +
      (endpoint.includes("?") ? "&" : "?") +
      (token ? `token=${encodeURIComponent(token)}` : "");

    const resp = await fetch(url, { method: "GET", redirect: "follow" });

    if (!resp.ok) {
      throw new Error(`Tasks API respondeu ${resp.status}`);
    }

    const data = await resp.json();

    if (!data.ok) {
      throw new Error(data.error || "Tasks API retornou erro");
    }

    const allTasks = data.tasks || [];
    const tasks = allTasks.filter((t) => !t.parentId); // top-level only

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const in7 = new Date(todayStart.getTime() + 7 * 86400000);

    const open = tasks.filter((t) => !t.done && t.status !== "done");
    const overdue = open.filter(
      (t) => t.targetDate && new Date(t.targetDate) < todayStart
    );
    const upcoming7 = open.filter((t) => {
      if (!t.targetDate) return false;
      const d = new Date(t.targetDate);
      return d >= todayStart && d <= in7;
    });

    const byCategory = {};
    open.forEach((t) => {
      const cat = t.category || "Outros";
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    result.metrics = {
      total: tasks.length,
      open: open.length,
      overdue: overdue.length,
      upcoming7: upcoming7.length,
      byCategory
    };

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    result.attentionItems = overdue
      .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9))
      .slice(0, 5)
      .map((t) => {
        const daysPast = Math.ceil(
          (todayStart - new Date(t.targetDate)) / 86400000
        );
        return {
          module: "mrovere-tasks",
          title: t.title || "Task sem título",
          subtitle: t.category
            ? `${t.category} · vencida há ${daysPast}d`
            : `Vencida há ${daysPast}d`,
          severity: t.priority === "high" ? "critical" : "high",
          date: t.targetDate,
          route: "mrovere-tasks",
          id: t.id
        };
      });

    result.upcomingItems = upcoming7
      .sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate))
      .slice(0, 5)
      .map((t) => {
        const days = Math.ceil((new Date(t.targetDate) - todayStart) / 86400000);
        return {
          module: "mrovere-tasks",
          title: t.title || "Task sem título",
          subtitle: t.category || "",
          date: t.targetDate,
          days,
          route: "mrovere-tasks",
          id: t.id
        };
      });

    result.status = "ok";
    result.lastUpdated = new Date().toISOString();
    return result;
  } catch (error) {
    console.warn("[home:tasks]", error.message);
    result.status = "error";
    result.error = error.message;
    return result;
  }
}
