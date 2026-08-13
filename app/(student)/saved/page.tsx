import type { Metadata } from "next";
import { SavedPage } from "@/components/student/saved-page";

export const metadata: Metadata = { title: "Saved books" };

export default function SavedBooksPage() {
  return <SavedPage />;
}
