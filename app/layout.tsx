import type { Metadata } from "next";
import "./globals.css";
import { PagesProvider } from "@/lib/pages-context";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Nest",
  description: "A scoped-down Notion clone",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">
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
