import type { Metadata } from "next";
import { ReaderPage } from "@/components/student/reader-page";

export const metadata: Metadata = { title: "Online reader" };

export default async function ReadBookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ReaderPage slug={slug} />;
}
