const WORKBOOK_PATH = "./data/partner/Focus Partner Tracking BR.xlsx";
const REQUIREMENTS_PATH = "./data/partner/accreditation-requirements.json";
const SHEET_JS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

let sheetJsPromise;

export async function ensureSheetJs() {
  if (window.XLSX) {
    return window.XLSX;
  }

  if (!sheetJsPromise) {
    sheetJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SHEET_JS_URL;
      script.async = true;
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => reject(new Error("Unable to load SheetJS from the CDN."));
      document.head.appendChild(script);
    });
  }

  return sheetJsPromise;
}

export async function loadPartnerWorkbook() {
  await ensureSheetJs();
  const response = await fetch(WORKBOOK_PATH, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      "The partner workbook could not be loaded. Run the app from a local web server and place the Excel file at data/partner/Focus Partner Tracking BR.xlsx."
    );
  }

  const buffer = await response.arrayBuffer();
  return window.XLSX.read(buffer, { type: "array" });
}

export async function loadAccreditationRequirements() {
  const response = await fetch(REQUIREMENTS_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load accreditation-requirements.json.");
  }

  return response.json();
}

export function parsePartnerWorkbook(workbook, requirements) {
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });

  if (rows.length < 4) {
    throw new Error("The workbook does not contain the expected structure.");
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  const groupRows = rows.slice(0, headerRowIndex).map((row) => propagateGroups(row || []));
  const headers = rows[headerRowIndex] || [];
  const allColumns = headers.map((header, index) => ({
    index,
    group: groupRows.map((row) => row[index]).filter(Boolean).join(" > "),
    header: String(header || "").trim()
  }));

  const maturityColumnSets = buildMaturityColumnSets(allColumns);

  const dataRows = rows
    .slice(headerRowIndex + 1)
    .filter((row) => String(row[1] || "").trim() && String(row[0] || "").trim());

  return dataRows.map((row) => {
    const introCourses = {
      one: readCompletion(row, findColumn(allColumns, "ONE", "intro", 0)),
      vm: readCompletion(row, findColumn(allColumns, "VM", "intro", 0)),
      sc: readCompletion(row, findColumn(allColumns, "SC", "intro", 0)),
      was: readCompletion(row, findColumn(allColumns, "WAS", "intro", 0)),
      ie: readCompletion(row, findColumn(allColumns, "IE", "intro", 0)),
      ot: readCompletion(row, findColumn(allColumns, "OT", "intro", 0)),
      cs: readCompletion(row, findColumn(allColumns, "CS", "intro", 0))
    };

    const specialistCourses = {
      one: readCompletion(row, findColumn(allColumns, "ONE", "special", 0)),
      vm: readCompletion(row, findColumn(allColumns, "VM", "special", 0)),
      sc: readCompletion(row, findColumn(allColumns, "SC", "special", 0)),
      ie: readCompletion(row, findColumn(allColumns, "IE", "special", 0)),
      ot: readCompletion(row, findColumn(allColumns, "OT", "special", 0)),
      cs: readCompletion(row, findColumn(allColumns, "CS", "special", 0))
    };

    const theoryCompleted = readCompletion(row, findColumn(allColumns, "Theory"));
    const introResult = evaluateIntro(introCourses, requirements);
    const specialistResult = evaluateSpecialist(specialistCourses, requirements);
    const workbookFlags = {
      intro: String(readValue(row, findColumn(allColumns, "Intro CERT")) || ""),
      specialist: String(readValue(row, findColumn(allColumns, "SP CERT")) || ""),
      theory: String(readValue(row, findColumn(allColumns, "Theory")) || ""),
      accreditation: String(readValue(row, findColumn(allColumns, "Accreditation")) || "")
    };
    const introCertified = introResult.passed || isAccreditedValue(workbookFlags.intro);
    const specialistCertified =
      specialistResult.passed || isAccreditedValue(workbookFlags.specialist);
    const programProgress = calculateProgramProgress(
      introCourses,
      specialistCourses,
      theoryCompleted,
      workbookFlags
    );

    const completedCourses = [
      ...introResult.completedCourses,
      ...specialistResult.completedCourses,
      ...(theoryCompleted ? requirements.theory : [])
    ];
    const missingIntroCourses = introCertified ? [] : introResult.missingCourses;
    const missingSpecialistCourses = specialistCertified ? [] : specialistResult.missingCourses;
    const missingCourses = [
      ...missingIntroCourses,
      ...missingSpecialistCourses,
      ...(theoryCompleted ? [] : requirements.theory)
    ];

    return {
      partnerId: String(row[0] || "").trim(),
      partnerName: String(row[1] || "").trim(),
      primaryContact: String(row[3] || "").trim(),
      status: String(row[4] || "").trim(),
      introCourses,
      specialistCourses,
      theoryCompleted,
      workbookFlags,
      maturity: {
        current: buildMaturitySnapshot(row, maturityColumnSets.current),
        target: buildMaturitySnapshot(row, maturityColumnSets.target)
      },
      computed: {
        introCertified,
        specialistCertified,
        accreditationReady: introCertified && specialistCertified && theoryCompleted,
        programProgress,
        completedCourses,
        missingCourses,
        missingIntroCourses,
        missingSpecialistCourses
      }
    };
  });
}

function findHeaderRowIndex(rows) {
  const index = rows.findIndex((row) => {
    const values = row.map((cell) => String(cell || "").trim().toLowerCase());
    return values.includes("id reseller") && values.includes("partner");
  });

  if (index < 0) {
    throw new Error("The partner workbook header row was not found.");
  }

  return index;
}

function buildMaturityColumnSets(columns) {
  const accreditationColumn = findColumn(columns, "Accreditation");
  const startIndex = accreditationColumn ? accreditationColumn.index + 1 : 0;
  const maturityColumns = columns
    .filter(
      (column) =>
        column.index > startIndex &&
        ["EM", "VM/WAS", "CS", "TPM"].includes(column.header)
    )
    .sort((left, right) => left.index - right.index);

  return {
    current: maturityColumns.slice(0, 4),
    target: maturityColumns.slice(4, 8)
  };
}

function propagateGroups(groupRow) {
  let current = "";
  return groupRow.map((cell) => {
    const value = String(cell || "").trim();
    if (value) {
      current = value;
    }
    return current;
  });
}

function findColumn(columns, header, groupHint = "", occurrence = 0) {
  const matches = columns.filter((column) => {
    const headerMatch = column.header === header;
    if (!headerMatch) {
      return false;
    }

    if (!groupHint) {
      return true;
    }

    return column.group.toLowerCase().includes(groupHint.toLowerCase());
  });

  return matches[occurrence] || null;
}

function readValue(row, column) {
  if (!column) {
    return "";
  }

  return row[column.index];
}

function readCompletion(row, column) {
  const value = String(readValue(row, column) || "").trim().toLowerCase();
  return ["ok", "yes", "y", "done", "completed", "complete", "x", "1", "true"].includes(value);
}

function buildMaturitySnapshot(row, columns) {
  const output = {};
  columns.forEach((column) => {
    output[column.header] = String(readValue(row, column) || "").trim();
  });
  return output;
}

function calculateProgramProgress(
  introCourses,
  specialistCourses,
  theoryCompleted,
  workbookFlags
) {
  const introDone = isAccreditedValue(workbookFlags.intro)
    ? 6
    : [
        introCourses.one,
        introCourses.vm || introCourses.sc,
        introCourses.was,
        introCourses.ie,
        introCourses.ot,
        introCourses.cs
      ].filter(Boolean).length;

  const specialistDone = isAccreditedValue(workbookFlags.specialist)
    ? 4
    : (specialistCourses.one ? 1 : 0) +
      (specialistCourses.vm || specialistCourses.sc ? 1 : 0) +
      Math.min(
        [specialistCourses.ie, specialistCourses.ot, specialistCourses.cs].filter(Boolean).length,
        2
      );

  const theoryDone = theoryCompleted ? 1 : 0;
  const totalDone = introDone + specialistDone + theoryDone;
  const totalCriteria = 11;

  return {
    introDone,
    specialistDone,
    theoryDone,
    totalDone,
    totalCriteria,
    percentage: Math.round((totalDone / totalCriteria) * 100)
  };
}

function isAccreditedValue(value) {
  return String(value || "").trim().toLowerCase() === "accredited";
}

function evaluateIntro(courses, requirements) {
  const courseMap = {
    "Introduction to Tenable One": courses.one,
    "Introduction to Tenable Vulnerability Management": courses.vm,
    "Introduction to Tenable Security Center": courses.sc,
    "Introduction to Tenable Web Application Security": courses.was,
    "Introduction to Tenable Identity Exposure": courses.ie,
    "Introduction to Tenable OT Security": courses.ot,
    "Introduction to Tenable Cloud Security": courses.cs
  };

  return evaluateCourseRules(courseMap, requirements.introduction);
}

function evaluateSpecialist(courses, requirements) {
  const courseMap = {
    "Tenable One Specialist": courses.one,
    "Tenable Vulnerability Management Specialist": courses.vm,
    "Tenable Security Center Specialist": courses.sc,
    "Tenable Identity Exposure Specialist": courses.ie,
    "Tenable OT Security Specialist": courses.ot,
    "Tenable Cloud Security Specialist": courses.cs
  };

  return evaluateCourseRules(courseMap, requirements.specialist);
}

function evaluateCourseRules(courseMap, ruleSet) {
  const completedCourses = [];
  const missingCourses = [];
  let passed = true;

  (ruleSet.requiredAll || []).forEach((course) => {
    if (courseMap[course]) {
      completedCourses.push(course);
    } else {
      passed = false;
      missingCourses.push(course);
    }
  });

  (ruleSet.oneOfGroups || []).forEach((group) => {
    const completed = group.filter((course) => courseMap[course]);
    if (completed.length) {
      completedCourses.push(...completed);
    } else {
      passed = false;
      missingCourses.push(`Complete at least one of: ${group.join(" | ")}`);
    }
  });

  (ruleSet.minimumGroups || []).forEach((group) => {
    const completed = group.courses.filter((course) => courseMap[course]);
    if (completed.length >= group.count) {
      completedCourses.push(...completed);
    } else {
      passed = false;
      missingCourses.push(`Complete at least ${group.count} of: ${group.courses.join(" | ")}`);
    }
  });

  return { passed, completedCourses, missingCourses };
}

export function parseGuardianSheet(workbook) {
  const sheetName =
    workbook.SheetNames.find((name) => /guardian/i.test(name.trim())) ||
    workbook.SheetNames[1];

  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) {
    return [];
  }

  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => /guardian[\s_-]*name/i.test(String(cell || "").trim()))
  );

  const startRow = headerIndex >= 0 ? headerIndex : 0;
  const headers = (rows[startRow] || []).map((h) => String(h || "").trim().toLowerCase());

  const idx = {
    name: headers.findIndex((h) => h.includes("guardian") || h === "name"),
    email: headers.indexOf("email"),
    partner: headers.indexOf("partner"),
    specialist: headers.findIndex((h) => h.includes("specialist")),
    tcsa: headers.indexOf("tcsa"),
    tcse: headers.indexOf("tcse"),
    tcde: headers.indexOf("tcde"),
    obs: headers.indexOf("obs")
  };

  return rows
    .slice(startRow + 1)
    .filter((row) => String(row[idx.name] ?? "").trim())
    .map((row) => {
      const specialist = readGuardianBool(row[idx.specialist]);
      const tcsa = readGuardianBool(row[idx.tcsa]);
      const tcse = readGuardianBool(row[idx.tcse]);
      const tcde = readGuardianBool(row[idx.tcde]);
      const certsDone = [specialist, tcsa, tcse, tcde].filter(Boolean).length;

      return {
        name: String(row[idx.name] ?? "").trim(),
        email: String(row[idx.email] ?? "").trim(),
        partner: String(row[idx.partner] ?? "").trim(),
        specialist,
        tcsa,
        tcse,
        tcde,
        obs: String(row[idx.obs] ?? "").trim(),
        computed: {
          allComplete: certsDone === 4,
          certsDone,
          percentage: Math.round((certsDone / 4) * 100)
        }
      };
    });
}

function readGuardianBool(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "yes", "ok", "1", "x", "done", "complete"].includes(normalized);
}

export function parseTechCertsSheet(workbook) {
  const sheetName = workbook.SheetNames.find((name) => /tech.?cert/i.test(name.trim()));
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: 0 });
  if (rows.length < 2) return [];

  const headers = (rows[0] || []).map((h) => String(h || "").trim());

  return rows
    .slice(1)
    .filter((row) => String(row[1] || "").trim())
    .map((row) => {
      const certs = {};
      headers.slice(2).forEach((h, i) => {
        certs[h] = Number(row[i + 2]) || 0;
      });
      return {
        partnerId: String(row[0] || "").trim(),
        partnerName: String(row[1] || "").trim(),
        certs
      };
    });
}

// ─── EM Certs Detail (drill-down por pessoa) ──────────────────────────────
// Regras dos blocos espelham exatamente as do EM Certification Dashboard
// (Tenable University): Block 1 = Intro (6 itens), Block 2 = Specialist
// (Req1 fixo + Req2 1-de-5 + Req3 2-de-3 grupos), Block 3 = Theory.

export const EM_COURSE_NAMES = {
  303: "Introduction to Tenable OT Security",
  333: "Introduction to Tenable Security Center",
  346: "Introduction to Tenable Vulnerability Management",
  414: "Introduction to Tenable Identity Exposure",
  483: "Tenable One Exposure Management Platform Introduction",
  535: "Introduction to Tenable Cloud Security",
  551: "Introduction to Web Application Scanning",
  561: "Tenable One Exposure Management Platform Specialist On-Demand",
  304: "Tenable Security Center Specialist",
  375: "Tenable Vulnerability Management Specialist",
  488: "Tenable Vulnerability Management Specialist On-Demand",
  554: "Domain Test Out Exam for Security Center",
  557: "Domain Test out Exam for Tenable VM",
  332: "Tenable OT Security Specialist",
  555: "Domain Test out exam for Tenable OT",
  420: "Tenable Identity Exposure Specialist",
  560: "Domain Test out Exam for Tenable IE",
  540: "Tenable Cloud Security Specialist",
  539: "Tenable Cloud Security Specialist On-Demand",
  556: "Domain Test out Exam for Tenable CS",
  552: "Exposure Management Business Theory"
};

export function emCourseName(courseId) {
  return EM_COURSE_NAMES[courseId] || `Course ${courseId}`;
}

export function parseEmCertsDetailSheet(workbook) {
  const sheetName = workbook.SheetNames.find((name) => /em certs detail/i.test(name.trim()));
  if (!sheetName) return {};

  const sheet = workbook.Sheets[sheetName];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) return {};

  const grouped = {};
  rows.slice(1).forEach((row) => {
    const partnerId = String(row[0] ?? "").trim();
    const partnerName = String(row[1] ?? "").trim();
    const userName = String(row[2] ?? "").trim();
    const email = String(row[3] ?? "").trim();
    const course = Number(row[4]);
    if (!partnerName || !userName || !course) return;

    if (!grouped[partnerName]) {
      grouped[partnerName] = { partnerId, partnerName, users: {} };
    }
    if (!grouped[partnerName].users[userName]) {
      grouped[partnerName].users[userName] = { name: userName, email, courses: new Set() };
    }
    grouped[partnerName].users[userName].courses.add(course);
  });

  const result = {};
  Object.values(grouped).forEach((entry) => {
    const users = Object.values(entry.users)
      .map((u) => ({
        name: u.name,
        email: u.email,
        courses: Array.from(u.courses).sort((a, b) => a - b)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const courseSet = new Set();
    users.forEach((u) => u.courses.forEach((c) => courseSet.add(c)));

    result[entry.partnerName] = {
      partnerId: entry.partnerId,
      partnerName: entry.partnerName,
      users,
      blocks: computeEmCertBlocks(courseSet)
    };
  });
  return result;
}

function computeEmCertBlocks(courseSet) {
  const has = (course) => courseSet.has(course);

  const b1Items = [
    { code: "303", label: "Introduction to Tenable OT Security", pass: has(303) },
    {
      code: "333/346",
      label: "Introduction to Tenable Security Center OU Introduction to Tenable Vulnerability Management",
      pass: has(333) || has(346)
    },
    { code: "414", label: "Introduction to Tenable Identity Exposure", pass: has(414) },
    { code: "483", label: "Tenable One Exposure Management Platform Introduction", pass: has(483) },
    { code: "535", label: "Introduction to Tenable Cloud Security", pass: has(535) },
    { code: "551", label: "Introduction to Web Application Scanning", pass: has(551) }
  ];
  const b1MetCount = b1Items.filter((item) => item.pass).length;
  const b1Pass = b1MetCount === 6;
  const b1Pct = Math.round((b1MetCount / 6) * 1000) / 10;

  const b2Req1Pass = has(561);
  const b2Req2Done = [304, 375, 488, 554, 557].filter(has);
  const b2Req2Pass = b2Req2Done.length > 0;

  const grpADone = [332, 555].filter(has);
  const grpBDone = [420, 560].filter(has);
  const grpCDone = [540, 539, 556].filter(has);
  const grpAPass = grpADone.length > 0;
  const grpBPass = grpBDone.length > 0;
  const grpCPass = grpCDone.length > 0;
  const grpsCount = [grpAPass, grpBPass, grpCPass].filter(Boolean).length;
  const b2Req3Pass = grpsCount >= 2;

  const b2Pass = b2Req1Pass && b2Req2Pass && b2Req3Pass;
  const b2Score = (b2Req1Pass ? 1 : 0) + (b2Req2Pass ? 1 : 0) + Math.min(grpsCount, 2) / 2;
  const b2Pct = Math.round((b2Score / 3) * 1000) / 10;

  const b3Pass = has(552);
  const b3Pct = b3Pass ? 100 : 0;

  const overall = b1Pass && b2Pass && b3Pass;
  const overallPct = Math.round(((b1Pct + b2Pct + b3Pct) / 3) * 10) / 10;

  return {
    overall,
    overallPct,
    b1: { pass: b1Pass, pct: b1Pct, metCount: b1MetCount, items: b1Items },
    b2: {
      pass: b2Pass,
      pct: b2Pct,
      req1: { pass: b2Req1Pass },
      req2: { pass: b2Req2Pass, done: b2Req2Done },
      req3: {
        pass: b2Req3Pass,
        metCount: grpsCount,
        groupA: { pass: grpAPass, done: grpADone },
        groupB: { pass: grpBPass, done: grpBDone },
        groupC: { pass: grpCPass, done: grpCDone }
      }
    },
    b3: { pass: b3Pass, pct: b3Pct }
  };
}
