import { NextResponse } from "next/server";
import Busboy from "busboy";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { z } from "zod";
import { checkAuthRateLimit, clearAuthRateLimit, isSameOriginRequest, requestClientKey } from "@/lib/auth-server";
import { isStrongPassword, KNUST_STUDENT_EMAIL_PATTERN, normalizeEmail, normalizeStudentId, PERSONAL_EMAIL_PATTERN, STUDENT_ID_PATTERN } from "@/lib/auth-validation";
import { getTrustedAppOrigin } from "@/lib/app-url";
import { createSupabaseServerAuthClient, getSupabaseAdminClient } from "@/lib/supabase-server";
import { checkStudentSignupEligibility } from "@/lib/student-signup-eligibility";

export const runtime = "nodejs";

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
const signupLockedMessage = "Sign ups are suspended for now. Please come back later or wait until further notice.";
const maxStudentIdSize = 5 * 1024 * 1024;
const maxFaceSnapshotSize = 1024 * 1024;
const maxSignupBodySize = 7 * 1024 * 1024;
const studentIdExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const signupFieldNames = new Set([
  "fullName",
  "indexNumber",
  "personalEmail",
  "studentEmail",
  "password",
  "department",
  "programme",
  "startYear",
  "completionYear",
  "gender",
  "residence",
  "location",
  "studentRecordCheck",
  "facialScanCheck",
  "identityConsent",
  "identityConsentAt",
]);
const signupFileNames = new Set(["studentIdFront", "facePresenceSnapshot"]);

type SignupFile = {
  bytes: Buffer;
  filename: string;
  type: string;
};

type SignupMultipart = {
  fields: Map<string, string>;
  files: Map<string, SignupFile>;
};

class SignupMultipartError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "SignupMultipartError";
  }
}

const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  indexNumber: z.string().trim().min(3).max(50),
  personalEmail: z.string().trim().max(160),
  studentEmail: z.string().trim().max(160),
  password: z.string().min(8).max(256),
  department: z.string().trim().min(2).max(120),
  programme: z.string().trim().min(2).max(160),
  startYear: z.coerce.number().int().min(2000).max(new Date().getFullYear() + 1),
  completionYear: z.coerce.number().int().min(2000).max(new Date().getFullYear() + 15),
  gender: z.enum(["female", "male", "non-binary", "prefer-not-to-say"]),
  residence: z.enum(["on-campus", "off-campus"]),
  location: z.string().trim().min(2).max(160),
  studentRecordCheck: z.literal("simulated-passed"),
  facialScanCheck: z.literal("simulated-completed"),
  identityConsent: z.literal("true"),
  identityConsentAt: z.string().datetime({ offset: true }),
}).superRefine((value, context) => {
  const personalEmail = normalizeEmail(value.personalEmail);
  const studentEmail = normalizeEmail(value.studentEmail);
  if (!PERSONAL_EMAIL_PATTERN.test(personalEmail) || KNUST_STUDENT_EMAIL_PATTERN.test(personalEmail)) {
    context.addIssue({ code: "custom", path: ["personalEmail"], message: "A separate personal email is required." });
  }
  if (!KNUST_STUDENT_EMAIL_PATTERN.test(studentEmail)) {
    context.addIssue({ code: "custom", path: ["studentEmail"], message: "A valid KNUST student email is required." });
  }
  if (personalEmail === studentEmail) {
    context.addIssue({ code: "custom", path: ["studentEmail"], message: "The two email addresses must be different." });
  }
  if (!STUDENT_ID_PATTERN.test(normalizeStudentId(value.indexNumber))) {
    context.addIssue({ code: "custom", path: ["indexNumber"], message: "A valid KNUST student ID is required." });
  }
  if (!isStrongPassword(value.password)) {
    context.addIssue({ code: "custom", path: ["password"], message: "The password does not meet the security requirements." });
  }
  if (value.completionYear < value.startYear || value.completionYear > value.startYear + 12) {
    context.addIssue({ code: "custom", path: ["completionYear"], message: "The completion year must follow the start year." });
  }
  const consentTime = Date.parse(value.identityConsentAt);
  if (consentTime < Date.now() - 24 * 60 * 60 * 1000 || consentTime > Date.now() + 5 * 60 * 1000) {
    context.addIssue({ code: "custom", path: ["identityConsentAt"], message: "Identity consent must be provided during this signup." });
  }
});

function formString(fields: Map<string, string>, key: string) {
  return fields.get(key) ?? "";
}

/**
 * Parse the two identity files as a bounded stream.
 *
 * The built-in FormData parser buffers the complete multipart request inside
 * the Next.js development process. Large mobile images can therefore cause a
 * disproportionate heap spike while Turbopack is also compiling. Busboy keeps
 * the request bounded while preserving the same multipart browser contract.
 */
async function parseSignupMultipart(request: Request, declaredLength: number | null): Promise<SignupMultipart> {
  if (!request.body) throw new SignupMultipartError("Invalid account request.");

  const fields = new Map<string, string>();
  const files = new Map<string, SignupFile>();
  const pendingFiles: Promise<void>[] = [];
  let actualLength = 0;

  let parser: ReturnType<typeof Busboy>;
  try {
    parser = Busboy({
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      limits: {
        fieldNameSize: 64,
        fieldSize: 512,
        fields: signupFieldNames.size,
        // Busboy marks a stream truncated when its byte count is exactly the
        // configured fileSize. Allow one sentinel byte here and enforce the
        // inclusive application limits after parsing.
        fileSize: maxStudentIdSize + 1,
        files: signupFileNames.size,
        // Busboy emits partsLimit when the counter reaches the configured
        // value (rather than when it exceeds it). One sentinel part therefore
        // accepts the exact 16 fields + 2 files and rejects a 19th part.
        parts: signupFieldNames.size + signupFileNames.size + 1,
        headerPairs: 32,
      },
    });
  } catch {
    throw new SignupMultipartError("Invalid account request.");
  }

  const rejectMultipart = (message: string, status = 400) => {
    if (!parser.destroyed) parser.destroy(new SignupMultipartError(message, status));
  };

  parser.on("field", (name, value, info) => {
    if (!signupFieldNames.has(name) || fields.has(name) || info.nameTruncated || info.valueTruncated) {
      rejectMultipart("Invalid account request.");
      return;
    }
    fields.set(name, value);
  });

  parser.on("file", (name, stream, info) => {
    const fileDone = new Promise<void>((resolve, reject) => {
      if (!signupFileNames.has(name) || files.has(name)) {
        stream.resume();
        reject(new SignupMultipartError("Invalid account request."));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      let limited = false;
      stream.on("limit", () => {
        limited = true;
      });
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => {
        if (limited || stream.truncated) {
          reject(new SignupMultipartError("The signup upload is too large.", 413));
          return;
        }
        files.set(name, {
          bytes: Buffer.concat(chunks, size),
          filename: info.filename,
          type: info.mimeType.toLowerCase(),
        });
        resolve();
      });
    });
    pendingFiles.push(fileDone);
    // The pipeline owns the surfaced error. Attaching this handler prevents a
    // rejected file promise from becoming an unhandled rejection meanwhile.
    void fileDone.catch((error: unknown) => {
      if (!parser.destroyed) parser.destroy(error instanceof Error ? error : new SignupMultipartError("Invalid account request."));
    });
  });

  parser.on("fieldsLimit", () => rejectMultipart("Invalid account request."));
  parser.on("filesLimit", () => rejectMultipart("Invalid account request."));
  parser.on("partsLimit", () => rejectMultipart("Invalid account request."));

  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      actualLength += chunk.length;
      if (actualLength > maxSignupBodySize || (declaredLength !== null && actualLength > declaredLength)) {
        callback(new SignupMultipartError("The signup upload is too large.", 413));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    const source = Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>);
    await pipeline(source, limiter, parser);
    await Promise.all(pendingFiles);
  } catch (error) {
    if (error instanceof SignupMultipartError) throw error;
    throw new SignupMultipartError("Invalid account request.");
  }

  if (declaredLength !== null && actualLength !== declaredLength) {
    throw new SignupMultipartError("Invalid account request.");
  }
  return { fields, files };
}

async function readSignupLock() {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("library_settings")
    .select("signup_locked")
    .eq("id", true)
    .maybeSingle();

  if (error || !data || typeof data.signup_locked !== "boolean") {
    throw new Error("Sign-up availability could not be confirmed.");
  }

  return data.signup_locked;
}

function signupLockedResponse() {
  return NextResponse.json(
    { error: signupLockedMessage, code: "SIGNUPS_LOCKED" },
    { status: 423, headers: noStoreHeaders },
  );
}

function signupAvailabilityErrorResponse() {
  return NextResponse.json(
    { error: "Sign-up is temporarily unavailable. Please try again later.", code: "SIGNUP_STATUS_UNAVAILABLE" },
    { status: 503, headers: noStoreHeaders },
  );
}

function signupErrorMessage(message: string) {
  if (/rate limit|too many/i.test(message)) {
    return "Too many account requests were made. Please wait a few minutes and try again.";
  }
  return "Your account could not be created. Check your details and try again.";
}

function matchesStudentIdSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  }
  if (type === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid account request." }, { status: 403, headers: noStoreHeaders });
  }

  const signupContentType = request.headers.get("content-type") ?? "";
  const declaredLengthHeader = request.headers.get("content-length");
  const declaredLength = declaredLengthHeader === null ? null : Number(declaredLengthHeader);
  if (!/^multipart\/form-data;\s*boundary=/i.test(signupContentType)) {
    return NextResponse.json({ error: "Invalid account request." }, { status: 415, headers: noStoreHeaders });
  }
  if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength <= 0)) {
    return NextResponse.json({ error: "Invalid account request." }, { status: 411, headers: noStoreHeaders });
  }
  if (declaredLength !== null && declaredLength > maxSignupBodySize) {
    return NextResponse.json({ error: "The signup upload is too large." }, { status: 413, headers: noStoreHeaders });
  }

  try {
    if (await readSignupLock()) return signupLockedResponse();
  } catch {
    return signupAvailabilityErrorResponse();
  }

  let multipart: SignupMultipart;
  try {
    multipart = await parseSignupMultipart(request, declaredLength);
  } catch (error) {
    const status = error instanceof SignupMultipartError ? error.status : 400;
    const message = status === 413 ? "The signup upload is too large." : "Invalid account request.";
    return NextResponse.json({ error: message }, { status, headers: noStoreHeaders });
  }

  const parsed = signupSchema.safeParse({
    fullName: formString(multipart.fields, "fullName"),
    indexNumber: formString(multipart.fields, "indexNumber"),
    personalEmail: formString(multipart.fields, "personalEmail"),
    studentEmail: formString(multipart.fields, "studentEmail"),
    password: formString(multipart.fields, "password"),
    department: formString(multipart.fields, "department"),
    programme: formString(multipart.fields, "programme"),
    startYear: formString(multipart.fields, "startYear"),
    completionYear: formString(multipart.fields, "completionYear"),
    gender: formString(multipart.fields, "gender"),
    residence: formString(multipart.fields, "residence"),
    location: formString(multipart.fields, "location"),
    studentRecordCheck: formString(multipart.fields, "studentRecordCheck"),
    facialScanCheck: formString(multipart.fields, "facialScanCheck"),
    identityConsent: formString(multipart.fields, "identityConsent"),
    identityConsentAt: formString(multipart.fields, "identityConsentAt"),
  });
  const studentIdFront = multipart.files.get("studentIdFront");
  const facePresenceSnapshot = multipart.files.get("facePresenceSnapshot");

  if (!parsed.success) {
    return NextResponse.json({ error: "Complete every student and account field with valid information." }, { status: 400, headers: noStoreHeaders });
  }
  if (!studentIdFront || studentIdFront.bytes.length === 0) {
    return NextResponse.json({ error: "Upload the front of your KNUST student ID." }, { status: 400, headers: noStoreHeaders });
  }
  if (studentIdFront.bytes.length > maxStudentIdSize || !studentIdExtensions.has(studentIdFront.type)) {
    return NextResponse.json({ error: "The student ID image must be a JPG, PNG, or WEBP file no larger than 5 MB." }, { status: 400, headers: noStoreHeaders });
  }
  const studentIdBuffer = studentIdFront.bytes;
  if (!matchesStudentIdSignature(studentIdFront.type, studentIdBuffer)) {
    return NextResponse.json({ error: "The selected file contents do not match a supported JPG, PNG, or WEBP image." }, { status: 400, headers: noStoreHeaders });
  }
  if (!facePresenceSnapshot || facePresenceSnapshot.bytes.length === 0) {
    return NextResponse.json({ error: "Complete the live camera check and capture a face-presence image." }, { status: 400, headers: noStoreHeaders });
  }
  if (facePresenceSnapshot.type !== "image/jpeg" || facePresenceSnapshot.bytes.length > maxFaceSnapshotSize) {
    return NextResponse.json({ error: "The face-presence image must be a valid JPG no larger than 1 MB." }, { status: 400, headers: noStoreHeaders });
  }
  const faceSnapshotBuffer = facePresenceSnapshot.bytes;
  if (!matchesStudentIdSignature(facePresenceSnapshot.type, faceSnapshotBuffer)) {
    return NextResponse.json({ error: "The face-presence file contents are not a valid JPG image." }, { status: 400, headers: noStoreHeaders });
  }

  const values = parsed.data;
  const personalEmail = normalizeEmail(values.personalEmail);
  const studentEmail = normalizeEmail(values.studentEmail);
  const indexNumber = normalizeStudentId(values.indexNumber);
  const rateKey = requestClientKey(request, personalEmail);
  if (!checkAuthRateLimit(rateKey, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many account requests were made. Please wait a few minutes and try again." }, { status: 429, headers: noStoreHeaders });
  }

  try {
    const admin = getSupabaseAdminClient();
    // Run the same registered email + student ID check used by Step 1 before
    // the generic duplicate checks. This keeps a direct/bypassed submission's
    // allow-list error clear while the Auth trigger remains the atomic guard.
    const eligibility = await checkStudentSignupEligibility(studentEmail, indexNumber);
    if (!eligibility.eligible) {
      return NextResponse.json(
        { error: eligibility.message, code: eligibility.code },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const [personalMatch, studentMatch, indexMatch] = await Promise.all([
      admin.from("profiles").select("id").eq("personal_email", personalEmail).maybeSingle(),
      admin.from("profiles").select("id").eq("student_email", studentEmail).maybeSingle(),
      admin.from("profiles").select("id").eq("index_number", indexNumber).maybeSingle(),
    ]);
    if (personalMatch.error || studentMatch.error || indexMatch.error) {
      throw new Error("Student account checks are temporarily unavailable.");
    }
    if (personalMatch.data || studentMatch.data || indexMatch.data) {
      return NextResponse.json({ error: signupErrorMessage("duplicate") }, { status: 400, headers: noStoreHeaders });
    }

    const completedAt = new Date().toISOString();
    const initialMetadata = {
      full_name: values.fullName,
      index_number: indexNumber,
      personal_email: personalEmail,
      student_email: studentEmail,
      department: values.department,
      programme: values.programme,
      start_year: values.startYear,
      completion_year: values.completionYear,
      gender: values.gender,
      residence: values.residence,
      location: values.location,
      student_record_check_status: "simulated_passed",
      facial_scan_status: "simulated_completed_no_biometric_match",
      identity_verification_mode: "simulation",
      identity_verification_completed_at: completedAt,
      identity_consent: true,
      identity_consent_at: values.identityConsentAt,
      identity_consent_scope: "student-id-profile-and-face-presence-snapshot",
      privacy_notice_version: "2026-07-15",
      student_id_status: "pending_storage",
    };
    // Recheck immediately before account creation. The database trigger is the
    // final authority for the small race between this check and Auth insertion.
    try {
      if (await readSignupLock()) {
        clearAuthRateLimit(rateKey);
        return signupLockedResponse();
      }
    } catch {
      clearAuthRateLimit(rateKey);
      return signupAvailabilityErrorResponse();
    }

    const auth = createSupabaseServerAuthClient();
    const { data, error: signupError } = await auth.auth.signUp({
      email: personalEmail,
      password: values.password,
      options: {
        emailRedirectTo: new URL("/sign-in?confirmed=1", getTrustedAppOrigin(request)).toString(),
        data: initialMetadata,
      },
    });
    if (signupError || !data.user) {
      // If an administrator enabled the lock after the final application
      // check, the Auth trigger rejects the insert. Re-read the setting so the
      // client still receives the precise suspension response.
      try {
        if (await readSignupLock()) {
          clearAuthRateLimit(rateKey);
          return signupLockedResponse();
        }
      } catch {
        clearAuthRateLimit(rateKey);
        return signupAvailabilityErrorResponse();
      }
      return NextResponse.json({ error: signupErrorMessage(signupError?.message ?? "Account creation failed.") }, { status: 400, headers: noStoreHeaders });
    }
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return NextResponse.json({ error: signupErrorMessage("duplicate") }, { status: 400, headers: noStoreHeaders });
    }

    const userId = data.user.id;
    const extension = studentIdExtensions.get(studentIdFront.type) ?? "jpg";
    const objectPath = userId + "/front." + extension;
    const faceSnapshotObjectPath = userId + "/face-presence.jpg";
    const storedPaths: string[] = [];

    try {
      const uploaded = await admin.storage.from("student-ids").upload(objectPath, studentIdBuffer, {
        contentType: studentIdFront.type,
        cacheControl: "0",
        upsert: false,
        metadata: { document_side: "front", verification_mode: "simulation", uploaded_at: completedAt },
      });
      if (uploaded.error) throw uploaded.error;
      storedPaths.push(objectPath);

      const faceUploaded = await admin.storage.from("student-ids").upload(faceSnapshotObjectPath, faceSnapshotBuffer, {
        contentType: "image/jpeg",
        cacheControl: "0",
        upsert: false,
        metadata: { document_type: "face_presence", verification_mode: "simulation", uploaded_at: completedAt },
      });
      if (faceUploaded.error) throw faceUploaded.error;
      storedPaths.push(faceSnapshotObjectPath);

      const privateProfileUpdate = await admin.from("student_private_profiles").upsert({
        profile_id: userId,
        student_record_check_status: "simulated_passed",
        facial_scan_status: "simulated_completed_no_biometric_match",
        identity_verification_mode: "simulation",
        identity_verification_completed_at: completedAt,
        identity_consent_at: values.identityConsentAt,
        identity_consent_scope: "student-id-profile-and-face-presence-snapshot",
        privacy_notice_version: "2026-07-15",
        student_id_status: "uploaded_private",
        student_id_object_path: objectPath,
        student_id_uploaded_at: completedAt,
        face_snapshot_object_path: faceSnapshotObjectPath,
        face_snapshot_uploaded_at: completedAt,
        verification_status: "verified",
        verification_notes: "Signup identity simulation completed. One administrator-only face-presence image was stored; no biometric match or biometric template was created.",
        verified_at: completedAt,
        verified_by: null,
      }, { onConflict: "profile_id" });
      if (privateProfileUpdate.error) throw privateProfileUpdate.error;

      const metadataUpdate = await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...initialMetadata,
          student_id_status: "uploaded_private",
          student_id_uploaded: true,
          face_snapshot_uploaded: true,
        },
      });
      if (metadataUpdate.error) throw metadataUpdate.error;
    } catch {
      if (storedPaths.length) await admin.storage.from("student-ids").remove(storedPaths);
      const deleted = await admin.auth.admin.deleteUser(userId);
      clearAuthRateLimit(rateKey);
      const error = deleted.error
        ? "The private identity evidence could not be stored and automatic account cleanup could not be confirmed. Contact library support before retrying."
        : "The private identity evidence could not be stored, so the incomplete account was removed. Please try again.";
      return NextResponse.json({ error }, { status: 503, headers: noStoreHeaders });
    }

    clearAuthRateLimit(rateKey);
    const message = data.session
      ? "Account created and identity evidence stored securely. Sign in with your personal email to continue."
      : "Account created and identity evidence stored securely. Check your personal inbox to confirm the account, then sign in.";
    return NextResponse.json({ message, requiresEmailConfirmation: !data.session }, { status: 201, headers: noStoreHeaders });
  } catch {
    return NextResponse.json({ error: "Account creation is temporarily unavailable. Please try again later." }, { status: 503, headers: noStoreHeaders });
  }
}
