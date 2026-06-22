export const MODULE_DEFINITIONS = [
  {
    route: "home",
    title: "Home",
    description: "Portal overview and quick access to available modules.",
    icon: "HM",
    visibility: ["admin", "se", "readonly"]
  },
  {
    route: "pov-tracker",
    title: "POV Tracker",
    description: "Track Tenable POV execution, evidence, milestones, and reports.",
    icon: "PV",
    visibility: ["admin", "se"],
    requiresProfileFlag: "povAccess"
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
    description: "Personal Channel SE task tracker and daily briefs (Google Drive).",
    icon: "TK",
    visibility: ["admin"],
    // Only shown to users whose Firestore profile has this field set.
    // Ties both menu visibility AND the Apps Script endpoint to the identity.
    requiresProfileFlag: "tasksEndpoint"
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
  readonly: new Set(["view-dashboards"]),
  se: new Set(["manage-own-povs"])
};

export function isAdmin(userContext) {
  return userContext?.role === "admin";
}

export function getRoleLabel(userContext) {
  if (userContext?.role === "admin") {
    return "Admin";
  }
  return userContext?.role === "se" ? "SE" : "Read only";
}

export function getAvailableModules(userContext) {
  const role = userContext?.role;
  return MODULE_DEFINITIONS.filter((module) => {
    if (!module.visibility.includes(role)) {
      return false;
    }
    // Per-user gate: module only appears when the profile field is present.
    if (module.requiresProfileFlag && !userContext?.profile?.[module.requiresProfileFlag]) {
      return false;
    }
    return true;
  });
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
