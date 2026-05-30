export const MODULE_DEFINITIONS = [
  {
    route: "home",
    title: "Home",
    description: "Portal overview and quick access to available modules.",
    icon: "HM",
    visibility: ["admin", "readonly"]
  },
  {
    route: "partner-dashboard",
    title: "Partner Dashboard",
    description: "Partner tracking, certifications, maturity, and email templates.",
    icon: "PD",
    visibility: ["admin", "readonly"]
  },
  {
    route: "iris-dashboard",
    title: "IRIS Dashboard",
    description: "Containers, accounts, usage insights, and local IRIS snapshots.",
    icon: "IR",
    visibility: ["admin", "readonly"]
  },
  {
    route: "mrovere-tasks",
    title: "MROVERE Tasks",
    description: "Claude and Slack task feeds with a local action tracker.",
    icon: "TK",
    visibility: ["admin"]
  },
  {
    route: "admin",
    title: "Admin",
    description: "User profile visibility and manual Firebase onboarding guidance.",
    icon: "AD",
    visibility: ["admin"]
  }
];

const ROLE_ABILITIES = {
  admin: new Set([
    "view-dashboards",
    "view-admin",
    "manage-partner-templates",
    "export-partner-templates",
    "import-iris",
    "clear-iris",
    "manage-tasks",
    "export-tasks",
    "clear-tasks",
    "read-firestore-users"
  ]),
  readonly: new Set(["view-dashboards"])
};

export function isAdmin(userContext) {
  return userContext?.role === "admin";
}

export function getRoleLabel(userContext) {
  return userContext?.role === "admin" ? "Admin" : "Read only";
}

export function getAvailableModules(userContext) {
  const role = userContext?.role;
  return MODULE_DEFINITIONS.filter((module) => module.visibility.includes(role));
}

export function canAccessRoute(userContext, route) {
  return getAvailableModules(userContext).some((module) => module.route === route);
}

export function canPerform(userContext, ability) {
  if (!userContext?.role) {
    return false;
  }

  return ROLE_ABILITIES[userContext.role]?.has(ability) ?? false;
}
