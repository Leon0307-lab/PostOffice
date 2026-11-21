import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: { default: "PostOffice", template: "%s · PostOffice" },
  description: "Internes Post- und Logistikmanagementsystem",
  manifest: "/manifest.webmanifest",
  applicationName: "PostOffice",
  appleWebApp: { capable: true, title: "PostOffice", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#25282B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
