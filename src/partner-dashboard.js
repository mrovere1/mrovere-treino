import { canPerform } from "./roles.js";
import {
  createRepositoryTemplatePayload,
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
  parsePartnerWorkbook,
  parseGuardianSheet,
  parseTechCertsSheet,
  parseEmCertsDetailSheet,
  emCourseName,
  emCourseCategory
} from "./partner-excel.js";

const partnerState = {
  activeTab: "overview",
  selectedTemplateId: null,
  selectedPartnerId: null,
  partners: [],
  requirements: null,
  templates: [],
  guardians: [],
  techCerts: [],
  emCertsDetail: {},
  certDetailPartner: null
};

const TEMPLATE_WORKFLOW_URL =
  "https://github.com/mrovere1/mrovere-treino/actions/workflows/save-partner-template.yml";

export async function renderPartnerDashboard(container, userContext) {
  container.innerHTML = `<div class="loading-state">Loading partner workbook and templates...</div>`;

  try {
    const [workbook, requirements, templates] = await Promise.all([
      loadPartnerWorkbook(),
      loadAccreditationRequirements(),
      loadPartnerTemplates()
    ]);

    partnerState.partners = parsePartnerWorkbook(workbook, requirements);
    partnerState.guardians = parseGuardianSheet(workbook);
    partnerState.techCerts = parseTechCertsSheet(workbook);
    partnerState.emCertsDetail = parseEmCertsDetailSheet(workbook);
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

export function renderPartnerOverview(partners, emCertsDetail = {}) {
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
                    <td class="partner-name-cell"><strong>${escapeHtml(partner.partnerName)}</strong></td>
                    <td>${renderTierBadge(partner.status)}</td>
                    <td class="muted">${escapeHtml(partner.primaryContact || "-")}</td>
                    <td>${renderProgressPill(partner.computed.introCertified, partner.computed.missingIntroCourses)}</td>
                    <td>${renderProgressPill(partner.computed.specialistCertified, partner.computed.missingSpecialistCourses)}</td>
                    <td>${renderStatusPill(partner.theoryCompleted)}</td>
                    <td>${renderProgressPill(partner.computed.accreditationReady, partner.computed.missingCourses)}</td>
                    <td>${renderProgramProgress(partner, emCertsDetail)}</td>
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

export function renderPartnerCerts(partners, emCertsDetail = {}) {
  return `
    <section class="panel card-table">
      <header>
        <div>
          <h3>Course detail by partner</h3>
          <p class="muted">Rules: Intro = required courses plus grouped choices. Specialist = required courses plus 1-of-2 and 2-of-3 rules. Click a partner name for the per-person breakdown.</p>
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
                    <td class="partner-name-cell">
                      ${renderPartnerNameCell(partner, emCertsDetail)}
                      <div class="muted">${escapeHtml(partner.primaryContact || "")}</div>
                    </td>
                    <td>${renderTierBadge(partner.status)}</td>
                    <td>${renderCourseList("intro", partner.introCourses)}</td>
                    <td>${renderProgressPill(partner.computed.introCertified, partner.computed.missingIntroCourses)}</td>
                    <td>${renderCourseList("specialist", partner.specialistCourses)}</td>
                    <td>${renderProgressPill(partner.computed.specialistCertified, partner.computed.missingSpecialistCourses)}</td>
                    <td>${renderStatusPill(partner.theoryCompleted)}</td>
                    <td>${renderProgramProgress(partner, emCertsDetail)}</td>
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

function renderPartnerNameCell(partner, emCertsDetail) {
  const hasDetail = Boolean(emCertsDetail[partner.partnerName]?.users?.length);
  if (!hasDetail) {
    return `<strong>${escapeHtml(partner.partnerName)}</strong>`;
  }
  return `<a href="#" class="partner-name-link" data-open-cert-detail="${escapeHtml(
    partner.partnerName
  )}" title="View per-person course detail"><strong>${escapeHtml(partner.partnerName)}</strong> ↗</a>`;
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
                    <td class="maturity-delivery maturity-delivery-start">${renderMaturityValue(partner.maturity.current.EM)}</td>
                    <td class="maturity-delivery">${renderMaturityValue(partner.maturity.current["VM/WAS"])}</td>
                    <td class="maturity-delivery">${renderMaturityValue(partner.maturity.current.CS)}</td>
                    <td class="maturity-delivery maturity-delivery-end">${renderMaturityValue(partner.maturity.current.TPM)}</td>
                    <td class="maturity-presales maturity-presales-start">${renderMaturityValue(partner.maturity.target.EM)}</td>
                    <td class="maturity-presales">${renderMaturityValue(partner.maturity.target["VM/WAS"])}</td>
                    <td class="maturity-presales">${renderMaturityValue(partner.maturity.target.CS)}</td>
                    <td class="maturity-presales">${renderMaturityValue(partner.maturity.target.TPM)}</td>
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

export function renderGuardianTab(guardians, partners) {
  const ready = guardians.filter((g) => g.computed.allComplete);
  const inProgress = guardians.filter((g) => !g.computed.allComplete && g.computed.certsDone > 0);
  const pending = guardians.filter((g) => g.computed.certsDone === 0);

  if (guardians.length === 0) {
    return `
      <section class="panel">
        <p class="muted">No Guardian candidates found in the workbook. Make sure the workbook contains a "Guardian" sheet with the expected columns.</p>
      </section>
    `;
  }

  return `
    <section class="partner-grid4">
      <article class="stat-card panel">
        <h3>Candidates</h3>
        <div class="stat-value">${guardians.length}</div>
        <p class="muted">Total in program</p>
      </article>
      <article class="stat-card panel">
        <h3>Ready</h3>
        <div class="stat-value">${ready.length}</div>
        <p class="muted">All certifications complete</p>
      </article>
      <article class="stat-card panel">
        <h3>In progress</h3>
        <div class="stat-value">${inProgress.length}</div>
        <p class="muted">Partial certifications</p>
      </article>
      <article class="stat-card panel">
        <h3>Pending</h3>
        <div class="stat-value">${pending.length}</div>
        <p class="muted">Not started</p>
      </article>
    </section>
    <section class="panel card-table">
      <header>
        <div>
          <h3>Guardian candidates</h3>
          <p class="muted">Requisitos atuais (VM/OT/Cloud): VM Sales + VM SE + TCDE (prova teórica + prática). Curso de Specialist recomendado mas não obrigatório. Oferecido por convite — empresa deve ser Gold ou Platinum.</p>
        </div>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Partner</th>
              <th>Specialist</th>
              <th title="Certificação Sales — VM, OT ou Cloud (substitui TCSA legado)">VM Sales</th>
              <th title="Certificação SE — VM, OT ou Cloud (substitui TCSE legado)">VM SE</th>
              <th title="2 provas: teórica + prática para VM, OT ou Cloud (substitui TCDE legado)">TCDE</th>
              <th>Progress</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${guardians
              .map((g) => {
                const partnerData = partners.find(
                  (p) => p.partnerName.toLowerCase() === g.partner.toLowerCase()
                );
                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(g.name)}</strong>
                      ${g.email ? `<div class="muted">${escapeHtml(g.email)}</div>` : ""}
                    </td>
                    <td>
                      ${partnerData ? renderTierBadge(partnerData.status) : ""}
                      <span>${escapeHtml(g.partner)}</span>
                    </td>
                    <td>${renderGuardianCertPill(g.specialist)}</td>
                    <td>${renderGuardianCertPill(g.tcsa)}</td>
                    <td>${renderGuardianCertPill(g.tcse)}</td>
                    <td>${renderGuardianCertPill(g.tcde)}</td>
                    <td>${renderGuardianProgress(g)}</td>
                    <td>${renderGuardianStatus(g)}</td>
                    <td class="muted">${escapeHtml(g.obs || "")}</td>
                  </tr>
                `;
              })
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
          Repository templates are loaded from <code>data/partner/templates/templates.json</code>. Browser edits stay local until published through GitHub Actions.
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
                  ? `
                    <button id="copy-template-payload-button" class="button secondary" type="button">Copy GitHub payload</button>
                    <button id="open-template-workflow-button" class="button secondary" type="button">Open save workflow</button>
                    <button id="export-template-button" class="button secondary" type="button">Export JSON</button>
                  `
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

export function renderTechCertsTab(techCerts) {
  const GROUPS = [
    { label: "Vulnerability Management", keys: ["VM-SE", "VM-Sales"] },
    { label: "Cloud Security",           keys: ["CS-SE", "CS-Sales"] },
    { label: "OT Security",              keys: ["OT-SE", "OT-Sales"] },
    { label: "Identity Security",        keys: ["IE-SE", "IE-Sales"] },
    { label: "Attack Surface Mgmt",      keys: ["ASM-SE", "ASM-Sales"] },
    { label: "Nessus",                   keys: ["Nessus"] },
    { label: "Tenable One",              keys: ["ONE-SE", "ONE-Sales"] },
    { label: "MSSP",                     keys: ["MSSP"] }
  ];

  if (!techCerts || techCerts.length === 0) {
    return `
      <section class="tab-section">
        <div class="empty-state">
          <p>Sem dados de Tech Certs disponíveis.</p>
          <p class="hint">Execute o script <code>update_certs.py</code> para popular a aba "Tech Certs" no Excel.</p>
        </div>
      </section>`;
  }

  const allKeys = GROUPS.flatMap((g) => g.keys);
  const totalCerts = techCerts.reduce((sum, p) => {
    return sum + allKeys.reduce((s, k) => s + (p.certs[k] || 0), 0);
  }, 0);
  const certifiedPartners = techCerts.filter((p) =>
    allKeys.some((k) => (p.certs[k] || 0) > 0)
  ).length;

  function certPill(count) {
    if (!count) return `<span class="cert-pill cert-pill--none">–</span>`;
    if (count >= 3) return `<span class="cert-pill cert-pill--high">${count}</span>`;
    return `<span class="cert-pill cert-pill--low">${count}</span>`;
  }

  const groupRow = GROUPS.map((g) =>
    `<th class="tc-group" colspan="${g.keys.length}">${g.label}</th>`
  ).join("");

  const subRow = GROUPS.flatMap((g) =>
    g.keys.map((k) => {
      const label = k.includes("-") ? k.split("-")[1] : "—";
      return `<th class="tc-sub">${label}</th>`;
    })
  ).join("");

  const rows = techCerts.map((p, i) => {
    const cells = GROUPS.flatMap((g) =>
      g.keys.map((k) => `<td class="cert-cell">${certPill(p.certs[k] || 0)}</td>`)
    ).join("");
    return `
      <tr class="${i % 2 === 1 ? "tc-row-alt" : ""}">
        <td class="partner-cell"><strong>${escapeHtml(p.partnerName || p.partnerId)}</strong></td>
        ${cells}
      </tr>`;
  }).join("");

  return `
    <section class="tab-section">
      <div class="section-header">
        <h2 class="section-title">Tech Certifications by Partner</h2>
        <p class="section-subtitle">Contagem de usuários únicos certificados por produto e track — fonte: Tableau Individual Certs Dashboard</p>
      </div>

      <div class="stats-row" style="display:flex;gap:1.5rem;margin-bottom:1.5rem;">
        <div class="stat-card" style="flex:1">
          <div class="stat-label">Parceiros com certs</div>
          <div class="stat-value">${certifiedPartners} / ${techCerts.length}</div>
        </div>
        <div class="stat-card" style="flex:1">
          <div class="stat-label">Total de certs mapeadas</div>
          <div class="stat-value">${totalCerts}</div>
        </div>
      </div>

      <div class="table-wrapper" style="overflow-x:auto;">
        <table class="certs-table tech-certs-table">
          <thead>
            <tr class="tc-group-row">
              <th class="tc-partner-header" rowspan="2">Partner</th>
              ${groupRow}
            </tr>
            <tr class="tc-sub-row">
              ${subRow}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="legend" style="margin-top:1rem;display:flex;gap:1rem;font-size:.75rem;color:var(--text-muted);">
        <span><span class="cert-pill cert-pill--high" style="display:inline-block">3+</span> Alta cobertura</span>
        <span><span class="cert-pill cert-pill--low" style="display:inline-block">1</span> Baixa cobertura</span>
        <span><span class="cert-pill cert-pill--none" style="display:inline-block">–</span> Sem cert</span>
        <span style="margin-left:auto">SE = Sales Engineer track &nbsp;|&nbsp; Sales = Sales track</span>
      </div>
    </section>`;
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
        ${renderTabButton("certifications", "EM Certs")}
        ${renderTabButton("techcerts", "Tech Certs")}
        ${renderTabButton("maturity", "Maturity")}
        ${renderTabButton("guardian", "Guardian")}
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
    const detail = partnerState.certDetailPartner
      ? partnerState.emCertsDetail[partnerState.certDetailPartner]
      : null;

    tabContent.innerHTML = detail
      ? renderEmCertDetail(detail)
      : renderPartnerCerts(partnerState.partners, partnerState.emCertsDetail);

    wireCertsTabActions(tabContent, userContext);
    return;
  }

  if (partnerState.activeTab === "maturity") {
    tabContent.innerHTML = renderPartnerMaturity(partnerState.partners);
    return;
  }

  if (partnerState.activeTab === "techcerts") {
    tabContent.innerHTML = renderTechCertsTab(partnerState.techCerts);
    return;
  }

  if (partnerState.activeTab === "guardian") {
    tabContent.innerHTML = renderGuardianTab(partnerState.guardians, partnerState.partners);
    return;
  }

  if (partnerState.activeTab === "email") {
    tabContent.innerHTML = renderEmailTemplates(userContext);
    wireTemplateActions(tabContent, userContext);
    return;
  }

  tabContent.innerHTML = renderPartnerOverview(partnerState.partners, partnerState.emCertsDetail);
}

function wireCertsTabActions(tabContent, userContext) {
  tabContent.querySelectorAll("[data-open-cert-detail]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      partnerState.certDetailPartner = link.dataset.openCertDetail;
      renderPartnerTabContent(tabContent, userContext);
    });
  });

  tabContent.querySelector("[data-back-to-certs]")?.addEventListener("click", (event) => {
    event.preventDefault();
    partnerState.certDetailPartner = null;
    renderPartnerTabContent(tabContent, userContext);
  });
}

export function renderEmCertDetail(detail) {
  const { partnerName, users, blocks } = detail;

  const b1ItemsHtml = blocks.b1.items
    .map(
      (item) => `
        <div class="em-block-item">
          <span class="em-block-item-label"><strong>${item.code}</strong> — ${escapeHtml(item.label)}</span>
          <span>${item.pass ? "✅" : "❌"}</span>
        </div>
      `
    )
    .join("");

  const req2DoneNames = blocks.b2.req2.done.map((c) => `${c} — ${escapeHtml(emCourseName(c))}`).join("<br/>");
  const grpDoneNames = (done) => done.map((c) => `${c} — ${escapeHtml(emCourseName(c))}`).join(", ");
  const idsWithNames = (ids, separator) =>
    ids.map((c) => `${c} — ${escapeHtml(emCourseName(c))}`).join(separator);

  return `
    <section class="panel">
      <header>
        <div>
          <a href="#" class="partner-name-link" data-back-to-certs>← Back to EM Certs</a>
          <h3 style="margin-top: 0.5rem;">${escapeHtml(partnerName)}</h3>
          <p class="muted">${users.length} team member${users.length === 1 ? "" : "s"} with at least one EM course.</p>
        </div>
      </header>

      <div class="partner-grid4" style="margin-top: 1rem;">
        <article class="stat-card panel">
          <h3>Overall</h3>
          <div class="stat-value">${blocks.overallPct}%</div>
          <p class="muted">${blocks.overall ? "✅ EM Certified" : "⏳ In progress"}</p>
        </article>
        <article class="stat-card panel">
          <h3>Block 1 — Intro</h3>
          <div class="stat-value">${blocks.b1.pct}%</div>
          <p class="muted">${blocks.b1.metCount}/6 met</p>
        </article>
        <article class="stat-card panel">
          <h3>Block 2 — Specialist</h3>
          <div class="stat-value">${blocks.b2.pct}%</div>
          <p class="muted">${blocks.b2.pass ? "✅ Passed" : "⏳ Incomplete"}</p>
        </article>
        <article class="stat-card panel">
          <h3>Block 3 — Theory</h3>
          <div class="stat-value">${blocks.b3.pct}%</div>
          <p class="muted">${blocks.b3.pass ? "552 ✅" : "Pending"}</p>
        </article>
      </div>
    </section>

    <section class="panel em-block-panel">
      <header>
        <div>
          <h3>Block 1 — Intro <span class="pill ${blocks.b1.pass ? "success" : "warning"}">${
    blocks.b1.pass ? "Passed (6/6)" : `${blocks.b1.metCount}/6 met`
  }</span></h3>
        </div>
      </header>
      <div class="em-block-grid">${b1ItemsHtml}</div>
    </section>

    <section class="panel em-block-panel">
      <header>
        <div>
          <h3>Block 2 — Specialist <span class="pill ${blocks.b2.pass ? "success" : "warning"}">${
    blocks.b2.pass ? "Passed" : "Incomplete"
  }</span></h3>
        </div>
      </header>
      <div class="em-block-grid">
        <div class="em-block-item">
          <span class="em-block-item-label"><strong>Req 1:</strong> 561 — Tenable One Exposure Management Platform Specialist On-Demand</span>
          <span>${blocks.b2.req1.pass ? "✅" : "❌"}</span>
        </div>
        <div class="em-block-item em-block-item-stack">
          <div class="em-block-item-label">
            <strong>Req 2 (any 1 of):</strong>
            <div class="muted em-block-options">${idsWithNames([304, 375, 488, 554, 557], "<br/>")}</div>
          </div>
          <span>${blocks.b2.req2.pass ? "✅" : "❌"}</span>
          ${
            blocks.b2.req2.done.length
              ? `<div class="muted em-block-done">Completed: ${req2DoneNames}</div>`
              : ""
          }
        </div>
        <div class="em-block-item em-block-item-stack">
          <div class="em-block-item-label">
            <strong>Req 3:</strong> any 2 elective groups (${blocks.b2.req3.metCount}/2 met)
          </div>
          <span>${blocks.b2.req3.pass ? "✅" : "❌"}</span>
          <div class="em-block-groups">
            <div><strong>Group A</strong> (${idsWithNames([332, 555], " or ")}): ${
              blocks.b2.req3.groupA.pass ? `✅ ${grpDoneNames(blocks.b2.req3.groupA.done)}` : "❌ Not met"
            }</div>
            <div><strong>Group B</strong> (${idsWithNames([420, 560], " or ")}): ${
              blocks.b2.req3.groupB.pass ? `✅ ${grpDoneNames(blocks.b2.req3.groupB.done)}` : "❌ Not met"
            }</div>
            <div><strong>Group C</strong> (${idsWithNames([540, 539, 556], " or ")}): ${
              blocks.b2.req3.groupC.pass ? `✅ ${grpDoneNames(blocks.b2.req3.groupC.done)}` : "❌ Not met"
            }</div>
          </div>
        </div>
      </div>
    </section>

    <section class="panel em-block-panel">
      <header>
        <div>
          <h3>Block 3 — Theory <span class="pill ${blocks.b3.pass ? "success" : "warning"}">${
    blocks.b3.pass ? "Passed" : "Incomplete"
  }</span></h3>
        </div>
      </header>
      <div class="em-block-grid">
        <div class="em-block-item">
          <span class="em-block-item-label"><strong>552</strong> — Exposure Management Business Theory</span>
          <span>${blocks.b3.pass ? "✅" : "❌"}</span>
        </div>
      </div>
    </section>

    <section class="panel card-table">
      <header>
        <div>
          <h3>Team members</h3>
          <p class="muted">${users.length} people with EM courses on file.</p>
        </div>
        <div class="em-course-legend">
          <span class="em-course-chip intro">Intro</span>
          <span class="em-course-chip specialist">Specialist</span>
          <span class="em-course-chip theory">Theory</span>
        </div>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Courses</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${users
              .map(
                (user) => `
                  <tr>
                    <td><strong>${escapeHtml(user.name)}</strong></td>
                    <td class="muted">${escapeHtml(user.email)}</td>
                    <td>
                      <div class="em-user-course-chips">
                        ${user.courses
                          .map(
                            (course) =>
                              `<span class="em-course-chip ${emCourseCategory(course)}"><strong>${course}</strong> ${escapeHtml(
                                emCourseName(course)
                              )}</span>`
                          )
                          .join("")}
                      </div>
                    </td>
                    <td>${user.courses.length}</td>
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
    container.querySelector("#copy-template-payload-button")?.addEventListener("click", async () => {
      const template = readTemplateForm(container);
      await navigator.clipboard?.writeText(createRepositoryTemplatePayload(template));
    });

    container.querySelector("#open-template-workflow-button")?.addEventListener("click", () => {
      window.open(TEMPLATE_WORKFLOW_URL, "_blank", "noopener,noreferrer");
    });

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

function renderProgramProgress(partner, emCertsDetail = {}) {
  const progress = partner.computed.programProgress || {
    totalDone: 0,
    totalCriteria: 11,
    percentage: 0
  };

  // The per-person detail (EM Certs Detail sheet) is computed directly from
  // the Tableau by-user course data and is more accurate than the workbook's
  // aggregate boolean columns, which can lag behind — prefer it when present.
  const overallPct = emCertsDetail[partner.partnerName]?.blocks?.overallPct;
  const percentage = overallPct ?? progress.percentage;

  return `
    <div class="partner-program-progress" title="Intro ${progress.introDone || 0}/6 | Specialist ${progress.specialistDone || 0}/4 | Theory ${progress.theoryDone || 0}/1">
      ${renderProgressBar(percentage)}
      <span class="muted">${progress.totalDone}/${progress.totalCriteria}</span>
    </div>
  `;
}

function renderGuardianCertPill(value) {
  return value
    ? '<span class="pill success">Done</span>'
    : '<span class="pill warning">Pending</span>';
}

function renderGuardianStatus(guardian) {
  if (guardian.computed.allComplete) {
    return '<span class="pill success">Ready</span>';
  }
  if (guardian.computed.certsDone > 0) {
    return '<span class="pill warning">In progress</span>';
  }
  return '<span class="pill">Pending</span>';
}

function renderGuardianProgress(guardian) {
  const { certsDone, percentage } = guardian.computed;
  return `
    <div class="partner-program-progress">
      ${renderProgressBar(percentage)}
      <span class="muted">${certsDone}/4</span>
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


