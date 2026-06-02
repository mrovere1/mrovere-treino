import { getAllRecords, putRecord } from "./storage.js";

const REPOSITORY_TEMPLATES_PATH = "./data/partner/templates/templates.json";

export const TEMPLATE_VARIABLES = [
  {
    variable: "{{partner_name}}",
    description: "Partner company name.",
    example: "Acme Security"
  },
  {
    variable: "{{contact_name}}",
    description: "Primary partner contact.",
    example: "Jordan Lee"
  },
  {
    variable: "{{completed_courses}}",
    description: "List of completed accreditation courses.",
    example: "Tenable One Specialist, Introduction to Tenable OT Security"
  },
  {
    variable: "{{missing_courses}}",
    description: "List of missing accreditation courses.",
    example: "Introduction to Tenable Cloud Security"
  },
  {
    variable: "{{intro_completed_courses}}",
    description: "Completed courses from the introduction track only.",
    example: "Introduction to Tenable One"
  },
  {
    variable: "{{intro_missing_courses}}",
    description: "Missing introduction-track requirements, including 1-of-2 guidance.",
    example: "Complete at least one of: Introduction to Tenable Vulnerability Management | Introduction to Tenable Security Center"
  },
  {
    variable: "{{specialist_completed_courses}}",
    description: "Completed courses from the specialist track only.",
    example: "Tenable One Specialist, Tenable Cloud Security Specialist"
  },
  {
    variable: "{{specialist_missing_courses}}",
    description: "Missing specialist-track requirements with exact remaining options for grouped rules.",
    example: "Complete 1 more of: Tenable Identity Exposure Specialist | Tenable OT Security Specialist"
  },
  {
    variable: "{{em_theory_completed_courses}}",
    description: "Completed EM theory requirements.",
    example: "Exposure Management Business Theory"
  },
  {
    variable: "{{em_theory_missing_courses}}",
    description: "Missing EM theory requirements.",
    example: "Exposure Management Business Theory"
  },
  {
    variable: "{{all_completed_courses}}",
    description: "All completed courses grouped by Intro, Specialist, and EM Theory.",
    example: "Intro Courses: ...\nSpecialist Courses: ..."
  },
  {
    variable: "{{all_missing_courses}}",
    description: "All missing requirements grouped by Intro, Specialist, and EM Theory.",
    example: "Intro Courses: ...\nSpecialist Courses: ..."
  },
  {
    variable: "{{program_progress_percentage}}",
    description: "Overall accreditation program progress percentage.",
    example: "82%"
  },
  {
    variable: "{{maturity_level}}",
    description: "Compact maturity summary for the partner.",
    example: "EM: Advanced | VM/WAS: Developing | CS: Foundation | TPM: Planned"
  },
  {
    variable: "{{next_steps}}",
    description: "Recommended actions for the follow-up email.",
    example: "Complete the remaining specialist track and confirm the theory course schedule."
  },
  {
    variable: "{{course_prerequisites}}",
    description: "Full accreditation prerequisite list for a new partner orientation.",
    example: "Introduction track, specialist track, and EM Business Theory prerequisites."
  }
];

const DEFAULT_TEMPLATES = [
  {
    id: "partner-follow-up",
    name: "Partner Follow-up",
    version: 1,
    subject: "Partner accreditation progress update for {{partner_name}}",
    body: [
      "Hello {{contact_name}},",
      "",
      "Here is the latest accreditation update for {{partner_name}}.",
      "",
      "Completed items by track:",
      "{{all_completed_courses}}",
      "",
      "Remaining items by track:",
      "{{all_missing_courses}}",
      "",
      "Overall program progress: {{program_progress_percentage}}",
      "",
      "Current maturity:",
      "{{maturity_level}}",
      "",
      "Recommended next steps:",
      "{{next_steps}}",
      "",
      "Best regards,",
      "MROVERE"
    ].join("\n"),
    updatedAt: null,
    updatedBy: "system",
    versions: []
  },
  {
    id: "partner-celebration",
    name: "Accreditation Celebration",
    version: 1,
    subject: "{{partner_name}} is now accreditation-ready",
    body: [
      "Hello {{contact_name}},",
      "",
      "Congratulations on the latest progress for {{partner_name}}.",
      "Completed courses:",
      "{{completed_courses}}",
      "",
      "Current maturity:",
      "{{maturity_level}}",
      "",
      "Suggested follow-up:",
      "{{next_steps}}",
      "",
      "Regards,",
      "MROVERE"
    ].join("\n"),
    updatedAt: null,
    updatedBy: "system",
    versions: []
  },
  {
    id: "new-partner-orientation",
    name: "New Partner Orientation",
    version: 1,
    subject: "Getting started with Tenable accreditation for {{partner_name}}",
    body: [
      "Hello {{contact_name}},",
      "",
      "Welcome to the Tenable partner accreditation journey.",
      "",
      "Below is the initial prerequisite checklist for {{partner_name}}:",
      "",
      "{{course_prerequisites}}",
      "",
      "Suggested next steps:",
      "{{next_steps}}",
      "",
      "Best regards,",
      "MROVERE"
    ].join("\n"),
    updatedAt: null,
    updatedBy: "system",
    versions: []
  }
];

export async function loadPartnerTemplates() {
  const [stored, repositoryTemplates] = await Promise.all([
    getAllRecords("partnerTemplateVersions"),
    loadRepositoryTemplates()
  ]);
  return mergeTemplates([...structuredClone(DEFAULT_TEMPLATES), ...repositoryTemplates], stored);
}

export async function savePartnerTemplateVersion(template, updatedBy) {
  const historyEntry = {
    version: template.version,
    subject: template.subject,
    body: template.body,
    updatedAt: template.updatedAt,
    updatedBy: template.updatedBy
  };

  const nextTemplate = {
    ...template,
    version: template.version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
    versions: [...(template.versions || []), historyEntry]
  };

  await putRecord("partnerTemplateVersions", nextTemplate);
  return nextTemplate;
}

export function createTemplateDraft() {
  return {
    id: `template-${crypto.randomUUID()}`,
    name: "New Template",
    version: 1,
    subject: "New template subject",
    body: "Hello {{contact_name}},\n\nWrite your message here.",
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
    versions: []
  };
}

export async function persistTemplate(template) {
  await putRecord("partnerTemplateVersions", template);
  return template;
}

export function renderTemplatePreview(template, sampleData) {
  let output = template.body;
  TEMPLATE_VARIABLES.forEach((variable) => {
    const key = variable.variable.replaceAll("{", "").replaceAll("}", "");
    output = output.replaceAll(variable.variable, sampleData[key] || "");
  });

  return output;
}

export function exportTemplatesJson(templates) {
  return JSON.stringify(templates, null, 2);
}

export function createRepositoryTemplatePayload(template) {
  const normalizedTemplate = normalizeTemplate({
    ...template,
    updatedAt: new Date().toISOString()
  });

  return JSON.stringify(
    {
      fileName: `${slugify(normalizedTemplate.name || normalizedTemplate.id)}.json`,
      template: normalizedTemplate
    },
    null,
    2
  );
}

async function loadRepositoryTemplates() {
  try {
    const response = await fetch(`${REPOSITORY_TEMPLATES_PATH}?v=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return normalizeRepositoryTemplates(payload);
  } catch {
    return [];
  }
}

function normalizeRepositoryTemplates(payload) {
  const templates = Array.isArray(payload) ? payload : payload.templates || [];
  return templates.map(normalizeTemplate).filter((template) => template.id && template.name);
}

function mergeTemplates(baseTemplates, overrideTemplates) {
  const map = new Map();
  baseTemplates.forEach((template) => {
    map.set(template.id, normalizeTemplate(template));
  });
  overrideTemplates.forEach((template) => {
    map.set(template.id, normalizeTemplate(template));
  });
  return Array.from(map.values());
}

function normalizeTemplate(template) {
  return {
    id: template.id || `template-${crypto.randomUUID()}`,
    name: template.name || "Untitled Template",
    version: Number(template.version || 1),
    subject: template.subject || "",
    body: template.body || "",
    updatedAt: template.updatedAt || null,
    updatedBy: template.updatedBy || "repository",
    versions: Array.isArray(template.versions) ? template.versions : []
  };
}

function slugify(value) {
  return String(value || "partner-template")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "partner-template";
}
