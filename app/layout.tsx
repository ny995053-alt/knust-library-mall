import type { Metadata } from "next";
import "./globals.css";
import { AppToaster } from "@/components/app-toaster";

export const metadata: Metadata = {
  title: {
    default: "KNUST Library Mall",
    template: "%s | KNUST Library Mall",
  },
  description: "Discover, borrow, and read books from the KNUST Library Mall.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
