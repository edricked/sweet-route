import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  applicationName: "Sweet Route",
  title: "Sweet Route",
  description: "Manage dessert orders and plan delivery routes inside PHirst Park Homes.",
  manifest: "./manifest.webmanifest",
  icons: { icon: "./icon-192.png", apple: "./apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#123522",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
