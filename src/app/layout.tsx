import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { MotionProvider } from "@/components/motion";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Pulse · Plaksha", template: "%s · Pulse" },
  description: "Raise it once. Watch it move. Issues and proposals for Plaksha, in the open.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e7e9e4" },
    { media: "(prefers-color-scheme: dark)", color: "#090c0a" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html
      lang="en"
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      className={outfit.variable}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <MotionProvider>{children}</MotionProvider>
        <Toaster
          position="bottom-center"
          offset={96}
          mobileOffset={96}
          toastOptions={{
            duration: 3500,
            className: "!rounded-full !border-0 !bg-dark !px-5 !py-3 !font-sans !text-[14px] !font-medium !text-ondark !shadow-[var(--shadow-pop)]",
          }}
        />
      </body>
    </html>
  );
}
