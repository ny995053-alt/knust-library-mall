import type { Metadata } from "next";
import { PublicHome } from "@/components/public/public-home";
import { getPublicCatalogPayload } from "@/lib/public-catalog-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover books",
  description: "Search the live KNUST Library Mall collection, borrow physical books, and read digital titles online.",
};

export default async function HomePage() {
  const initialPayload = await getPublicCatalogPayload();
  return <PublicHome initialPayload={initialPayload} />;
}
