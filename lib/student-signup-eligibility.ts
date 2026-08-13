import "server-only";

import { normalizeEmail, normalizeStudentId } from "@/lib/auth-validation";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

export type StudentSignupEligibilityFailure = {
  eligible: false;
  code:
    | "STUDENT_EMAIL_NOT_REGISTERED"
    | "STUDENT_REGISTRY_ID_MISMATCH"
    | "STUDENT_REGISTRY_ALREADY_CLAIMED";
  message: string;
};

export type StudentSignupEligibility =
  | { eligible: true }
  | StudentSignupEligibilityFailure;

/**
 * Check the server-only institutional signup record before starting identity
 * uploads or creating an Auth user. The database trigger repeats this rule
 * under a row lock, so this early check improves UX without becoming the
 * security boundary.
 */
export async function checkStudentSignupEligibility(
  studentEmail: string,
  indexNumber: string,
): Promise<StudentSignupEligibility> {
  const normalizedStudentEmail = normalizeEmail(studentEmail);
  const normalizedIndexNumber = normalizeStudentId(indexNumber);
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_signup_allowlist")
    .select("index_number,is_active,claimed_by")
    .eq("student_email", normalizedStudentEmail)
    .maybeSingle();

  if (error) throw new Error("Student registration lookup failed.");

  if (!data || data.is_active !== true) {
    return {
      eligible: false,
      code: "STUDENT_EMAIL_NOT_REGISTERED",
      message: "This student email is not in the registered KNUST student database. Make sure you are a registered KNUST student and check the address before trying again.",
    };
  }

  if (normalizeStudentId(String(data.index_number ?? "")) !== normalizedIndexNumber) {
    return {
      eligible: false,
      code: "STUDENT_REGISTRY_ID_MISMATCH",
      message: "The student ID does not match the registered KNUST student email. Check both details.",
    };
  }

  if (data.claimed_by) {
    return {
      eligible: false,
      code: "STUDENT_REGISTRY_ALREADY_CLAIMED",
      message: "This student registration record has already been claimed. Sign in or reset your password.",
    };
  }

  return { eligible: true };
}
