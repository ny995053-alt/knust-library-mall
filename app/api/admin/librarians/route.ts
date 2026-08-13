import { createHash, randomBytes, randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAuthRateLimit, clearAuthRateLimit, isSameOriginRequest, parseLimitedJsonRequest, requestClientKey } from "@/lib/auth-server";
import { KNUST_STUDENT_EMAIL_PATTERN, normalizeEmail, PERSONAL_EMAIL_PATTERN } from "@/lib/auth-validation";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
const createLibrarianSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  personalEmail: z.string().trim().max(160),
}).strict().superRefine((value, context) => {
  const email = normalizeEmail(value.personalEmail);
  if (!PERSONAL_EMAIL_PATTERN.test(email) || KNUST_STUDENT_EMAIL_PATTERN.test(email)) {
    context.addIssue({ code: "custom", path: ["personalEmail"], message: "A valid personal email is required." });
  }
});

function authorizationToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  return match?.[1] ?? null;
}

function createTemporaryPassword() {
  return randomBytes(18).toString("base64url") + "Aa1!";
}

function createTransientStudentEmail(staffId: string) {
  const localPart = staffId.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
  return `library.staff.${localPart}@st.knust.edu.gh`;
}

async function createUniqueStaffId() {
  const admin = getSupabaseAdminClient();
  const year = String(new Date().getUTCFullYear()).slice(-2);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const staffId = `LIB/STAFF/${year}/${randomInt(100000, 1000000)}`;
    const result = await admin.from("profiles").select("id").eq("index_number", staffId).maybeSingle();
    if (result.error) throw new Error("Staff ID availability could not be checked.");
    if (!result.data) return staffId;
  }
  throw new Error("A unique staff ID could not be generated.");
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid librarian provisioning request." }, { status: 403, headers: noStoreHeaders });
  }

  const token = authorizationToken(request);
  if (!token) {
    return NextResponse.json({ error: "Administrator authentication is required." }, { status: 401, headers: noStoreHeaders });
  }

  let body: unknown;
  try {
    body = await parseLimitedJsonRequest(request, 8 * 1024);
  } catch {
    return NextResponse.json({ error: "Invalid librarian account details." }, { status: 400, headers: noStoreHeaders });
  }

  const parsed = createLibrarianSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the librarian's full name and a valid personal email." }, { status: 400, headers: noStoreHeaders });
  }

  const admin = getSupabaseAdminClient();
  const authenticated = await admin.auth.getUser(token);
  if (authenticated.error || !authenticated.data.user) {
    return NextResponse.json({ error: "Your administrator session is invalid or has expired." }, { status: 401, headers: noStoreHeaders });
  }

  const actorId = authenticated.data.user.id;
  const actorResult = await admin.from("profiles").select("id,role,status,admin_access_revoked_at").eq("id", actorId).maybeSingle();
  const actor = actorResult.data as { id: string; role: string; status: string; admin_access_revoked_at: string | null } | null;
  if (actorResult.error || !actor || actor.status !== "active" || actor.admin_access_revoked_at || (actor.role !== "admin" && actor.role !== "super_admin")) {
    return NextResponse.json({ error: "Active administrator access is required." }, { status: 403, headers: noStoreHeaders });
  }

  const personalEmail = normalizeEmail(parsed.data.personalEmail);
  const rateKey = "provision-librarian:" + requestClientKey(request, actorId + ":" + personalEmail);
  if (!checkAuthRateLimit(rateKey, 4, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many librarian accounts were requested. Wait a few minutes and try again." }, { status: 429, headers: noStoreHeaders });
  }

  const [canonicalMatch, personalMatch] = await Promise.all([
    admin.from("profiles").select("id").eq("email", personalEmail).maybeSingle(),
    admin.from("profiles").select("id").eq("personal_email", personalEmail).maybeSingle(),
  ]);
  if (canonicalMatch.error || personalMatch.error) {
    return NextResponse.json({ error: "Existing accounts could not be checked." }, { status: 503, headers: noStoreHeaders });
  }
  if (canonicalMatch.data || personalMatch.data) {
    return NextResponse.json({ error: "An account already uses this personal email. Use the existing-account promotion flow instead." }, { status: 409, headers: noStoreHeaders });
  }

  let createdUserId: string | null = null;
  let intentTokenHash: string | null = null;
  let failureStage: "intent" | "auth" | "metadata" | "profile" | "cleanup" | "audit" = "intent";
  try {
    const staffId = await createUniqueStaffId();
    const temporaryPassword = createTemporaryPassword();
    const transientStudentEmail = createTransientStudentEmail(staffId);
    const provisioningToken = randomBytes(32).toString("hex");
    intentTokenHash = createHash("sha256").update(provisioningToken).digest("hex");

    // This short-lived, service-only intent gives the Auth insert trigger a
    // non-forgeable proof that this account was initiated by an active admin.
    // It is consumed atomically by the trigger before the public signup lock.
    const intent = await admin.from("librarian_provisioning_intents").insert({
      token_hash: intentTokenHash,
      personal_email: personalEmail,
      staff_id: staffId,
      actor_id: actorId,
      provisioned_role: "librarian",
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (intent.error) {
      clearAuthRateLimit(rateKey);
      return NextResponse.json({
        error: "Secure librarian provisioning is unavailable. Apply the latest Supabase SQL and try again.",
      }, { status: 503, headers: noStoreHeaders });
    }

    // Supabase Auth does not guarantee that custom app_metadata is visible to
    // an auth.users INSERT trigger. The one-time provisioning token is matched
    // to the service-only intent above; public callers cannot create one.
    failureStage = "auth";
    const created = await admin.auth.admin.createUser({
      email: personalEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.data.fullName,
        index_number: staffId,
        student_email: transientStudentEmail,
        provisioning_token: provisioningToken,
      },
    });
    if (created.error || !created.data.user) {
      await admin.from("librarian_provisioning_intents").delete().eq("token_hash", intentTokenHash);
      intentTokenHash = null;
      clearAuthRateLimit(rateKey);
      const duplicate = /already|registered|exists|duplicate/i.test(created.error?.message ?? "");
      return NextResponse.json({
        error: duplicate
          ? "An account already uses this personal email. Use the existing-account promotion flow instead."
          : "The librarian account could not be created.",
      }, { status: duplicate ? 409 : 503, headers: noStoreHeaders });
    }
    createdUserId = created.data.user.id;

    failureStage = "metadata";
    const safeUserMetadata = Object.fromEntries(
      Object.entries(created.data.user.user_metadata ?? {}).filter(([key]) => key !== "provisioning_token"),
    );
    const trustedMetadata = await admin.auth.admin.updateUserById(createdUserId, {
      app_metadata: {
        ...created.data.user.app_metadata,
        provisioned_role: "librarian",
      },
      user_metadata: {
        ...safeUserMetadata,
        full_name: parsed.data.fullName,
        index_number: staffId,
        student_email: null,
        provisioning_token: null,
        account_type: "librarian",
      },
    });
    if (trustedMetadata.error) throw new Error("Trusted librarian metadata could not be applied.");

    failureStage = "profile";
    const profileResult = await admin.rpc("service_provision_librarian_profile", {
      p_auth_user_id: createdUserId,
      p_full_name: parsed.data.fullName,
      p_staff_id: staffId,
      p_personal_email: personalEmail,
    });
    if (profileResult.error) throw new Error("The librarian profile could not be finalized.");

    // This keeps the route compatible with an already-applied schema while
    // the SQL RPC also performs the same idempotent cleanup for future runs.
    failureStage = "cleanup";
    const intakeCleanup = await admin.from("student_private_profiles").delete().eq("profile_id", createdUserId);
    if (intakeCleanup.error) throw new Error("The transient student intake could not be removed.");

    failureStage = "audit";
    const auditResult = await admin.from("audit_events").insert({
      actor_id: actorId,
      event_type: "librarian_credentials_issued",
      entity_type: "profile",
      entity_id: createdUserId,
      metadata: {
        provisioning_method: "admin_generated_credentials",
        staff_id: staffId,
        personal_email: personalEmail,
      },
    });
    if (auditResult.error) throw new Error("The credential issuance audit could not be recorded.");

    clearAuthRateLimit(rateKey);
    return NextResponse.json({
      credentials: {
        fullName: parsed.data.fullName,
        personalEmail,
        staffId,
        temporaryPassword,
      },
    }, { status: 201, headers: noStoreHeaders });
  } catch (caughtError) {
    console.error("Librarian provisioning failed", {
      stage: failureStage,
      code: typeof caughtError === "object" && caughtError && "code" in caughtError ? String(caughtError.code) : "unavailable",
    });
    const cleanup = createdUserId ? await admin.auth.admin.deleteUser(createdUserId) : null;
    const intentCleanup = intentTokenHash
      ? await admin.from("librarian_provisioning_intents").delete().eq("token_hash", intentTokenHash)
      : null;
    clearAuthRateLimit(rateKey);
    const stageMessage = failureStage === "intent"
      ? "Secure librarian provisioning could not be started. Apply the latest Supabase SQL and try again."
      : failureStage === "auth"
      ? "Supabase Auth could not create the librarian account. Check the Auth logs and try a different personal email."
      : failureStage === "profile"
        ? "The librarian profile could not be finalized. Apply the latest Supabase SQL and try again."
        : "The librarian account could not be finalized securely. Please try again.";
    return NextResponse.json({
      error: cleanup?.error || intentCleanup?.error
        ? "The librarian account could not be finalized and automatic cleanup was not confirmed. Contact a system administrator before retrying."
        : `${stageMessage} The incomplete account was removed.`,
    }, { status: 503, headers: noStoreHeaders });
  }
}
