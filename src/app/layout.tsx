import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cooyor — Autonomous Payment Operations Agent",
  description:
    "Cooyor detects, decides, and resolves payment incidents autonomously.",
  applicationName: "Cooyor",
  generator: "Cooyor",
  keywords: [
    "Cooyor",
    "payment operations",
    "agentic banking",
    "Airwallex",
    "payment incident",
    "autonomous payments",
  ],
  icons: {
    icon: "/cooyor-logo.jpg",
    shortcut: "/cooyor-logo.jpg",
    apple: "/cooyor-logo.jpg",
  },
  openGraph: {
    title: "Cooyor — Autonomous Payment Operations Agent",
    description: "Detect. Decide. Resolve.",
    siteName: "Cooyor",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}