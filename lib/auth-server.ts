import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { normalizeEmail, normalizeStudentId, PERSONAL_EMAIL_PATTERN } from "@/lib/auth-validation";
import { isSameOriginRequest as isSameOriginRequestFromHelper } from "@/lib/request-origin";

type ResolvedLogin = {
  email: string;
  role: "student" | "librarian" | "admin" | "super_admin";
  status: string;
};

export async function resolveLoginIdentifier(identifier: string): Promise<ResolvedLogin | null> {
  const admin = getSupabaseAdminClient();
  const trimmed = identifier.trim();
  let profile: ResolvedLogin | null = null;

  if (PERSONAL_EMAIL_PATTERN.test(trimmed)) {
    const email = normalizeEmail(trimmed);
    const canonical = await admin.from("profiles").select("email, role, status").eq("email", email).maybeSingle();
    if (canonical.data) profile = canonical.data as ResolvedLogin;

    if (!profile) {
      const personal = await admin.from("profiles").select("email, role, status").eq("personal_email", email).maybeSingle();
      if (personal.data) profile = personal.data as ResolvedLogin;
    }

    if (!profile) {
      const student = await admin.from("profiles").select("email, role, status").eq("student_email", email).maybeSingle();
      if (student.data) profile = student.data as ResolvedLogin;
    }
  } else {
    const studentId = normalizeStudentId(trimmed);
    const result = await admin.from("profiles").select("email, role, status").eq("index_number", studentId).maybeSingle();
    if (result.data) profile = result.data as ResolvedLogin;
  }

  return profile?.email ? profile : null;
}

const attempts = new Map<string, { count: number; resetAt: number }>();
const maxTrackedRateLimitKeys = 10_000;

function pruneRateLimitKeys(now: number) {
  if (attempts.size < maxTrackedRateLimitKeys) return;
  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key);
  }
  while (attempts.size >= maxTrackedRateLimitKeys) {
    const oldest = attempts.keys().next().value as string | undefined;
    if (!oldest) break;
    attempts.delete(oldest);
  }
}

export function checkAuthRateLimit(key: string, limit = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  pruneRateLimitKeys(now);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.delete(key);
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function clearAuthRateLimit(key: string) {
  attempts.delete(key);
}

export function isSameOriginRequest(request: Request) {
  return isSameOriginRequestFromHelper(request);
}

export function isJsonRequest(request: Request, maxBytes: number) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return false;
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return true;
  const parsedLength = Number(contentLength);
  return Number.isSafeInteger(parsedLength) && parsedLength >= 0 && parsedLength <= maxBytes;
}

export async function parseLimitedJsonRequest(request: Request, maxBytes: number): Promise<unknown> {
  if (!isJsonRequest(request, maxBytes) || !request.body) throw new Error("Invalid JSON request.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error("JSON request is too large.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

export function requestClientKey(request: Request, identifier: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = (forwarded || request.headers.get("x-real-ip") || "local").slice(0, 128);
  return createHash("sha256")
    .update(ip + ":" + normalizeEmail(identifier).slice(0, 256))
    .digest("hex");
}
