import type { Metadata } from "next";
import { ProfilePage } from "@/components/student/profile-page";

export const metadata: Metadata = { title: "Student profile" };

export default function StudentProfilePage() {
  return <ProfilePage />;
}
