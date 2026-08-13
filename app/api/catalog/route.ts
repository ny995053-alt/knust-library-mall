import { NextResponse } from "next/server";
import { getPublicCatalogPayload } from "@/lib/public-catalog-server";

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

export async function GET() {
  const payload = await getPublicCatalogPayload();
  return NextResponse.json(payload, { headers: noStoreHeaders });
}
