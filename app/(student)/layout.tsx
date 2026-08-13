import type { Metadata } from "next";
import { LibraryProvider } from "@/components/student/library-provider";
import { StudentShell } from "@/components/student/student-shell";

export const metadata: Metadata = { title: "My library" };

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <LibraryProvider>
      <StudentShell>{children}</StudentShell>
    </LibraryProvider>
  );
}
