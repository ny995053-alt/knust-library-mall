import { createHash, randomBytes, randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAuthRateLimit, isSameOriginRequest, parseLimitedJsonRequest, requestClientKey } from "@/lib/auth-server";
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

const createAdministratorSchema = z.object({
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
  return randomBytes(24).toString("base64url") + "Aa1!";
}

async function createUniqueAdministratorId() {
  const admin = getSupabaseAdminClient();
  const year = String(new Date().getUTCFullYear()).slice(-2);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const staffId = `ADMIN/STAFF/${year}/${randomInt(100000, 1000000)}`;
    const result = await admin.from("profiles").select("id").eq("index_number", staffId).maybeSingle();
    if (result.error) throw new Error("STAFF_ID_LOOKUP_FAILED");
    if (!result.data) return staffId;
  }

  throw new Error("STAFF_ID_GENERATION_FAILED");
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid administrator provisioning request." }, { status: 403, headers: noStoreHeaders });
  }

  const token = authorizationToken(request);
  if (!token) {
    return NextResponse.json({ error: "Super administrator authentication is required." }, { status: 401, headers: noStoreHeaders });
  }

  let body: unknown;
  try {
    body = await parseLimitedJsonRequest(request, 8 * 1024);
  } catch {
    return NextResponse.json({ error: "Invalid administrator account details." }, { status: 400, headers: noStoreHeaders });
  }

  const parsed = createAdministratorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter the administrator's full name and a valid personal email." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const admin = getSupabaseAdminClient();
  const authenticated = await admin.auth.getUser(token);
  if (authenticated.error || !authenticated.data.user) {
    return NextResponse.json({ error: "Your super administrator session is invalid or has expired." }, { status: 401, headers: noStoreHeaders });
  }

  const actorId = authenticated.data.user.id;
  const actorResult = await admin.from("profiles").select("id,role,status,admin_access_revoked_at").eq("id", actorId).maybeSingle();
  const actor = actorResult.data as { id: string; role: string; status: string; admin_access_revoked_at: string | null } | null;
  if (actorResult.error || !actor || actor.role !== "super_admin" || actor.status !== "active" || actor.admin_access_revoked_at) {
    return NextResponse.json({ error: "Active super administrator access is required." }, { status: 403, headers: noStoreHeaders });
  }

  const personalEmail = normalizeEmail(parsed.data.personalEmail);
  const actorRateKey = "provision-administrator-actor:" + requestClientKey(request, actorId);
  const emailRateKey = "provision-administrator-email:" + requestClientKey(request, actorId + ":" + personalEmail);
  if (
    !checkAuthRateLimit(actorRateKey, 6, 15 * 60 * 1000)
    || !checkAuthRateLimit(emailRateKey, 3, 15 * 60 * 1000)
  ) {
    return NextResponse.json(
      { error: "Too many administrator accounts were requested. Wait a few minutes and try again." },
      { status: 429, headers: noStoreHeaders },
    );
  }

  const [canonicalMatch, personalMatch] = await Promise.all([
    admin.from("profiles").select("id").eq("email", personalEmail).maybeSingle(),
    admin.from("profiles").select("id").eq("personal_email", personalEmail).maybeSingle(),
  ]);
  if (canonicalMatch.error || personalMatch.error) {
    return NextResponse.json({ error: "Administrator account availability could not be checked." }, { status: 503, headers: noStoreHeaders });
  }
  if (canonicalMatch.data || personalMatch.data) {
    return NextResponse.json({ error: "An account already uses this personal email." }, { status: 409, headers: noStoreHeaders });
  }

  let createdUserId: string | null = null;
  let intentTokenHash: string | null = null;
  let failureStage: "staff_id" | "intent" | "auth" | "metadata" | "profile" | "cleanup" | "audit" = "staff_id";

  try {
    const staffId = await createUniqueAdministratorId();
    const temporaryPassword = createTemporaryPassword();
    const provisioningToken = randomBytes(32).toString("hex");
    intentTokenHash = createHash("sha256").update(provisioningToken).digest("hex");

    failureStage = "intent";
    const intent = await admin.from("librarian_provisioning_intents").insert({
      token_hash: intentTokenHash,
      personal_email: personalEmail,
      staff_id: staffId,
      actor_id: actorId,
      provisioned_role: "admin",
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (intent.error) throw new Error("PROVISIONING_INTENT_FAILED");

    failureStage = "auth";
    const created = await admin.auth.admin.createUser({
      email: personalEmail,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { provisioned_role: "admin" },
      user_metadata: {
        full_name: parsed.data.fullName,
        index_number: staffId,
        provisioning_token: provisioningToken,
        account_type: "administrator",
      },
    });
    if (created.error || !created.data.user) {
      const duplicate = /already|registered|exists|duplicate/i.test(created.error?.message ?? "");
      if (duplicate) {
        await admin.from("librarian_provisioning_intents").delete().eq("token_hash", intentTokenHash);
        intentTokenHash = null;
        return NextResponse.json({ error: "An account already uses this personal email." }, { status: 409, headers: noStoreHeaders });
      }
      throw new Error("AUTH_CREATE_FAILED");
    }
    createdUserId = created.data.user.id;

    failureStage = "metadata";
    const safeUserMetadata = Object.fromEntries(
      Object.entries(created.data.user.user_metadata ?? {}).filter(([key]) => key !== "provisioning_token"),
    );
    const trustedMetadata = await admin.auth.admin.updateUserById(createdUserId, {
      app_metadata: {
        ...created.data.user.app_metadata,
        provisioned_role: "admin",
      },
      user_metadata: {
        ...safeUserMetadata,
        full_name: parsed.data.fullName,
        index_number: staffId,
        provisioning_token: null,
        account_type: "administrator",
      },
    });
    if (trustedMetadata.error) throw new Error("AUTH_METADATA_FAILED");

    failureStage = "profile";
    const profileResult = await admin.rpc("service_provision_administrator_profile", {
      p_actor_id: actorId,
      p_auth_user_id: createdUserId,
      p_full_name: parsed.data.fullName,
      p_staff_id: staffId,
      p_personal_email: personalEmail,
    });
    if (profileResult.error) throw new Error("PROFILE_FINALIZATION_FAILED");

    failureStage = "cleanup";
    const [privateProfileCleanup, intentCleanup] = await Promise.all([
      admin.from("student_private_profiles").delete().eq("profile_id", createdUserId),
      admin.from("librarian_provisioning_intents").delete().eq("token_hash", intentTokenHash),
    ]);
    if (privateProfileCleanup.error || intentCleanup.error) throw new Error("TRANSIENT_CLEANUP_FAILED");
    intentTokenHash = null;

    failureStage = "audit";
    const auditResult = await admin.from("audit_events").insert({
      actor_id: actorId,
      event_type: "administrator_credentials_issued",
      entity_type: "profile",
      entity_id: createdUserId,
      metadata: {
        provisioning_method: "super_admin_generated_credentials",
        staff_id: staffId,
        personal_email: personalEmail,
        assigned_role: "admin",
      },
    });
    if (auditResult.error) throw new Error("AUDIT_WRITE_FAILED");

    return NextResponse.json({
      credentials: {
        fullName: parsed.data.fullName,
        personalEmail,
        staffId,
        temporaryPassword,
      },
    }, { status: 201, headers: noStoreHeaders });
  } catch {
    console.error("Administrator provisioning failed", {
      stage: failureStage,
      code: "PROVISIONING_FAILED",
    });

    const authCleanup = createdUserId ? await admin.auth.admin.deleteUser(createdUserId) : null;
    const intentCleanup = intentTokenHash
      ? await admin.from("librarian_provisioning_intents").delete().eq("token_hash", intentTokenHash)
      : null;
    const cleanupUnconfirmed = Boolean(authCleanup?.error || intentCleanup?.error);

    return NextResponse.json({
      error: cleanupUnconfirmed
        ? "The administrator account could not be finalized and automatic cleanup was not confirmed. Contact a super administrator before retrying."
        : failureStage === "intent" || failureStage === "profile"
          ? "Secure administrator provisioning is not available yet. Apply the latest Supabase SQL and retry."
          : "The administrator account could not be created securely. Any incomplete account was removed.",
    }, { status: 503, headers: noStoreHeaders });
  }
}
