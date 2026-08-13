import type { Metadata } from "next";
import { LoansPage } from "@/components/student/loans-page";

export const metadata: Metadata = { title: "My loans" };

export default function MyLoansPage() {
  return <LoansPage />;
}
