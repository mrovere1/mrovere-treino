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

    drawPartnerModule(container, userContext);
  } catch (error) {
    container.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

export function renderPartnerOverview(partners) {
  const readyCount = partners.filter((partner) => partner.computed.accreditationReady).length;
  const theoryPending = partners.filter((partner) => !partner.theoryCompleted).length;
  const followUpPartners = partners
    .filter((partner) => partner.computed.missingCourses.length)
    .slice(0, 8);

  return `
    <section class="grid-cards">
      <article class="stat-card panel">
        <h3>Total partners</h3>
        <div class="stat-value">${partners.length}</div>
      </article>
      <article class="stat-card panel">
        <h3>Accreditation ready</h3>
        <div class="stat-value">${readyCount}</div>
      </article>
      <article class="stat-card panel">
        <h3>Theory pending</h3>
        <div class="stat-value">${theoryPending}</div>
      </article>
    </section>
    <section class="panel partner-overview-list" style="padding: 1rem;">
      <div class="section-heading">
        <h3>Partners that need follow-up</h3>
        <span class="muted">${followUpPartners.length} shown</span>
      </div>
      ${followUpPartners
        .map(
          (partner) => `
            <article class="partner-overview-row">
              <div>
                <strong>${escapeHtml(partner.partnerName)}</strong>
                <div class="muted">${escapeHtml(partner.primaryContact || "No primary contact")}</div>
              </div>
              <div class="muted">${escapeHtml(partner.computed.missingCourses.join(" | "))}</div>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

export function renderPartnerCerts(partners) {
  return `
    <section class="panel card-table">
      <header>
        <div>
          <h3>Certification status</h3>
          <p class="muted">Computed from the live workbook and accreditation rule set.</p>
        </div>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Partner</th>
              <th>Intro</th>
              <th>Specialist</th>
              <th>Theory</th>
              <th>Accreditation</th>
              <th>Missing items</th>
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
                    <td>${renderStatusPill(partner.computed.introCertified)}</td>
                    <td>${renderStatusPill(partner.computed.specialistCertified)}</td>
                    <td>${renderStatusPill(partner.theoryCompleted)}</td>
                    <td>${renderStatusPill(partner.computed.accreditationReady)}</td>
                    <td>${escapeHtml(partner.computed.missingCourses.join(" | ") || "None")}</td>
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
        <table>
          <thead>
            <tr>
              <th>Partner</th>
              <th>Current EM</th>
              <th>Current VM/WAS</th>
              <th>Current CS</th>
              <th>Current TPM</th>
              <th>Target EM</th>
              <th>Target VM/WAS</th>
              <th>Target CS</th>
              <th>Target TPM</th>
            </tr>
          </thead>
          <tbody>
            ${partners
              .map(
                (partner) => `
                  <tr>
                    <td>${escapeHtml(partner.partnerName)}</td>
                    <td>${escapeHtml(partner.maturity.current.EM || "-")}</td>
                    <td>${escapeHtml(partner.maturity.current["VM/WAS"] || "-")}</td>
                    <td>${escapeHtml(partner.maturity.current.CS || "-")}</td>
                    <td>${escapeHtml(partner.maturity.current.TPM || "-")}</td>
                    <td>${escapeHtml(partner.maturity.target.EM || "-")}</td>
                    <td>${escapeHtml(partner.maturity.target["VM/WAS"] || "-")}</td>
                    <td>${escapeHtml(partner.maturity.target.CS || "-")}</td>
                    <td>${escapeHtml(partner.maturity.target.TPM || "-")}</td>
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
  const samplePartner = partnerState.partners[0];
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
                <div class="muted">Version ${template.version}</div>
              </button>
            `
          )
          .join("")}
      </article>
      <div class="template-stack">
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
          <div class="code-block">${escapeHtml(renderTemplatePreview(selectedTemplate, sampleData))}</div>
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
        ${renderTabButton("certifications", "Certifications")}
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
  return {
    partner_name: partner?.partnerName || "Sample Partner",
    contact_name: partner?.primaryContact || "Sample Contact",
    completed_courses: partner?.computed.completedCourses.join(", ") || "No completed courses yet",
    missing_courses: partner?.computed.missingCourses.join(", ") || "No missing courses",
    maturity_level: partner
      ? `EM: ${partner.maturity.current.EM || "-"} | VM/WAS: ${partner.maturity.current["VM/WAS"] || "-"} | CS: ${partner.maturity.current.CS || "-"} | TPM: ${partner.maturity.current.TPM || "-"}`
      : "EM: Planned | VM/WAS: Planned | CS: Planned | TPM: Planned",
    next_steps:
      partner?.computed.missingCourses.length
        ? `Focus on ${partner.computed.missingCourses[0]} and schedule the next accreditation review.`
        : "Keep the certification evidence updated and confirm the next maturity milestone."
  };
}

function renderTabButton(tab, label) {
  return `<button class="tab-button ${partnerState.activeTab === tab ? "active" : ""}" data-tab="${tab}" type="button">${label}</button>`;
}

function renderStatusPill(value) {
  return value
    ? '<span class="pill success">Complete</span>'
    : '<span class="pill warning">Pending</span>';
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
