import type { Metadata } from "next";
import { LibrarianDashboard } from "@/components/librarian/librarian-dashboard";

export const metadata: Metadata = { title: "Librarian desk" };

export default function LibrarianPage() {
  return <LibrarianDashboard />;
}
