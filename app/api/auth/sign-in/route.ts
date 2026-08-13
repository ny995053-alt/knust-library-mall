import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAuthRateLimit, clearAuthRateLimit, isSameOriginRequest, parseLimitedJsonRequest, requestClientKey, resolveLoginIdentifier } from "@/lib/auth-server";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

const requestSchema = z.object({
  identifier: z.string().trim().min(3).max(160),
  password: z.string().min(8).max(256),
});

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

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid sign-in request." }, { status: 403, headers: noStoreHeaders });
  }

  let body: unknown;
  try {
    body = await parseLimitedJsonRequest(request, 8 * 1024);
  } catch {
    return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400, headers: noStoreHeaders });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email or student ID and password." }, { status: 400, headers: noStoreHeaders });
  }

  const rateKey = requestClientKey(request, parsed.data.identifier);
  if (!checkAuthRateLimit(rateKey)) {
    return NextResponse.json({ error: "Too many sign-in attempts. Please wait a few minutes and try again." }, { status: 429, headers: noStoreHeaders });
  }

  try {
    const profile = await resolveLoginIdentifier(parsed.data.identifier);
    const email = profile?.email ?? "invalid-account@st.knust.edu.gh";
    const supabase = createSupabaseServerAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });

    if (error || !profile || profile.status !== "active" || !data.session) {
      return NextResponse.json({ error: "The credentials you entered are not correct." }, { status: 401, headers: noStoreHeaders });
    }

    clearAuthRateLimit(rateKey);
    const destination = profile.role === "student"
      ? "/library"
      : profile.role === "librarian"
        ? "/librarian"
        : "/admin";
    return NextResponse.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      destination,
    }, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again." }, { status: 503, headers: noStoreHeaders });
  }
}
