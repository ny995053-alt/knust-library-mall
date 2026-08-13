import type { Metadata } from "next";
import { BookDetail } from "@/components/student/book-detail";

export const metadata: Metadata = { title: "Book details" };

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BookDetail slug={slug} />;
}
