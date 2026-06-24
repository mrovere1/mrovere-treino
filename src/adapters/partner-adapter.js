import { canAccessRoute } from "../roles.js";
import {
  loadAccreditationRequirements,
  loadPartnerWorkbook,
  parseGuardianSheet,
  parsePartnerWorkbook
} from "../partner-excel.js";

const LOAD_TIMEOUT_MS = 8000;

export async function getPartnerSummary(userContext) {
  const result = {
    module: "partner-dashboard",
    access: false,
    status: "no_access",
    metrics: null,
    attentionItems: [],
    upcomingItems: [],
    lastUpdated: null
  };

  if (!canAccessRoute(userContext, "partner-dashboard")) {
    return result;
  }

  result.access = true;

  try {
    const { partners, guardians } = await Promise.race([
      _loadData(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout ao carregar dados de parceiros")), LOAD_TIMEOUT_MS)
      )
    ]);

    if (!partners.length) {
      result.status = "empty";
      result.metrics = {
        total: 0,
        accredited: 0,
        introCert: 0,
        inProgress: 0,
        pending: 0,
        guardians: 0,
        guardiansComplete: 0
      };
      return result;
    }

    const accredited = partners.filter((p) => p.computed.accreditationReady);
    const introCert = partners.filter((p) => p.computed.introCertified);
    const inProgress = partners.filter(
      (p) => !p.computed.accreditationReady && p.computed.programProgress.totalDone > 0
    );
    const pending = partners.filter((p) => p.computed.programProgress.totalDone === 0);

    result.metrics = {
      total: partners.length,
      accredited: accredited.length,
      introCert: introCert.length,
      inProgress: inProgress.length,
      pending: pending.length,
      guardians: guardians.length,
      guardiansComplete: guardians.filter((g) => g.computed.allComplete).length
    };

    // Attention: partners with no progress at all
    result.attentionItems = pending.slice(0, 3).map((p) => ({
      module: "partner-dashboard",
      title: p.partnerName,
      subtitle: "Nenhum curso concluído",
      severity: "medium",
      date: null,
      route: "partner-dashboard",
      id: p.partnerId
    }));

    // Upcoming: partners closest to completing (highest programProgress %)
    result.upcomingItems = inProgress
      .sort((a, b) => b.computed.programProgress.percentage - a.computed.programProgress.percentage)
      .slice(0, 5)
      .map((p) => ({
        module: "partner-dashboard",
        title: p.partnerName,
        subtitle: `${p.computed.programProgress.percentage}% concluído · ${p.computed.missingCourses.length} curso${p.computed.missingCourses.length !== 1 ? "s" : ""} faltando`,
        date: null,
        days: null,
        route: "partner-dashboard",
        id: p.partnerId
      }));

    result.status = "ok";
    result.lastUpdated = new Date().toISOString();
    return result;
  } catch (error) {
    console.warn("[home:partner]", error.message);
    result.status = "error";
    result.error = error.message;
    return result;
  }
}

async function _loadData() {
  const [workbook, requirements] = await Promise.all([
    loadPartnerWorkbook(),
    loadAccreditationRequirements()
  ]);
  return {
    partners: parsePartnerWorkbook(workbook, requirements),
    guardians: parseGuardianSheet(workbook)
  };
}
