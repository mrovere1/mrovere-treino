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

  const groups = propagateGroups(rows[0] || []);
  const headers = rows[1] || [];
  const allColumns = headers.map((header, index) => ({
    index,
    group: groups[index] || "",
    header: String(header || "").trim()
  }));

  const maturityColumns = allColumns.filter((column) =>
    ["EM", "VM/WAS", "CS", "TPM"].includes(column.header)
  );

  const dataRows = rows.slice(3).filter((row) => String(row[1] || "").trim());

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
      one: readCompletion(row, findColumn(allColumns, "ONE", "special", 1)),
      vm: readCompletion(row, findColumn(allColumns, "VM", "special", 1)),
      sc: readCompletion(row, findColumn(allColumns, "SC", "special", 1)),
      ie: readCompletion(row, findColumn(allColumns, "IE", "special", 1)),
      ot: readCompletion(row, findColumn(allColumns, "OT", "special", 1)),
      cs: readCompletion(row, findColumn(allColumns, "CS", "special", 1))
    };

    const theoryCompleted = readCompletion(row, findColumn(allColumns, "Theory"));
    const introResult = evaluateIntro(introCourses, requirements);
    const specialistResult = evaluateSpecialist(specialistCourses, requirements);

    const completedCourses = [
      ...introResult.completedCourses,
      ...specialistResult.completedCourses,
      ...(theoryCompleted ? requirements.theory : [])
    ];
    const missingCourses = [
      ...introResult.missingCourses,
      ...specialistResult.missingCourses,
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
      workbookFlags: {
        intro: String(readValue(row, findColumn(allColumns, "Intro CERT")) || ""),
        specialist: String(readValue(row, findColumn(allColumns, "SP CERT")) || ""),
        theory: String(readValue(row, findColumn(allColumns, "Theory")) || ""),
        accreditation: String(readValue(row, findColumn(allColumns, "Accreditation")) || "")
      },
      maturity: {
        current: buildMaturitySnapshot(row, maturityColumns.slice(0, 4)),
        target: buildMaturitySnapshot(row, maturityColumns.slice(4, 8))
      },
      computed: {
        introCertified: introResult.passed,
        specialistCertified: specialistResult.passed,
        accreditationReady: introResult.passed && specialistResult.passed && theoryCompleted,
        completedCourses,
        missingCourses
      }
    };
  });
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
  return ["yes", "y", "done", "completed", "complete", "x", "1", "true"].includes(value);
}

function buildMaturitySnapshot(row, columns) {
  const output = {};
  columns.forEach((column) => {
    output[column.header] = String(readValue(row, column) || "").trim();
  });
  return output;
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
