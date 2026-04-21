export const COLLEGE_EMAIL_DOMAIN = "bitsathy.ac.in";

const DEPARTMENT_BY_CODE = {
  ec: "ECE",
  cs: "CSE",
  it: "IT",
  me: "Mechanical",
  ee: "EEE",
};

export const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

export const isCollegeEmail = (email = "") => {
  const normalized = normalizeEmail(email);
  return normalized.endsWith(`@${COLLEGE_EMAIL_DOMAIN}`);
};

export const parseAcademicDetailsFromEmail = (email = "") => {
  const normalized = normalizeEmail(email);
  if (!isCollegeEmail(normalized)) {
    return { departmentCode: "", department: "", batch: "", year: "" };
  }

  const localPart = normalized.split("@")[0] || "";
  const match = localPart.match(/^([a-z]{2})(\d{2})/i);
  if (!match) {
    return { departmentCode: "", department: "", batch: "", year: "" };
  }

  const departmentCode = String(match[1] || "").toLowerCase();
  const batchCode = String(match[2] || "");
  const batchStart = Number(`20${batchCode}`);

  if (!Number.isFinite(batchStart)) {
    return {
      departmentCode,
      department: DEPARTMENT_BY_CODE[departmentCode] || departmentCode.toUpperCase(),
      batch: "",
      year: "",
    };
  }

  return {
    departmentCode,
    department: DEPARTMENT_BY_CODE[departmentCode] || departmentCode.toUpperCase(),
    batch: String(batchStart),
    year: `${batchStart}-${batchStart + 4}`,
  };
};

export const COLLEGE_EMAIL_ERROR =
  "Only college email (@bitsathy.ac.in) is allowed. Please use your institutional email ID.";
