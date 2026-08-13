import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAuthRateLimit, isSameOriginRequest, parseLimitedJsonRequest, requestClientKey, resolveLoginIdentifier } from "@/lib/auth-server";
import { getTrustedAppOrigin } from "@/lib/app-url";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

const requestSchema = z.object({ identifier: z.string().trim().min(3).max(160) });
const responseMessage = "If those details match an account, a reset link has been sent to the personal email inbox.";

export async function POST(request: Request) {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
  };
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ message: responseMessage }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await parseLimitedJsonRequest(request, 4 * 1024);
  } catch {
    return NextResponse.json({ message: responseMessage }, { headers });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: responseMessage }, { headers });

  const rateKey = "reset:" + requestClientKey(request, parsed.data.identifier);
  if (!checkAuthRateLimit(rateKey, 4, 15 * 60 * 1000)) {
    return NextResponse.json({ message: responseMessage }, { headers });
  }

  try {
    const profile = await resolveLoginIdentifier(parsed.data.identifier);
    if (profile?.email && profile.status === "active") {
      const supabase = createSupabaseServerAuthClient();
      await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: new URL("/reset-password?recovery=1", getTrustedAppOrigin(request)).toString(),
      });
    }
  } catch {
    // The response deliberately stays identical to prevent account enumeration.
  }

  return NextResponse.json({ message: responseMessage }, { headers });
}
