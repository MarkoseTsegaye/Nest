import type { Metadata } from "next";
import { Lexend, Bricolage_Grotesque } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { PagesProvider } from "@/lib/pages-context";
import { Sidebar } from "@/components/Sidebar";

// Body & UI: Lexend is engineered to improve reading proficiency and reduce
// reading fatigue — a natural fit for a note-taking app aimed at students.
const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
  display: "swap",
});

// Titles & headings: Bricolage Grotesque is bold and characterful but tidy,
// giving pages that confident, well-organized "study notes" structure.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

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
      className={`dark h-full ${lexend.variable} ${bricolage.variable} ${GeistMono.variable}`}
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
