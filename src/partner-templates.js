import { getAllRecords, putRecord } from "./storage.js";

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
    variable: "{{maturity_level}}",
    description: "Compact maturity summary for the partner.",
    example: "EM: Advanced | VM/WAS: Developing | CS: Foundation | TPM: Planned"
  },
  {
    variable: "{{next_steps}}",
    description: "Recommended actions for the follow-up email.",
    example: "Complete the remaining specialist track and confirm the theory course schedule."
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
      "Completed items:",
      "{{completed_courses}}",
      "",
      "Remaining items:",
      "{{missing_courses}}",
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
  }
];

export async function loadPartnerTemplates() {
  const stored = await getAllRecords("partnerTemplateVersions");
  if (!stored.length) {
    return structuredClone(DEFAULT_TEMPLATES);
  }

  const map = new Map(stored.map((template) => [template.id, template]));
  return DEFAULT_TEMPLATES.map((template) => map.get(template.id) || structuredClone(template)).concat(
    stored.filter((template) => !DEFAULT_TEMPLATES.some((defaultTemplate) => defaultTemplate.id === template.id))
  );
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
