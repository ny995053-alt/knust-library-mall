export const KNUST_STUDENT_EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@st\.knust\.edu\.gh$/i;
export const PERSONAL_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const STUDENT_ID_PATTERN = /^\d{8}$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeStudentId(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isStrongPassword(value: string) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}
