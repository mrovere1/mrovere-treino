import { canPerform } from "./roles.js";
import {
  createTemplateDraft,
  exportTemplatesJson,
  loadPartnerTemplates,
  persistTemplate,
  renderTemplatePreview,
  savePartnerTemplateVersion,
  TEMPLATE_VARIABLES
} from "./partner-templates.js";
import {
  loadAccreditationRequirements,
  loadPartnerWorkbook,
  parsePartnerWorkbook
} from "./partner-excel.js";

const partnerState = {
  activeTab: "overview",
  selectedTemplateId: null,
  selectedPartnerId: null,
  partners: [],
  requirements: null,
  templates: []
};

export async function renderPartnerDashboard(container, userContext) {
  container.innerHTML = `<div class="loading-state">Loading partner workbook and templates...</div>`;

  try {
    const [workbook, requirements, templates] = await Promise.all([
      loadPartnerWorkbook(),
      loadAccreditationRequirements(),
      loadPartnerTemplates()
    ]);

    partnerState.partners = parsePartnerWorkbook(workbook, requirements);
    partnerState.requirements = requirements;
    partnerState.templates = templates;
    partnerState.selectedTemplateId = partnerState.selectedTemplateId || templates[0]?.id || null;
    partnerState.selectedPartnerId =
      partnerState.selectedPartnerId || partnerState.partners[0]?.partnerId || null;

    drawPartnerModule(container, userContext);
  } catch (error) {
    container.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

export function renderPartnerOverview(partners) {
  const readyCount = partners.filter((partner) => partner.computed.accreditationReady).length;
  const introReady = partners.filter((partner) => partner.computed.introCertified).length;
  const theoryDone = partners.filter((partner) => partner.theoryCompleted).length;
  const inProgress = partners.filter((partner) => partner.computed.missingCourses.length).length;

  return `
    <section class="partner-grid4">
      <article class="stat-card panel">
        <h3>Tracked partners</h3>
        <div class="stat-value">${partners.length}</div>
        <p class="muted">Focus partners BR</p>
      </article>
      <article class="stat-card panel">
        <h3>Intro CERT complete</h3>
        <div class="stat-value">${introReady}</div>
        <p class="muted">Accredited in this stage</p>
      </article>
      <article class="stat-card panel">
        <h3>EM theory done</h3>
        <div class="stat-value">${theoryDone}</div>
        <p class="muted">Theory course completed</p>
      </article>
      <article class="stat-card panel">
        <h3>In progress</h3>
        <div class="stat-value">${inProgress}</div>
        <p class="muted">Need follow-up</p>
      </article>
    </section>
    <section class="panel card-table">
      <header>
        <div>
          <h3>Partner status</h3>
          <p class="muted">Live status computed from the current workbook and accreditation rules.</p>
        </div>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Partner</th>
              <th>Tier</th>
              <th>Contact</th>
              <th>Intro CERT</th>
              <th>SP CERT</th>
              <th>EM theory</th>
              <th>Accreditation</th>
              <th>Program progress</th>
            </tr>
          </thead>
          <tbody>
            ${partners
              .map(
                (partner) => `
                  <tr>
                    <td><strong>${escapeHtml(partner.partnerName)}</strong></td>
                    <td>${renderTierBadge(partner.status)}</td>
                    <td class="muted">${escapeHtml(partner.primaryContact || "-")}</td>
                    <td>${renderProgressPill(partner.computed.introCertified, partner.computed.missingIntroCourses)}</td>
                    <td>${renderProgressPill(partner.computed.specialistCertified, partner.computed.missingSpecialistCourses)}</td>
                    <td>${renderStatusPill(partner.theoryCompleted)}</td>
                    <td>${renderProgressPill(partner.computed.accreditationReady, partner.computed.missingCourses)}</td>
                    <td>${renderProgramProgress(partner)}</td>
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

export function renderPartnerCerts(partners) {
  return `
    <section class="panel card-table">
      <header>
        <div>
          <h3>Course detail by partner</h3>
          <p class="muted">Rules: Intro = required courses plus grouped choices. Specialist = required courses plus 1-of-2 and 2-of-3 rules.</p>
        </div>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Partner</th>
              <th>Tier</th>
              <th>Intro courses</th>
              <th>Intro CERT</th>
              <th>Specialist courses</th>
              <th>SP CERT</th>
              <th>Theory</th>
              <th>Program progress</th>
            </tr>
          </thead>
          <tbody>
            ${partners
              .map(
                (partner) => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(partner.partnerName)}</strong>
                      <div class="muted">${escapeHtml(partner.primaryContact || "")}</div>
                    </td>
                    <td>${renderTierBadge(partner.status)}</td>
                    <td>${renderCourseList("intro", partner.introCourses)}</td>
                    <td>${renderProgressPill(partner.computed.introCertified, partner.computed.missingIntroCourses)}</td>
                    <td>${renderCourseList("specialist", partner.specialistCourses)}</td>
                    <td>${renderProgressPill(partner.computed.specialistCertified, partner.computed.missingSpecialistCourses)}</td>
                    <td>${renderStatusPill(partner.theoryCompleted)}</td>
                    <td>${renderProgramProgress(partner)}</td>
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

export function renderPartnerMaturity(partners) {
  return `
    <section class="panel card-table">
      <header>
        <div>
          <h3>Maturity overview</h3>
          <p class="muted">Current and target maturity values are read from the workbook at runtime.</p>
        </div>
      </header>
      <div class="table-wrap">
        <table class="maturity-table">
          <thead>
            <tr>
              <th rowspan="2">Partner</th>
              <th rowspan="2">Tier</th>
              <th class="maturity-group maturity-group-delivery" colspan="4">EM Delivery (Deployment)</th>
              <th class="maturity-group maturity-group-presales" colspan="4">Pre-Sales Delivery (PoV)</th>
            </tr>
            <tr>
              <th class="maturity-delivery maturity-delivery-start">EM</th>
              <th class="maturity-delivery">VM/WAS</th>
              <th class="maturity-delivery">CS</th>
              <th class="maturity-delivery maturity-delivery-end">TPM</th>
              <th class="maturity-presales maturity-presales-start">EM</th>
              <th class="maturity-presales">VM/WAS</th>
              <th class="maturity-presales">CS</th>
              <th class="maturity-presales">TPM</th>
            </tr>
          </thead>
          <tbody>
            ${partners
              .map(
                (partner) => `
                  <tr>
                    <td><strong>${escapeHtml(partner.partnerName)}</strong></td>
                    <td>${renderTierBadge(partner.status)}</td>
                    <td class="maturity-delivery-start">${renderMaturityValue(partner.maturity.current.EM)}</td>
                    <td>${renderMaturityValue(partner.maturity.current["VM/WAS"])}</td>
                    <td>${renderMaturityValue(partner.maturity.current.CS)}</td>
                    <td class="maturity-delivery-end">${renderMaturityValue(partner.maturity.current.TPM)}</td>
                    <td class="maturity-presales-start">${renderMaturityValue(partner.maturity.target.EM)}</td>
                    <td>${renderMaturityValue(partner.maturity.target["VM/WAS"])}</td>
                    <td>${renderMaturityValue(partner.maturity.target.CS)}</td>
                    <td>${renderMaturityValue(partner.maturity.target.TPM)}</td>
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

export function renderEmailTemplates(userContext) {
  const selectedTemplate =
    partnerState.templates.find((template) => template.id === partnerState.selectedTemplateId) ||
    partnerState.templates[0];
  const samplePartner =
    partnerState.partners.find((partner) => partner.partnerId === partnerState.selectedPartnerId) ||
    partnerState.partners[0];
  const sampleData = buildTemplateSampleData(samplePartner);

  return `
    <section class="partner-template-grid">
      <article class="panel template-list">
        <div class="section-heading">
          <h3>Email templates</h3>
          ${
            canPerform(userContext, "manage-partner-templates")
              ? '<button id="new-template-button" class="button secondary" type="button">New template</button>'
              : ""
          }
        </div>
        ${partnerState.templates
          .map(
            (template) => `
              <button
                class="template-item ${template.id === selectedTemplate.id ? "active" : ""}"
                data-template-select="${template.id}"
                type="button"
              >
                <strong>${escapeHtml(template.name)}</strong>
              </button>
            `
          )
          .join("")}
        <div class="template-repository-note">
          Seed templates live under <code>data/partner/templates</code>. Browser edits are saved locally until exported.
        </div>
      </article>
      <div class="template-stack">
        <article class="panel template-partner-picker">
          <div class="section-heading">
            <h3>Partner context</h3>
            <span class="pill">${escapeHtml(samplePartner?.status || "No tier")}</span>
          </div>
          <div class="field">
            <label for="template-partner">Compose using partner data</label>
            <select id="template-partner">
              ${partnerState.partners
                .map(
                  (partner) => `
                    <option value="${escapeHtml(partner.partnerId)}" ${partner.partnerId === samplePartner?.partnerId ? "selected" : ""}>
                      ${escapeHtml(partner.partnerName)} (${escapeHtml(partner.status || "No tier")})
                    </option>
                  `
                )
                .join("")}
            </select>
          </div>
          <div class="template-context-grid">
            <article>
              <strong>Completed courses</strong>
              <p>${escapeHtml(sampleData.completed_courses || "None")}</p>
            </article>
            <article>
              <strong>Missing courses</strong>
              <p>${escapeHtml(sampleData.missing_courses || "None")}</p>
            </article>
          </div>
        </article>
        <article class="panel template-editor">
          <div class="section-heading">
            <h3>${escapeHtml(selectedTemplate.name)}</h3>
            <div class="toolbar">
              ${
                canPerform(userContext, "manage-partner-templates")
                  ? `
                    <button id="save-template-button" class="button primary" type="button">Save</button>
                    <button id="version-template-button" class="button secondary" type="button">Save new version</button>
                  `
                  : ""
              }
              ${
                canPerform(userContext, "export-partner-templates")
                  ? '<button id="export-template-button" class="button secondary" type="button">Export JSON</button>'
                  : ""
              }
            </div>
          </div>
          <div class="content-stack">
            <div class="field">
              <label for="template-name">Template name</label>
              <input id="template-name" ${canPerform(userContext, "manage-partner-templates") ? "" : "disabled"} value="${escapeHtml(selectedTemplate.name)}" />
            </div>
            <div class="field">
              <label for="template-subject">Subject</label>
              <input id="template-subject" ${canPerform(userContext, "manage-partner-templates") ? "" : "disabled"} value="${escapeHtml(selectedTemplate.subject)}" />
            </div>
            <div class="field">
              <label for="template-body">Body</label>
              <textarea id="template-body" ${canPerform(userContext, "manage-partner-templates") ? "" : "disabled"}>${escapeHtml(selectedTemplate.body)}</textarea>
            </div>
          </div>
        </article>
        <article class="panel template-preview">
          <div class="section-heading">
            <h3>Preview</h3>
            <span class="pill">${escapeHtml(samplePartner?.partnerName || "Sample partner")}</span>
          </div>
          <div class="field">
            <label>Subject preview</label>
            <input disabled value="${escapeHtml(renderSubjectPreview(selectedTemplate, sampleData))}" />
          </div>
          <div class="code-block">${escapeHtml(renderTemplatePreview(selectedTemplate, sampleData))}</div>
          <button id="copy-template-preview" class="button secondary" type="button">Copy preview</button>
        </article>
        <article class="panel template-variables">
          <div class="section-heading">
            <h3>Available variables</h3>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Description</th>
                  <th>Example</th>
                </tr>
              </thead>
              <tbody>
                ${TEMPLATE_VARIABLES.map(
                  (item) => `
                    <tr>
                      <td><code>${escapeHtml(item.variable)}</code></td>
                      <td>${escapeHtml(item.description)}</td>
                      <td>${escapeHtml(item.example)}</td>
                    </tr>
                  `
                ).join("")}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  `;
}

function drawPartnerModule(container, userContext) {
  container.innerHTML = `
    <div class="dashboard-shell">
      <section class="module-header">
        <div>
          <h2>Partner Dashboard</h2>
          <p>
            Data is parsed from the workbook each time this module is opened. Update the
            Excel file and reload the app to reflect the latest content.
          </p>
        </div>
        <div class="toolbar">
          <span class="pill">Partners: ${partnerState.partners.length}</span>
          <span class="pill">Source: Focus Partner Tracking BR.xlsx</span>
        </div>
      </section>
      <section class="tab-strip">
        ${renderTabButton("overview", "Overview")}
        ${renderTabButton("certifications", "Courses")}
        ${renderTabButton("maturity", "Maturity")}
        ${renderTabButton("email", "Email Templates")}
      </section>
      <section id="partner-tab-content"></section>
    </div>
  `;

  const tabContent = container.querySelector("#partner-tab-content");
  renderPartnerTabContent(tabContent, userContext);

  container.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      partnerState.activeTab = button.dataset.tab;
      drawPartnerModule(container, userContext);
    });
  });
}

function renderPartnerTabContent(tabContent, userContext) {
  if (partnerState.activeTab === "certifications") {
    tabContent.innerHTML = renderPartnerCerts(partnerState.partners);
    return;
  }

  if (partnerState.activeTab === "maturity") {
    tabContent.innerHTML = renderPartnerMaturity(partnerState.partners);
    return;
  }

  if (partnerState.activeTab === "email") {
    tabContent.innerHTML = renderEmailTemplates(userContext);
    wireTemplateActions(tabContent, userContext);
    return;
  }

  tabContent.innerHTML = renderPartnerOverview(partnerState.partners);
}

function wireTemplateActions(container, userContext) {
  container.querySelector("#template-partner")?.addEventListener("change", (event) => {
    partnerState.selectedPartnerId = event.target.value;
    drawPartnerModule(container.closest("#app-content"), userContext);
  });

  container.querySelectorAll("[data-template-select]").forEach((button) => {
    button.addEventListener("click", () => {
      partnerState.selectedTemplateId = button.dataset.templateSelect;
      drawPartnerModule(container.closest("#app-content"), userContext);
    });
  });

  if (canPerform(userContext, "manage-partner-templates")) {
    container.querySelector("#new-template-button")?.addEventListener("click", async () => {
      const draft = createTemplateDraft();
      await persistTemplate(draft);
      partnerState.templates = await loadPartnerTemplates();
      partnerState.selectedTemplateId = draft.id;
      drawPartnerModule(container.closest("#app-content"), userContext);
    });

    container.querySelector("#save-template-button")?.addEventListener("click", async () => {
      const template = readTemplateForm(container);
      await persistTemplate(template);
      partnerState.templates = await loadPartnerTemplates();
      drawPartnerModule(container.closest("#app-content"), userContext);
    });

    container.querySelector("#version-template-button")?.addEventListener("click", async () => {
      const template = readTemplateForm(container);
      await savePartnerTemplateVersion(template, userContext.email || userContext.name);
      partnerState.templates = await loadPartnerTemplates();
      drawPartnerModule(container.closest("#app-content"), userContext);
    });
  }

  if (canPerform(userContext, "export-partner-templates")) {
    container.querySelector("#export-template-button")?.addEventListener("click", () => {
      const blob = new Blob([exportTemplatesJson(partnerState.templates)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "partner-email-templates.json";
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  container.querySelector("#copy-template-preview")?.addEventListener("click", async () => {
    const selectedTemplate = partnerState.templates.find(
      (template) => template.id === partnerState.selectedTemplateId
    );
    const selectedPartner = partnerState.partners.find(
      (partner) => partner.partnerId === partnerState.selectedPartnerId
    );
    const sampleData = buildTemplateSampleData(selectedPartner);
    const text = [
      `Subject: ${renderSubjectPreview(selectedTemplate, sampleData)}`,
      "",
      renderTemplatePreview(selectedTemplate, sampleData)
    ].join("\n");
    await navigator.clipboard?.writeText(text);
  });
}

function readTemplateForm(container) {
  const selectedTemplate = partnerState.templates.find(
    (template) => template.id === partnerState.selectedTemplateId
  );

  return {
    ...selectedTemplate,
    name: container.querySelector("#template-name")?.value.trim() || selectedTemplate.name,
    subject:
      container.querySelector("#template-subject")?.value.trim() || selectedTemplate.subject,
    body: container.querySelector("#template-body")?.value || selectedTemplate.body,
    updatedAt: new Date().toISOString()
  };
}

function buildTemplateSampleData(partner) {
  const courseGroups = buildTemplateCourseGroups(partner);
  const progress = partner?.computed.programProgress?.percentage || 0;

  return {
    partner_name: partner?.partnerName || "Sample Partner",
    contact_name: partner?.primaryContact || "Sample Contact",
    completed_courses: courseGroups.allCompletedFlat,
    missing_courses: courseGroups.allMissingFlat,
    intro_completed_courses: courseGroups.intro.completed,
    intro_missing_courses: courseGroups.intro.missing,
    specialist_completed_courses: courseGroups.specialist.completed,
    specialist_missing_courses: courseGroups.specialist.missing,
    em_theory_completed_courses: courseGroups.theory.completed,
    em_theory_missing_courses: courseGroups.theory.missing,
    all_completed_courses: courseGroups.allCompletedGrouped,
    all_missing_courses: courseGroups.allMissingGrouped,
    program_progress_percentage: `${progress}%`,
    maturity_level: partner
      ? `EM: ${partner.maturity.current.EM || "-"} | VM/WAS: ${partner.maturity.current["VM/WAS"] || "-"} | CS: ${partner.maturity.current.CS || "-"} | TPM: ${partner.maturity.current.TPM || "-"}`
      : "EM: Planned | VM/WAS: Planned | CS: Planned | TPM: Planned",
    next_steps:
      partner?.computed.missingCourses.length
        ? `Focus on ${partner.computed.missingCourses[0]} and schedule the next accreditation review.`
        : "Keep the certification evidence updated and confirm the next maturity milestone.",
    course_prerequisites: buildPrerequisiteList()
  };
}

function buildTemplateCourseGroups(partner) {
  const requirements = partnerState.requirements;
  if (!partner || !requirements) {
    const fallback = "Partner course data is not available.";
    return {
      intro: { completed: fallback, missing: fallback },
      specialist: { completed: fallback, missing: fallback },
      theory: { completed: fallback, missing: fallback },
      allCompletedFlat: fallback,
      allMissingFlat: fallback,
      allCompletedGrouped: fallback,
      allMissingGrouped: fallback
    };
  }

  const intro = evaluateTemplateRuleGroup(
    buildIntroCourseMap(partner.introCourses),
    requirements.introduction,
    "Intro Courses"
  );
  const specialist = evaluateTemplateRuleGroup(
    buildSpecialistCourseMap(partner.specialistCourses),
    requirements.specialist,
    "Specialist Courses"
  );
  const theoryCourses = requirements.theory || [];
  const theoryCompleted = partner.theoryCompleted ? theoryCourses : [];
  const theoryMissing = partner.theoryCompleted ? [] : theoryCourses;
  const theory = {
    completed: formatList(theoryCompleted, "No EM Theory courses completed yet"),
    missing: formatList(theoryMissing, "No EM Theory courses missing")
  };

  const completedGroups = [
    ["Intro Courses", intro.completed],
    ["Specialist Courses", specialist.completed],
    ["EM Theory", theory.completed]
  ];
  const missingGroups = [
    ["Intro Courses", intro.missing],
    ["Specialist Courses", specialist.missing],
    ["EM Theory", theory.missing]
  ];
  const allCompleted = [
    ...intro.completedItems,
    ...specialist.completedItems,
    ...theoryCompleted
  ];
  const allMissing = [
    ...intro.missingItems,
    ...specialist.missingItems,
    ...theoryMissing
  ];

  return {
    intro,
    specialist,
    theory,
    allCompletedFlat: formatList(allCompleted, "No completed courses yet"),
    allMissingFlat: formatList(allMissing, "No missing courses"),
    allCompletedGrouped: formatGroupedList(completedGroups),
    allMissingGrouped: formatGroupedList(missingGroups)
  };
}

function buildIntroCourseMap(courses) {
  return {
    "Introduction to Tenable One": courses.one,
    "Introduction to Tenable Vulnerability Management": courses.vm,
    "Introduction to Tenable Security Center": courses.sc,
    "Introduction to Tenable Web Application Security": courses.was,
    "Introduction to Tenable Identity Exposure": courses.ie,
    "Introduction to Tenable OT Security": courses.ot,
    "Introduction to Tenable Cloud Security": courses.cs
  };
}

function buildSpecialistCourseMap(courses) {
  return {
    "Tenable One Specialist": courses.one,
    "Tenable Vulnerability Management Specialist": courses.vm,
    "Tenable Security Center Specialist": courses.sc,
    "Tenable Identity Exposure Specialist": courses.ie,
    "Tenable OT Security Specialist": courses.ot,
    "Tenable Cloud Security Specialist": courses.cs
  };
}

function evaluateTemplateRuleGroup(courseMap, ruleSet, label) {
  const completedItems = [];
  const missingItems = [];

  (ruleSet.requiredAll || []).forEach((course) => {
    if (courseMap[course]) {
      completedItems.push(course);
    } else {
      missingItems.push(course);
    }
  });

  (ruleSet.oneOfGroups || []).forEach((group) => {
    const completed = group.filter((course) => courseMap[course]);
    if (completed.length) {
      completedItems.push(...completed);
      return;
    }

    missingItems.push(`Complete at least one of: ${group.join(" | ")}`);
  });

  (ruleSet.minimumGroups || []).forEach((group) => {
    const completed = group.courses.filter((course) => courseMap[course]);
    const missing = group.courses.filter((course) => !courseMap[course]);
    completedItems.push(...completed);

    const remainingCount = Math.max(group.count - completed.length, 0);
    if (remainingCount > 0) {
      missingItems.push(`Complete ${remainingCount} more of: ${missing.join(" | ")}`);
    }
  });

  return {
    completed: formatList(completedItems, `No ${label.toLowerCase()} completed yet`),
    missing: formatList(missingItems, `No ${label.toLowerCase()} requirements missing`),
    completedItems,
    missingItems
  };
}

function formatGroupedList(groups) {
  return groups
    .map(([label, content]) => `${label}:\n${content}`)
    .join("\n\n");
}

function buildPrerequisiteList() {
  const requirements = partnerState.requirements;
  if (!requirements) {
    return "Accreditation prerequisites are loaded from accreditation-requirements.json.";
  }

  const lines = [];
  lines.push("Introduction track:");
  (requirements.introduction?.requiredAll || []).forEach((course) => {
    lines.push(`- ${course}`);
  });
  (requirements.introduction?.oneOfGroups || []).forEach((group) => {
    lines.push(`- Complete at least one of: ${group.join(" | ")}`);
  });

  lines.push("");
  lines.push("Specialist track:");
  (requirements.specialist?.requiredAll || []).forEach((course) => {
    lines.push(`- ${course}`);
  });
  (requirements.specialist?.oneOfGroups || []).forEach((group) => {
    lines.push(`- Complete at least one of: ${group.join(" | ")}`);
  });
  (requirements.specialist?.minimumGroups || []).forEach((group) => {
    lines.push(`- Complete at least ${group.count} of: ${group.courses.join(" | ")}`);
  });

  if (requirements.theory?.length) {
    lines.push("");
    lines.push("Business theory:");
    requirements.theory.forEach((course) => {
      lines.push(`- ${course}`);
    });
  }

  return lines.join("\n");
}

function renderSubjectPreview(template, sampleData) {
  if (!template) {
    return "";
  }

  let output = template.subject || "";
  TEMPLATE_VARIABLES.forEach((variable) => {
    const key = variable.variable.replaceAll("{", "").replaceAll("}", "");
    output = output.replaceAll(variable.variable, sampleData[key] || "");
  });
  return output;
}

function renderTabButton(tab, label) {
  return `<button class="tab-button ${partnerState.activeTab === tab ? "active" : ""}" data-tab="${tab}" type="button">${label}</button>`;
}

function renderStatusPill(value) {
  return value
    ? '<span class="pill success">Complete</span>'
    : '<span class="pill warning">Pending</span>';
}

function renderProgressPill(isComplete, missingItems = []) {
  if (isComplete) {
    return '<span class="pill success">Accredited</span>';
  }

  const tooltip = missingItems.length ? ` title="${escapeHtml(missingItems.join(" | "))}"` : "";
  return `<span class="pill warning"${tooltip}>In progress</span>`;
}

function renderTierBadge(tier) {
  const normalized = String(tier || "Unknown").toLowerCase();
  const className = ["platinum", "gold", "silver", "bronze"].includes(normalized)
    ? normalized
    : "neutral";
  return `<span class="partner-tier ${className}">${escapeHtml(tier || "Unknown")}</span>`;
}

function renderCourseList(type, courses) {
  const introGroups = [
    { courses: [["ONE", courses.one]] },
    { label: "1 of 2", grouped: true, courses: [["VM", courses.vm], ["SC", courses.sc]] },
    { courses: [["WAS", courses.was], ["IE", courses.ie], ["OT", courses.ot], ["CS", courses.cs]] }
  ];
  const specialistGroups = [
    { courses: [["ONE SP", courses.one]] },
    { label: "1 of 2", grouped: true, courses: [["VM SP", courses.vm], ["SC SP", courses.sc]] },
    {
      label: "2 of 3",
      grouped: true,
      strong: true,
      courses: [["IE SP", courses.ie], ["OT SP", courses.ot], ["CS SP", courses.cs]]
    }
  ];
  const groups = type === "intro" ? introGroups : specialistGroups;

  return `
    <div class="partner-course-list">
      ${groups.map(renderCourseGroup).join("")}
    </div>
  `;
}

function getPartnerProgress(partner) {
  return partner.computed.programProgress?.percentage || 0;
}

function renderProgressBar(value) {
  const className = getProgressTone(value);

  return `
    <div class="partner-progress">
      <span class="partner-progress-track">
        <span class="partner-progress-fill ${className}" style="width: ${value}%"></span>
      </span>
      <span>${value}%</span>
    </div>
  `;
}

function getProgressTone(value) {
  const numericValue = Number(value) || 0;
  if (numericValue >= 100) {
    return "complete";
  }
  if (numericValue >= 61) {
    return "good";
  }
  if (numericValue >= 16) {
    return "warning";
  }
  return "danger";
}

function renderProgramProgress(partner) {
  const progress = partner.computed.programProgress || {
    totalDone: 0,
    totalCriteria: 11,
    percentage: 0
  };

  return `
    <div class="partner-program-progress" title="Intro ${progress.introDone || 0}/6 | Specialist ${progress.specialistDone || 0}/4 | Theory ${progress.theoryDone || 0}/1">
      ${renderProgressBar(progress.percentage)}
      <span class="muted">${progress.totalDone}/${progress.totalCriteria}</span>
    </div>
  `;
}

function renderCourseGroup(group) {
  const className = [
    "partner-course-group",
    group.grouped ? "grouped" : "",
    group.strong ? "strong" : ""
  ].filter(Boolean).join(" ");

  return `
    <span class="${className}">
      <span class="partner-course-items">
        ${group.courses
          .map(
            ([label, complete]) => `
              <span class="partner-course ${complete ? "done" : "pending"}">${escapeHtml(label)}</span>
            `
          )
          .join("")}
      </span>
      ${group.label ? `<span class="partner-course-rule">${escapeHtml(group.label)}</span>` : ""}
    </span>
  `;
}

function renderMaturityValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return '<span class="maturity-pill empty">-</span>';
  }

  const className = ["high", "medium", "low"].includes(normalized) ? normalized : "neutral";
  return `<span class="maturity-pill ${className}">${escapeHtml(normalized.toUpperCase())}</span>`;
}

function formatList(items = [], fallback) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : fallback;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
