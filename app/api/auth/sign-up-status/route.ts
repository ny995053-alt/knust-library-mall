import { NextResponse } from "next/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

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

export async function GET() {
  try {
    const supabase = createSupabaseServerAuthClient();
    const { data, error } = await supabase.rpc("get_public_signup_status");

    if (error || typeof data !== "boolean") {
      throw new Error("Sign-up availability could not be confirmed.");
    }

    return NextResponse.json(
      { signupLocked: data },
      { headers: noStoreHeaders },
    );
  } catch {
    // Registration fails closed if the public setting cannot be read. Existing
    // account sign-in uses a separate route and remains fully available.
    return NextResponse.json(
      { signupLocked: true },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
