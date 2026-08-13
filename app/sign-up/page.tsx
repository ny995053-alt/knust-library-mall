import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return <AuthScreen mode="sign-up" />;
}
