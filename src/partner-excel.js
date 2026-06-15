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
      primaryContact: String(row[2] || "").trim(),
      status: String(row[3] || "").trim(),
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
