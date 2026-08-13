import "server-only";

import { resolveRequestOrigin } from "@/lib/request-origin";

function normalizeOrigin(value?: string | null) {
  const configured = value?.trim();
  if (!configured) return null;

  const parsed = new URL(configured);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("APP_URL must be a trusted HTTP or HTTPS origin.");
  }
  return parsed.origin;
}

function configuredOrigin() {
  return normalizeOrigin(process.env.APP_URL)
    || normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
    || normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
}

export function getTrustedAppOrigin(request: Request) {
  const configured = configuredOrigin();
  const requestOrigin = resolveRequestOrigin(request);
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_URL is required for production authentication links.");
    }
    return requestOrigin;
  }

  if (process.env.NODE_ENV === "production") {
    return configured;
  }

  return configured === requestOrigin ? configured : requestOrigin;
}
