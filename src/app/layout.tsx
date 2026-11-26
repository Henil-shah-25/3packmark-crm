import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import "./globals.css";
import { StartupSplash } from "@/components/layout/StartupSplash";

const urbanist = Urbanist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-urbanist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "3packmark Private Limited CRM",
  description: "3packmark Private Limited - B2B Sales & Dispatch CRM",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${urbanist.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                var stored = localStorage.getItem('rapport_theme');
                var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                document.documentElement.setAttribute('data-theme', theme);
                setTimeout(function(){
                  document.documentElement.classList.add('failsafe', 'is-ready');
                }, 4000);
              } catch(e) {}
            })();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <StartupSplash />
        {children}
      </body>
    </html>
  );
}
