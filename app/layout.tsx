import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { PagesProvider } from "@/lib/pages-context";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Nest",
  description: "A scoped-down Notion clone — pages, blocks, and databases.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark h-full ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="h-full font-sans antialiased">
        <PagesProvider>
          <div className="flex h-full">
            <Sidebar />
            <main className="flex-1 h-screen overflow-y-auto">{children}</main>
          </div>
        </PagesProvider>
      </body>
    </html>
  );
}
