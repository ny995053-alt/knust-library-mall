import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAuthRateLimit, isSameOriginRequest, parseLimitedJsonRequest, requestClientKey } from "@/lib/auth-server";
import { KNUST_STUDENT_EMAIL_PATTERN, normalizeEmail, normalizeStudentId, STUDENT_ID_PATTERN } from "@/lib/auth-validation";
import { checkStudentSignupEligibility } from "@/lib/student-signup-eligibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};

const requestSchema = z.object({
  studentEmail: z.string().trim().max(160),
  indexNumber: z.string().trim().min(3).max(50),
}).superRefine((value, context) => {
  if (!KNUST_STUDENT_EMAIL_PATTERN.test(normalizeEmail(value.studentEmail))) {
    context.addIssue({ code: "custom", path: ["studentEmail"], message: "A valid KNUST student email is required." });
  }
  if (!STUDENT_ID_PATTERN.test(normalizeStudentId(value.indexNumber))) {
    context.addIssue({ code: "custom", path: ["indexNumber"], message: "A valid KNUST student ID is required." });
  }
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid student registration check." }, { status: 403, headers: noStoreHeaders });
  }

  let body: unknown;
  try {
    body = await parseLimitedJsonRequest(request, 2 * 1024);
  } catch {
    return NextResponse.json({ error: "Invalid student registration check." }, { status: 400, headers: noStoreHeaders });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid KNUST student email and student ID." }, { status: 400, headers: noStoreHeaders });
  }

  const studentEmail = normalizeEmail(parsed.data.studentEmail);
  const indexNumber = normalizeStudentId(parsed.data.indexNumber);
  // Keep one budget per client/IP. Including the candidate email in the key
  // would let a caller rotate addresses and enumerate the private registry.
  const rateKey = requestClientKey(request, "signup-precheck");
  if (!checkAuthRateLimit(rateKey, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many student registration checks were made. Please wait a few minutes and try again." }, { status: 429, headers: noStoreHeaders });
  }

  try {
    const result = await checkStudentSignupEligibility(studentEmail, indexNumber);
    if (!result.eligible) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: 400, headers: noStoreHeaders },
      );
    }

    return NextResponse.json({ eligible: true }, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      { error: "Student registration could not be verified right now. Please try again later.", code: "STUDENT_REGISTRY_UNAVAILABLE" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
